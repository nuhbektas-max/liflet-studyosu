import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { kaynakEkle, projeKaydet, projeleriListele, projeSil, yedekCoz, yedekMetni } from './db';
import { BODUR_ELMA_BEKLIYOR } from '../model/sablonlar';

const p = { id: 'a', ad: 'Elma', kategori: 'Meyvecilik', sablon: BODUR_ELMA_BEKLIYOR, icerik: {}, guncelleme: 1 };

describe('depolama', () => {
  it('kaydeder, listeler, siler, yedekler', async () => {
    await projeKaydet(p);
    expect((await projeleriListele()).map((x) => x.id)).toEqual(['a']);
    expect(yedekCoz(yedekMetni(p)).ad).toBe('Elma');
    await projeSil('a');
    expect(await projeleriListele()).toEqual([]);
  });
  it('kaynak üzerine yazılamaz', async () => {
    const k = { id: 'k', ad: 'a.pdf', sha256: 'x', veri: new ArrayBuffer(1), eklenme: 1 };
    await kaynakEkle(k);
    await expect(kaynakEkle(k)).rejects.toThrow();
  });
});
