import { PDFDocument, rgb, pushGraphicsState, popGraphicsState, rectangle, clip, endPath, type PDFPage } from 'pdf-lib';
import { fontlariYukle } from './olcer';
import { duzenle, MM_PT, type Olcer } from './duzen';
import { stilBul } from './stil';
import { etkinTur, fotoYerlesim, golgeKatmanlari, metinKutusu } from './gorunum';
import type { Project, Slot } from '../model/types';

export type PdfSecenek = { tur: 'baski' | 'ekran'; tasmaMm?: number };

function renk(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return rgb(0, 0, 0);
  const n = parseInt(m[1]!, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

async function gorselGom(doc: PDFDocument, veri: string) {
  const [bas, b64] = veri.split(',');
  const bayt = Uint8Array.from(atob(b64 ?? ''), (c) => c.charCodeAt(0));
  if (/image\/png/.test(bas ?? '')) return doc.embedPng(bayt);
  if (/image\/jpe?g/.test(bas ?? '')) return doc.embedJpg(bayt);
  // Diğer biçimler (webp vb.) tarayıcıda PNG'ye çevrilir.
  const im = await new Promise<HTMLImageElement>((c, r) => { const i = new Image(); i.onload = () => c(i); i.onerror = r; i.src = veri; });
  const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  cv.getContext('2d')!.drawImage(im, 0, 0);
  const png = cv.toDataURL('image/png').split(',')[1]!;
  return doc.embedPng(Uint8Array.from(atob(png), (c) => c.charCodeAt(0)));
}

/**
 * Seçilebilir metinli, gömülü fontlu PDF. Taşma payı sayfayı büyütür; net alan (TrimBox) ve
 * içerik koordinatları (taşma kadar ötelenmiş) değişmez.
 */
export async function pdfUret(p: Project, olc: Olcer, sec: PdfSecenek): Promise<Uint8Array> {
  const t = p.sablon;
  const tasma = sec.tur === 'baski' ? (sec.tasmaMm ?? 0) : 0;
  const doc = await PDFDocument.create();
  doc.setTitle(p.ad); doc.setProducer('Liflet Tasarım Stüdyosu'); doc.setLanguage('tr-TR');
  const font = await fontlariYukle(doc);
  const W = t.sayfa.genislik + 2 * tasma, H = t.sayfa.yukseklik + 2 * tasma;
  const sayfalar: PDFPage[] = [];
  for (let i = 0; i < t.sayfa.sayi; i++) {
    const s = doc.addPage([W * MM_PT, H * MM_PT]);
    const pt = (mm: number) => mm * MM_PT;
    s.setTrimBox(pt(tasma), pt(tasma), pt(t.sayfa.genislik), pt(t.sayfa.yukseklik));
    s.setBleedBox(0, 0, pt(W), pt(H));
    sayfalar.push(s);
  }
  const X = (x: number) => (x + tasma) * MM_PT;
  const Y = (y: number) => (H - tasma - y) * MM_PT; // üstten → alttan

  for (const o of t.sabit) {
    const s = sayfalar[o.sayfa]; const r = o.rect; const c = o.cizim?.renk;
    if (!s || typeof c !== 'string') continue;
    // Arka plan taşma alanına kadar uzatılır (yalnızca tam sayfa arka planlar).
    const tam = o.tur === 'arkaplan' && r.x <= 0 && r.y <= 0 && r.w >= t.sayfa.genislik && r.h >= t.sayfa.yukseklik;
    if (tam) s.drawRectangle({ x: 0, y: 0, width: W * MM_PT, height: H * MM_PT, color: renk(c) });
    else s.drawRectangle({ x: X(r.x), y: Y(r.y + r.h), width: r.w * MM_PT, height: r.h * MM_PT, color: renk(c) });
  }

  for (const a of t.alanlar as Slot[]) {
    const s = sayfalar[a.sayfa]; const c = p.icerik[a.id];
    if (!s || !c) continue;
    const r = a.rect; const tur = etkinTur(a, c);
    const kutu = (q: typeof r) => ({ x: X(q.x), y: Y(q.y + q.h), width: q.w * MM_PT, height: q.h * MM_PT });
    if (c.golge) for (const k of golgeKatmanlari(r, c.golge)) s.drawRectangle({ ...kutu(k.rect), color: renk(c.golge.renk), opacity: k.opaklik });
    if (c.zemin) s.drawRectangle({ ...kutu(r), color: renk(c.zemin.renk), opacity: c.zemin.opaklik });
    if (tur !== 'metin') {
      if (c.foto && c.fotoBoyut) {
        const img = await gorselGom(doc, c.foto);
        const k = fotoYerlesim(a, c)!;
        s.pushOperators(pushGraphicsState(), rectangle(X(r.x), Y(r.y + r.h), r.w * MM_PT, r.h * MM_PT), clip(), endPath());
        s.drawImage(img, { x: X(k.x), y: Y(k.y + k.h), width: k.w * MM_PT, height: k.h * MM_PT });
        s.pushOperators(popGraphicsState());
      }
    } else if (c.metin) {
      const st = stilBul(a, c);
      const d = duzenle(c.metin, st, metinKutusu(r, c), olc);
      const f = font(st.aile, st.kalin);
      for (const q of d.parcalar) {
        if (c.yaziGolge) s.drawText(q.t, { x: X(q.x + c.yaziGolge.dx), y: Y(q.y + c.yaziGolge.dy), size: st.punto, font: f, color: renk(c.yaziGolge.renk), opacity: c.yaziGolge.opaklik });
        s.drawText(q.t, { x: X(q.x), y: Y(q.y), size: st.punto, font: f, color: renk(c.yaziRenk ?? '#1a1a1a') });
      }
    }
    if (c.kenar && c.kenar.kalinlik > 0) s.drawRectangle({ ...kutu(r), borderColor: renk(c.kenar.renk), borderWidth: c.kenar.kalinlik * MM_PT });
  }
  return doc.save();
}
