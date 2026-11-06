// Depo denetimi: sürüm tutarlılığı, testler, başvuru metni yer tutucuları, Word sürümlerinin güncelliği.
// Kullanım: node araclar/kod-modu/denetle.mjs
// Ekrana en çok ~10 satır özet basar; ayrıntı _cikti/denetim.json dosyasına yazılır.
import fs from 'node:fs';
import path from 'node:path';
import { KOK, UYGULAMALAR, surumleri, calistir, sonDegisim, oku, ciktiYaz } from './lib/depo.mjs';

const rapor = { uygulamalar: {}, basvuru: {}, word: [] };
const satir = [];

for (const [kisa, u] of Object.entries(UYGULAMALAR)) {
  const s = surumleri(u);
  const farkli = [...new Set(s.map(x => x.surum))];
  const t = calistir('node', [u.test]);
  rapor.uygulamalar[kisa] = { surumler: s, test: t };
  const surumYazi = farkli.length === 1 ? `sürüm ${farkli[0]} (tutarlı)` :
    `SÜRÜM TUTARSIZ: ${s.map(x => `${path.basename(x.dosya)}=${x.surum}`).join(', ')}`;
  satir.push(`${u.ad}: ${surumYazi}; test ${t.ok ? 'geçti' : 'KALDI: ' + t.son}`);
}

// Başvuru metni ve türevlerinde yer tutucular.
const yeşil = 'yesil-eller';
const mdler = [];
(function tara(d) {
  for (const f of fs.readdirSync(path.join(KOK, d))) {
    const rel = path.join(d, f);
    if (fs.statSync(path.join(KOK, rel)).isDirectory()) tara(rel);
    else if (f.endsWith('.md')) mdler.push(rel);
  }
})(yeşil);
let topD = 0, topT = 0;
for (const md of mdler) {
  const m = oku(md);
  const d = (m.match(/\[DOLDURULACAK/g) || []).length, t = (m.match(/\[TEYİT EDİLECEK/g) || []).length;
  topD += d; topT += t;
  rapor.basvuru[md] = { doldurulacak: d, teyit: t };
  const docx = md.replace(/\.md$/, '.docx');
  if (fs.existsSync(path.join(KOK, docx))) {
    const geride = sonDegisim(docx) < sonDegisim(md);
    rapor.word.push({ md, docx, geride });
  }
}
const ana = rapor.basvuru['yesil-eller/anka-basvuru-metni.md'] || {};
satir.push(`Yeşil Eller: ana metinde ${ana.doldurulacak} DOLDURULACAK, ${ana.teyit} TEYİT EDİLECEK; tüm taslaklarda ${topD} / ${topT}`);
const geride = rapor.word.filter(w => w.geride);
satir.push(geride.length ? `Word geride kalmış (${geride.length}): ${geride.map(w => path.basename(w.docx)).join(', ')}`
  : `Word sürümleri güncel (${rapor.word.length} dosya)`);

const g = calistir('git', ['status', '--porcelain']);
const kirli = g.ok && g.son ? g.son.split(' | ').length : 0;
satir.push(`Git: ${kirli ? 'kaydedilmemiş değişiklik var' : 'temiz'}`);

console.log(satir.join('\n'));
console.log('Ayrıntı: ' + ciktiYaz('denetim.json', rapor));
const sorun = Object.values(rapor.uygulamalar).some(a => !a.test.ok || new Set(a.surumler.map(x => x.surum)).size > 1);
process.exit(sorun ? 1 : 0);
