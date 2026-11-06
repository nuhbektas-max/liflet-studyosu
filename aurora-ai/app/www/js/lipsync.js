// AURORA - Türkçe dudak senkronu.
// Türkçe yazıldığı gibi okunduğu için harften ağız şekline kural tabanlı eşleme güvenilirdir.
// Ses motoru her kelimenin başladığı anı bildirir (Android onRangeStart / tarayıcı boundary);
// kelimenin harfleri tahmini süresine yayılır ve her harf bir ağız şekline (açıklık, yuvarlaklık)
// karşılık gelir. Kelime bildirimi gelmeyen motorlarda bütün cümle tahmini hızla oynatılır.

/** Şartnamedeki viseme grupları ve ağız şekli: open 0..1 çene, round 0..1 dudak yuvarlama. */
export const VISEMES = Object.freeze({
  sil: { open: 0.0, round: 0.0 },
  PP: { open: 0.0, round: 0.1 },   // m b p
  FF: { open: 0.12, round: 0.0 },  // f v
  TH: { open: 0.2, round: 0.0 },
  DD: { open: 0.25, round: 0.0 },  // d t n l
  kk: { open: 0.3, round: 0.05 },  // k g ğ h
  CH: { open: 0.22, round: 0.35 }, // ç c ş j
  SS: { open: 0.15, round: 0.0 },  // s z
  nn: { open: 0.2, round: 0.0 },
  RR: { open: 0.25, round: 0.15 }, // r
  aa: { open: 0.85, round: 0.0 },  // a
  E: { open: 0.55, round: 0.0 },   // e
  I: { open: 0.32, round: 0.0 },   // ı i y
  O: { open: 0.6, round: 0.75 },   // o ö
  U: { open: 0.32, round: 1.0 },   // u ü
});

const LETTER_TO_VISEME = {
  a: 'aa', â: 'aa', e: 'E', ı: 'I', i: 'I', î: 'I', o: 'O', ö: 'O', u: 'U', ü: 'U', û: 'U',
  m: 'PP', b: 'PP', p: 'PP',
  f: 'FF', v: 'FF',
  d: 'DD', t: 'DD', l: 'DD',
  n: 'nn',
  k: 'kk', g: 'kk', ğ: 'kk', h: 'kk', q: 'kk', x: 'kk',
  ç: 'CH', c: 'CH', ş: 'CH', j: 'CH',
  s: 'SS', z: 'SS',
  r: 'RR',
  y: 'I', w: 'U',
};

const VOWELS = new Set(['aa', 'E', 'I', 'O', 'U']);

/** Bir kelimeyi viseme dizisine çevirir. Türkçe büyük/küçük harf kuralı (İ→i, I→ı) uygulanır. */
export function wordToVisemes(word) {
  const lower = String(word).toLocaleLowerCase('tr-TR');
  const out = [];
  for (const ch of lower) {
    const v = LETTER_TO_VISEME[ch];
    if (v) out.push(v);
    else if (/\d/.test(ch)) out.push('E', 'DD'); // rakamlar okunurken ağız hareket etsin
  }
  return out;
}

/** Harf başına süre (saniye); sesliler biraz daha uzun. rate: konuşma hızı çarpanı. */
export function visemeDuration(v, rate = 1) {
  return (VOWELS.has(v) ? 0.085 : 0.055) / Math.max(0.3, rate);
}

export class LipSync {
  constructor() {
    this.track = [];      // [{t0, t1, open, round}]
    this.rate = 1;
    this.active = false;
  }

  /** Konuşma başladı. text verilirse kelime bildirimi gelmezse diye bütün cümle planlanır. */
  start(text, rate, now) {
    this.rate = rate || 1;
    this.active = true;
    this.track = [];
    this.lastWordAt = -1;
    this.fallbackText = text || '';
    this.fallbackStart = now;
    this._plan(this.fallbackText, now);
  }

  /** Motor bir kelimenin başladığını bildirdi. */
  word(word, now) {
    this.lastWordAt = now;
    this._plan(word, now);
  }

  stop() {
    this.active = false;
    this.track = [];
  }

  _plan(text, now) {
    const seq = [];
    for (const w of String(text).split(/\s+/)) {
      const vs = wordToVisemes(w);
      if (vs.length) { seq.push(...vs); seq.push('sil'); }
    }
    let t = now;
    this.track = seq.map((v) => {
      const d = v === 'sil' ? 0.05 / this.rate : visemeDuration(v, this.rate);
      const seg = { t0: t, t1: t + d, ...VISEMES[v], v };
      t += d;
      return seg;
    });
  }

  /** O anki ağız şekli. Kelime aralarında ağız yumuşakça kapanır. */
  sample(now) {
    if (!this.active || !this.track.length) return { open: 0, round: 0 };
    const last = this.track[this.track.length - 1];
    if (now >= last.t1) return { open: 0, round: 0 };
    if (now < this.track[0].t0) return { open: 0, round: 0 };
    let i = 0;
    while (i < this.track.length - 1 && this.track[i].t1 <= now) i++;
    const cur = this.track[i];
    const next = this.track[i + 1] || cur;
    const u = Math.min(1, Math.max(0, (now - cur.t0) / Math.max(1e-3, cur.t1 - cur.t0)));
    const blend = u > 0.6 ? (u - 0.6) / 0.4 : 0; // segmentin sonunda bir sonrakine geçiş
    return {
      open: cur.open + (next.open - cur.open) * blend,
      round: cur.round + (next.round - cur.round) * blend,
    };
  }
}
