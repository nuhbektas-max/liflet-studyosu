// AURORA - ses tanıma (ASR) ve ses üretimi (TTS).
// Android'de telefonun kendi Türkçe motorları kullanılır (SpeechRecognizer, TextToSpeech; Java köprüsü).
// Tarayıcıda Web Speech API (Chrome: webkitSpeechRecognition, speechSynthesis).
// Olaylar: listen-start, user-speaking, level(0..1), partial(text), final(text), listen-end,
//          listen-error({code, message, silent}), speak-start, word(word), speak-end, speak-error(msg)

import { isAndroid } from './device.js';

export class Emitter {
  constructor() { this.map = new Map(); }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.map.get(name)?.delete(fn);
  }
  emit(name, data) { for (const fn of this.map.get(name) || []) fn(data); }
}

/** Android köprüsünün gönderdiği olayları alır (Java: AuroraNative.emit(tür, veri)). */
export const nativeEvents = new Emitter();
if (typeof window !== 'undefined') {
  window.AuroraNative = { emit: (type, data) => nativeEvents.emit(type, data) };
}

const ASR_ERRORS = {
  1: 'Ağ zaman aşımı', 2: 'Ağ hatası', 3: 'Ses kaydı hatası', 4: 'Ses tanıma sunucusu hatası',
  5: 'İstemci hatası', 6: 'Konuşma duyulmadı', 7: 'Söylediğinizi anlayamadım',
  8: 'Ses tanıma meşgul', 9: 'Mikrofon izni yok', 10: 'Çok fazla istek', 11: 'Sunucu bağlantısı kesildi',
  12: 'Türkçe dil paketi desteklenmiyor', 13: 'Türkçe dil paketi indirilmemiş',
};

export class Voice extends Emitter {
  constructor() {
    super();
    this.listening = false;
    this.speaking = false;
    this.rate = 1;
    this.pitch = 1;
    this.muted = false;
    this.android = isAndroid();
    this._utterId = 0;
    if (this.android) this._bindAndroid();
  }

  get canListen() {
    return this.android || !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  // ---------- Dinleme ----------
  startListening() {
    if (this.listening) return;
    this.listening = true;
    if (this.android) {
      window.AuroraAndroid.startListening('tr-TR');
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      this.listening = false;
      this.emit('listen-error', { code: 0, message: 'Bu tarayıcıda ses tanıma yok; yazarak konuşabilirsiniz.' });
      return;
    }
    const rec = new SR();
    this.rec = rec;
    rec.lang = 'tr-TR';
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onstart = () => this.emit('listen-start');
    rec.onspeechstart = () => this.emit('user-speaking', true);
    rec.onspeechend = () => this.emit('user-speaking', false);
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) this.emit('partial', interim);
    };
    rec.onerror = (e) => {
      const silent = e.error === 'no-speech' || e.error === 'aborted';
      const msg = e.error === 'not-allowed' ? 'Mikrofon izni verilmedi.' : e.error === 'no-speech' ? 'Sizi duyamadım.' : `Ses tanıma hatası: ${e.error}`;
      this.emit('listen-error', { code: e.error, message: msg, silent });
    };
    rec.onend = () => {
      this.listening = false;
      this.emit('user-speaking', false);
      if (finalText.trim()) this.emit('final', finalText.trim());
      this.emit('listen-end');
    };
    rec.start();
  }

  stopListening() {
    if (!this.listening) return;
    if (this.android) window.AuroraAndroid.stopListening();
    else this.rec?.stop();
  }

  cancelListening() {
    if (!this.listening) return;
    this.listening = false;
    if (this.android) window.AuroraAndroid.cancelListening();
    else this.rec?.abort();
  }

  // ---------- Konuşma ----------
  speak(text) {
    this.stopSpeaking();
    if (!text) return;
    const id = `u${++this._utterId}`;
    this.currentId = id;
    this._started = false;
    // Ses motoru hiç başlamazsa (ses paketi yok, motor takıldı) akış donmasın: tahmini sürede bitir.
    clearTimeout(this._watchdog);
    this._watchdog = setTimeout(() => this._fallbackTimed(id, text, 'Ses motoru yanıt vermedi; metin ekranda.'), 2500);
    if (this.muted) {
      // Ses kapalıyken de yüz konuşsun ve akış sürsün: tahmini süre kadar "konuşuyor".
      this.speaking = true;
      this._started = true;
      this.emit('speak-start', { text, rate: this.rate, timed: false });
      const ms = Math.max(800, text.length * 62 / this.rate);
      this._muteTimer = setTimeout(() => { if (this.currentId === id) this._ended(); }, ms);
      return;
    }
    if (this.android) {
      this.speaking = true;
      this._pendingText = text;
      window.AuroraAndroid.speak(text, this.rate, this.pitch, id);
      return;
    }
    if (!window.speechSynthesis) {
      this.emit('speak-error', 'Bu tarayıcıda ses üretimi yok.');
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'tr-TR';
    const voice = speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith('tr'));
    if (voice) u.voice = voice;
    u.rate = this.rate;
    u.pitch = this.pitch;
    u.onstart = () => { if (this.currentId !== id || this._started) return; this._started = true; this.speaking = true; this.emit('speak-start', { text, rate: this.rate, timed: true }); };
    u.onboundary = (e) => {
      if (e.name && e.name !== 'word') return;
      const rest = text.slice(e.charIndex);
      const w = rest.match(/^[^\s]+/);
      if (w) this.emit('word', w[0]);
    };
    u.onend = () => {
      if (this.currentId !== id) return;
      if (!this._started) this._fallbackTimed(id, text, 'Bu tarayıcıda Türkçe ses yok; metin ekranda.');
      else this._ended();
    };
    u.onerror = (e) => {
      if (this.currentId !== id) return;
      if (e.error === 'interrupted' || e.error === 'canceled') { this._ended(); return; }
      if (!this._started) { this._fallbackTimed(id, text, `Ses üretilemedi (${e.error}); metin ekranda.`); return; }
      this.emit('speak-error', `Ses üretilemedi: ${e.error}`);
      this._ended();
    };
    this.speaking = true;
    speechSynthesis.speak(u);
  }

  /** Ses çıkmadığında yüz yine konuşsun ve akış sürsün: metin uzunluğuna göre süre. */
  _fallbackTimed(id, text, message) {
    if (this.currentId !== id || this._started) return;
    this._started = true;
    this.speaking = true;
    clearTimeout(this._watchdog);
    if (message) this.emit('speak-error', message);
    this.emit('speak-start', { text, rate: this.rate, timed: false });
    this._muteTimer = setTimeout(() => { if (this.currentId === id) this._ended(); }, Math.max(800, text.length * 62 / this.rate));
  }

  stopSpeaking() {
    clearTimeout(this._muteTimer);
    clearTimeout(this._watchdog);
    this.currentId = null;
    if (this.android) window.AuroraAndroid.stopSpeaking();
    else if (window.speechSynthesis) speechSynthesis.cancel();
    if (this.speaking) this._ended();
  }

  _ended() {
    clearTimeout(this._watchdog);
    clearTimeout(this._muteTimer);
    if (!this.speaking) return;
    this.speaking = false;
    this.emit('speak-end');
  }

  _bindAndroid() {
    nativeEvents.on('asr', (d) => {
      switch (d.event) {
        case 'ready': this.emit('listen-start'); break;
        case 'begin': this.emit('user-speaking', true); break;
        case 'endOfSpeech': this.emit('user-speaking', false); break;
        case 'rms': this.emit('level', Math.max(0, Math.min(1, (d.value + 2) / 12))); break;
        case 'partial': this.emit('partial', d.text); break;
        case 'result':
          this.listening = false;
          this.emit('user-speaking', false);
          if (d.text) this.emit('final', d.text);
          this.emit('listen-end');
          break;
        case 'error': {
          this.listening = false;
          this.emit('user-speaking', false);
          const silent = d.code === 6 || d.code === 7 || d.code === 5;
          this.emit('listen-error', { code: d.code, message: ASR_ERRORS[d.code] || `Ses tanıma hatası (${d.code})`, silent });
          this.emit('listen-end');
          break;
        }
        default: break;
      }
    });
    nativeEvents.on('tts', (d) => {
      if (d.id && d.id !== this.currentId) return;
      switch (d.event) {
        case 'start': if (this._started) break; this._started = true; this.emit('speak-start', { text: this._pendingText, rate: this.rate, timed: true }); break;
        case 'range': {
          const w = (this._pendingText || '').slice(d.start, d.end);
          if (w) this.emit('word', w);
          break;
        }
        case 'done': this._ended(); break;
        case 'error':
          if (!this._started) this._fallbackTimed(this.currentId, this._pendingText || '', d.message || 'Ses üretilemedi; metin ekranda.');
          else { this.emit('speak-error', d.message || 'Ses üretilemedi.'); this._ended(); }
          break;
        default: break;
      }
    });
  }
}
