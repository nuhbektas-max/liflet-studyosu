// iPhone yayını: besi-rasyon/www/ içeriğini herkese açık nuhbektas-max/besi-rasyon deposuna kopyalar,
// main ve gh-pages dallarına gönderir (GitHub Pages gh-pages'tan yayınlar).
// Kullanım: node araclar/kod-modu/iphone.mjs [--onay]
// --onay yoksa yalnızca deneme: neyin değişeceğini gösterir, hiçbir şey göndermez, klonu eski hâline döndürür.
// Hedef klon: BESI_IPHONE_DEPO ortam değişkeni ya da ../besi-rasyon (yoksa sığ klonlanır).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { KOK, UYGULAMALAR, surumleri, calistir, onayVar, ciktiYaz } from './lib/depo.mjs';

const UZAK = 'https://github.com/nuhbektas-max/besi-rasyon';
const KORU = new Set(['.git', '.nojekyll', 'README.md']); // hedefte silinmeyecekler
const WWW = path.join(KOK, 'besi-rasyon', 'www');
const DEPO = process.env.BESI_IPHONE_DEPO || path.resolve(KOK, '..', 'besi-rasyon');
const git = (...a) => calistir('git', a, DEPO);
const gitTam = (...a) => execFileSync('git', a, { cwd: DEPO, encoding: 'utf8' }).trim();
const yazma = onayVar();
const satir = [];
const bitir = kod => { console.log(satir.join('\n')); process.exit(kod); };

const s = [...new Set(surumleri(UYGULAMALAR.besi).map(x => x.surum))];
if (s.length > 1) { satir.push(`Sürüm tutarsız (${s.join(', ')}); önce denetle.mjs.`); bitir(1); }
const v = s[0];
const t = calistir('node', [UYGULAMALAR.besi.test]);
if (!t.ok) { satir.push('Test kaldı, yayın yapılmadı: ' + t.son); bitir(1); }

// Klonu hazırla ve uzaktaki main'e eşitle (yerel artıkları temizler).
if (!fs.existsSync(path.join(DEPO, '.git'))) {
  const r = calistir('git', ['clone', '-q', '--depth', '1', UZAK, DEPO]);
  if (!r.ok) { satir.push('Klonlanamadı: ' + r.son); bitir(1); }
}
let r = git('fetch', '-q', '--depth', '1', 'origin', 'main');
if (!r.ok) { satir.push('Uzak depo okunamadı: ' + r.son); bitir(1); }
const temizle = () => { git('checkout', '-q', '-B', 'main', 'origin/main'); git('reset', '-q', '--hard', 'origin/main'); git('clean', '-qfd'); };
temizle();

const swYol = path.join(DEPO, 'sw.js');
const eski = ((fs.existsSync(swYol) ? fs.readFileSync(swYol, 'utf8') : '').match(/besi-rasyon-v([\d.]+)'/) || [])[1] || 'yok';

// Eşitle: hedefte www'de olmayanları sil (README ve .nojekyll kalır), www'yi kopyala.
for (const f of fs.readdirSync(DEPO)) if (!KORU.has(f)) fs.rmSync(path.join(DEPO, f), { recursive: true, force: true });
fs.cpSync(WWW, DEPO, { recursive: true });
if (!fs.existsSync(path.join(DEPO, '.nojekyll'))) fs.writeFileSync(path.join(DEPO, '.nojekyll'), '');
gitTam('add', '-A');
const liste = gitTam('diff', '--cached', '--name-status').split('\n').filter(Boolean);
const say = h => liste.filter(x => x.startsWith(h)).length;
ciktiYaz('iphone.json', { eski, yeni: v, dosyalar: liste });

satir.push(`iPhone yayını: yayındaki ${eski} → ${v} ${yazma ? '' : '(deneme, gönderilmedi)'}`);
if (!liste.length) { satir.push('- Değişiklik yok, yayın zaten güncel.'); temizle(); bitir(0); }
satir.push(`- Dosyalar: ${say('A')} yeni, ${say('M')} değişen, ${say('D')} silinen (liste: _cikti/iphone.json)`);

if (!yazma) { temizle(); satir.push('Göndermek için aynı komutu --onay ile çalıştırın.'); bitir(0); }

r = git('-c', 'user.name=nuhbektas-max', '-c', 'user.email=nuhbektas-max@users.noreply.github.com',
  'commit', '-qm', `Besi Rasyon ${v}`);
if (!r.ok) { satir.push('Commit yapılamadı: ' + r.son); bitir(1); }
let hata = 0;
for (const dal of ['main', 'gh-pages']) {
  const p = git('push', '-q', ...(dal === 'gh-pages' ? ['-f'] : []), 'origin', `HEAD:${dal}`);
  satir.push(`- ${dal}: ${p.ok ? 'gönderildi' : 'GÖNDERİLEMEDİ → ' + p.son}`);
  if (!p.ok) hata = 1;
}
if (!hata) satir.push('Adres: https://nuhbektas-max.github.io/besi-rasyon/ (Pages birkaç dakikada yenilenir)');
bitir(hata);
