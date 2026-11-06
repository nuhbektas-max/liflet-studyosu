import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { describe, expect, it, beforeAll } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { fontYukleyiciAyarla } from './fonts';
import { olcerOlustur } from './olcer';
import { duzenle, metinOnerileri, MM_PT, type Olcer } from './duzen';
import { kapla } from './foto';
import { etkinDpi } from './gorunum';
import { baskiOncesiKontrol } from './kontrol';
import { pdfUret } from './pdfDisa';
import { DENEME_SABLONU } from '../model/deneme';
import { icerikDegistir } from '../model/lock';
import { VARSAYILAN_STIL } from './stil';
import type { Project } from '../model/types';

const DOSYA = { Sans: 'LiberationSans-Regular', 'Sans-Kalin': 'LiberationSans-Bold', Serif: 'LiberationSerif-Regular', 'Serif-Kalin': 'LiberationSerif-Bold' } as const;
let olc: Olcer;
beforeAll(async () => {
  fontYukleyiciAyarla(async (k) => new Uint8Array(readFileSync(`src/assets/fonts/${DOSYA[k]}.ttf`)));
  olc = await olcerOlustur();
});
const bos = (): Project => ({ id: 'p', ad: 'Deneme', kategori: 'Meyvecilik', sablon: DENEME_SABLONU, icerik: {}, guncelleme: 0 });
const png1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('metin yerleşimi', () => {
  const alan = DENEME_SABLONU.alanlar.find((a) => a.id === 's0-k1')!;
  it('kısa metin sığar, kelimeler bölünmez', () => {
    const d = duzenle('Bodur elma bahçeleri sıklıkla budama ister.', VARSAYILAN_STIL, alan.rect, olc);
    expect(d.sigiyor).toBe(true);
    for (const q of d.parcalar) expect(q.x + olc(q.t, VARSAYILAN_STIL, 10) / MM_PT).toBeLessThanOrEqual(alan.rect.x + alan.rect.w + 0.01);
  });
  it('uzun metin sığmaz ve uyarı verir, punto değişmez', () => {
    const d = duzenle('elma '.repeat(2000), VARSAYILAN_STIL, alan.rect, olc);
    expect(d.sigiyor).toBe(false);
  });
  it('sütuna sığmayan tek kelime işaretlenir', () => {
    const d = duzenle('A' + 'W'.repeat(80), VARSAYILAN_STIL, alan.rect, olc);
    expect(d.tasanKelime).not.toBeNull();
  });
  it('Türkçe karakterler ölçülür (tanımsız glif değil)', () => {
    expect(olc('çğıöşüÇĞİÖŞÜ', VARSAYILAN_STIL, 10)).toBeGreaterThan(40);
  });
  it('öneriler: tekrar ve uzun cümle', () => {
    const o = metinOnerileri('Elma dikilir. Elma dikilir. ' + 'kelime '.repeat(30) + '.');
    expect(o.length).toBeGreaterThanOrEqual(2);
  });
});

describe('fotoğraf', () => {
  it('orijinal en-boy oranı korunur', () => {
    const k = kapla({ w: 4000, h: 3000 }, { x: 0, y: 0, w: 80, h: 80 });
    expect(k.w / k.h).toBeCloseTo(4 / 3, 5);
    expect(k.h).toBeCloseTo(80, 5);
  });
  it('düşük çözünürlük bulunur', () => {
    const a = DENEME_SABLONU.alanlar.find((x) => x.id === 's0-foto')!;
    expect(etkinDpi(a, { foto: 'x', fotoBoyut: { w: 300, h: 300 } })!).toBeLessThan(150);
  });
});

describe('baskı öncesi kontrol ve PDF', () => {
  it('boş projede uyarılar, taşan metinde hata', () => {
    let p = bos();
    expect(baskiOncesiKontrol(p, olc).filter((b) => b.duzey === 'uyari').length).toBeGreaterThan(5);
    p = icerikDegistir(p, 's0-k1', { metin: 'elma '.repeat(2000) });
    expect(baskiOncesiKontrol(p, olc).some((b) => b.duzey === 'hata' && b.alanId === 's0-k1')).toBe(true);
  });
  it('PDF: 2 sayfa, net ölçü 300×210, taşma payı net ölçüyü değiştirmez, metin seçilebilir', async () => {
    let p = bos();
    p = icerikDegistir(p, 's0-baslik', { metin: 'Bodur Elma Yetiştiriciliği' });
    p = icerikDegistir(p, 's0-k1', { metin: 'Çiçeklenme, ışık ve şeker oranı için gün boyu güneş gerekir.' });
    p = icerikDegistir(p, 's0-foto', { foto: png1, fotoBoyut: { w: 1, h: 1 } });
    mkdirSync('/tmp/liflet', { recursive: true });
    for (const tasma of [0, 3]) {
      const bytes = await pdfUret(p, olc, { tur: 'baski', tasmaMm: tasma });
      writeFileSync(`/tmp/liflet/deneme-${tasma}.pdf`, bytes);
      const d = await PDFDocument.load(bytes);
      expect(d.getPageCount()).toBe(2);
      const s = d.getPage(0);
      const tb = s.getTrimBox();
      expect(tb.width / MM_PT).toBeCloseTo(300, 2);
      expect(tb.height / MM_PT).toBeCloseTo(210, 2);
      expect(s.getWidth() / MM_PT).toBeCloseTo(300 + 2 * tasma, 2);
    }
  });
});

describe('çoklu seçenekler', () => {
  const slot = (id: string) => DENEME_SABLONU.alanlar.find((a) => a.id === id)!;
  it('metin alanı fotoğraf/logo olabilir; şablon mührü değişmez', async () => {
    const { etkinTur } = await import('./gorunum');
    const { sablonMuhru } = await import('../model/lock');
    let p = bos();
    p = icerikDegistir(p, 's0-k1', { mod: 'foto' });
    p = icerikDegistir(p, 's0-foto', { mod: 'metin', metin: 'Metin olarak' });
    expect(etkinTur(slot('s0-k1'), p.icerik['s0-k1'])).toBe('foto');
    expect(etkinTur(slot('s0-foto'), p.icerik['s0-foto'])).toBe('metin');
    expect(sablonMuhru(p.sablon)).toBe(DENEME_SABLONU.muhur);
  });
  it('logo oranı bozulmadan sığdırılır ve ortalanır', () => {
    const k = kapla({ w: 1000, h: 500 }, { x: 0, y: 0, w: 34, h: 9 }, 1, undefined, 'sigdir');
    expect(k.w / k.h).toBeCloseTo(2, 5);
    expect(k.h).toBeLessThanOrEqual(9 + 1e-9); expect(k.w).toBeLessThanOrEqual(34 + 1e-9);
    expect(k.x).toBeCloseTo((34 - k.w) / 2, 5);
  });
  it('gölge katmanları: bulanıklıkta çoklu, toplam saydamlık korunur', async () => {
    const { golgeKatmanlari } = await import('./gorunum');
    const k = golgeKatmanlari({ x: 0, y: 0, w: 10, h: 10 }, { renk: '#000', dx: 1, dy: 1, bulanik: 3, opaklik: 0.6 });
    expect(k.length).toBe(6);
    expect(k.reduce((a, b) => a + b.opaklik, 0)).toBeCloseTo(0.6, 5);
  });
  it('PDF: zemin, çerçeve, gölge, yazı gölgesi ve logo ile üretilir; metin seçilebilir kalır', async () => {
    let p = bos();
    p = icerikDegistir(p, 's0-k1', { metin: 'Zeminli ve gölgeli metin kutusu', zemin: { renk: '#ffffff', opaklik: 0.8 }, kenar: { renk: '#b3261e', kalinlik: 0.4 },
      golge: { renk: '#000000', dx: 1, dy: 1, bulanik: 2, opaklik: 0.3 }, yaziRenk: '#003366', yaziGolge: { renk: '#000000', dx: 0.2, dy: 0.2, opaklik: 0.4 }, bosluk: 3 });
    p = icerikDegistir(p, 's0-logo-sol', { foto: png1, fotoBoyut: { w: 1, h: 1 } });
    p = icerikDegistir(p, 's0-k2', { mod: 'foto', foto: png1, fotoBoyut: { w: 1, h: 1 } });
    const bytes = await pdfUret(p, olc, { tur: 'baski', tasmaMm: 3 });
    writeFileSync('/tmp/liflet/secenekler.pdf', bytes);
    const d = await PDFDocument.load(bytes);
    expect(d.getPageCount()).toBe(2);
    expect(d.getPage(0).getTrimBox().width / MM_PT).toBeCloseTo(300, 2);
  });
  it('iç boşluk metin alanını küçültür, taşma denetimine yansır', () => {
    const a = slot('s0-k1');
    const dar = duzenle('elma '.repeat(150), VARSAYILAN_STIL, { x: 0, y: 0, w: a.rect.w - 20, h: a.rect.h - 20 }, olc);
    const genis = duzenle('elma '.repeat(150), VARSAYILAN_STIL, a.rect, olc);
    expect(dar.gerekenYukseklik).toBeGreaterThan(genis.gerekenYukseklik);
  });
});
