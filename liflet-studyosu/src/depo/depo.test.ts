import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';
import { benzersizAd, depoAra, duzMetin, pdfIceAl } from './depo';
import { depoDosyaOku, depoListele, depoSil } from '../storage/db';
import { fontYukleyiciAyarla } from '../editor/fonts';
import { olcerOlustur } from '../editor/olcer';
import { pdfUret } from '../editor/pdfDisa';
import { DENEME_SABLONU } from '../model/deneme';
import { icerikDegistir } from '../model/lock';
import type { PdfJsLib } from './metinCikar';
import type { Olcer } from '../editor/duzen';

const lib = pdfjs as unknown as PdfJsLib;
const D = { Sans: 'LiberationSans-Regular', 'Sans-Kalin': 'LiberationSans-Bold', Serif: 'LiberationSerif-Regular', 'Serif-Kalin': 'LiberationSerif-Bold' } as const;
let pdf: Uint8Array; let olc: Olcer;
const dosya = (ad: string, b: Uint8Array) => ({ name: ad, arrayBuffer: async () => b.slice().buffer as ArrayBuffer });

beforeAll(async () => {
  fontYukleyiciAyarla(async (k) => new Uint8Array(readFileSync(`src/assets/fonts/${D[k]}.ttf`)));
  olc = await olcerOlustur();
  let p = { id: 'p', ad: 'x', kategori: 'Meyvecilik', sablon: DENEME_SABLONU, icerik: {}, guncelleme: 0 };
  p = icerikDegistir(p, 's0-k1', { metin: 'Budama kış aylarında yapılır. Bodur elma bahçesinde sulama damla yöntemiyle yapılmalıdır.' });
  pdf = await pdfUret(p, olc, { tur: 'ekran' });
});

describe('liflet deposu', () => {
  it('ekler, orijinal baytları aynen saklar, metni arar', async () => {
    const r = await pdfIceAl(dosya('Bodur Elma.pdf', pdf), lib);
    expect(r.durum).toBe('eklendi');
    expect(r.kayit!.ad).toBe('Bodur Elma');
    const saklanan = new Uint8Array((await depoDosyaOku(r.kayit!.id))!);
    expect(Buffer.from(saklanan).equals(Buffer.from(pdf))).toBe(true);
    const liste = await depoListele();
    expect(depoAra(liste, 'DAMLA yöntemi')[0]?.metin).toContain('damla');
    expect(duzMetin(liste[0]!)).toContain('Sayfa 1');
  });
  it('aynı içerik ikinci kez eklenmez', async () => {
    const r = await pdfIceAl(dosya('baska-ad.pdf', pdf), lib);
    expect(r.durum).toBe('kopya');
    expect((await depoListele()).length).toBe(1);
  });
  it('PDF olmayan dosya reddedilir', async () => {
    const r = await pdfIceAl(dosya('x.pdf', new TextEncoder().encode('merhaba dünya')), lib);
    expect(r.durum).toBe('hata');
  });
  it('metni olmayan PDF uyarı ile eklenir; aynı ad numaralanır', async () => {
    const d = await PDFDocument.create(); d.addPage([300, 200]);
    const r = await pdfIceAl(dosya('Bodur Elma.pdf', await d.save()), lib);
    expect(r.durum).toBe('eklendi'); expect(r.kayit!.ad).toBe('Bodur Elma (2)');
    expect(r.mesaj).toContain('OCR');
    await depoSil(r.kayit!.id);
    expect(await depoDosyaOku(r.kayit!.id)).toBeUndefined();
  });
  it('benzersizAd', () => { expect(benzersizAd('A', ['A', 'A (2)'])).toBe('A (3)'); });
});
