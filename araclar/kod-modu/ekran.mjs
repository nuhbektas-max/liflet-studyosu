// Besi Rasyon ekran sınaması: bütün sayfaları ve rasyon adımlarını telefon, tablet ve geniş ekranda gezer.
// JS hatalarını, yatay taşmayı ve ekran dışına taşan öğeleri sayar; rasyonu hesaplar.
// Kullanım: node araclar/kod-modu/ekran.mjs [--resim] [--dolu]
// --dolu: örnek veriyle (hayvanlar, tartım, satış, takvim, depo, yemleme; içinde HTML denemesi) sınar.
// Lisans için GEÇİCİ bir sınama anahtarı üretilir (gerçek anahtar gerekmez, hiçbir yere yazılmaz).
// Özet ekrana, ayrıntı _cikti/ekran.json'a; --resim ile ekran görüntüleri _cikti/ekran/ klasörüne.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { webcrypto as wc } from 'node:crypto';
import { KOK, CIKTI, ciktiYaz } from './lib/depo.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const WWW = path.join(KOK, 'besi-rasyon', 'www');
const RESIM = process.argv.includes('--resim');
const DOLU = process.argv.includes('--dolu');
const gun = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const XSS = '<img src=x onerror="window.__xss=1">';
const ORNEK = {
  'besiRasyon.hayvanlar.v1': [
    { id: 'h1', kupe: 'TR06 1001', ad: 'Karabaş', irk: 'simental', cinsiyet: 'tosun', giris: gun(-90), girisKg: 320, alis: 250, bolme: 'A', tartim: [{ t: gun(-60), kg: 360 }, { t: gun(-30), kg: 395 }, { t: gun(-1), kg: 430 }], saglik: [{ k: 's1', t: gun(-80), tur: 'Aşı', not: 'şap', tekrar: gun(5), tutar: 300 }] },
    { id: 'h2', kupe: 'TR06 1002' + XSS, ad: XSS, irk: 'holstein', cinsiyet: 'tosun', giris: gun(-40), girisKg: 280, alis: 240, bolme: 'B' + XSS, not: XSS, tartim: [{ t: gun(-40), kg: 280 }], saglik: [] },
    { id: 'h3', kupe: 'TR06 1003', irk: 'melez', cinsiyet: 'tosun', giris: gun(-200), girisKg: 300, alis: 245, bolme: 'A', tartim: [{ t: gun(-10), kg: 610 }], cikis: { t: gun(-2), kg: 620, fiyat: 280 } },
    { id: 'h4', kupe: 'TR06 1004', irk: 'yerli', cinsiyet: 'duve', giris: gun(0), girisKg: 250, bolme: '', tartim: [] },
  ],
  'besiRasyon.notlar': [
    { k: 'n1', t: gun(-35), saat: '09:00', tur: 'odeme', metin: 'Yem borcu ' + XSS, bolme: '', tutar: 15000, tekrar: 'ay', bitti: [] },
    { k: 'n2', t: gun(1), saat: '', tur: 'veteriner', metin: 'Kontrol', bolme: 'A', tutar: 0, tekrar: 'hafta', bitti: [] },
    { k: 'n3', t: gun(-3), saat: '', tur: 'diger', metin: 'Geçmiş iş', bolme: '', tutar: 0, tekrar: 'yok', bitti: [] },
    { k: 'n4', t: '2026-01-31', saat: '', tur: 'odeme', metin: 'Ay sonu ödemesi', bolme: '', tutar: 1000, tekrar: 'ay', bitti: [] },
  ],
  'besiRasyon.depo': { 'Arpa': { kg: 2000, t: gun(-5) }, [XSS]: { kg: 10, t: gun(-1) } },
  'besiRasyon.tartimAraligi': '30',
};
const GENISLIK = [360, 412, 800, 1280];
const SAYFALAR = ['ana', 'yem', 'hayvan', 'beyan', 'lisans', 'ayarlar', 'kar', 'yemleme', 'depo', 'takvim'];
const ADIMLAR = ['hayvan', 'yemler', 'katki', 'ayar', 'sonuc', 'kayit', 'kontrol', 'silaj'];
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const cift = await wc.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const ACIK = b64u(await wc.subtle.exportKey('raw', cift.publicKey));
const OZEL = b64u(await wc.subtle.exportKey('pkcs8', cift.privateKey));

const TUR = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const sunucu = http.createServer((q, s) => {
  let f = decodeURIComponent(q.url.split('?')[0]); if (f === '/') f = '/index.html';
  const yol = path.join(WWW, f);
  if (!yol.startsWith(WWW) || !fs.existsSync(yol)) { s.writeHead(404); return s.end(); }
  let govde = fs.readFileSync(yol);
  if (f === '/lisans.js') govde = govde.toString().replace(/var ACIK_ANAHTAR = '[^']+'/, `var ACIK_ANAHTAR = '${ACIK}'`);
  if (f === '/rol.js') govde = "window.BESI_ROL = 'yonetici';";
  s.writeHead(200, { 'content-type': TUR[path.extname(f)] || 'application/octet-stream' }); s.end(govde);
}).listen(0);
const URL = `http://127.0.0.1:${sunucu.address().port}/`;

const tarayici = await chromium.launch();
const rapor = { genislik: {} };
if (RESIM) fs.mkdirSync(path.join(CIKTI, 'ekran'), { recursive: true });

for (const w of GENISLIK) {
  const ctx = await tarayici.newContext({ viewport: { width: w, height: w < 700 ? 780 : 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(([k, o]) => {
    try {
      localStorage.setItem('besiRasyon.yonetici', k);
      if (o && !sessionStorage.getItem('__tohum')) { Object.entries(o).forEach(([a, v]) => localStorage.setItem(a, typeof v === 'string' ? v : JSON.stringify(v))); sessionStorage.setItem('__tohum', '1'); }
    } catch (e) {}
  }, [OZEL, DOLU ? ORNEK : null]);
  const p = await ctx.newPage();
  const hatalar = [];
  p.on('pageerror', e => hatalar.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) hatalar.push('console: ' + m.text()); });
  await p.goto(URL);
  await p.waitForFunction(() => !document.body.classList.contains('kilitli') && window.BesiSayfa, null, { timeout: 15000 }).catch(() => hatalar.push('uygulama açılmadı (kilitli kaldı)'));
  const sonuclar = {};
  const denetle = async ad => {
    await p.waitForTimeout(150);
    const r = await p.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const tasan = [];
      document.querySelectorAll('body *').forEach(el => {
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
        const b = el.getBoundingClientRect();
        if (b.width && (b.right > W + 1 || b.left < -1)) {
          // Kaydırılabilir kap içindeyse sorun değil.
          let k = el.parentElement, kayar = false;
          while (k && k !== document.body) { const o = getComputedStyle(k).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { kayar = true; break; } k = k.parentElement; }
          if (!kayar) tasan.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')) + ' ' + Math.round(b.right) + '>' + W);
        }
      });
      return { yatayKaydirma: document.documentElement.scrollWidth > W + 1, tasan: [...new Set(tasan)].slice(0, 5) };
    });
    if (RESIM) await p.screenshot({ path: path.join(CIKTI, 'ekran', `${w}-${ad}.png`), fullPage: true });
    sonuclar[ad] = r;
  };
  for (const s of SAYFALAR) { await p.evaluate(s => window.BesiSayfa.git(s), s); await denetle(s); }
  for (const a of ADIMLAR) { await p.evaluate(a => { window.BesiSayfa.git('rasyon', false, a); }, a); await denetle('rasyon-' + a); }
  // Rasyonu hesapla.
  await p.evaluate(() => window.BesiSayfa.git('rasyon', false, 'ayar'));
  const t0 = Date.now();
  await p.click('#adimHesapla').catch(e => hatalar.push('hesapla düğmesi: ' + e.message.split('\n')[0]));
  if (DOLU && await p.evaluate(() => window.__xss)) hatalar.push('XSS: kullanıcı metni HTML olarak çalıştı');
  const hesap = await p.waitForSelector('#result:not([hidden]) table', { timeout: 60000 }).then(() => true, () => false);
  const maliyet = hesap ? await p.evaluate(() => (document.querySelector('#result') || {}).innerText.match(/[\d.,]+\s*TL/)?.[0] || '') : '';
  await denetle('rasyon-sonuc-hesapli');
  // Takvimin ay görünümü ve kayıtlı rasyonun yemlemeye atanması.
  if (DOLU && hesap) {
    await p.click('#result button[data-a="kaydet"]').catch(e => hatalar.push('kaydet: ' + e.message.split('\n')[0]));
    await p.evaluate(() => window.BesiSayfa.git('yemleme'));
    const secim = await p.$$('#sayfa-yemleme select[data-bolme]');
    if (!secim.length) hatalar.push('yemleme: kayıtlı rasyon atanacak seçim kutusu yok');
    for (let i = 0; i < secim.length; i++) {
      const sc = (await p.$$('#sayfa-yemleme select[data-bolme]'))[i];
      const v = sc && await sc.evaluate(e => [...e.options].map(o => o.value).filter(Boolean).pop());
      if (v) await sc.selectOption(v);
    }
    await denetle('yemleme-atanmis');
    const toplamVar = await p.evaluate(() => /Bugün toplam/.test(document.getElementById('sayfa-yemleme').innerText));
    if (!toplamVar) hatalar.push('yemleme: atamadan sonra "Bugün toplam" çıkmadı');
    await p.evaluate(() => window.BesiSayfa.git('depo'));
    const gunluk = await p.evaluate(() => [...document.querySelectorAll('#sayfa-depo tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')));
    rapor['depo-' + w] = gunluk;
    await denetle('depo-atanmis');
    await p.evaluate(() => window.BesiSayfa.git('kar'));
    await denetle('kar-atanmis');
  }
  if (DOLU) {
    await p.evaluate(() => window.BesiSayfa.git('takvim'));
    const ay = await p.$('#tvGor button[data-deger="ay"]');
    if (ay) { await ay.click(); await denetle('takvim-ay'); }
    if (await p.evaluate(() => window.__xss)) hatalar.push('XSS: kullanıcı metni HTML olarak çalıştı');
  }
  rapor.genislik[w] = { hatalar: [...new Set(hatalar)], hesap, maliyet, sure: Date.now() - t0, sonuclar };
  await ctx.close();
}
await tarayici.close(); sunucu.close();

const satir = [];
for (const [w, r] of Object.entries(rapor.genislik)) {
  const tasanSayfa = Object.entries(r.sonuclar).filter(([, x]) => x.yatayKaydirma || x.tasan.length).map(([a]) => a);
  satir.push(`${w}px: ${r.hatalar.length} JS hatası; rasyon ${r.hesap ? 'hesaplandı (' + r.maliyet + ', ' + r.sure + ' ms)' : 'HESAPLANMADI'}; taşan: ${tasanSayfa.length ? tasanSayfa.join(', ') : 'yok'}`);
}
const tumHata = [...new Set(Object.values(rapor.genislik).flatMap(r => r.hatalar))];
if (tumHata.length) satir.push('Hatalar: ' + tumHata.slice(0, 3).join(' || ').slice(0, 400));
console.log(satir.join('\n'));
console.log('Ayrıntı: ' + ciktiYaz('ekran.json', rapor) + (RESIM ? ', resimler: _cikti/ekran/' : ''));
process.exit(tumHata.length ? 1 : 0);
