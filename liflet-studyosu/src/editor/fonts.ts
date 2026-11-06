import sansR from '../assets/fonts/LiberationSans-Regular.ttf?url';
import sansB from '../assets/fonts/LiberationSans-Bold.ttf?url';
import serifR from '../assets/fonts/LiberationSerif-Regular.ttf?url';
import serifB from '../assets/fonts/LiberationSerif-Bold.ttf?url';
import type { YaziStili } from '../model/types';

export type FontAnahtari = `${YaziStili['aile']}${'' | '-Kalin'}`;
const URLLER: Record<FontAnahtari, string> = { Sans: sansR, 'Sans-Kalin': sansB, Serif: serifR, 'Serif-Kalin': serifB };
const onbellek = new Map<string, Promise<Uint8Array>>();

export const fontAnahtari = (aile: YaziStili['aile'], kalin?: boolean): FontAnahtari => (kalin ? `${aile}-Kalin` : aile) as FontAnahtari;

/** Testlerde (Node) dosyadan okumak için değiştirilebilir. */
export let fontYukleyici = (k: FontAnahtari): Promise<Uint8Array> => {
  let p = onbellek.get(k);
  if (!p) { p = fetch(URLLER[k]).then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b)); onbellek.set(k, p); }
  return p;
};
export const fontYukleyiciAyarla = (f: typeof fontYukleyici) => { fontYukleyici = f; };

/** Önizleme (SVG) aynı yazı dosyalarını CSS ile kullanır. */
export const FONT_CSS = (Object.keys(URLLER) as FontAnahtari[]).map((k) => {
  const [aile, kalin] = k.split('-');
  return `@font-face{font-family:'Liflet ${aile}';font-weight:${kalin ? 700 : 400};src:url(${URLLER[k]});}`;
}).join('\n');
