import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fontYukleyiciAyarla } from '../editor/fonts';
import { olcerOlustur } from '../editor/olcer';
import { pdfUret } from '../editor/pdfDisa';
import { DENEME_SABLONU } from '../model/deneme';
import { icerikDegistir } from '../model/lock';
import { metinCikar, type PdfJsLib } from './metinCikar';
import type { Olcer } from '../editor/duzen';
import type { Project } from '../model/types';

const D = { Sans: 'LiberationSans-Regular', 'Sans-Kalin': 'LiberationSans-Bold', Serif: 'LiberationSerif-Regular', 'Serif-Kalin': 'LiberationSerif-Bold' } as const;
let olc: Olcer;
beforeAll(async () => { fontYukleyiciAyarla(async (k) => new Uint8Array(readFileSync(`src/assets/fonts/${D[k]}.ttf`))); olc = await olcerOlustur(); });

describe('PDF metin çıkarma', () => {
  it('3 sütunlu sayfada sütun sırasıyla, paragraf ve kısa çizgi birleştirmeyle okur', async () => {
    let p: Project = { id: 'p', ad: 'x', kategori: 'Meyvecilik', sablon: DENEME_SABLONU, icerik: {}, guncelleme: 0 };
    p = icerikDegistir(p, 's0-k0', { metin: 'Birinci sütun ilk paragraf.\nBirinci sütun ikinci paragraf, kelime sonu bö-\nlünmüş.' });
    p = icerikDegistir(p, 's0-k1', { metin: 'İkinci sütun metni: çiçeklenme ışık şeker.' });
    p = icerikDegistir(p, 's0-k2', { metin: 'Üçüncü sütun metni.' });
    p = icerikDegistir(p, 's0-baslik', { metin: 'Bodur Elma Yetiştiriciliği' });
    const bytes = await pdfUret(p, olc, { tur: 'ekran' });
    const r = await metinCikar(bytes, pdfjs as unknown as PdfJsLib);
    expect(r.sayfaSayisi).toBe(2);
    expect(r.metinVar).toBe(true);
    expect(r.sayfalar[0]!.genislikMm).toBeCloseTo(300, 0);
    const b = r.sayfalar[0]!.bloklar;
    const tum = b.map((x) => x.metin).join(' | ');
    expect(tum).toContain('Bodur Elma Yetiştiriciliği');
    expect(tum).toContain('çiçeklenme ışık şeker');
    // sütunlar soldan sağa: 0 ibaresi yoksa 1,2,3 sırası
    const kolonlar = [...new Set(b.map((x) => x.kolon))];
    expect(kolonlar).toEqual([...kolonlar].sort((x, y) => x - y));
    const kolon = (m: string) => b.find((x) => x.metin.includes(m))!.kolon;
    expect(kolon('Birinci')).toBeLessThan(kolon('İkinci'));
    expect(kolon('İkinci')).toBeLessThan(kolon('Üçüncü'));
    // Satır aralığı normalse aynı paragraf tek blok olur; satır sonu kısa çizgisi birleşir.
    expect(b.filter((x) => x.metin.startsWith('Birinci')).length).toBe(1);
    expect(tum).toContain('bölünmüş');
    expect(tum).not.toContain('bö-');
  });
  it('metin katmanı olmayan PDF için metinVar=false', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const d = await PDFDocument.create(); d.addPage([300, 200]);
    const r = await metinCikar(await d.save(), pdfjs as unknown as PdfJsLib);
    expect(r.metinVar).toBe(false);
  });
});
