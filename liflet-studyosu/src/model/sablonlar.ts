import type { Template } from './types';
import { DENEME_SABLONU } from './deneme';

/**
 * Başlangıç şablonları. Bodur Elma geometrisi KAYNAK PDF'den çıkarılacaktır;
 * o zamana kadar yalnızca brifte açıkça yazılan ölçüler (300×210 mm, yatay, 2 sayfa,
 * 3 sütun) bulunur ve durum 'bekliyor' olur. Sabit öğe, alan ve renk tahmin edilmez.
 */
export const BODUR_ELMA_BEKLIYOR: Template = {
  id: 'bodur-elma',
  ad: 'Şablon 1: Bodur Elma',
  surum: 0,
  durum: 'bekliyor',
  sayfa: { genislik: 300, yukseklik: 210, yon: 'yatay', sayi: 2 },
  sutunSayisi: 3,
  renkler: [],
  sabit: [],
  alanlar: [],
};

export const BASLANGIC_SABLONLARI: Template[] = [BODUR_ELMA_BEKLIYOR, DENEME_SABLONU];
