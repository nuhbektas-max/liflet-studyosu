import type { Project } from '../model/types';
import type { Kimlik } from '../model/kimlik';
import type { PdfMetni } from '../depo/metinCikar';

const AD = 'liflet-studyosu';
const SURUM = 3;

function ac(): Promise<IDBDatabase> {
  return new Promise((coz, red) => {
    const istek = indexedDB.open(AD, SURUM);
    istek.onupgradeneeded = () => {
      const db = istek.result;
      if (!db.objectStoreNames.contains('projeler')) db.createObjectStore('projeler', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kimlikler')) db.createObjectStore('kimlikler', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('depo')) db.createObjectStore('depo', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('depoDosya')) db.createObjectStore('depoDosya');
      // Kaynak PDF'ler ve yedekleri: asla üzerine yazılmaz.
      if (!db.objectStoreNames.contains('kaynaklar')) db.createObjectStore('kaynaklar', { keyPath: 'id' });
    };
    istek.onsuccess = () => coz(istek.result);
    istek.onerror = () => red(istek.error);
  });
}

async function islem<T>(depo: string, mod: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await ac();
  return new Promise((coz, red) => {
    const tx = db.transaction(depo, mod);
    const r = f(tx.objectStore(depo));
    tx.oncomplete = () => { db.close(); coz(r.result); };
    tx.onerror = () => { db.close(); red(tx.error); };
  });
}

export const projeKaydet = (p: Project) => islem('projeler', 'readwrite', (s) => s.put(p));
export const projeOku = (id: string) => islem<Project | undefined>('projeler', 'readonly', (s) => s.get(id));
export const projeSil = (id: string) => islem('projeler', 'readwrite', (s) => s.delete(id));
export async function projeleriListele(): Promise<Project[]> {
  const hepsi = await islem<Project[]>('projeler', 'readonly', (s) => s.getAll());
  return hepsi.sort((a, b) => b.guncelleme - a.guncelleme);
}

export type KaynakKaydi = { id: string; ad: string; sha256: string; veri: ArrayBuffer; eklenme: number };

/** Kaynak yalnızca bir kez yazılır; aynı kimlik varsa reddedilir (orijinali bozmama kuralı). */
export async function kaynakEkle(k: KaynakKaydi): Promise<void> {
  if (await islem('kaynaklar', 'readonly', (s) => s.get(k.id))) {
    throw new Error('Bu kaynak zaten kayıtlı; üzerine yazılamaz.');
  }
  await islem('kaynaklar', 'readwrite', (s) => s.add(k));
}
export const kaynakOku = (id: string) => islem<KaynakKaydi | undefined>('kaynaklar', 'readonly', (s) => s.get(id));

/** Proje yedeği (düzenlenebilir proje dosyası). */
export const yedekMetni = (p: Project) => JSON.stringify({ tur: 'liflet-projesi', surum: 1, proje: p }, null, 2);
export function yedekCoz(metin: string): Project {
  const o = JSON.parse(metin);
  if (o?.tur !== 'liflet-projesi' || !o.proje?.id) throw new Error('Geçerli bir liflet proje dosyası değil.');
  return o.proje as Project;
}

export const kimlikKaydet = (k: Kimlik) => islem('kimlikler', 'readwrite', (s) => s.put(k));
export const kimlikSil = (id: string) => islem('kimlikler', 'readwrite', (s) => s.delete(id));
export async function kimlikleriListele(): Promise<Kimlik[]> {
  const h = await islem<Kimlik[]>('kimlikler', 'readonly', (s) => s.getAll());
  return h.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

/** Liflet deposu: kullanıcının yüklediği hazır PDF'ler. Dosya baytları ayrı depoda, orijinal olarak saklanır. */
export type DepoKaydi = {
  id: string; ad: string; dosyaAdi: string; sha256: string; boyut: number;
  sayfaSayisi: number; metin: PdfMetni; eklenme: number;
  /** Uygulamayla gelen hazır kütüphane kaydı (salt okunur). */
  hazir?: boolean;
  /** Metnin nasıl çıkarıldığı: PDF metin katmanı ya da OCR (hata olabilir). */
  kaynak?: 'metin-katmani' | 'ocr';
  ocrGuven?: number;
};
export async function depoEkle(k: DepoKaydi, veri: ArrayBuffer): Promise<void> {
  const db = await ac();
  await new Promise<void>((coz, red) => {
    const tx = db.transaction(['depo', 'depoDosya'], 'readwrite');
    tx.objectStore('depo').put(k); tx.objectStore('depoDosya').put(veri, k.id);
    tx.oncomplete = () => { db.close(); coz(); }; tx.onerror = () => { db.close(); red(tx.error); };
  });
}
export async function depoListele(): Promise<DepoKaydi[]> {
  const h = await islem<DepoKaydi[]>('depo', 'readonly', (s) => s.getAll());
  return h.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}
export const depoDosyaOku = (id: string) => islem<ArrayBuffer | undefined>('depoDosya', 'readonly', (s) => s.get(id));
export const depoAdDegistir = async (id: string, ad: string) => {
  const k = await islem<DepoKaydi | undefined>('depo', 'readonly', (s) => s.get(id));
  if (k) await islem('depo', 'readwrite', (s) => s.put({ ...k, ad }));
};
export async function depoSil(id: string): Promise<void> {
  const db = await ac();
  await new Promise<void>((coz, red) => {
    const tx = db.transaction(['depo', 'depoDosya'], 'readwrite');
    tx.objectStore('depo').delete(id); tx.objectStore('depoDosya').delete(id);
    tx.oncomplete = () => { db.close(); coz(); }; tx.onerror = () => { db.close(); red(tx.error); };
  });
}
