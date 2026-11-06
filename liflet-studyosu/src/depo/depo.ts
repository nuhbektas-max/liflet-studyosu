import { depoEkle, depoListele, type DepoKaydi } from '../storage/db';
import { metinCikar, type PdfJsLib } from './metinCikar';
import { HAZIR_KUTUPHANE } from '../kutuphane/hazir';

export async function sha256(bayt: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bayt as BufferSource);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export const pdfMi = (b: Uint8Array) => b.length > 5 && String.fromCharCode(...b.slice(0, 5)) === '%PDF-';

/** Aynı adı tekrar kullanmamak için " (2)" ekler. */
export function benzersizAd(ad: string, mevcut: string[]): string {
  if (!mevcut.includes(ad)) return ad;
  let n = 2; while (mevcut.includes(`${ad} (${n})`)) n++;
  return `${ad} (${n})`;
}

export type IceAlSonuc = { durum: 'eklendi' | 'kopya' | 'hata'; kayit?: DepoKaydi; mesaj: string };

/**
 * PDF'yi depoya alır. Dosya olduğu gibi (değiştirilmeden) saklanır, metni ayrıca çıkarılır.
 * Aynı içerik (SHA-256) ikinci kez eklenmez.
 */
export async function pdfIceAl(dosya: { name: string; arrayBuffer(): Promise<ArrayBuffer> }, lib: PdfJsLib, ad?: string): Promise<IceAlSonuc> {
  const buf = await dosya.arrayBuffer();
  const bayt = new Uint8Array(buf);
  if (!pdfMi(bayt)) return { durum: 'hata', mesaj: `"${dosya.name}" geçerli bir PDF dosyası değil.` };
  const mevcut = await depoListele();
  const ozet = await sha256(bayt);
  const ayni = mevcut.find((k) => k.sha256 === ozet);
  if (ayni) return { durum: 'kopya', kayit: ayni, mesaj: `"${dosya.name}" zaten depoda ("${ayni.ad}" adıyla).` };
  let metin;
  try { metin = await metinCikar(bayt, lib); }
  catch (e) { return { durum: 'hata', mesaj: `"${dosya.name}" okunamadı: ${(e as Error).message}` }; }
  const kayit: DepoKaydi = {
    id: crypto.randomUUID(),
    ad: benzersizAd((ad ?? dosya.name.replace(/\.pdf$/i, '')).trim() || 'Adsız', mevcut.map((k) => k.ad)),
    dosyaAdi: dosya.name, sha256: ozet, boyut: bayt.length, sayfaSayisi: metin.sayfaSayisi, metin, eklenme: Date.now(),
  };
  await depoEkle(kayit, buf);
  return { durum: 'eklendi', kayit, mesaj: metin.metinVar ? `"${kayit.ad}" eklendi.` : `"${kayit.ad}" eklendi, ama metin katmanı yok (taranmış olabilir). Metin çekmek için OCR gerekir.` };
}

export type AramaSonucu = { kayit: DepoKaydi; sayfa: number; kolon: number; metin: string };

/** Depodaki tüm PDF'lerin metninde arar (Türkçe büyük/küçük harf duyarsız). */
export function depoAra(liste: DepoKaydi[], sorgu: string, sinir = 100): AramaSonucu[] {
  const q = sorgu.trim().toLocaleLowerCase('tr');
  if (!q) return [];
  const out: AramaSonucu[] = [];
  for (const kayit of liste) for (const s of kayit.metin.sayfalar) for (const b of s.bloklar)
    if (b.metin.toLocaleLowerCase('tr').includes(q)) { out.push({ kayit, sayfa: s.no, kolon: b.kolon, metin: b.metin }); if (out.length >= sinir) return out; }
  return out;
}

export function duzMetin(k: DepoKaydi): string {
  return k.metin.sayfalar.map((s) => `--- Sayfa ${s.no} ---\n` + s.bloklar.map((b) => b.metin).join('\n\n')).join('\n\n');
}

/** Hazır kütüphane + kullanıcının yüklediği PDF'ler. */
export async function tumKayitlar(): Promise<DepoKaydi[]> {
  const k = await depoListele();
  return [...HAZIR_KUTUPHANE, ...k].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}
