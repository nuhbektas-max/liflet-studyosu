// AURORA - uygulamanın akışı: yüz, durum makinesi, ses, Claude ve telefon araçlarını birbirine bağlar.

import { HoloFace } from './face.js';
import { RobotStateMachine, StateLabels, States } from './state.js';
import { LipSync } from './lipsync.js';
import { Voice, nativeEvents } from './voice.js';
import { DeviceTools, MemoryStore, isAndroid } from './device.js';
import { ClaudeBrain, ConversationHistory, DEFAULT_MODEL, MODEL_CHOICES } from './brain.js';
import { GeminiBrain, GEMINI_DEFAULT_MODEL, GEMINI_MODEL_CHOICES } from './gemini.js';

export const VERSION = '1.2';
const $ = (id) => document.getElementById(id);

// ---------- Güvenli depolama ----------
const store = (() => {
  try { localStorage.setItem('aurora.t', '1'); localStorage.removeItem('aurora.t'); return localStorage; } catch {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  }
})();

// Anahtarlar: Android'de Keystore ile şifreli, tarayıcıda yerel depoda. name: anthropic | gemini
const webKey = (name) => (name === 'anthropic' ? 'aurora.key' : `aurora.key.${name}`);
const secrets = {
  load(name) {
    if (isAndroid()) { try { return window.AuroraAndroid.secretLoad(name) || ''; } catch { return ''; } }
    return store.getItem(webKey(name)) || '';
  },
  save(name, v) {
    if (isAndroid()) return window.AuroraAndroid.secretSave(name, v || '');
    if (v) store.setItem(webKey(name), v); else store.removeItem(webKey(name));
    return true;
  },
};

const DEFAULTS = { provider: 'gemini', model: DEFAULT_MODEL, geminiModel: GEMINI_DEFAULT_MODEL, effort: 'low', baseURL: '', rate: 1, pitch: 1, continuous: false, muted: false, anim: 1, perf: false };
const settings = (() => {
  let s = { ...DEFAULTS };
  try { s = { ...s, ...JSON.parse(store.getItem('aurora.settings.v1') || '{}') }; } catch { /* */ }
  return s;
})();
if (/^gemini-2\.5-/.test(settings.geminiModel)) settings.geminiModel = GEMINI_DEFAULT_MODEL;
const keys = { anthropic: secrets.load('anthropic'), gemini: secrets.load('gemini') };
const keyName = (provider) => (provider === 'gemini' ? 'gemini' : 'anthropic');
const currentKey = () => keys[keyName(settings.provider)];
const saveSettings = () => store.setItem('aurora.settings.v1', JSON.stringify(settings));

// ---------- Bileşenler ----------
const face = new HoloFace($('stage'));
face.setPerformance(settings.perf);
face.animScale = settings.anim;
const lips = new LipSync();
const voice = new Voice();
voice.rate = settings.rate;
voice.pitch = settings.pitch;
voice.muted = settings.muted;
const memory = new MemoryStore(store);
const history = new ConversationHistory(store);
const tools = new DeviceTools({ confirm: askConfirm, events: nativeEvents, memory });
const claudeBrain = new ClaudeBrain({
  settings: () => ({ apiKey: keys.anthropic, model: settings.model, effort: settings.effort, baseURL: settings.baseURL }),
  tools, memory, history, storage: store,
});
const geminiBrain = new GeminiBrain({
  settings: () => ({ apiKey: keys.gemini, model: settings.geminiModel }),
  tools, memory, history, storage: store,
  onModelReplaced: (oldId, newId, why) => {
    if (why === 'retired') { settings.geminiModel = newId; saveSettings(); $('tool-note').textContent = `${oldId} kapandığı için ${newId} modeline geçildi.`; }
    else $('tool-note').textContent = `${oldId} günlük kotası doldu; bu cevap ${newId} ile.`;
  },
});
/** Seçili sağlayıcının konuşma motoru. */
const brain = () => (settings.provider === 'gemini' ? geminiBrain : claudeBrain);
const machine = new RobotStateMachine({ minimumErrorSeconds: 3 });

// ---------- Durum ----------
const signals = { microphoneOpen: false, userSpeaking: false, awaitingResponse: false, characterSpeaking: false, error: null };
let errorUntil = 0;
const now = () => performance.now() / 1000;

function setError(message, { speak = true } = {}) {
  if (!message) return;
  signals.error = message;
  errorUntil = now() + 3.5;
  $('said-robot').textContent = message;
  if (speak) voice.speak(message);
}

machine.onChange((prev, next) => {
  face.setState(next);
  const st = $('status');
  st.className = `status ${next}`;
  $('status-label').textContent = StateLabels[next];
  $('btn-mic').classList.toggle('on', next === States.LISTENING);
});

function tick() {
  if (signals.error && now() > errorUntil && !voice.speaking) signals.error = null;
  signals.microphoneOpen = voice.listening;
  signals.characterSpeaking = voice.speaking && !signals.error;
  signals.awaitingResponse = brain().busy;
  machine.update(signals, now());
  if (voice.speaking) {
    const m = lips.sample(now());
    face.setMouth(m.open, m.round);
  } else {
    face.setMouth(0, 0);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- Konuşma akışı ----------
async function ask(text) {
  text = String(text || '').trim();
  if (!text) return;
  voice.stopSpeaking();
  voice.cancelListening();
  signals.error = null;
  $('said-user').textContent = text;
  $('said-robot').textContent = '';
  $('tool-note').textContent = '';
  if (!navigator.onLine) { setError('İnternet bağlantısı yok. Bağlanınca tekrar deneyin.'); return; }
  face.lookAt('up');
  const res = await brain().ask(text, {
    onTool: (name) => { $('tool-note').textContent = TOOL_LABELS[name] || name; },
  });
  if (res.cancelled) return;
  if (res.error) {
    setError(res.error);
    if (res.needsKey) openSettings();
    return;
  }
  const r = res.reply;
  face.setEmotion(r.emotion, r.intensity);
  face.playGesture(r.gesture);
  face.lookAt(r.gaze);
  $('said-robot').textContent = r.text;
  voice.speak(r.text);
  updateUsage();
}

const TOOL_LABELS = {
  toggle_flashlight: 'Fener ayarlanıyor…', set_volume: 'Ses seviyesi ayarlanıyor…',
  open_wifi_settings: 'Wi-Fi ayarları açılıyor…', open_bluetooth_settings: 'Bluetooth ayarları açılıyor…',
  open_system_settings: 'Ayarlar açılıyor…', get_device_info: 'Cihaz bilgisi okunuyor…',
  get_battery_status: 'Pil durumu okunuyor…', get_network_status: 'Bağlantı kontrol ediliyor…',
  remember: 'Hafızaya kaydediliyor…', forget: 'Hafızadan siliniyor…',
};

voice.on('speak-start', ({ text, rate }) => lips.start(text, rate, now()));
voice.on('word', (w) => lips.word(w, now()));
voice.on('speak-end', () => {
  lips.stop();
  face.setEmotion('neutral', 0.4);
  if (settings.continuous && !signals.error && !brain().busy && history.turns.length) setTimeout(() => {
    if (!voice.speaking && !brain().busy) voice.startListening();
  }, 350);
});
voice.on('speak-error', (m) => { $('tool-note').textContent = m; });
voice.on('user-speaking', (v) => { signals.userSpeaking = !!v; });
voice.on('level', (v) => face.setAudioLevel(v));
voice.on('partial', (t) => { $('said-user').textContent = t; });
voice.on('final', (t) => ask(t));
voice.on('listen-error', ({ message, silent }) => {
  if (silent) { $('tool-note').textContent = message; return; }
  setError(message);
});

// ---------- Düğmeler ----------
$('btn-mic').addEventListener('click', async () => {
  if (voice.listening) { voice.stopListening(); return; }
  // Söz kesme: robot konuşuyor ya da düşünüyorsa durdur, dinlemeye geç.
  voice.stopSpeaking();
  brain().cancel();
  if (!(await ensureMicPermission())) { setError('Konuşabilmem için mikrofon izni gerekiyor.', { speak: false }); return; }
  voice.startListening();
});
$('btn-stop').addEventListener('click', () => {
  voice.stopSpeaking();
  voice.cancelListening();
  brain().cancel();
  lips.stop();
});
$('btn-clear').addEventListener('click', () => {
  history.clear();
  $('said-user').textContent = '';
  $('said-robot').textContent = 'Yeni bir konuşma başladı.';
});
$('ask-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('ask-input');
  const t = input.value;
  input.value = '';
  input.blur();
  ask(t);
});
$('btn-mute').addEventListener('click', () => {
  settings.muted = !settings.muted;
  voice.muted = settings.muted;
  if (settings.muted) voice.stopSpeaking();
  $('btn-mute').classList.toggle('muted', settings.muted);
  saveSettings();
});
$('btn-mute').classList.toggle('muted', settings.muted);

function updateNet() { $('net').classList.toggle('off', !navigator.onLine); $('net').title = navigator.onLine ? 'Bağlı' : 'Bağlantı yok'; }
window.addEventListener('online', updateNet);
window.addEventListener('offline', updateNet);
updateNet();

// ---------- İzinler ----------
const permWaiters = new Map();
nativeEvents.on('permission', (d) => {
  const fn = permWaiters.get(d.name);
  if (fn) { permWaiters.delete(d.name); fn(!!d.granted); }
  renderPermissions();
});
function requestPermission(name) {
  if (!isAndroid()) return Promise.resolve(true);
  if (window.AuroraAndroid.hasPermission(name)) return Promise.resolve(true);
  return new Promise((resolve) => {
    permWaiters.set(name, resolve);
    window.AuroraAndroid.requestPermission(name);
  });
}
const ensureMicPermission = () => requestPermission('microphone');

function renderPermissions() {
  const box = $('perm-list');
  box.textContent = '';
  if (!isAndroid()) { box.innerHTML = '<p class="hint">İzinler Android uygulamasında yönetilir.</p>'; return; }
  for (const [name, label] of [['microphone', 'Mikrofon (konuşma)'], ['bluetooth', 'Yakındaki cihazlar (Bluetooth durumu)']]) {
    const row = document.createElement('div');
    const ok = window.AuroraAndroid.hasPermission(name);
    row.innerHTML = `<span>${label}</span>`;
    if (ok) { const s = document.createElement('span'); s.className = 'ok'; s.textContent = 'Verildi'; row.append(s); }
    else { const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'İzin ver'; b.onclick = () => requestPermission(name); row.append(b); }
    box.append(row);
  }
}

// ---------- Onay penceresi ----------
function askConfirm(message) {
  return new Promise((resolve) => {
    $('confirm-text').textContent = message;
    $('confirm').hidden = false;
    voice.speak(message);
    const done = (v) => { $('confirm').hidden = true; $('confirm-yes').onclick = $('confirm-no').onclick = null; resolve(v); };
    $('confirm-yes').onclick = () => done(true);
    $('confirm-no').onclick = () => done(false);
  });
}

// ---------- Ayarlar ----------
function openSettings() {
  $('settings').hidden = false;
  $('set-provider').value = settings.provider;
  shownProvider = settings.provider;
  showProvider();
  $('set-effort').value = settings.effort;
  $('set-rate').value = settings.rate; $('out-rate').textContent = `${settings.rate.toFixed(2)}×`;
  $('set-pitch').value = settings.pitch; $('out-pitch').textContent = settings.pitch.toFixed(2);
  $('set-anim').value = settings.anim; $('out-anim').textContent = `%${Math.round(settings.anim * 100)}`;
  $('set-continuous').checked = settings.continuous;
  $('set-perf').checked = settings.perf;
  renderMemory();
  renderPermissions();
  updateUsage();
}
let shownProvider = settings.provider;
/** Ayarlar ekranında gösterilen sağlayıcının alanlarını doldurur. */
function showProvider() {
  const g = shownProvider === 'gemini';
  $('set-key').value = keys[keyName(shownProvider)];
  $('set-key').placeholder = g ? 'AIza…' : 'sk-ant-…';
  $('set-model-custom').placeholder = g ? 'ör. gemini-pro-latest' : 'ör. claude-sonnet-5-5';
  $('key-label').textContent = g ? 'Gemini API anahtarı' : 'Claude API anahtarı';
  $('set-base').value = settings.baseURL;
  $('row-base').hidden = g;
  $('row-effort').hidden = g;
  fillModels(g ? GEMINI_MODEL_CHOICES : MODEL_CHOICES, g ? settings.geminiModel : settings.model);
  const where = isAndroid() ? 'Telefonda Android Keystore ile şifrelenip yalnızca bu cihazda saklanır.' : 'Tarayıcıda bu tarayıcının yerel deposunda (şifresiz) durur; yalnızca kendi cihazınızda kullanın.';
  $('key-note').textContent = g
    ? `Anahtarı aistudio.google.com > Get API key sayfasından alın. ${where} Anahtar uygulamaya gömülü değildir.`
    : `Anahtarı console.anthropic.com'dan alın. ${where} Anahtar uygulamaya gömülü değildir; Console'da aylık harcama sınırı koyun.`;
}
/** Ekrandaki alanları gösterilen sağlayıcıya kaydeder. */
function storeShownProvider() {
  const name = keyName(shownProvider);
  const key = $('set-key').value.trim();
  if (key !== keys[name]) { keys[name] = key; secrets.save(name, key); }
  const model = $('set-model-custom').value.trim() || $('set-model').value;
  if (shownProvider === 'gemini') settings.geminiModel = model || GEMINI_DEFAULT_MODEL;
  else {
    settings.model = model || DEFAULT_MODEL;
    settings.baseURL = $('set-base').value.trim();
    settings.effort = $('set-effort').value;
  }
}
function closeSettings() {
  storeShownProvider();
  settings.provider = $('set-provider').value;
  saveSettings();
  $('settings').hidden = true;
}
function fillModels(list, current) {
  const sel = $('set-model');
  sel.textContent = '';
  const ids = new Set();
  for (const m of list) {
    ids.add(m.id);
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.label;
    sel.append(o);
  }
  if (ids.has(current)) { sel.value = current; $('set-model-custom').value = ''; }
  else $('set-model-custom').value = current || '';
}
$('btn-settings').addEventListener('click', openSettings);
$('btn-close-settings').addEventListener('click', closeSettings);
$('set-model').addEventListener('change', () => { $('set-model-custom').value = ''; });
$('set-provider').addEventListener('change', (e) => {
  storeShownProvider();
  shownProvider = e.target.value;
  settings.provider = shownProvider;
  saveSettings();
  showProvider();
  updateUsage();
  $('test-result').textContent = '';
});
$('set-rate').addEventListener('input', (e) => { settings.rate = +e.target.value; voice.rate = settings.rate; $('out-rate').textContent = `${settings.rate.toFixed(2)}×`; saveSettings(); });
$('set-pitch').addEventListener('input', (e) => { settings.pitch = +e.target.value; voice.pitch = settings.pitch; $('out-pitch').textContent = settings.pitch.toFixed(2); saveSettings(); });
$('set-anim').addEventListener('input', (e) => { settings.anim = +e.target.value; face.animScale = settings.anim; $('out-anim').textContent = `%${Math.round(settings.anim * 100)}`; saveSettings(); });
$('set-continuous').addEventListener('change', (e) => { settings.continuous = e.target.checked; saveSettings(); });
$('set-perf').addEventListener('change', (e) => { settings.perf = e.target.checked; face.setPerformance(settings.perf); saveSettings(); });
$('btn-list-models').addEventListener('click', async () => {
  closeSettings(); openSettings();
  $('test-result').textContent = 'Modeller getiriliyor…';
  try {
    const list = await brain().listModels();
    const g = settings.provider === 'gemini';
    fillModels(list.length ? list : (g ? GEMINI_MODEL_CHOICES : MODEL_CHOICES), g ? settings.geminiModel : settings.model);
    $('test-result').textContent = `${list.length} model bulundu.`;
  } catch (e) {
    $('test-result').textContent = 'Model listesi alınamadı. Anahtarı kontrol edin.';
  }
});
$('btn-test').addEventListener('click', async () => {
  closeSettings(); openSettings();
  $('test-result').textContent = 'Deneniyor…';
  const res = await brain().ask('Bağlantı denemesi: tek kısa cümleyle merhaba de.');
  if (res.error) $('test-result').textContent = res.error;
  else if (res.reply) {
    const m = settings.provider === 'gemini' ? settings.geminiModel : settings.model;
    $('test-result').textContent = `Çalışıyor (${Math.round(res.ms)} ms, ${m}): ${res.reply.text}`;
    history.turns.pop(); // deneme konuşması geçmişte kalmasın
    try { store.setItem('aurora.history.v1', JSON.stringify(history.turns)); } catch { /* */ }
  }
});
function renderMemory() {
  const ul = $('memory-list');
  ul.textContent = '';
  const items = memory.list();
  if (!items.length) { ul.innerHTML = '<li><span class="hint">Henüz kayıt yok.</span></li>'; return; }
  for (const it of items) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = `${it.id}. ${it.fact}`;
    const edit = document.createElement('button');
    edit.textContent = 'Düzelt';
    edit.style.color = 'var(--ink-dim)';
    edit.onclick = () => { const v = prompt('Bilgiyi düzeltin', it.fact); if (v && v.trim()) { memory.update(it.id, v.trim()); renderMemory(); } };
    const del = document.createElement('button');
    del.textContent = 'Sil';
    del.onclick = () => { memory.remove(it.id); renderMemory(); };
    li.append(span, edit, del);
    ul.append(li);
  }
}
$('btn-memory-add').addEventListener('click', () => {
  const v = $('memory-new').value.trim();
  if (v) { memory.add(v); $('memory-new').value = ''; renderMemory(); }
});
$('btn-memory-clear').addEventListener('click', async () => { if (await askConfirm('Bütün hafıza silinsin mi?')) { memory.clear(); renderMemory(); } });
$('btn-history-clear').addEventListener('click', () => { history.clear(); $('test-result').textContent = 'Konuşma geçmişi silindi.'; });
function updateUsage() {
  const u = brain().usage;
  $('usage').textContent = `${u.requests} istek · ${u.input.toLocaleString('tr-TR')} giriş / ${u.output.toLocaleString('tr-TR')} çıkış belirteci · son yanıt ${u.lastMs ? (u.lastMs / 1000).toFixed(1) + ' sn' : '—'}`;
}
$('ver').textContent = VERSION;

// ---------- Açılış ----------
setTimeout(() => {
  if (!currentKey() && !(settings.provider === 'claude' && settings.baseURL)) {
    $('said-robot').textContent = `Merhaba, ben Aurora. Konuşabilmemiz için sağ üstteki ayarlardan ${settings.provider === 'gemini' ? 'Gemini' : 'Claude'} API anahtarını girin.`;
  } else {
    const greet = 'Merhaba, ben Aurora. Mikrofona dokunup benimle konuşabilirsiniz.';
    $('said-robot').textContent = greet;
    face.setEmotion('happy', 0.6);
    face.playGesture('nod');
    voice.speak(greet);
  }
}, 900);

// Test ve hata ayıklama için
window.aurora = { face, voice, brain, claudeBrain, geminiBrain, machine, ask, settings };
