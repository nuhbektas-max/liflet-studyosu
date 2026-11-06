import { sablonOnayla } from './lock';
import type { Slot, Template } from './types';

/**
 * GELİŞTİRME / DENEME şablonu. Bakanlık tasarımı DEĞİLDİR; editör ve PDF üretimini sınamak içindir.
 * Yalnızca brifteki ölçüler (300×210 yatay, 2 sayfa, 3 sütun) kullanılır; renkler ve yerleşim yapaydır.
 */
const M = 12, GAP = 6, KOL = (300 - 2 * M - 2 * GAP) / 3;
const kolon = (i: number) => M + i * (KOL + GAP);
const yazi = { aile: 'Sans' as const, punto: 9.5, satirAraligi: 1.3, hiza: 'sol' as const };

const alanlar: Slot[] = [
  ...[0, 1].flatMap((s): Slot[] => [
    { id: `s${s}-logo-sol`, sayfa: s, tur: 'logo', ad: 'Logo (Bakanlık)', kimlikRolu: 'logo-bakanlik', rect: { x: M, y: 3, w: 34, h: 9 } },
    { id: `s${s}-logo-orta`, sayfa: s, tur: 'logo', ad: 'Logo (Valilik)', kimlikRolu: 'logo-valilik', rect: { x: 150 - 17, y: 3, w: 34, h: 9 } },
    { id: `s${s}-logo-sag`, sayfa: s, tur: 'logo', ad: 'Logo (İl Müdürlüğü)', kimlikRolu: 'logo-mudurluk', rect: { x: 300 - M - 34, y: 3, w: 34, h: 9 } },
  ]),
  { id: 's0-baslik', sayfa: 0, tur: 'baslik', ad: 'Ürün başlığı', rect: { x: kolon(1), y: 14, w: KOL * 2 + GAP, h: 22 }, yazi: { aile: 'Serif', kalin: true, punto: 26, satirAraligi: 1.1, hiza: 'sol' } },
  { id: 's0-foto', sayfa: 0, tur: 'foto', ad: 'Ana fotoğraf', rect: { x: kolon(0), y: 14, w: KOL, h: 80 } },
  { id: 's0-k1', sayfa: 0, tur: 'metin', ad: 'Metin 1', rect: { x: kolon(1), y: 42, w: KOL, h: 130 }, yazi },
  { id: 's0-k2', sayfa: 0, tur: 'metin', ad: 'Metin 2', rect: { x: kolon(2), y: 42, w: KOL, h: 130 }, yazi },
  { id: 's0-k0', sayfa: 0, tur: 'metin', ad: 'Metin 0', rect: { x: kolon(0), y: 100, w: KOL, h: 72 }, yazi },
  { id: 's1-k0', sayfa: 1, tur: 'metin', ad: 'Metin 3', rect: { x: kolon(0), y: 14, w: KOL, h: 158 }, yazi },
  { id: 's1-foto', sayfa: 1, tur: 'foto', ad: 'İkinci fotoğraf', rect: { x: kolon(1), y: 14, w: KOL, h: 70 } },
  { id: 's1-k1', sayfa: 1, tur: 'metin', ad: 'Metin 4', rect: { x: kolon(1), y: 90, w: KOL, h: 82 }, yazi },
  { id: 's1-k2', sayfa: 1, tur: 'metin', ad: 'Metin 5', rect: { x: kolon(2), y: 14, w: KOL, h: 158 }, yazi },
  { id: 's1-iletisim', sayfa: 1, tur: 'iletisim', ad: 'İletişim', kimlikRolu: 'iletisim', rect: { x: M, y: 180, w: 300 - 2 * M, h: 20 }, yazi: { ...yazi, punto: 8.5 } },
];

const ham: Template = {
  id: 'deneme', ad: 'DENEME şablonu (Bakanlık tasarımı değildir)', surum: 1, durum: 'bekliyor', deneme: true,
  sayfa: { genislik: 300, yukseklik: 210, yon: 'yatay', sayi: 2 }, sutunSayisi: 3,
  kenarBosluk: { ust: 14, sag: M, alt: 10, sol: M }, renkler: ['#fff6d6', '#b3261e'],
  sabit: [
    ...[0, 1].flatMap((s) => [
      { id: `bg${s}`, sayfa: s, tur: 'arkaplan' as const, rect: { x: 0, y: 0, w: 300, h: 210 }, cizim: { renk: '#fff6d6' } },
      { id: `serit${s}`, sayfa: s, tur: 'altBilgi' as const, rect: { x: 0, y: 200, w: 300, h: 10 }, cizim: { renk: '#b3261e' } },
    ]),
  ],
  alanlar,
};

export const DENEME_SABLONU: Template = sablonOnayla(ham, { yonetici: true });
