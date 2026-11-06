// AURORA web çekirdeği testleri: node --test aurora-ai/app/test
import test from 'node:test';
import assert from 'node:assert/strict';
import { RobotStateMachine, isAllowed, States } from '../www/js/state.js';
import { LipSync, wordToVisemes, VISEMES } from '../www/js/lipsync.js';
import { DeviceTools, MemoryStore, TOOL_DEFINITIONS } from '../www/js/device.js';
import { ClaudeBrain, ConversationHistory, parseReply, RESPONSE_SCHEMA, EMOTIONS } from '../www/js/brain.js';

const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const S = (o = {}) => ({ microphoneOpen: false, userSpeaking: false, awaitingResponse: false, characterSpeaking: false, error: null, ...o });

test('durum makinesi şartnamedeki akışı izler', () => {
  const sm = new RobotStateMachine();
  const log = [];
  sm.onChange((a, b) => log.push(`${a}>${b}`));
  sm.update(S({ microphoneOpen: true }), 1);
  sm.update(S({ microphoneOpen: true, userSpeaking: true }), 2);
  sm.update(S({ awaitingResponse: true }), 3);
  sm.update(S({ characterSpeaking: true }), 4);
  sm.update(S(), 5);
  assert.deepEqual(log, ['idle>listening', 'listening>thinking', 'thinking>speaking', 'speaking>idle']);
});

test('hata her durumdan girilir, en az 3 sn kalır, sonra bekleme', () => {
  const sm = new RobotStateMachine({ minimumErrorSeconds: 3 });
  sm.update(S({ awaitingResponse: true }), 0);
  sm.update(S({ error: 'x' }), 1);
  assert.equal(sm.current, States.ERROR);
  sm.update(S(), 2);
  assert.equal(sm.current, States.ERROR);
  sm.update(S(), 4.1);
  assert.equal(sm.current, States.IDLE);
  for (const s of Object.values(States)) if (s !== 'error') assert.ok(isAllowed(s, 'error'));
  assert.ok(!isAllowed('error', 'speaking'));
});

test('Türkçe harfler doğru ağız şekline eşlenir', () => {
  assert.deepEqual(wordToVisemes('Merhaba'), ['PP', 'E', 'RR', 'kk', 'aa', 'PP', 'aa']);
  assert.deepEqual(wordToVisemes('İstanbul'), ['I', 'SS', 'DD', 'aa', 'nn', 'PP', 'U', 'DD']);
  assert.deepEqual(wordToVisemes('ışık'), ['I', 'CH', 'I', 'kk']);
  assert.deepEqual(wordToVisemes('göz'), ['kk', 'O', 'SS']);
  assert.deepEqual(wordToVisemes('üç'), ['U', 'CH']);
  for (const v of ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U']) assert.ok(VISEMES[v], v);
});

test('dudak senkronu: a açık, m kapalı, o yuvarlak, sonunda ağız kapanır', () => {
  const l = new LipSync();
  l.start('', 1, 0);
  l.word('ama', 10);
  assert.ok(l.sample(10.01).open > 0.7);           // a
  const tM = 10 + 0.085 + 0.01;                     // m
  assert.ok(l.sample(tM).open < 0.1);
  l.word('o', 20);
  assert.ok(l.sample(20.02).round > 0.6);
  assert.equal(l.sample(25).open, 0);
});

test('araç tanımları geçerli şema: strict, additionalProperties false', () => {
  const names = TOOL_DEFINITIONS.map((t) => t.name);
  for (const n of ['toggle_flashlight', 'set_volume', 'open_wifi_settings', 'open_bluetooth_settings', 'open_system_settings', 'get_device_info', 'get_battery_status']) assert.ok(names.includes(n), n);
  for (const t of TOOL_DEFINITIONS) {
    assert.equal(t.strict, true);
    assert.equal(t.input_schema.additionalProperties, false);
    assert.deepEqual([...t.input_schema.required].sort(), Object.keys(t.input_schema.properties).sort());
  }
  assert.deepEqual(RESPONSE_SCHEMA.properties.emotion.enum, EMOTIONS);
  assert.equal(EMOTIONS.length, 9);
});

test('araç doğrulaması: geçersiz parametre reddedilir, Android yoksa uydurma sonuç yok', async () => {
  const memory = new MemoryStore(memStorage());
  const tools = new DeviceTools({ confirm: async () => true, events: { on: () => () => {} }, memory });
  assert.equal((await tools.execute('set_volume', { stream: 'media', action: 'set', level_percent: 150 })).ok, false);
  assert.equal((await tools.execute('toggle_flashlight', { state: 'yanık' })).ok, false);
  const r = await tools.execute('toggle_flashlight', { state: 'on' });
  assert.equal(r.ok, false);
  assert.match(r.error, /Android/);
  assert.equal((await tools.execute('bilinmeyen', {})).ok, false);
});

test('alarm sesini kapatmak onay ister; onay yoksa işlem yapılmaz', async () => {
  let asked = '';
  const tools = new DeviceTools({ confirm: async (m) => { asked = m; return false; }, events: { on: () => () => {} }, memory: new MemoryStore(memStorage()) });
  const r = await tools.execute('set_volume', { stream: 'alarm', action: 'mute', level_percent: null });
  assert.equal(r.cancelled, true);
  assert.match(asked, /alarm/);
});

test('Android köprüsü varsa araçlar ona gider ve gerçek sonucu döndürür', async () => {
  const calls = [];
  globalThis.window = { AuroraAndroid: { device: (n, a) => { calls.push([n, JSON.parse(a)]); return JSON.stringify({ ok: true, on: true, verified: true }); } } };
  try {
    const tools = new DeviceTools({ confirm: async () => true, events: { on: () => () => {} }, memory: new MemoryStore(memStorage()) });
    const r = await tools.execute('toggle_flashlight', { state: 'on' });
    assert.deepEqual(calls, [['torch', { state: 'on' }]]);
    assert.equal(r.on, true);
  } finally { delete globalThis.window; }
});

test('hafıza: ekle, düzelt, sil', () => {
  const m = new MemoryStore(memStorage());
  const a = m.add('Adı Nuh');
  m.add('Kahveyi şekersiz içer');
  m.update(a.id, 'Adı Nuh Bey');
  assert.equal(m.list()[0].fact, 'Adı Nuh Bey');
  m.remove(a.id);
  assert.equal(m.list().length, 1);
});

test('yanıt ayrıştırıcı: JSON, bozuk JSON, düz metin', () => {
  assert.deepEqual(parseReply('{"text":"Merhaba","emotion":"happy","gesture":"nod","intensity":0.7,"gaze":"camera"}'),
    { text: 'Merhaba', emotion: 'happy', gesture: 'nod', intensity: 0.7, gaze: 'camera' });
  assert.equal(parseReply('Şöyle: {"text":"Tamam","emotion":"xx","gesture":"nod","intensity":5,"gaze":"camera"}').emotion, 'neutral');
  assert.equal(parseReply('düz metin').text, 'düz metin');
});

test('Claude döngüsü: araç çağrısı yürütülür, tool_result gider, yapılandırılmış yanıt döner', async () => {
  const requests = [];
  const responses = [
    { id: 'm1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu1', name: 'remember', input: { fact: 'Kullanıcının adı Nuh' } }],
      usage: { input_tokens: 100, output_tokens: 20 } },
    { id: 'm2', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"text":"Tamam Nuh, aklımda.","emotion":"happy","gesture":"nod","intensity":0.6,"gaze":"camera"}' }],
      usage: { input_tokens: 150, output_tokens: 30 } },
  ];
  const fakeFetch = async (url, init) => {
    requests.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
    return new Response(JSON.stringify(responses.shift()), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const storage = memStorage();
  const memory = new MemoryStore(storage);
  const brain = new ClaudeBrain({
    settings: () => ({ apiKey: 'sk-ant-test', model: 'claude-opus-5-5', effort: 'low' }),
    tools: new DeviceTools({ confirm: async () => true, events: { on: () => () => {} }, memory }),
    memory, history: new ConversationHistory(storage), storage, fetch: fakeFetch,
  });
  const tools = [];
  const res = await brain.ask('Adımı hatırla: Nuh', { onTool: (n) => tools.push(n) });
  assert.equal(res.error, undefined);
  assert.equal(res.reply.text, 'Tamam Nuh, aklımda.');
  assert.equal(res.reply.emotion, 'happy');
  assert.deepEqual(tools, ['remember']);
  assert.equal(memory.list()[0].fact, 'Kullanıcının adı Nuh');
  assert.equal(requests.length, 2);
  const [r1, r2] = requests;
  assert.match(r1.url, /\/v1\/messages/);
  // SDK 1.3.0 anahtarı Authorization başlığında gönderir ve API sürümü 2026-10-21'i kullanır.
  assert.equal(r1.headers.get('authorization'), 'Bearer sk-ant-test');
  assert.equal(r1.headers.get('anthropic-version'), '2026-10-21');
  assert.equal(r1.headers.get('anthropic-dangerous-direct-browser-access'), 'true');
  assert.match(r1.headers.get('anthropic-beta') || '', /server-side-fallback-2026-07-01/);
  assert.equal(r1.body.fallbacks, 'default');
  assert.equal(r1.body.model, 'claude-opus-5-5');
  assert.equal(r1.body.output_config.format.type, 'json_schema');
  assert.equal(r1.body.output_config.effort, 'low');
  assert.ok(!('tool_choice' in r1.body));
  const last = r2.body.messages[r2.body.messages.length - 1];
  assert.equal(last.role, 'user');
  assert.equal(last.content[0].type, 'tool_result');
  assert.equal(last.content[0].tool_use_id, 'tu1');
  assert.equal(JSON.parse(last.content[0].content).ok, true);
  assert.equal(brain.usage.input, 250);
  // Geçmiş yalnızca metin tutar
  assert.deepEqual(brain.history.toMessages(), [{ role: 'user', content: 'Adımı hatırla: Nuh' }, { role: 'assistant', content: 'Tamam Nuh, aklımda.' }]);
});

test('Claude hataları Türkçe ve anlaşılır', async () => {
  const storage = memStorage();
  const memory = new MemoryStore(storage);
  const mk = (status, body) => new ClaudeBrain({
    settings: () => ({ apiKey: 'k', model: 'claude-haiku-5-5' }),
    tools: new DeviceTools({ confirm: async () => true, events: { on: () => () => {} }, memory }),
    memory, history: new ConversationHistory(storage), storage,
    fetch: async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  });
  assert.match((await mk(401, { type: 'error', error: { type: 'authentication_error', message: 'bad key' } }).ask('x')).error, /API anahtarı/);
  assert.match((await mk(404, { type: 'error', error: { type: 'not_found_error', message: 'model' } }).ask('x')).error, /model bulunamadı/);
  const noKey = new ClaudeBrain({ settings: () => ({ apiKey: '' }), tools: null, memory, history: new ConversationHistory(storage), storage });
  assert.equal((await noKey.ask('x')).needsKey, true);
});
