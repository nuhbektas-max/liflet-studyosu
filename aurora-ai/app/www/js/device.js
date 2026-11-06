// AURORA - telefon donanımı araçları (Tool Use, şartname 6.4 ve 7).
// Claude bir aracı çağırdığında işlem burada GERÇEKTEN yürütülür ve gerçek sonuç Claude'a döner.
// Android'de işi Java köprüsü (window.AuroraAndroid) yapar; tarayıcıda desteklenmeyen araçlar
// "desteklenmiyor" sonucu verir, uydurma sonuç dönmez.

const bridge = () => (typeof window !== 'undefined' ? window.AuroraAndroid : undefined);
export const isAndroid = () => !!bridge();

function callBridge(name, args = {}) {
  const b = bridge();
  if (!b) return { ok: false, error: 'Bu işlem yalnızca Android uygulamasında yapılabilir.' };
  try {
    return JSON.parse(b.device(name, JSON.stringify(args)));
  } catch (e) {
    return { ok: false, error: `Android köprüsü hata verdi: ${e.message || e}` };
  }
}

/** Ayar paneli kapatılıp uygulamaya dönülünceye kadar bekler (en çok 60 sn). */
function waitForReturn(events, timeoutMs = 60000) {
  return new Promise((resolve) => {
    let done = false;
    const off = events.on('returned', () => { if (!done) { done = true; off(); resolve(true); } });
    setTimeout(() => { if (!done) { done = true; off(); resolve(false); } }, timeoutMs);
  });
}

const obj = (properties, required = Object.keys(properties)) => ({
  type: 'object', properties, required, additionalProperties: false,
});

/** Claude'a verilen araç tanımları (JSON Schema, strict). */
export const TOOL_DEFINITIONS = [
  {
    name: 'toggle_flashlight',
    description: 'Telefonun fenerini (kamera flaşı) açar, kapatır ya da tersine çevirir. Kullanıcı ışığı/feneri açmasını veya kapatmasını açıkça istediğinde kullan. Sonuç fenerin gerçek durumunu verir.',
    strict: true,
    input_schema: obj({ state: { type: 'string', enum: ['on', 'off', 'toggle'], description: 'on: aç, off: kapat, toggle: tersine çevir' } }),
  },
  {
    name: 'set_volume',
    description: 'Medya, zil veya alarm ses seviyesini ayarlar. "Sesi yüzde 50 yap" için action=set, level_percent=50. "Azalt/yükselt" için down/up (yaklaşık %15 adım). "Tamamen kapat" için mute. Sonuç gerçek seviyeyi yüzde olarak verir.',
    strict: true,
    input_schema: obj({
      stream: { type: 'string', enum: ['media', 'ring', 'alarm'], description: 'Hangi ses: medya (müzik, video, bu uygulamanın sesi), zil, alarm' },
      action: { type: 'string', enum: ['set', 'up', 'down', 'mute', 'max'] },
      level_percent: { anyOf: [{ type: 'integer' }, { type: 'null' }], description: 'action=set için 0-100 arası yüzde; diğerlerinde null' },
    }),
  },
  {
    name: 'open_wifi_settings',
    description: 'Wi-Fi ayar panelini açar. Android 10 ve sonrası uygulamaların Wi-Fi\'yi kendisinin açıp kapatmasına izin vermez; kullanıcı paneldeki düğmeyi kendisi değiştirir. Panel kapanınca gerçek Wi-Fi durumu okunup döner.',
    strict: true,
    input_schema: obj({}),
  },
  {
    name: 'open_bluetooth_settings',
    description: 'Bluetooth ayarlarını açar. Kullanıcı Bluetooth\'u sistem ekranında kendisi açar/kapatır; dönünce gerçek durum okunur.',
    strict: true,
    input_schema: obj({}),
  },
  {
    name: 'open_system_settings',
    description: 'Bir sistem ayarları ekranını açar.',
    strict: true,
    input_schema: obj({ section: { type: 'string', enum: ['main', 'app', 'location', 'display', 'sound', 'battery', 'internet'] } }),
  },
  {
    name: 'get_device_info',
    description: 'Telefonun marka, model, Android sürümü, işlemci mimarisi, bellek ve depolama bilgisini verir.',
    strict: true,
    input_schema: obj({}),
  },
  {
    name: 'get_battery_status',
    description: 'Pil yüzdesini, şarj olup olmadığını ve pil sıcaklığını verir.',
    strict: true,
    input_schema: obj({}),
  },
  {
    name: 'get_network_status',
    description: 'İnternet bağlantısı olup olmadığını ve bağlantı türünü (Wi-Fi, mobil) verir.',
    strict: true,
    input_schema: obj({}),
  },
  {
    name: 'remember',
    description: 'Kullanıcının AÇIKÇA hatırlamanı istediği bir bilgiyi uzun süreli hafızaya kaydeder (ör. "adımı hatırla", "kahveyi şekersiz içtiğimi unutma"). Sağlık, kimlik numarası, şifre, banka bilgisi gibi hassas bilgileri kaydetme.',
    strict: true,
    input_schema: obj({ fact: { type: 'string', description: 'Kısa, tek cümlelik bilgi' } }),
  },
  {
    name: 'forget',
    description: 'Uzun süreli hafızadan bir bilgiyi siler. Kullanıcı bir şeyi unutmanı istediğinde kullan. memory_id hafıza listesindeki numaradır.',
    strict: true,
    input_schema: obj({ memory_id: { type: 'integer' } }),
  },
];

const SETTINGS_SECTIONS = new Set(['main', 'app', 'location', 'display', 'sound', 'battery', 'internet']);

/**
 * Araçları yürüten sınıf.
 * confirm(message) → Promise<boolean>: kullanıcı onayı gerektiren işlemler için arayüz sorar.
 * events: { on(name, fn) → off } — Android köprüsünden gelen olaylar.
 * memory: MemoryStore.
 */
export class DeviceTools {
  constructor({ confirm, events, memory }) {
    this.confirm = confirm;
    this.events = events;
    this.memory = memory;
  }

  /** Bir araç çağrısını doğrular, gerekirse onay ister, yürütür. Her zaman bir sonuç nesnesi döner. */
  async execute(name, input) {
    try {
      const args = input && typeof input === 'object' ? input : {};
      switch (name) {
        case 'toggle_flashlight': {
          if (!['on', 'off', 'toggle'].includes(args.state)) return bad('state on/off/toggle olmalı');
          return callBridge('torch', { state: args.state });
        }
        case 'set_volume': {
          if (!['media', 'ring', 'alarm'].includes(args.stream)) return bad('stream media/ring/alarm olmalı');
          if (!['set', 'up', 'down', 'mute', 'max'].includes(args.action)) return bad('action geçersiz');
          let level = args.level_percent;
          if (args.action === 'set') {
            if (!Number.isInteger(level) || level < 0 || level > 100) return bad('level_percent 0-100 arası tam sayı olmalı');
          } else level = null;
          const silencing = args.action === 'mute' || (args.action === 'set' && level === 0);
          if (silencing && args.stream !== 'media') {
            const name = args.stream === 'alarm' ? 'alarm' : 'zil';
            const ok = await this.confirm(`${name} sesini kapatayım mı? Kapanırsa ${args.stream === 'alarm' ? 'alarmları' : 'aramaları'} duymayabilirsiniz.`);
            if (!ok) return { ok: false, cancelled: true, error: 'Kullanıcı onaylamadı; ses değiştirilmedi.' };
          }
          return callBridge('volume', { stream: args.stream, action: args.action, level });
        }
        case 'open_wifi_settings':
        case 'open_bluetooth_settings': {
          const kind = name === 'open_wifi_settings' ? 'wifi' : 'bluetooth';
          const opened = callBridge('openPanel', { kind });
          if (!opened.ok) return opened;
          const returned = await waitForReturn(this.events);
          const state = callBridge(kind === 'wifi' ? 'wifiState' : 'bluetoothState');
          return { ...state, panel_opened: true, user_returned: returned };
        }
        case 'open_system_settings': {
          if (!SETTINGS_SECTIONS.has(args.section)) return bad('section geçersiz');
          return callBridge('openSettings', { section: args.section });
        }
        case 'get_device_info':
          return isAndroid() ? callBridge('deviceInfo') : webDeviceInfo();
        case 'get_battery_status':
          return isAndroid() ? callBridge('battery') : webBattery();
        case 'get_network_status':
          return isAndroid() ? callBridge('network') : { ok: true, online: navigator.onLine, type: 'bilinmiyor (tarayıcı)' };
        case 'remember': {
          const fact = String(args.fact || '').trim();
          if (!fact) return bad('fact boş olamaz');
          const item = this.memory.add(fact);
          return { ok: true, saved: item };
        }
        case 'forget': {
          if (!Number.isInteger(args.memory_id)) return bad('memory_id tam sayı olmalı');
          const removed = this.memory.remove(args.memory_id);
          return removed ? { ok: true, removed } : { ok: false, error: `${args.memory_id} numaralı kayıt yok` };
        }
        default:
          return bad(`Bilinmeyen araç: ${name}`);
      }
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }
}

const bad = (msg) => ({ ok: false, error: `Geçersiz parametre: ${msg}` });

function webDeviceInfo() {
  return {
    ok: true,
    platform: 'tarayıcı',
    userAgent: navigator.userAgent,
    language: navigator.language,
    cpuCores: navigator.hardwareConcurrency || null,
    memoryGB: navigator.deviceMemory || null,
    screen: `${screen.width}x${screen.height}`,
  };
}

async function webBattery() {
  if (!navigator.getBattery) return { ok: false, error: 'Bu tarayıcı pil bilgisini vermiyor.' };
  const b = await navigator.getBattery();
  return { ok: true, percent: Math.round(b.level * 100), charging: b.charging };
}

/** Uzun süreli hafıza: yalnızca kullanıcının kaydettirdiği bilgiler. Cihazda localStorage'da durur. */
export class MemoryStore {
  constructor(storage, key = 'aurora.memory.v1') {
    this.storage = storage;
    this.key = key;
    this.items = [];
    try { this.items = JSON.parse(storage.getItem(key) || '[]'); } catch { this.items = []; }
  }
  _save() { try { this.storage.setItem(this.key, JSON.stringify(this.items)); } catch { /* depolama kapalı */ } }
  add(fact) {
    const id = this.items.reduce((m, it) => Math.max(m, it.id), 0) + 1;
    const item = { id, fact, date: new Date().toISOString().slice(0, 10) };
    this.items.push(item);
    this._save();
    return item;
  }
  remove(id) {
    const i = this.items.findIndex((it) => it.id === id);
    if (i < 0) return null;
    const [removed] = this.items.splice(i, 1);
    this._save();
    return removed;
  }
  update(id, fact) {
    const it = this.items.find((x) => x.id === id);
    if (!it) return null;
    it.fact = fact;
    this._save();
    return it;
  }
  clear() { this.items = []; this._save(); }
  list() { return this.items.slice(); }
}
