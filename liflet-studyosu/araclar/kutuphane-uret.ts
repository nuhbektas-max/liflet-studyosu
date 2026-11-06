/**
 * Hazır liflet kütüphanesini üretir: kutuphane/pdf/*.pdf → kutuphane/kutuphane.json
 * Metin katmanı olan PDF'ler pdf.js ile, resim olan (taranmış) PDF'ler Tesseract OCR (Türkçe) ile okunur;
 * ikisi de aynı blok/sütun algoritmasından geçer. Kaynak PDF'lere dokunulmaz.
 * Gereken: tesseract-ocr + tesseract-ocr-tur, poppler-utils (pdftoppm).  Çalıştırma: npx tsx araclar/kutuphane-uret.ts
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { metinCikar, sayfayiBloklaraAyir, type PdfJsLib, type PdfMetni, type SayfaMetni } from '../src/depo/metinCikar';

const PDF_KLASOR = 'kutuphane/pdf';
const CIKTI = 'kutuphane/kutuphane.json';
const DPI = 300;
const MM_PT = 72 / 25.4;

type Oge = { x: number; y: number; w: number; h: number; s: string };

const ONBELLEK = 'kutuphane/.ocr-onbellek';
function tsvAl(png: string): string {
  mkdirSync(ONBELLEK, { recursive: true });
  const anahtar = join(ONBELLEK, createHash('sha256').update(readFileSync(png)).digest('hex').slice(0, 24) + '.tsv');
  if (existsSync(anahtar)) return readFileSync(anahtar, 'utf8');
  const t = execFileSync('tesseract', [png, 'stdout', '-l', 'tur', '--psm', '3', '--dpi', String(DPI), 'tsv'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(anahtar, t);
  return t;
}

function ocrSayfa(png: string): { ogeler: Oge[]; guven: number[] } {
  const tsv = tsvAl(png);
  const satirlar = tsv.split('\n').slice(1).map((l) => l.split('\t'));
  const ps = 72 / DPI;
  type Kelime = { blok: string; sat: string; l: number; t: number; w: number; h: number; s: string; conf: number };
  const kelimeler: Kelime[] = [];
  let sayfaH = 0;
  for (const c of satirlar) {
    if (c.length < 12) continue;
    const seviye = +c[0]!;
    if (seviye === 1) sayfaH = +c[9]!;
    if (seviye !== 5) continue;
    const s = c[11]!.trim(); const conf = +c[10]!;
    if (!s) continue;
    // Fotoğraf/zemin gürültüsünü ele: düşük güvenli kısa ya da harfsiz parçalar
    const harfOrani = (s.match(/\p{L}|\d/gu) ?? []).length / s.length;
    if (conf < 35 && (s.length <= 3 || harfOrani < 0.6)) continue;
    if (conf < 15) continue;
    kelimeler.push({ blok: `${c[2]}.${c[3]}.${c[4]}`, sat: `${c[2]}.${c[3]}.${c[4]}`, l: +c[6]!, t: +c[7]!, w: +c[8]!, h: +c[9]!, s, conf });
  }
  // Satır bazında yazı boyutu ve taban çizgisini ortaklaştır (sözcük kutuları kelimeye göre oynar).
  const satirHaritasi = new Map<string, Kelime[]>();
  for (const k of kelimeler) satirHaritasi.set(k.sat, [...(satirHaritasi.get(k.sat) ?? []), k]);
  const ogeler: Oge[] = [];
  for (const g of satirHaritasi.values()) {
    const ust = Math.min(...g.map((k) => k.t)); const alt = Math.max(...g.map((k) => k.t + k.h));
    const boy = [...g.map((k) => k.h)].sort((a, b) => a - b)[Math.floor(g.length / 2)]!;
    const punto = Math.min(alt - ust, boy * 1.05) * 0.8 * ps; // yaklaşık yazı boyutu (pt)
    const taban = (alt - boy * 0.18) * ps; // üstten pt
    for (const k of g) ogeler.push({ x: k.l * ps, y: sayfaH * ps - taban, w: k.w * ps, h: punto, s: k.s });
  }
  // OCR kutu yüksekliği satırdan satıra oynar; gövde yazısına yakın olanları sayfanın ortanca boyutuna eşitle,
  // başlıklar (belirgin büyük/küçük) kendi boyutunda kalsın. Böylece paragraf ayırma yalnızca boşluklara bakar.
  const boylar = ogeler.map((o) => o.h).sort((a, b) => a - b);
  const medyan = boylar[Math.floor(boylar.length / 2)] ?? 0;
  for (const o of ogeler) if (o.h >= medyan * 0.7 && o.h <= medyan * 1.3) o.h = medyan;
  return { ogeler, guven: kelimeler.map((k) => k.conf) };
}

async function ocrPdf(dosya: string): Promise<{ metin: PdfMetni; guven: number }> {
  const gecici = mkdtempSync(join(tmpdir(), 'liflet-ocr-'));
  try {
    execFileSync('pdftoppm', ['-r', String(DPI), '-png', dosya, join(gecici, 's')]);
    const png = readdirSync(gecici).filter((f) => f.endsWith('.png')).sort();
    const sayfalar: SayfaMetni[] = []; const tum: number[] = [];
    for (let i = 0; i < png.length; i++) {
      const { ogeler, guven } = ocrSayfa(join(gecici, png[i]!));
      tum.push(...guven);
      // Sayfa ölçüsü pdf'ten (pt)
      const bilgi = execFileSync('pdfinfo', ['-f', String(i + 1), '-l', String(i + 1), dosya], { encoding: 'utf8' });
      const m = /Page\s+\d+ size:\s+([\d.]+) x ([\d.]+)/.exec(bilgi) ?? /Page size:\s+([\d.]+) x ([\d.]+)/.exec(bilgi);
      const W = +m![1]!, H = +m![2]!;
      sayfalar.push({ no: i + 1, genislikMm: W / MM_PT, yukseklikMm: H / MM_PT, bloklar: sayfayiBloklaraAyir(i + 1, ogeler, W, H) });
    }
    return { metin: { sayfaSayisi: png.length, sayfalar, metinVar: sayfalar.some((s) => s.bloklar.length > 0) }, guven: tum.length ? Math.round(tum.reduce((a, b) => a + b, 0) / tum.length) : 0 };
  } finally { rmSync(gecici, { recursive: true, force: true }); }
}

const slug = (ad: string) => ad.toLocaleLowerCase('tr').replace(/[^\p{L}\d]+/gu, '-').replace(/^-|-$/g, '');

const dosyalar = readdirSync(PDF_KLASOR).filter((f) => f.toLowerCase().endsWith('.pdf')).sort((a, b) => a.localeCompare(b, 'tr'));
const kayitlar = [];
for (const f of dosyalar) {
  const yol = join(PDF_KLASOR, f); const bayt = new Uint8Array(readFileSync(yol));
  const ad = f.replace(/\.pdf$/i, '');
  let metin = await metinCikar(bayt, pdfjs as unknown as PdfJsLib);
  let kaynak: 'metin-katmani' | 'ocr' = 'metin-katmani'; let guven: number | undefined;
  if (!metin.metinVar) { const o = await ocrPdf(yol); metin = o.metin; guven = o.guven; kaynak = 'ocr'; }
  const blok = metin.sayfalar.reduce((a, s) => a + s.bloklar.length, 0);
  console.log(`${ad}: ${metin.sayfaSayisi} sayfa, ${blok} blok, ${kaynak}${guven !== undefined ? `, güven %${guven}` : ''}`);
  kayitlar.push({ id: `hazir:${slug(ad)}`, ad, dosyaAdi: f, sha256: createHash('sha256').update(bayt).digest('hex'), boyut: bayt.length, sayfaSayisi: metin.sayfaSayisi, kaynak, ocrGuven: guven, metin });
}
writeFileSync(CIKTI, JSON.stringify(kayitlar));
console.log(`${kayitlar.length} liflet → ${CIKTI}`);
