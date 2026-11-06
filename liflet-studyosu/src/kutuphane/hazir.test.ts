import { describe, expect, it } from 'vitest';
import { HAZIR_KUTUPHANE } from './hazir';
import { depoAra, duzMetin } from '../depo/depo';

describe('hazır liflet kütüphanesi', () => {
  it('12 liflet, hepsi A4 yatay, hepsi metin içeriyor', () => {
    expect(HAZIR_KUTUPHANE).toHaveLength(12);
    for (const k of HAZIR_KUTUPHANE) {
      expect(k.hazir).toBe(true);
      expect(k.metin.metinVar, k.ad).toBe(true);
      const s = k.metin.sayfalar[0]!;
      expect(Math.round(s.genislikMm), k.ad).toBe(297);
      expect(Math.round(s.yukseklikMm), k.ad).toBe(210);
    }
  });
  it('taranmış olanlar OCR olarak işaretli ve güveni yüksek; metin katmanlı olan ayrı', () => {
    const ocr = HAZIR_KUTUPHANE.filter((k) => k.kaynak === 'ocr');
    expect(ocr).toHaveLength(11);
    for (const k of ocr) expect(k.ocrGuven ?? 0, k.ad).toBeGreaterThanOrEqual(85);
    expect(HAZIR_KUTUPHANE.filter((k) => k.kaynak === 'metin-katmani').map((k) => k.ad)).toEqual(['Doğ. Ekim Leaf Let']);
  });
  it('Türkçe karakterli arama çalışır (büyük/küçük harf duyarsız)', () => {
    expect(depoAra(HAZIR_KUTUPHANE, 'ARPA').length).toBeGreaterThan(0);
    expect(depoAra(HAZIR_KUTUPHANE, 'Hektolitre ağırlığı').some((r) => r.kayit.ad === 'Arpa Tarımı')).toBe(true);
    expect(depoAra(HAZIR_KUTUPHANE, 'tescil')[0]?.metin.length).toBeGreaterThan(10);
  });
  it('paragraflar satır satır bölünmemiş: ortalama blok uzunluğu makul', () => {
    for (const k of HAZIR_KUTUPHANE.filter((x) => x.kaynak === 'ocr')) {
      const bloklar = k.metin.sayfalar.flatMap((s) => s.bloklar);
      const ort = bloklar.reduce((a, b) => a + b.metin.length, 0) / bloklar.length;
      expect(ort, k.ad).toBeGreaterThan(60);
    }
    expect(duzMetin(HAZIR_KUTUPHANE[0]!)).toContain('Sayfa 1');
  });
});
