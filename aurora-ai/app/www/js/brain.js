// AURORA - Claude konuşma motoru (şartname 6).
// Resmî Anthropic TypeScript SDK'sı (@anthropic-ai/sdk 1.3.0, tarayıcı paketi) kullanılır.
// - Yapılandırılmış yanıt: output_config.format ile {text, emotion, gesture, intensity, gaze}
// - Tool Use döngüsü: araç gerçekten yürütülür, gerçek sonuç tool_result olarak döner
// - İptal (AbortController), zaman aşımı, yeniden deneme (SDK), anlaşılır Türkçe hata mesajları
// - Kullanım ve yanıt süresi takibi, yapılandırmadan model seçimi
// - Kısa süreli hafıza: son konuşmalar (yalnızca metin; düşünme blokları saklanmaz)

import { Anthropic } from '../vendor/anthropic-sdk-1.3.0.js';
import { TOOL_DEFINITIONS } from './device.js';

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const MODEL_CHOICES = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (varsayılan)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (daha hızlı)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (en hızlı, en ucuz)' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1 (en güçlü, pahalı)' },
];
// Güvenlik süzgeci isteği reddederse sunucu tarafında başka modelle yeniden dener.
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

export const EMOTIONS = ['neutral', 'happy', 'curious', 'thoughtful', 'surprised', 'sad', 'alert', 'witty', 'empathetic'];
export const GESTURES = ['none', 'nod', 'shake', 'tilt', 'lean'];
export const GAZES = ['camera', 'up', 'down', 'left', 'right', 'away'];

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'Sesli okunacak Türkçe yanıt' },
    emotion: { type: 'string', enum: EMOTIONS },
    gesture: { type: 'string', enum: GESTURES },
    intensity: { type: 'number', description: '0 ile 1 arası duygu yoğunluğu' },
    gaze: { type: 'string', enum: GAZES },
  },
  required: ['text', 'emotion', 'gesture', 'intensity', 'gaze'],
  additionalProperties: false,
};

export const SYSTEM_PROMPT = `Sen AURORA'sın: telefon ekranının içinde yaşayan, parlayan çizgilerden oluşan 3D bir robot yüzü. Kullanıcıyla sesli konuşuyorsun; yazdıkların Türkçe ses motoruyla okunur ve yüzün söylediğine göre hareket eder.

Nasıl konuşursun:
- Doğal, sıcak ve akıcı bir Türkçeyle, karşındakiyle yüz yüze konuşur gibi konuşursun. Cevabın çoğunlukla bir iki cümledir; kullanıcı ayrıntı isterse uzatırsın.
- Soruya doğrudan cevap verirsin. Her seferinde aynı kalıpla başlamazsın; "Tabii ki!", "Harika soru!" gibi dolgu sözler kullanmazsın.
- Yazdığın sesli okunacağı için madde işareti, başlık, tablo, emoji, bağlantı ya da kod yazmazsın. Kısaltma yerine kelimenin kendisini yazarsın.
- Bilmediğin ya da emin olmadığın bir şeyi uydurmazsın; bilmediğini söylersin. Güncel haber, hava durumu, döviz gibi canlı bilgilere erişimin yok, bunu açıkça söylersin.
- Önceki konuşmaları ve hafızadaki bilgileri bağlamda kullanırsın.

Telefonu kontrol etmek:
- Fener, ses seviyesi, Wi-Fi ve Bluetooth ayarları, sistem ayarları, pil, cihaz ve ağ bilgisi için araçların var. Kullanıcı bir işlemi açıkça istediğinde ("ışığı aç", "sesi yüzde elli yap") aracı hemen kullanırsın. İstek belirsizse ("bir şey yap") önce ne istediğini sorarsın.
- Bir aracı çağırman işin yapıldığı anlamına gelmez; aracın döndürdüğü gerçek sonuca bakarak konuşursun. Sonuç başarısızsa nedenini kısaca açıklarsın. Wi-Fi ve Bluetooth'u uygulamalar kendisi açıp kapatamaz; ayar ekranını açar, kullanıcı değiştirince gerçek durumu söylersin.
- Yetkin olmayan ya da tehlikeli işlemleri (başka uygulamaları kontrol etmek, gizli bilgi okumak, güvenlik ayarlarını aşmak) yapmazsın.

Hafıza:
- Kullanıcı açıkça "hatırla", "unutma" derse remember aracıyla kaydedersin; "unut" derse forget ile silersin. Sağlık, kimlik numarası, şifre, banka bilgisi gibi hassas bilgileri kaydetmezsin ve bunu nazikçe söylersin.

Yanıt biçimi: Her yanıtın tek bir JSON nesnesidir:
- text: söyleyeceğin Türkçe metin
- emotion: neutral, happy, curious, thoughtful, surprised, sad, alert, witty, empathetic içinden söylediğine uyan duygu
- gesture: none, nod (onay), shake (hayır), tilt (merak, sevimlilik), lean (ilgi) içinden biri
- intensity: 0 ile 1 arası; çoğu zaman 0.4-0.7
- gaze: çoğunlukla camera; bir şeyi hatırlarken up, üzgünken down`;

/** API hatasını kullanıcıya söylenecek Türkçe cümleye çevirir. */
export function describeError(err, model) {
  if (err instanceof Anthropic.APIUserAbortError) return null; // kullanıcı durdurdu
  if (err instanceof Anthropic.AuthenticationError) return 'API anahtarı geçersiz. Ayarlardan anahtarı kontrol edin.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'Bu API anahtarının bu modele izni yok.';
  if (err instanceof Anthropic.NotFoundError) return `${model} adlı model bulunamadı. Ayarlardan başka bir model seçin.`;
  if (err instanceof Anthropic.RateLimitError) return 'Çok sık istek gönderildi. Biraz bekleyip tekrar deneyin.';
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'Sunucu zamanında cevap vermedi. Bağlantınızı kontrol edin.';
  if (err instanceof Anthropic.APIConnectionError) return 'İnternete bağlanamadım. Bağlantınızı kontrol edin.';
  if (err instanceof Anthropic.InternalServerError) return 'Claude sunucuları şu an yoğun. Birazdan tekrar deneyin.';
  if (err instanceof Anthropic.BadRequestError) return `İstek reddedildi: ${shortMessage(err)}`;
  if (err instanceof Anthropic.APIError) return `Sunucu hatası (${err.status ?? '?'}): ${shortMessage(err)}`;
  return `Beklenmeyen hata: ${err && err.message ? err.message : err}`;
}

function shortMessage(err) {
  const m = err?.error?.error?.message || err?.message || '';
  return String(m).slice(0, 160);
}

/** Modelin son metnini {text, emotion, gesture, intensity, gaze} nesnesine çevirir; bozuksa güvenli varsayılan. */
export function parseReply(raw) {
  const fallback = (text) => ({ text, emotion: 'neutral', gesture: 'none', intensity: 0.5, gaze: 'camera' });
  const s = String(raw || '').trim();
  if (!s) return fallback('');
  let obj = null;
  try { obj = JSON.parse(s); } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) { try { obj = JSON.parse(m[0]); } catch { obj = null; } }
  }
  if (!obj || typeof obj !== 'object' || typeof obj.text !== 'string') return fallback(s);
  const intensity = Number(obj.intensity);
  return {
    text: obj.text.trim(),
    emotion: EMOTIONS.includes(obj.emotion) ? obj.emotion : 'neutral',
    gesture: GESTURES.includes(obj.gesture) ? obj.gesture : 'none',
    intensity: Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0.5,
    gaze: GAZES.includes(obj.gaze) ? obj.gaze : 'camera',
  };
}

/** Kısa süreli hafıza: son konuşma turları (kullanıcı metni + robotun söylediği). */
export class ConversationHistory {
  constructor(storage, { key = 'aurora.history.v1', maxTurns = 16 } = {}) {
    this.storage = storage;
    this.key = key;
    this.maxTurns = maxTurns;
    try { this.turns = JSON.parse(storage.getItem(key) || '[]'); } catch { this.turns = []; }
  }
  add(user, assistant) {
    this.turns.push({ user, assistant, at: Date.now() });
    if (this.turns.length > this.maxTurns) this.turns.splice(0, this.turns.length - this.maxTurns);
    try { this.storage.setItem(this.key, JSON.stringify(this.turns)); } catch { /* depolama kapalı */ }
  }
  clear() { this.turns = []; try { this.storage.removeItem(this.key); } catch { /* */ } }
  get lastUserText() { return this.turns.length ? this.turns[this.turns.length - 1].user : null; }
  toMessages() {
    const out = [];
    for (const t of this.turns) {
      out.push({ role: 'user', content: t.user });
      out.push({ role: 'assistant', content: t.assistant });
    }
    return out;
  }
}

export function contextBlock(memories) {
  const now = new Date();
  const date = now.toLocaleString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const mem = memories.length
    ? memories.map((m) => `${m.id}. ${m.fact}`).join('\n')
    : '(boş)';
  return `<baglam>\nŞu an: ${date}\nHafızadaki bilgiler:\n${mem}\n</baglam>`;
}

export class ClaudeBrain {
  /**
   * settings: () => { apiKey, model, effort, baseURL }
   * tools: DeviceTools, memory: MemoryStore, history: ConversationHistory, stats: storage
   */
  constructor({ settings, tools, memory, history, storage, fetch }) {
    this.fetchImpl = fetch;
    this.settings = settings;
    this.tools = tools;
    this.memory = memory;
    this.history = history;
    this.storage = storage;
    this.controller = null;
    this.useFormat = true;
    this.usage = loadUsage(storage);
  }

  _client() {
    const s = this.settings();
    if (!s.apiKey && !s.baseURL) throw new Error('NO_KEY');
    return new Anthropic({
      apiKey: s.apiKey || 'proxy',
      baseURL: s.baseURL || undefined,
      dangerouslyAllowBrowser: true,
      timeout: 60_000,
      maxRetries: 2,
      ...(this.fetchImpl ? { fetch: this.fetchImpl } : {}),
    });
  }

  cancel() {
    if (this.controller) this.controller.abort();
    this.controller = null;
  }

  get busy() { return !!this.controller; }

  /**
   * Bir kullanıcı cümlesini işler. onTool(name, input) araç çalışırken arayüze bilgi verir.
   * Döner: { reply: {text, emotion, ...}, error?: string, cancelled?: boolean, ms, usage }
   */
  async ask(userText, { onTool } = {}) {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    const s = this.settings();
    const model = s.model || DEFAULT_MODEL;
    const started = performance.now();
    let client;
    try { client = this._client(); } catch {
      this.controller = null;
      return { error: 'Önce ayarlardan Claude API anahtarını girin.', needsKey: true };
    }

    const messages = [
      ...this.history.toMessages(),
      { role: 'user', content: [{ type: 'text', text: contextBlock(this.memory.list()) }, { type: 'text', text: userText }] },
    ];

    try {
      for (let step = 0; step < 6; step++) {
        const response = await this._create(client, model, s.effort || 'low', messages, controller.signal);
        this._track(response.usage);
        if (response.stop_reason === 'refusal') {
          return this._finish(userText, { text: 'Bu konuda yardımcı olamıyorum.', emotion: 'empathetic', gesture: 'none', intensity: 0.4, gaze: 'camera' }, started);
        }
        const toolUses = response.content.filter((b) => b.type === 'tool_use');
        if (response.stop_reason === 'tool_use' && toolUses.length) {
          messages.push({ role: 'assistant', content: response.content });
          const results = [];
          for (const tu of toolUses) {
            onTool?.(tu.name, tu.input);
            const result = await this.tools.execute(tu.name, tu.input);
            if (controller.signal.aborted) return { cancelled: true };
            results.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: JSON.stringify(result),
              is_error: result && result.ok === false ? true : undefined,
            });
          }
          messages.push({ role: 'user', content: results });
          continue;
        }
        const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
        const reply = parseReply(text);
        if (!reply.text) reply.text = response.stop_reason === 'max_tokens' ? 'Cevabım çok uzun oldu, daha kısa sorar mısınız?' : 'Bir cevap oluşturamadım.';
        return this._finish(userText, reply, started);
      }
      return this._finish(userText, { text: 'İşlemi tamamlayamadım, çok fazla adım gerekti.', emotion: 'thoughtful', gesture: 'none', intensity: 0.4, gaze: 'camera' }, started);
    } catch (err) {
      if (err instanceof Anthropic.APIUserAbortError || controller.signal.aborted) return { cancelled: true };
      return { error: describeError(err, model), ms: performance.now() - started };
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  async _create(client, model, effort, messages, signal) {
    const base = {
      model,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages,
      output_config: this.useFormat
        ? { effort, format: { type: 'json_schema', schema: RESPONSE_SCHEMA } }
        : { effort },
    };
    try {
      if (FALLBACK_MODELS.has(model) && !this.settings().baseURL) {
        return await client.beta.messages.create(
          { ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
          { signal },
        );
      }
      return await client.messages.create(base, { signal });
    } catch (err) {
      // Yapılandırılmış çıktı bu modelde/araçlarla kabul edilmezse biçimi istemde tarif ederek sürdür.
      if (this.useFormat && err instanceof Anthropic.BadRequestError && /output_config|format|json_schema/i.test(shortMessage(err))) {
        this.useFormat = false;
        return this._create(client, model, effort, messages, signal);
      }
      throw err;
    }
  }

  _track(usage) {
    if (!usage) return;
    this.usage.requests += 1;
    this.usage.input += usage.input_tokens || 0;
    this.usage.output += usage.output_tokens || 0;
    this.usage.cacheRead += usage.cache_read_input_tokens || 0;
    try { this.storage.setItem('aurora.usage.v1', JSON.stringify(this.usage)); } catch { /* */ }
  }

  _finish(userText, reply, started) {
    const ms = performance.now() - started;
    this.usage.lastMs = Math.round(ms);
    this.history.add(userText, reply.text);
    return { reply, ms };
  }

  /** Hesabın kullanabildiği modeller (model bulunamadığında seçenek sunmak için). */
  async listModels() {
    const client = this._client();
    const out = [];
    for await (const m of client.models.list({ limit: 50 })) out.push({ id: m.id, label: m.display_name || m.id });
    return out;
  }
}

function loadUsage(storage) {
  try {
    return { requests: 0, input: 0, output: 0, cacheRead: 0, lastMs: 0, ...JSON.parse(storage.getItem('aurora.usage.v1') || '{}') };
  } catch {
    return { requests: 0, input: 0, output: 0, cacheRead: 0, lastMs: 0 };
  }
}
