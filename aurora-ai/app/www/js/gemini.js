// AURORA - Google Gemini konuşma motoru (Claude'a seçenek).
// Gemini API (generativelanguage.googleapis.com/v1beta) generateContent uç noktası, anahtar
// x-goog-api-key başlığında. Claude motoruyla aynı arayüz: ask(), cancel(), busy, usage, listModels().
// - Araçlar functionDeclarations olarak verilir; functionCall gelince araç GERÇEKTEN yürütülür,
//   sonucu functionResponse olarak döner.
// - Modelin içeriği (düşünce imzası thoughtSignature dahil) araç turunda değiştirilmeden geri gönderilir.
// - Yanıt biçimi istemle tarif edilir ({text, emotion, gesture, intensity, gaze}); araçlarla birlikte
//   responseSchema kullanılmaz, ayrıştırıcı bozuk/düz metne de dayanıklıdır.

import { TOOL_DEFINITIONS } from './device.js';
import { SYSTEM_PROMPT, parseReply, contextBlock } from './brain.js';

// gemini-2.5-* yeni kullanıcılara kapandı (Kasım 2026, API 404 "no longer available to new users").
export const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash-lite';
export const GEMINI_MODEL_CHOICES = [
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (varsayılan, en hızlı)' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (daha akıllı; ücretsizde günde ~20 istek)' },
  { id: 'gemini-flash-latest', label: 'Gemini Flash, en yeni' },
  { id: 'gemini-flash-lite-latest', label: 'Gemini Flash-Lite, en yeni' },
  { id: 'gemini-pro-latest', label: 'Gemini Pro, en yeni (yavaş)' },
];
// Seçili modelin günlük kotası dolarsa ya da model kapandıysa sırayla denenecek yedekler.
export const GEMINI_FALLBACKS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];

const API = 'https://generativelanguage.googleapis.com/v1beta';

const GEMINI_SYSTEM = `${SYSTEM_PROMPT}

Fonksiyonlar (araçlar) hakkında kesin kural: Kullanıcı fener, ses seviyesi, Wi-Fi, Bluetooth, ayarlar, pil, cihaz bilgisi, internet durumu, hatırlama ya da unutma isterse ÖNCE ilgili fonksiyonu çağır; JSON yanıtını ancak fonksiyonun sonucu geldikten sonra yaz. Fonksiyonu çağırmadan "kaydettim", "açtım", "ayarladım" gibi bir işi yaptığını asla söyleme.

Yanıtını yalnızca bu JSON nesnesi olarak ver; önüne, arkasına açıklama ya da kod bloğu işareti koyma.`;

/** Claude araç şemasını Gemini'nin OpenAPI alt kümesine çevirir. Parametresiz araçta parameters yok. */
export function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema.anyOf)) {
    const nonNull = schema.anyOf.filter((s) => s.type !== 'null');
    const nullable = nonNull.length < schema.anyOf.length;
    const base = toGeminiSchema(nonNull[0] || { type: 'string' });
    return { ...base, ...(nullable ? { nullable: true } : {}), ...(schema.description ? { description: schema.description } : {}) };
  }
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'additionalProperties' || k === 'strict') continue;
    if (k === 'properties') {
      out.properties = {};
      for (const [pk, pv] of Object.entries(v)) out.properties[pk] = toGeminiSchema(pv);
    } else if (k === 'items') out.items = toGeminiSchema(v);
    else out[k] = v;
  }
  return out;
}

export function geminiTools(defs = TOOL_DEFINITIONS) {
  return [{
    functionDeclarations: defs.map((t) => {
      const d = { name: t.name, description: t.description };
      const props = t.input_schema && t.input_schema.properties;
      if (props && Object.keys(props).length) d.parameters = toGeminiSchema(t.input_schema);
      return d;
    }),
  }];
}

class GeminiError extends Error {
  constructor(kind, message, status) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

/** Gemini hata yanıtını Türkçe cümleye çevirir. */
export function describeGeminiError(status, body, model) {
  const err = body && body.error ? body.error : {};
  const reason = (err.details || []).map((d) => d.reason).find(Boolean) || err.status || '';
  const msg = String(err.message || '').slice(0, 160);
  if (reason === 'API_KEY_INVALID' || /API key not valid/i.test(msg)) return 'Gemini API anahtarı geçersiz. Ayarlardan anahtarı kontrol edin.';
  if (status === 403) return 'Bu Gemini anahtarının bu modele ya da servise izni yok.';
  if (status === 404) return `${model} adlı Gemini modeli bulunamadı. Ayarlardan başka bir model seçin.`;
  if (status === 429) {
    if (/free_tier|Free Tier/i.test(msg + JSON.stringify(err.details || []))) {
      return /per ?day|PerDay/i.test(JSON.stringify(err.details || [])) ? 'Ücretsiz Gemini günlük kotası doldu. Yarın tekrar deneyin ya da Google AI Studio\'da faturalandırmayı açın.' : 'Ücretsiz Gemini kotası dakikada birkaç istekle sınırlı. Bir dakika bekleyip tekrar deneyin.';
    }
    return 'Gemini kotası doldu ya da çok sık istek gönderildi. Biraz bekleyip tekrar deneyin.';
  }
  if (status >= 500) return 'Gemini sunucuları şu an yoğun. Birazdan tekrar deneyin.';
  if (status === 400) return `Gemini isteği reddetti: ${msg}`;
  return `Gemini hatası (${status}): ${msg}`;
}

export class GeminiBrain {
  /** settings: () => { apiKey, model }; fetch: test için değiştirilebilir. */
  constructor({ settings, tools, memory, history, storage, fetch: fetchImpl, onModelReplaced }) {
    this.onModelReplaced = onModelReplaced;
    this.settings = settings;
    this.tools = tools;
    this.memory = memory;
    this.history = history;
    this.storage = storage;
    this.fetchImpl = fetchImpl || ((...a) => fetch(...a));
    this.controller = null;
    this.usage = loadUsage(storage);
  }

  get busy() { return !!this.controller; }

  cancel() {
    if (this.controller) this.controller.abort();
    this.controller = null;
  }

  async _post(path, body, signal) {
    const { apiKey } = this.settings();
    for (let attempt = 0; attempt < 3; attempt++) {
      let res;
      try {
        res = await this.fetchImpl(`${API}/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
          signal,
        });
      } catch (e) {
        if (signal.aborted) throw new GeminiError('abort', 'iptal');
        if (attempt < 2) { await sleep(800 * (attempt + 1)); continue; }
        throw new GeminiError('network', 'İnternete bağlanamadım. Bağlantınızı kontrol edin.');
      }
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { json = null; }
      if (res.ok) return json || {};
      if (res.status === 429 && attempt < 2) {
        // Dakika kotası: sunucunun söylediği kadar (en çok 12 sn) bekleyip yeniden dene; günlük kota ise bekleme.
        const wait = retryDelayMs(json);
        if (wait !== null && wait <= 12000 && !isDailyQuota(json)) { await sleep(Math.max(1000, wait)); continue; }
      } else if (res.status >= 500 && attempt < 2) { await sleep(1500 * (attempt + 1)); continue; }
      const e = new GeminiError('api', describeGeminiError(res.status, json, this.settings().model || GEMINI_DEFAULT_MODEL), res.status);
      e.body = json;
      throw e;
    }
    throw new GeminiError('api', 'Gemini yanıt vermedi.');
  }

  async ask(userText, { onTool } = {}) {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    const s = this.settings();
    let model = s.model || GEMINI_DEFAULT_MODEL;
    const tried = new Set([model]);
    const started = performance.now();
    if (!s.apiKey) {
      this.controller = null;
      return { error: 'Önce ayarlardan Gemini API anahtarını girin.', needsKey: true };
    }
    const contents = [];
    for (const m of this.history.toMessages()) {
      contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
    }
    contents.push({ role: 'user', parts: [{ text: contextBlock(this.memory.list()) }, { text: userText }] });

    // Zaman aşımı: 90 sn içinde tur bitmezse iptal
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      for (let step = 0; step < 6; step++) {
        const body = {
          systemInstruction: { parts: [{ text: GEMINI_SYSTEM }] },
          contents,
          tools: geminiTools(),
          toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
          generationConfig: { maxOutputTokens: 2048 },
        };
        let data;
        for (;;) {
          try {
            data = await this._post(`models/${encodeURIComponent(model)}:generateContent`, body, controller.signal);
            break;
          } catch (e) {
            const next = this._nextModel(e, model, tried);
            if (!next) throw e;
            this.onModelReplaced?.(model, next, e.status === 404 ? 'retired' : 'quota');
            tried.add(next);
            model = next;
          }
        }
        this._track(data.usageMetadata);
        if (data.promptFeedback && data.promptFeedback.blockReason) {
          return this._finish(userText, refusal(), started);
        }
        const cand = (data.candidates || [])[0];
        if (!cand) return this._finish(userText, refusal(), started);
        if (cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT' || cand.finishReason === 'BLOCKLIST') {
          return this._finish(userText, refusal(), started);
        }
        const content = cand.content || { role: 'model', parts: [] };
        const parts = content.parts || [];
        const calls = parts.filter((p) => p.functionCall);
        if (calls.length) {
          contents.push({ role: 'model', parts }); // thoughtSignature dahil aynen
          const responses = [];
          for (const p of calls) {
            const { name, args } = p.functionCall;
            onTool?.(name, args);
            const result = await this.tools.execute(name, args || {});
            if (controller.signal.aborted) return { cancelled: true };
            responses.push({ functionResponse: { name, response: { result } } });
          }
          contents.push({ role: 'user', parts: responses });
          continue;
        }
        const text = parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');
        const reply = parseReply(stripFence(text));
        if (!reply.text) reply.text = cand.finishReason === 'MAX_TOKENS' ? 'Cevabım çok uzun oldu, daha kısa sorar mısınız?' : 'Bir cevap oluşturamadım.';
        return this._finish(userText, reply, started);
      }
      return this._finish(userText, { text: 'İşlemi tamamlayamadım, çok fazla adım gerekti.', emotion: 'thoughtful', gesture: 'none', intensity: 0.4, gaze: 'camera' }, started);
    } catch (err) {
      if (controller.signal.aborted && !(err instanceof GeminiError && err.kind !== 'abort')) {
        return this.controller === controller ? { error: 'Gemini zamanında cevap vermedi. Bağlantınızı kontrol edin.' } : { cancelled: true };
      }
      if (err instanceof GeminiError) return { error: err.message, ms: performance.now() - started };
      return { error: `Beklenmeyen hata: ${err && err.message ? err.message : err}` };
    } finally {
      clearTimeout(timer);
      if (this.controller === controller) this.controller = null;
    }
  }

  /** Model kapandıysa (404) Google'ın önerdiği, günlük kota dolduysa (429) sıradaki yedek model. */
  _nextModel(e, model, tried) {
    if (!(e instanceof GeminiError)) return null;
    if (e.status === 404) {
      const s = suggestedModel(e.body);
      if (s && !tried.has(s)) return s;
    }
    if (e.status === 404 || (e.status === 429 && isDailyQuota(e.body))) {
      return GEMINI_FALLBACKS.find((m) => !tried.has(m)) || null;
    }
    return null;
  }

  _track(u) {
    if (!u) return;
    this.usage.requests += 1;
    this.usage.input += u.promptTokenCount || 0;
    this.usage.output += (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0);
    try { this.storage.setItem('aurora.usage.gemini.v1', JSON.stringify(this.usage)); } catch { /* */ }
  }

  _finish(userText, reply, started) {
    const ms = performance.now() - started;
    this.usage.lastMs = Math.round(ms);
    this.history.add(userText, reply.text);
    return { reply, ms };
  }

  /** Hesabın kullanabildiği, generateContent destekleyen Gemini modelleri. */
  async listModels() {
    const { apiKey } = this.settings();
    const res = await this.fetchImpl(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
    const json = await res.json();
    if (!res.ok) throw new Error(describeGeminiError(res.status, json, ''));
    return (json.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }));
  }
}

/** Hata gövdesindeki RetryInfo.retryDelay ("12s", "0.5s") ya da "retry in N ms/s" → milisaniye. */
export function retryDelayMs(body) {
  const err = body && body.error ? body.error : {};
  for (const d of err.details || []) {
    if (d.retryDelay) { const m = String(d.retryDelay).match(/([\d.]+)s/); if (m) return Math.round(parseFloat(m[1]) * 1000); }
  }
  const m = String(err.message || '').match(/retry in ([\d.]+)\s*(ms|s)/i);
  if (m) return Math.round(parseFloat(m[1]) * (m[2].toLowerCase() === 's' ? 1000 : 1));
  return null;
}
const isDailyQuota = (body) => /PerDay/i.test(JSON.stringify((body && body.error && body.error.details) || []));
/** "no longer available ... use models/X" hatasından önerilen modeli çıkarır. */
export function suggestedModel(body) {
  const m = String((body && body.error && body.error.message) || '').match(/use models\/([\w.-]+)/i);
  return m ? m[1] : null;
}

const refusal = () => ({ text: 'Bu konuda yardımcı olamıyorum.', emotion: 'empathetic', gesture: 'none', intensity: 0.4, gaze: 'camera' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripFence = (t) => String(t || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

function loadUsage(storage) {
  try {
    return { requests: 0, input: 0, output: 0, cacheRead: 0, lastMs: 0, ...JSON.parse(storage.getItem('aurora.usage.gemini.v1') || '{}') };
  } catch {
    return { requests: 0, input: 0, output: 0, cacheRead: 0, lastMs: 0 };
  }
}
