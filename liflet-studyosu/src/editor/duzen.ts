import type { Rect, YaziStili } from '../model/types';

/** Metin ölçer: verilen puntoda metnin genişliği (pt). Hem önizleme hem PDF aynı ölçeri kullanır. */
export type Olcer = (metin: string, stil: Pick<YaziStili, 'aile' | 'kalin'>, punto: number) => number;

export const MM_PT = 72 / 25.4;
/** İlk satırın taban çizgisi: üstten punto × bu katsayı. Önizleme ve PDF aynı değeri kullanır. */
export const ASCENT = 0.9;

export type Parca = { t: string; x: number; y: number }; // mm, sayfa koordinatı; y taban çizgisi
export type Duzen = {
  parcalar: Parca[]; satirSayisi: number;
  /** Gereken yükseklik (mm). */
  gerekenYukseklik: number;
  sigiyor: boolean;
  /** Tek başına satıra sığmayan kelime var (kelime bölünmez, taşma sayılır). */
  tasanKelime: string | null;
};

/** Kelimeleri bölmeden satırlara sarar. */
export function sar(metin: string, stil: YaziStili, genislikPt: number, olc: Olcer): { satirlar: string[][]; tasanKelime: string | null; sonSatirParagrafSonu: boolean[] } {
  const satirlar: string[][] = []; const sonlar: boolean[] = []; let tasan: string | null = null;
  for (const par of metin.replace(/\r/g, '').split('\n')) {
    const kelimeler = par.split(/\s+/).filter(Boolean);
    if (!kelimeler.length) { satirlar.push([]); sonlar.push(true); continue; }
    let cur: string[] = [];
    for (const k of kelimeler) {
      if (olc(k, stil, stil.punto) > genislikPt && !tasan) tasan = k;
      const dene = [...cur, k].join(' ');
      if (cur.length && olc(dene, stil, stil.punto) > genislikPt) { satirlar.push(cur); sonlar.push(false); cur = [k]; } else cur.push(k);
    }
    satirlar.push(cur); sonlar.push(true);
  }
  return { satirlar, tasanKelime: tasan, sonSatirParagrafSonu: sonlar };
}

export function duzenle(metin: string, stil: YaziStili, rect: Rect, olc: Olcer): Duzen {
  const gPt = rect.w * MM_PT;
  const { satirlar, tasanKelime, sonSatirParagrafSonu } = sar(metin, stil, gPt, olc);
  const adim = (stil.punto * stil.satirAraligi) / MM_PT; // mm
  const parcalar: Parca[] = [];
  satirlar.forEach((kel, i) => {
    if (!kel.length) return;
    const y = rect.y + (stil.punto * ASCENT) / MM_PT + i * adim;
    const satir = kel.join(' ');
    const wPt = olc(satir, stil, stil.punto);
    if (stil.hiza === 'iki' && !sonSatirParagrafSonu[i] && kel.length > 1) {
      const kelimeToplam = kel.reduce((a, k) => a + olc(k, stil, stil.punto), 0);
      const bosluk = (gPt - kelimeToplam) / (kel.length - 1);
      let x = rect.x;
      kel.forEach((k) => { parcalar.push({ t: k, x, y }); x += (olc(k, stil, stil.punto) + bosluk) / MM_PT; });
      return;
    }
    const x = stil.hiza === 'orta' ? rect.x + (gPt - wPt) / 2 / MM_PT : stil.hiza === 'sag' ? rect.x + (gPt - wPt) / MM_PT : rect.x;
    parcalar.push({ t: satir, x, y });
  });
  const gerek = satirlar.length ? ((satirlar.length - 1) * stil.punto * stil.satirAraligi + stil.punto * 1.15) / MM_PT : 0;
  return { parcalar, satirSayisi: satirlar.length, gerekenYukseklik: gerek, sigiyor: gerek <= rect.h + 0.01 && !tasanKelime, tasanKelime };
}

/** Sığmayan metin için ÖNERİ üretir; hiçbir şeyi kendiliğinden silmez veya küçültmez. */
export function metinOnerileri(metin: string): string[] {
  const o: string[] = [];
  const cumleler = metin.split(/(?<=[.!?])\s+|\n+/).map((c) => c.trim()).filter(Boolean);
  const gorulen = new Map<string, number>();
  for (const c of cumleler) { const k = c.toLocaleLowerCase('tr'); gorulen.set(k, (gorulen.get(k) ?? 0) + 1); }
  for (const [k, n] of gorulen) if (n > 1) o.push(`Şu cümle ${n} kez geçiyor, tekrarı kaldırabilirsiniz: "${k.slice(0, 60)}"`);
  for (const c of cumleler) { const n = c.split(/\s+/).length; if (n > 25) o.push(`Uzun cümle (${n} kelime), ikiye bölmeyi veya sadeleştirmeyi düşünün: "${c.slice(0, 60)}…"`); }
  const kel = metin.toLocaleLowerCase('tr').match(/[\p{L}]{3,}/gu) ?? [];
  const art = new Map<string, number>();
  for (let i = 1; i < kel.length; i++) if (kel[i] === kel[i - 1]) art.set(kel[i]!, (art.get(kel[i]!) ?? 0) + 1);
  for (const [k, n] of art) o.push(`Art arda tekrar eden kelime: "${k}" (${n} kez)`);
  return o.slice(0, 6);
}

export const SIGMAMA_UYARISI = 'Bu metin mevcut alana sığmıyor. Metni düzenlemek veya içerik alanını yönetici izniyle değiştirmek ister misiniz?';
