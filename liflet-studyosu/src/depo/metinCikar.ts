import { MM_PT } from '../editor/duzen';

/** pdf.js'in kullandığımız küçük yüzeyi (tarayıcı ve Node sürümleriyle aynı). */
export type PdfJsLib = {
  getDocument(src: { data: Uint8Array }): { destroy(): Promise<void>; promise: Promise<{
    numPages: number;
    getPage(n: number): Promise<{
      getViewport(o: { scale: number }): { width: number; height: number };
      getTextContent(): Promise<{ items: ({ str: string; transform: number[]; width: number; height: number } | { type: string })[] }>;
    }>;
  }> };
};

export type Blok = {
  sayfa: number;
  /** 0: tüm genişliği kaplayan metin (başlık vb.); 1..n: soldan sağa sütunlar. */
  kolon: number;
  metin: string;
  /** Sayfadaki konum (mm, sol üst başlangıç). */
  kutu: { x: number; y: number; w: number; h: number };
  punto: number;
};
export type SayfaMetni = { no: number; genislikMm: number; yukseklikMm: number; bloklar: Blok[] };
export type PdfMetni = { sayfaSayisi: number; sayfalar: SayfaMetni[]; metinVar: boolean };

type Oge = { x: number; y: number; w: number; h: number; s: string };
type Satir = { y: number; x0: number; x1: number; punto: number; metin: string };

const GAP_MM = 3.5; // sütun boşluğu en az bu kadar

function satirlaraDok(ogeler: Oge[]): Satir[] {
  const sirali = [...ogeler].sort((a, b) => b.y - a.y || a.x - b.x);
  const gruplar: Oge[][] = [];
  for (const o of sirali) {
    const g = gruplar.find((q) => Math.abs(q[0]!.y - o.y) <= Math.max(q[0]!.h, o.h) * 0.4);
    if (g) g.push(o); else gruplar.push([o]);
  }
  return gruplar.map((g) => {
    g.sort((a, b) => a.x - b.x);
    let metin = ''; let sonX = -Infinity;
    for (const o of g) {
      const bosluk = o.x - sonX;
      if (metin && bosluk > o.h * 0.18 && !metin.endsWith(' ') && !o.s.startsWith(' ')) metin += ' ';
      metin += o.s; sonX = o.x + o.w;
    }
    const punto = Math.max(...g.map((o) => o.h));
    return { y: Math.max(...g.map((o) => o.y)), x0: g[0]!.x, x1: Math.max(...g.map((o) => o.x + o.w)), punto, metin: metin.replace(/\s+$/g, '') };
  }).filter((s) => s.metin.trim());
}

function paragraflaraBol(satirlar: Satir[]): { metin: string; satirlar: Satir[] }[] {
  const s = [...satirlar].sort((a, b) => b.y - a.y);
  // Paragraf ayırma: satır aralığı, sütundaki tipik satır aralığının belirgin üstündeyse (yazı boyutu tahminine bağlı değil).
  const aralar = s.slice(1).map((x, i) => s[i]!.y - x.y).filter((d) => d > 0).sort((a, b) => a - b);
  const tipik = aralar[Math.floor(aralar.length / 2)] ?? 0;
  const out: { metin: string; satirlar: Satir[] }[] = [];
  for (const sat of s) {
    const son = out[out.length - 1];
    const prev = son?.satirlar[son.satirlar.length - 1];
    const boyutFarki = prev ? Math.abs(prev.punto - sat.punto) / Math.max(prev.punto, sat.punto) : 0;
    const bosluk = prev ? prev.y - sat.y : 0;
    const yeni = !prev || (tipik > 0 ? bosluk > tipik * 1.45 : bosluk > Math.max(prev.punto, sat.punto) * 1.7) || boyutFarki > 0.2;
    if (yeni) { out.push({ metin: sat.metin, satirlar: [sat] }); continue; }
    son!.satirlar.push(sat);
    // Satır sonu kısa çizgi: sonraki satır küçük harfle başlıyorsa kelimeyi birleştir.
    son!.metin = /\p{L}-$/u.test(son!.metin) && /^\p{Ll}/u.test(sat.metin) ? son!.metin.slice(0, -1) + sat.metin : son!.metin + ' ' + sat.metin;
  }
  return out;
}

/** Sütun sınırlarını x izdüşümündeki boşluklardan bulur (geniş başlıklar hariç tutulur). */
function sutunlar(ogeler: Oge[], sayfaW: number): [number, number][] {
  const araliklar = ogeler.filter((o) => o.s.trim()).map((o) => [o.x, o.x + o.w] as [number, number]).sort((a, b) => a[0] - b[0]);
  const birlesik: [number, number][] = [];
  for (const [a, b] of araliklar) {
    const son = birlesik[birlesik.length - 1];
    if (son && a - son[1] < GAP_MM * MM_PT) son[1] = Math.max(son[1], b); else birlesik.push([a, b]);
  }
  // Çok dar (tek kelimelik) artıkları komşuya kat.
  return birlesik.filter((c) => c[1] - c[0] > sayfaW * 0.04 || birlesik.length === 1);
}

export function sayfayiBloklaraAyir(no: number, ogeler: Oge[], W: number, H: number): Blok[] {
  const dar = ogeler.filter((o) => o.w < W * 0.45 || !o.s.trim());
  // Sütun sınırları yalnızca gövde yazısından bulunur; büyük başlıklar birden çok sütuna taşabilir.
  const boylar = dar.filter((o) => o.s.trim()).map((o) => o.h).sort((a, b) => a - b);
  const medyan = boylar[Math.floor(boylar.length / 2)] ?? 0;
  const sutun = sutunlar(dar.filter((o) => o.h <= medyan * 1.35), W);
  const sutunNo = (o: Oge) => {
    const ort = o.x + o.w / 2;
    let en = 0, fark = Infinity;
    sutun.forEach((c, i) => { const d = ort < c[0] ? c[0] - ort : ort > c[1] ? ort - c[1] : 0; if (d < fark) { fark = d; en = i; } });
    return en + 1;
  };
  const geniş = ogeler.filter((o) => o.w >= W * 0.45 && o.s.trim());
  const gruplar = new Map<number, Oge[]>();
  if (geniş.length) gruplar.set(0, geniş);
  for (const o of dar) if (o.s.trim()) { const k = sutunNo(o); gruplar.set(k, [...(gruplar.get(k) ?? []), o]); }
  const bloklar: Blok[] = [];
  for (const k of [...gruplar.keys()].sort((a, b) => a - b)) {
    for (const p of paragraflaraBol(satirlaraDok(gruplar.get(k)!))) {
      const x0 = Math.min(...p.satirlar.map((s) => s.x0)), x1 = Math.max(...p.satirlar.map((s) => s.x1));
      const yUst = Math.max(...p.satirlar.map((s) => s.y + s.punto * 0.8)), yAlt = Math.min(...p.satirlar.map((s) => s.y - s.punto * 0.2));
      bloklar.push({ sayfa: no, kolon: k, metin: p.metin.trim(), punto: Math.round(p.satirlar[0]!.punto * 10) / 10,
        kutu: { x: x0 / MM_PT, y: (H - yUst) / MM_PT, w: (x1 - x0) / MM_PT, h: (yUst - yAlt) / MM_PT } });
    }
  }
  return bloklar;
}

/** PDF'in metin katmanını okur: sütun sırasıyla, paragraflara ayrılmış bloklar. Kaynak PDF'ye dokunmaz. */
export async function metinCikar(bayt: Uint8Array, lib: PdfJsLib): Promise<PdfMetni> {
  const gorev = lib.getDocument({ data: bayt.slice() });
  const doc = await gorev.promise;
  const sayfalar: SayfaMetni[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const sayfa = await doc.getPage(n);
      const vp = sayfa.getViewport({ scale: 1 });
      const tc = await sayfa.getTextContent();
      const ogeler: Oge[] = [];
      for (const i of tc.items) {
        if (!('str' in i)) continue;
        const [, , , d, x, y] = i.transform as [number, number, number, number, number, number];
        ogeler.push({ x: x!, y: y!, w: i.width, h: Math.abs(d!) || i.height, s: i.str });
      }
      sayfalar.push({ no: n, genislikMm: vp.width / MM_PT, yukseklikMm: vp.height / MM_PT, bloklar: sayfayiBloklaraAyir(n, ogeler, vp.width, vp.height) });
    }
  } finally { await gorev.destroy(); }
  return { sayfaSayisi: doc.numPages, sayfalar, metinVar: sayfalar.some((s) => s.bloklar.length > 0) };
}
