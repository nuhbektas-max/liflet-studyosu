// Gemini motoru testleri: node --test aurora-ai/app/test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiBrain, geminiTools, toGeminiSchema, describeGeminiError } from '../www/js/gemini.js';
import { DeviceTools, MemoryStore, TOOL_DEFINITIONS } from '../www/js/device.js';
import { ConversationHistory } from '../www/js/brain.js';

const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('araç şemaları Gemini biçimine çevrilir', () => {
  const [{ functionDeclarations: fd }] = geminiTools();
  assert.equal(fd.length, TOOL_DEFINITIONS.length);
  const vol = fd.find((d) => d.name === 'set_volume');
  assert.equal(vol.parameters.type, 'object');
  assert.ok(!('additionalProperties' in vol.parameters));
  assert.deepEqual(vol.parameters.properties.level_percent.type, 'integer');
  assert.equal(vol.parameters.properties.level_percent.nullable, true);
  assert.ok(!('parameters' in fd.find((d) => d.name === 'get_battery_status'))); // parametresiz
  assert.ok(!JSON.stringify(fd).includes('strict'));
  assert.deepEqual(toGeminiSchema({ anyOf: [{ type: 'string' }, { type: 'null' }] }), { type: 'string', nullable: true });
});

test('Gemini döngüsü: functionCall yürütülür, functionResponse ve düşünce imzası geri gider', async () => {
  const reqs = [];
  const answers = [
    { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'remember', args: { fact: 'Kullanıcı Kalecikli' } }, thoughtSignature: 'SIG123' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 } },
    { candidates: [{ content: { role: 'model', parts: [{ text: '```json\n{"text":"Kalecikli olduğunuzu unutmam.","emotion":"happy","gesture":"nod","intensity":0.7,"gaze":"camera"}\n```' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 20, thoughtsTokenCount: 5 } },
  ];
  const fakeFetch = async (url, init) => { reqs.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return json(200, answers.shift()); };
  const storage = memStorage();
  const memory = new MemoryStore(storage);
  const brain = new GeminiBrain({
    settings: () => ({ apiKey: 'AIza-test', model: 'gemini-3.8-flash' }),
    tools: new DeviceTools({ confirm: async () => true, events: { on: () => () => {} }, memory }),
    memory, history: new ConversationHistory(storage), storage, fetch: fakeFetch,
  });
  const res = await brain.ask('Kalecikli olduğumu hatırla');
  assert.equal(res.error, undefined);
  assert.equal(res.reply.text, 'Kalecikli olduğunuzu unutmam.');
  assert.equal(res.reply.emotion, 'happy');
  assert.equal(memory.list()[0].fact, 'Kullanıcı Kalecikli');
  const [r1, r2] = reqs;
  assert.equal(r1.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.equal(r1.headers['x-goog-api-key'], 'AIza-test');
  assert.ok(r1.body.systemInstruction.parts[0].text.includes('AURORA'));
  assert.equal(r1.body.contents.at(-1).role, 'user');
  const modelTurn = r2.body.contents.at(-2);
  assert.equal(modelTurn.role, 'model');
  assert.equal(modelTurn.parts[0].thoughtSignature, 'SIG123');
  const fr = r2.body.contents.at(-1).parts[0].functionResponse;
  assert.equal(fr.name, 'remember');
  assert.equal(fr.response.result.ok, true);
  assert.equal(brain.usage.input, 220);
  assert.equal(brain.usage.output, 35);
  assert.deepEqual(brain.history.toMessages().map((m) => m.role), ['user', 'assistant']);
});

test('Gemini hataları Türkçe', async () => {
  assert.match(describeGeminiError(400, { error: { message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } }, 'x'), /anahtarı geçersiz/);
  assert.match(describeGeminiError(404, {}, 'gemini-9'), /gemini-9/);
  assert.match(describeGeminiError(429, {}, 'x'), /kota/);
  const storage = memStorage();
  const memory = new MemoryStore(storage);
  let calls = 0;
  const brain = new GeminiBrain({
    settings: () => ({ apiKey: 'k', model: 'gemini-3.8-flash' }),
    tools: new DeviceTools({ confirm: async () => true, events: { on: () => () => {} }, memory }),
    memory, history: new ConversationHistory(storage), storage,
    fetch: async () => { calls++; return json(400, { error: { code: 400, message: 'API key not valid.', details: [{ reason: 'API_KEY_INVALID' }] } }); },
  });
  const r = await brain.ask('selam');
  assert.match(r.error, /Gemini API anahtarı geçersiz/);
  assert.equal(calls, 1); // 400 yeniden denenmez
  const noKey = new GeminiBrain({ settings: () => ({ apiKey: '' }), tools: null, memory, history: new ConversationHistory(storage), storage });
  assert.equal((await noKey.ask('x')).needsKey, true);
});

test('güvenlik engeli kibar retle sonuçlanır', async () => {
  const storage = memStorage();
  const memory = new MemoryStore(storage);
  const brain = new GeminiBrain({
    settings: () => ({ apiKey: 'k' }), tools: null, memory, history: new ConversationHistory(storage), storage,
    fetch: async () => json(200, { promptFeedback: { blockReason: 'SAFETY' } }),
  });
  assert.match((await brain.ask('x')).reply.text, /yardımcı olamıyorum/);
});

test('kaldırılan model: Google önerdiği modele bir kez geçilir', async () => {
  const urls = [];
  const storage = memStorage();
  const memory = new MemoryStore(storage);
  let replaced = null;
  const brain = new GeminiBrain({
    settings: () => ({ apiKey: 'k', model: 'gemini-2.5-flash' }), tools: null, memory, history: new ConversationHistory(storage), storage,
    onModelReplaced: (a, b) => { replaced = [a, b]; },
    fetch: async (url) => {
      urls.push(url);
      if (url.includes('gemini-2.5-flash')) return json(404, { error: { code: 404, status: 'NOT_FOUND', message: 'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features.' } });
      return json(200, { candidates: [{ content: { role: 'model', parts: [{ text: '{"text":"Merhaba","emotion":"happy","gesture":"none","intensity":0.5,"gaze":"camera"}' }] }, finishReason: 'STOP' }] });
    },
  });
  const r = await brain.ask('selam');
  assert.equal(r.reply.text, 'Merhaba');
  assert.deepEqual(replaced, ['gemini-2.5-flash', 'gemini-3.8-flash']);
  assert.equal(urls.length, 2);
});

test('ücretsiz dakika kotası: kısa bekleyip yeniden dener, sonra anlaşılır mesaj', async () => {
  const storage = memStorage();
  const memory = new MemoryStore(storage);
  let calls = 0;
  const quota = { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 5\nPlease retry in 56.1ms.',
    details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }, { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '0s' }] } };
  const brain = new GeminiBrain({
    settings: () => ({ apiKey: 'k' }), tools: null, memory, history: new ConversationHistory(storage), storage,
    fetch: async () => { calls++; return calls < 2 ? json(429, quota) : json(200, { candidates: [{ content: { parts: [{ text: '{"text":"Tamam","emotion":"neutral","gesture":"none","intensity":0.5,"gaze":"camera"}' }] }, finishReason: 'STOP' }] }); },
  });
  const r = await brain.ask('x');
  assert.equal(r.reply.text, 'Tamam');
  assert.equal(calls, 2);
  assert.match(describeGeminiError(429, quota, 'x'), /dakikada/);
});

test('günlük kota dolunca yedek modele geçilir', async () => {
  const storage = memStorage();
  const memory = new MemoryStore(storage);
  const urls = [];
  const daily = { error: { code: 429, message: 'Quota exceeded ... per day ... Please retry in 15h10m41s.', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } };
  let why = null;
  const brain = new GeminiBrain({
    settings: () => ({ apiKey: 'k', model: 'gemini-3.8-flash' }), tools: null, memory, history: new ConversationHistory(storage), storage,
    onModelReplaced: (a, b, w) => { why = [a, b, w]; },
    fetch: async (url) => { urls.push(url); return url.includes('3.8') ? json(429, daily) : json(200, { candidates: [{ content: { parts: [{ text: '{"text":"Buradayım","emotion":"neutral","gesture":"none","intensity":0.5,"gaze":"camera"}' }] }, finishReason: 'STOP' }] }); },
  });
  const r = await brain.ask('x');
  assert.equal(r.reply.text, 'Buradayım');
  assert.deepEqual(why, ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'quota']);
  assert.equal(urls.length, 2);
});
