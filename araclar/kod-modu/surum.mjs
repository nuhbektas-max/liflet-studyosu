// Sürüm artırma: bir uygulamanın sürüm numarasını geçtiği bütün dosyalarda birlikte değiştirir.
// Kullanım: node araclar/kod-modu/surum.mjs <besi|sut> <yeni x.y> [--onay]
// --onay yoksa yalnızca deneme yapar (dosyaya yazmaz), ne değişeceğini gösterir.
import { uygulama, surumDegistir, onayVar, ciktiYaz } from './lib/depo.mjs';

const [kisa, yeni] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!kisa || !yeni) { console.log('Kullanım: node araclar/kod-modu/surum.mjs <besi|sut> <x.y> [--onay]'); process.exit(1); }
const u = uygulama(kisa), yazma = onayVar();
const d = surumDegistir(u, yeni, yazma);
const eksik = d.filter(x => !x.adet);
console.log(`${u.ad} → ${yeni} ${yazma ? '(YAZILDI)' : '(deneme, dosyaya yazılmadı)'}`);
for (const x of d) console.log(`- ${x.dosya}: ${x.eski ?? 'BULUNAMADI'} → ${x.yeni ?? yeni} (${x.adet} yer)`);
if (eksik.length) console.log(`UYARI: ${eksik.length} dosyada sürüm bulunamadı; elle bakılmalı.`);
if (!yazma) console.log('Uygulamak için aynı komutu --onay ile çalıştırın.');
ciktiYaz(`surum-${kisa}.json`, { yeni, yazma, d });
process.exit(eksik.length ? 2 : 0);
