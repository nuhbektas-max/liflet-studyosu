// Sürüm teslim paketi: sohbete gönderilecek dosyaları tek seferde _cikti/<uygulama>-<sürüm>/ içine hazırlar.
// Kullanım: node araclar/kod-modu/paketle.mjs <besi|sut>
// Yerelde üretilenler: testler, tek dosyalık HTML (kullanıcı), iPhone zip'i (yalnızca Besi Rasyon).
// APK ve exe GitHub'da derlenir; script yalnızca hangi release etiketinden alınacağını yazar.
// Bu script dışarıya hiçbir şey göndermez.
import fs from 'node:fs';
import path from 'node:path';
import { KOK, CIKTI, uygulama, surumleri, calistir } from './lib/depo.mjs';

const kisa = process.argv[2];
if (!kisa) { console.log('Kullanım: node araclar/kod-modu/paketle.mjs <besi|sut>'); process.exit(1); }
const u = uygulama(kisa);
const s = [...new Set(surumleri(u).map(x => x.surum))];
if (s.length > 1) { console.log(`Sürüm tutarsız (${s.join(', ')}); önce denetle.mjs ve surum.mjs.`); process.exit(1); }
const v = s[0], dosyaAdi = u.ad.replace(/\s|ü/g, m => (m === 'ü' ? 'u' : ''));
const hedef = path.join(CIKTI, `${u.klasor}-${v}`);
fs.rmSync(hedef, { recursive: true, force: true });
fs.mkdirSync(hedef, { recursive: true });
const satir = [`${u.ad} ${v} paketi`];

const t = calistir('node', [u.test]);
satir.push(`- Test: ${t.ok ? 'geçti' : 'KALDI → ' + t.son}`);
if (!t.ok) { console.log(satir.join('\n')); process.exit(1); }

// Tek dosyalık HTML.
const html = path.join(hedef, `${dosyaAdi}-${v}.html`);
if (kisa === 'sut') {
  const r = calistir('python3', ['sut-rasyon/build.py', html, 'kullanici']);
  if (!r.ok) { satir.push('- HTML: HATA → ' + r.son); console.log(satir.join('\n')); process.exit(1); }
} else {
  const www = path.join(KOK, u.klasor, 'www');
  let h = fs.readFileSync(path.join(www, 'index.html'), 'utf8'), n = 0;
  h = h.replace(/<script src="([^"]+)"><\/script>/g, (_, f) => {
    const kod = fs.readFileSync(path.join(www, f), 'utf8');
    if (kod.toLowerCase().includes('</script')) throw new Error(f + ' gömülemez');
    n++;
    return '<script>\n' + kod + '\n</script>';
  });
  h = h.replace(/<link rel="manifest"[^>]*>\s*/, '');
  fs.writeFileSync(html, h);
  if (n < 6) throw new Error('beklenen betik sayısı bulunamadı: ' + n);
}
satir.push(`- Tek dosyalık HTML: ${path.basename(html)} (${Math.round(fs.statSync(html).size / 1024)} KB)`);

// iPhone zip'i: www/ içeriği olduğu gibi.
if (kisa === 'besi') {
  const zip = path.join(hedef, `${dosyaAdi}-iPhone-${v}.zip`);
  const r = calistir('zip', ['-qr', zip, '.'], path.join(KOK, u.klasor, 'www'));
  satir.push(r.ok ? `- iPhone zip: ${path.basename(zip)} (${Math.round(fs.statSync(zip).size / 1024)} KB)` : '- iPhone zip: HATA → ' + r.son);
}

const etiket = `${u.klasor}-apk-latest / ${u.klasor}-exe-latest`;
satir.push(`- GitHub'dan alınacak: ${dosyaAdi}-${v}.apk, ${dosyaAdi}-Yonetici-${v}.apk, Kurulum/Tasinabilir-${v}.0.exe (etiket ${etiket})`);
satir.push(`Klasör: ${path.relative(KOK, hedef)}`);
console.log(satir.join('\n'));
