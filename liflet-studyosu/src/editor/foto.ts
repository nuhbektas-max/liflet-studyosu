import type { Rect } from '../model/types';

/** "Kapla" yerleşimi: orijinal en-boy oranı korunur; alan taşmadan dolar. Dönüş: alan içine göre mm. */
export function kapla(img: { w: number; h: number }, rect: Rect, olcek = 1, konum = { x: 0.5, y: 0.5 }, mod: 'kapla' | 'sigdir' = 'kapla', hiza = { x: 0.5, y: 0.5 }) {
  if (mod === 'sigdir') {
    const q = Math.min(rect.w / img.w, rect.h / img.h);
    return { x: (rect.w - img.w * q) * hiza.x, y: (rect.h - img.h * q) * hiza.y, w: img.w * q, h: img.h * q };
  }
  const s = Math.max(rect.w / img.w, rect.h / img.h) * Math.max(1, olcek);
  const w = img.w * s, h = img.h * s;
  const x = -(w - rect.w) * Math.min(1, Math.max(0, konum.x));
  const y = -(h - rect.h) * Math.min(1, Math.max(0, konum.y));
  return { x, y, w, h };
}

export const DPI_BASKI = 200;
export const DPI_EKRAN = 96;

export function dpiDurumu(dpi: number | null): 'yok' | 'iyi' | 'zayif' | 'yetersiz' {
  if (dpi == null) return 'yok';
  return dpi >= DPI_BASKI ? 'iyi' : dpi >= 150 ? 'zayif' : 'yetersiz';
}

export function dosyaOku(f: File): Promise<{ foto: string; fotoBoyut: { w: number; h: number } }> {
  return new Promise((coz, red) => {
    const r = new FileReader();
    r.onload = () => {
      const foto = String(r.result);
      const im = new Image();
      im.onload = () => coz({ foto, fotoBoyut: { w: im.naturalWidth, h: im.naturalHeight } });
      im.onerror = () => red(new Error('Görsel okunamadı.'));
      im.src = foto;
    };
    r.onerror = () => red(new Error('Dosya okunamadı.'));
    r.readAsDataURL(f);
  });
}
