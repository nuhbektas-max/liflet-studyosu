import { PDFDocument, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { fontAnahtari, fontYukleyici } from './fonts';
import type { Olcer } from './duzen';
import type { YaziStili } from '../model/types';

/** Gömülü yazı karakterleriyle ölçüm yapan nesne; PDF üretiminde de aynı fontlar kullanılır. */
export async function fontlariYukle(doc: PDFDocument): Promise<(aile: YaziStili['aile'], kalin?: boolean) => PDFFont> {
  doc.registerFontkit(fontkit);
  const harita = new Map<string, PDFFont>();
  for (const aile of ['Sans', 'Serif'] as const) for (const kalin of [false, true]) {
    const k = fontAnahtari(aile, kalin);
    harita.set(k, await doc.embedFont(await fontYukleyici(k), { subset: true }));
  }
  return (aile, kalin) => harita.get(fontAnahtari(aile, kalin))!;
}

export async function olcerOlustur(): Promise<Olcer> {
  const doc = await PDFDocument.create();
  const f = await fontlariYukle(doc);
  return (metin, stil, punto) => f(stil.aile, stil.kalin).widthOfTextAtSize(metin, punto);
}
