import { describe, expect, it } from 'vitest';
import { alanKutusuDegistir, geometriDegistiMi, icerikDegistir, KilitHatasi, sablonMuhru, sablonOnayla } from './lock';
import { baslat, geriAl, uygula, uygulaBirlestir, yinele } from './history';
import type { Project, Template } from './types';

const sablon: Template = {
  id: 't', ad: 'Deneme', surum: 1, durum: 'bekliyor',
  sayfa: { genislik: 300, yukseklik: 210, yon: 'yatay', sayi: 2 }, sutunSayisi: 3, renkler: ['#ffcc00'],
  sabit: [{ id: 'logo1', sayfa: 0, tur: 'logoAlani', rect: { x: 5, y: 5, w: 30, h: 15 } }],
  alanlar: [{ id: 'baslik', sayfa: 0, tur: 'baslik', ad: 'Başlık', rect: { x: 40, y: 10, w: 100, h: 20 } }],
};
const proje = (t: Template): Project => ({ id: 'p', ad: 'x', kategori: 'Meyvecilik', sablon: t, icerik: {}, guncelleme: 0 });

describe('şablon kilidi', () => {
  it('içerik değişir, şablon değişmez', () => {
    const t = sablonOnayla(sablon, { yonetici: true });
    const p = icerikDegistir(proje(t), 'baslik', { metin: 'Bodur Elma' });
    expect(p.icerik.baslik?.metin).toBe('Bodur Elma');
    expect(sablonMuhru(p.sablon)).toBe(t.muhur);
    expect(geometriDegistiMi(p)).toBe(false);
  });
  it('sabit öğeye dokunulamaz', () => {
    expect(() => icerikDegistir(proje(sablon), 'logo1', { metin: 'a' })).toThrow(KilitHatasi);
  });
  it('normal kullanıcı alan kutusunu değiştiremez', () => {
    expect(() => alanKutusuDegistir(proje(sablon), 'baslik', { x: 0, y: 0, w: 1, h: 1 }, { yonetici: false })).toThrow(KilitHatasi);
  });
  it('yönetici değiştirirse onaylı şablonda geometri sapması yakalanır', () => {
    const t = sablonOnayla(sablon, { yonetici: true });
    const p = alanKutusuDegistir(proje(t), 'baslik', { x: 41, y: 10, w: 100, h: 20 }, { yonetici: true });
    expect(geometriDegistiMi(p)).toBe(true);
  });
  it('onayı yalnızca yönetici verir', () => {
    expect(() => sablonOnayla(sablon, { yonetici: false })).toThrow(KilitHatasi);
  });
});

describe('geri al / yinele', () => {
  it('çalışır', () => {
    let g = baslat(1); g = uygula(g, 2); g = uygula(g, 3);
    g = geriAl(g); expect(g.simdi).toBe(2);
    g = yinele(g); expect(g.simdi).toBe(3);
    g = geriAl(geriAl(geriAl(g))); expect(g.simdi).toBe(1);
    g = uygula(g, 9); expect(g.gelecek).toEqual([]);
  });
});

describe('geri al birleştirme', () => {
  it('aynı alana hızlı yazma tek adım; farklı alan veya uzun ara yeni adım', () => {
    let g = baslat('');
    g = uygulaBirlestir(g, 'a', 'k1', 0);
    g = uygulaBirlestir(g, 'ab', 'k1', 200);
    g = uygulaBirlestir(g, 'abc', 'k1', 400);
    expect(g.gecmis).toEqual(['']);
    g = uygulaBirlestir(g, 'abcd', 'k2', 500);
    expect(g.gecmis).toEqual(['', 'abc']);
    g = uygulaBirlestir(g, 'abcde', 'k2', 3000);
    expect(g.gecmis).toEqual(['', 'abc', 'abcd']);
    expect(geriAl(g).simdi).toBe('abcd');
    expect(geriAl(geriAl(geriAl(g))).simdi).toBe('');
  });
});
