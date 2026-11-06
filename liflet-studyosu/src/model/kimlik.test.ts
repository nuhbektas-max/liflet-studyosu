import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { iletisimMetni, kimlikHatalari, kimligiUygula, yeniKimlik } from './kimlik';
import { DENEME_SABLONU } from './deneme';
import { sablonMuhru } from './lock';
import { kimlikKaydet, kimlikleriListele, kimlikSil } from '../storage/db';
import type { Project } from './types';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const kimlik = () => ({
  ...yeniKimlik('Ankara'), mudurlukAdi: 'Ankara İl Tarım ve Orman Müdürlüğü', adres: 'Çankaya / Ankara', telefon: '0312 000 00 00', eposta: 'ankara@tarim.gov.tr', web: 'ankara.tarimorman.gov.tr',
  bakanlikLogo: { foto: png, boyut: { w: 1000, h: 400 } }, mudurlukLogo: { foto: png, boyut: { w: 500, h: 500 } }, renkler: ['#b3261e', '#ffcc00'],
});
const proje = (): Project => ({ id: 'p', ad: 'x', kategori: 'Meyvecilik', sablon: DENEME_SABLONU, icerik: {}, guncelleme: 0 });

describe('kurumsal kimlik', () => {
  it('logolar, iletişim ve renkler aktarılır; geometri/mühür değişmez; logo oranı korunacak modda', () => {
    const p = kimligiUygula(proje(), kimlik());
    expect(p.icerik['s0-logo-sol']).toMatchObject({ mod: 'logo', sigdir: 'sigdir', fotoBoyut: { w: 1000, h: 400 } });
    expect(p.icerik['s1-logo-sag']?.fotoBoyut).toEqual({ w: 500, h: 500 });
    expect(p.icerik['s0-logo-orta']).toBeUndefined(); // valilik logosu tanımsız → boş kalır
    expect(p.icerik['s1-iletisim']?.metin).toContain('0312 000 00 00');
    expect(p.kimlikRenkleri).toEqual(['#b3261e', '#ffcc00']);
    expect(sablonMuhru(p.sablon)).toBe(DENEME_SABLONU.muhur);
  });
  it('bosOlanlar: dolu alana dokunmaz', () => {
    let p = kimligiUygula(proje(), kimlik());
    p = { ...p, icerik: { ...p.icerik, 's1-iletisim': { metin: 'Elle yazıldı' } } };
    expect(kimligiUygula(p, kimlik(), true).icerik['s1-iletisim']?.metin).toBe('Elle yazıldı');
    expect(kimligiUygula(p, kimlik()).icerik['s1-iletisim']?.metin).toContain('Tel:');
  });
  it('iletişim metni boş alanları atlar', () => {
    expect(iletisimMetni({ ...yeniKimlik('x'), mudurlukAdi: 'A', web: 'w.tr' })).toBe('A\nw.tr');
  });
  it('doğrulama', () => {
    expect(kimlikHatalari({ ...kimlik(), ad: ' ' })).toHaveLength(1);
    expect(kimlikHatalari({ ...kimlik(), eposta: 'yanlis' })).toHaveLength(1);
    expect(kimlikHatalari({ ...kimlik(), renkler: ['kırmızı'] })).toHaveLength(1);
    expect(kimlikHatalari(kimlik())).toEqual([]);
  });
  it('profiller saklanır, listelenir, silinir', async () => {
    const k = kimlik(); await kimlikKaydet(k);
    expect((await kimlikleriListele()).map((x) => x.ad)).toContain('Ankara');
    await kimlikSil(k.id);
    expect(await kimlikleriListele()).toEqual([]);
  });
});
