/** Logo işleme: boş kenar kırpma, beyaz zemini saydamlaştırma, küçültme, SVG'yi resme çevirme. Oran hiçbir zaman bozulmaz. */

export type RGBA = { data: Uint8ClampedArray; width: number; height: number };
export type LogoSecenek = { kirp: boolean; beyazSaydam: boolean };
export const VARSAYILAN_LOGO: LogoSecenek = { kirp: true, beyazSaydam: false };
/** Büyük logolar bu uzun kenara küçültülür (ör. 34 mm alanda 300 dpi için ~400 px yeter). */
export const EN_BUYUK_KENAR = 1600;

export type Kutu = { x: number; y: number; w: number; h: number };

const uzak = (d: Uint8ClampedArray, i: number, j: number) => Math.abs(d[i]! - d[j]!) + Math.abs(d[i + 1]! - d[j + 1]!) + Math.abs(d[i + 2]! - d[j + 2]!);

/**
 * Logonun asıl içeriğini saran kutu. Zemin saydamsa saydam olmayan, düz renkse (köşelerden bilinir) zemin renginden
 * ayrışan pikseller içerik sayılır. Zemin belirlenemezse (köşeler farklı) tüm görüntü döner.
 */
export function icerikSinirlari(img: RGBA, tolerans = 30): Kutu {
  const { data: d, width: W, height: H } = img;
  const tam = { x: 0, y: 0, w: W, h: H };
  const koseler = [0, (W - 1) * 4, (H - 1) * W * 4, ((H - 1) * W + W - 1) * 4];
  const saydamKose = koseler.filter((i) => d[i + 3]! < 16).length;
  let icerik: (i: number) => boolean;
  if (saydamKose >= 3) icerik = (i) => d[i + 3]! >= 16;
  else {
    const ref = koseler[0]!;
    const benzer = koseler.filter((i) => d[i + 3]! >= 16 && uzak(d, i, ref) <= tolerans).length;
    if (benzer < 3) return tam;
    icerik = (i) => d[i + 3]! >= 16 && uzak(d, i, ref) > tolerans;
  }
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (icerik((y * W + x) * 4)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return tam;
  const pay = Math.max(1, Math.round(Math.max(W, H) * 0.01)); // kenarda küçük nefes payı
  x0 = Math.max(0, x0 - pay); y0 = Math.max(0, y0 - pay); x1 = Math.min(W - 1, x1 + pay); y1 = Math.min(H - 1, y1 + pay);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Beyaza yakın pikselleri saydam yapar (kenarlarda yumuşak geçiş). Yeni bir görüntü döner. */
export function beyaziSaydamYap(img: RGBA): RGBA {
  const d = new Uint8ClampedArray(img.data);
  for (let i = 0; i < d.length; i += 4) {
    const m = Math.min(d[i]!, d[i + 1]!, d[i + 2]!);
    if (m >= 245) d[i + 3] = 0;
    else if (m >= 215) d[i + 3] = Math.round((d[i + 3]! * (245 - m)) / 30);
  }
  return { data: d, width: img.width, height: img.height };
}

export function kirp(img: RGBA, k: Kutu): RGBA {
  const d = new Uint8ClampedArray(k.w * k.h * 4);
  for (let y = 0; y < k.h; y++) d.set(img.data.subarray(((k.y + y) * img.width + k.x) * 4, ((k.y + y) * img.width + k.x + k.w) * 4), y * k.w * 4);
  return { data: d, width: k.w, height: k.h };
}

/** Uzun kenarı sınırlar, oranı korur. Küçültme gerekmiyorsa aynı ölçüyü verir. */
export function kucultOlcusu(w: number, h: number, enBuyuk = EN_BUYUK_KENAR): { w: number; h: number } {
  const o = Math.min(1, enBuyuk / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * o)), h: Math.max(1, Math.round(h * o)) };
}

// ---- Tarayıcı (canvas) sarmalayıcıları ----

function resimYukle(src: string, boyut?: { w: number; h: number }): Promise<HTMLImageElement> {
  return new Promise((coz, red) => {
    const im = boyut ? new Image(boyut.w, boyut.h) : new Image();
    im.onload = () => coz(im);
    im.onerror = () => red(new Error('Görsel okunamadı.'));
    im.src = src;
  });
}

function canvasaCiz(im: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!; c.imageSmoothingQuality = 'high'; c.drawImage(im, 0, 0, w, h);
  return cv;
}

const dosyaMetni = (f: File) => new Promise<string>((coz, red) => { const r = new FileReader(); r.onload = () => coz(String(r.result)); r.onerror = () => red(new Error('Dosya okunamadı.')); r.readAsDataURL(f); });

/** SVG'nin oranını width/height ya da viewBox'tan bulur (tarayıcı ölçü vermezse). */
function svgOrani(metin: string): { w: number; h: number } {
  const g = /<svg[^>]*\swidth="([\d.]+)(?:px)?"/i.exec(metin), y = /<svg[^>]*\sheight="([\d.]+)(?:px)?"/i.exec(metin);
  if (g && y) return { w: +g[1]!, h: +y[1]! };
  const vb = /viewBox="[\d.\-]+[ ,]+[\d.\-]+[ ,]+([\d.]+)[ ,]+([\d.]+)"/i.exec(metin);
  if (vb) return { w: +vb[1]!, h: +vb[2]! };
  return { w: 1000, h: 1000 };
}

/** Dosyayı "ham" PNG'ye çevirir (en çok 1600 px; SVG ve her biçim PNG olur). */
export async function logoHamOlustur(f: File): Promise<string> {
  const veri = await dosyaMetni(f);
  let boyut: { w: number; h: number } | undefined;
  if (f.type === 'image/svg+xml' || /\.svg$/i.test(f.name)) {
    const o = svgOrani(await f.text());
    boyut = kucultOlcusu(o.w, o.h);
    const k = Math.max(boyut.w, boyut.h) < 800 ? 800 / Math.max(boyut.w, boyut.h) : 1; // vektörü yeterince büyük çiz
    boyut = { w: Math.round(boyut.w * k), h: Math.round(boyut.h * k) };
  }
  const im = await resimYukle(veri, boyut);
  const o = boyut ?? kucultOlcusu(im.naturalWidth, im.naturalHeight);
  if (!o.w || !o.h) throw new Error('Görselin ölçüsü okunamadı.');
  return canvasaCiz(im, o.w, o.h).toDataURL('image/png');
}

/** Ham görüntüden seçeneklere göre işlenmiş logoyu üretir. */
export async function logoIsle(ham: string, s: LogoSecenek): Promise<{ foto: string; boyut: { w: number; h: number } }> {
  const im = await resimYukle(ham);
  const cv = canvasaCiz(im, im.naturalWidth, im.naturalHeight);
  const c = cv.getContext('2d')!;
  let img: RGBA = c.getImageData(0, 0, cv.width, cv.height);
  if (s.beyazSaydam) img = beyaziSaydamYap(img);
  if (s.kirp) { const k = icerikSinirlari(img); if (k.w !== img.width || k.h !== img.height) img = kirp(img, k); }
  const son = document.createElement('canvas'); son.width = img.width; son.height = img.height;
  son.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return { foto: son.toDataURL('image/png'), boyut: { w: img.width, h: img.height } };
}
