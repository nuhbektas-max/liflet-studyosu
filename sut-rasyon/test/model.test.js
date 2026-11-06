// Süt sığırı hesap motoru testleri: node sut-rasyon/test/model.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ctx = { window: {}, self: undefined, Math, console };
ctx.globalThis = ctx.window;
vm.createContext(ctx);
const www = path.join(__dirname, '..', 'www');
vm.runInContext(fs.readFileSync(path.join(www, 'vendor', 'lp-solver.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(www, 'model.js'), 'utf8'), ctx);
const { SutModel: M, solver } = ctx.window;
const feed = id => Object.assign({}, M.FEEDS.find(f => f.id === id));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} != ${b} ±${tol}`);
const set = ids => ids.map(feed);
const tum = ['silaj', 'yonca', 'bsaman', 'arpa', 'misir', 'soya', 'aycicegi', 'kepek', 'mermer', 'dcp', 'tampamuk'];

// 1) Sağmal inek (650 kg, 30 kg süt, %3,8 yağ, %3,2 protein, 100. gün): ihtiyaçlar NRC aralığında.
const inek = { bw: 650, sut: 30, yag: 3.8, protein: 3.2, dim: 100, gebelik: 0, ebe: 3 };
const r = M.requirements('sagmal', inek);
close(r.dmi, 22.5, 2.5, 'kuru madde tüketimi');
close(r.nel, 0.08 * Math.pow(650, 0.75) + 30 * (0.0929 * 3.8 + 0.0547 * 3.2 + 0.0395 * 4.85), 0.01, 'NEL');
assert.ok(r.nel > 30 && r.nel < 36, 'NEL ~ 32 Mcal: ' + r.nel);
assert.ok(r.mp > 1600 && r.mp < 2100, 'MP: ' + r.mp);
close(r.ca, 122, 8, 'Ca'); close(r.p, 80, 10, 'P');

// 2) Çözüm bulunur ve kısıtlara uyar.
const out = M.compute(solver, 'sagmal', inek, set(tum));
assert.ok(out.ok, out.mesaj);
const s = out.sonuc, t = s.toplam;
assert.ok(t.nel >= r.nel - 0.01, 'enerji karşılanmalı');
assert.ok(t.mp >= r.mp - 1, 'MP karşılanmalı');
assert.ok(t.rdp >= 130 / 0.85 * t.tdn - 1, 'işkembe azotu (RDP) karşılanmalı');
close(t.km, r.dmi, 1e-6, 'kuru madde');
assert.ok(s.kabaOran >= 0.40 - 1e-6, 'kaba yem en az %40');
assert.ok(s.nisastaOran <= 26.01, 'nişasta en çok %26');
assert.ok(s.yagOran <= 6.51, 'yağ en çok %6,5');
assert.ok(s.ndfOran >= 28 - 0.01, 'NDF en az %28');
assert.ok(t.ca >= r.ca - 0.1 && t.p >= r.p - 0.1, 'Ca/P karşılanmalı');
close(s.satirlar.reduce((a, l) => a + l.maliyet, 0), s.gunlukMaliyet, 1e-6, 'maliyet toplamı');
assert.ok(s.yogunluk > 1.5 && s.yogunluk < 1.85, 'enerji yoğunluğu: ' + s.yogunluk);
console.log('Sağmal (30 kg süt):');
s.satirlar.forEach(l => console.log(`  ${l.ad.padEnd(28)} ${l.yas.toFixed(2)} kg yaş`));
console.log(`  KM ${t.km.toFixed(1)} kg, HP %${s.hpOran.toFixed(1)}, NEL ${s.yogunluk.toFixed(2)}, kaba %${(s.kabaOran * 100).toFixed(0)}, ${s.gunlukMaliyet.toFixed(0)} TL/gün, ${out.litreBasiMaliyet.toFixed(2)} TL/kg süt`);

// 3) Daha fazla süt daha fazla enerji/maliyet, ucuz arpa arpayı artırır.
const yuksek = M.compute(solver, 'sagmal', Object.assign({}, inek, { sut: 40 }), set(tum));
assert.ok(yuksek.ok && yuksek.sonuc.gunlukMaliyet > s.gunlukMaliyet, '40 kg süt daha pahalı');
const ucuz = M.compute(solver, 'sagmal', inek, set(tum).map(f => f.id === 'arpa' ? Object.assign(f, { fiyat: 4 }) : f));
const kg = (o, id) => (o.miktarlar[id] || 0);
assert.ok(ucuz.sonuc.gunlukMaliyet < s.gunlukMaliyet && kg(ucuz, 'arpa') >= kg(out, 'arpa') - 1e-6, 'ucuz arpa kullanılmalı');

// 4) Kaba yem yoksa reddedilir.
assert.ok(!M.compute(solver, 'sagmal', inek, set(['arpa', 'soya'])).ok);

// 5) Yem kısıtı: yonca en çok 2 kg yaş.
const lim = set(tum).map(f => f.id === 'yonca' ? Object.assign(f, { en_cok: 2 }) : f);
const l1 = M.compute(solver, 'sagmal', inek, lim);
assert.ok(l1.ok && (l1.sonuc.satirlar.find(x => x.id === 'yonca') || { yas: 0 }).yas <= 2.0001, 'yonca sınırı');

// 6) Kuru dönem, geçiş, düve, buzağı çözülür; kuru dönemde enerji aşırı olmaz.
const kuru = M.compute(solver, 'kuru', { bw: 680, gebelik: 230 }, set(['silaj', 'yonca', 'bsaman', 'cayir', 'soya', 'kepek', 'mermer', 'dcp']));
assert.ok(kuru.ok, kuru.mesaj);
assert.ok(kuru.sonuc.toplam.nel <= kuru.ihtiyac.nel * 1.08 + 1e-6 && kuru.sonuc.kabaOran >= 0.6 - 1e-6, 'kuru: enerji ve kaba');
close(kuru.ihtiyac.dmi, 12.2, 0.3, 'kuru KM');
const gecis = M.compute(solver, 'gecis', { bw: 680, gebelik: 270 }, set(['silaj', 'yonca', 'bsaman', 'arpa', 'soya', 'kepek', 'mermer', 'dcp']));
assert.ok(gecis.ok, gecis.mesaj);
assert.ok(gecis.ihtiyac.nel > kuru.ihtiyac.nel, 'geçişte enerji ihtiyacı yüksek');
const duve = M.compute(solver, 'duve', { bw: 300, adg: 0.8 }, set(['silaj', 'yonca', 'bsaman', 'arpa', 'soya', 'kepek', 'mermer', 'hz_duve']));
assert.ok(duve.ok, duve.mesaj);
assert.ok(duve.sonuc.yogunluk > 1.2 && duve.sonuc.yogunluk < 1.7, 'düve enerji yoğunluğu ' + duve.sonuc.yogunluk);
const buz = M.compute(solver, 'buzagi', { bw: 100, adg: 0.7 }, set(['hz_buzagi', 'yonca', 'bsaman', 'mermer']));
assert.ok(buz.ok, buz.mesaj);
assert.ok(buz.sonuc.hpOran > 16, 'buzağı HP yüksek: ' + buz.sonuc.hpOran);
console.log(`Düve 300 kg: ${duve.sonuc.gunlukMaliyet.toFixed(1)} TL/gün; buzağı 100 kg: ${buz.sonuc.gunlukMaliyet.toFixed(1)} TL/gün`);

// 7) Yetersiz yemle anlaşılır hata.
const yetersiz = M.compute(solver, 'sagmal', Object.assign({}, inek, { sut: 45 }), set(['bsaman', 'cayir', 'arpa']));
assert.ok(!yetersiz.ok && /karşılanamıyor|kurulamadı/.test(yetersiz.mesaj), yetersiz.mesaj);
console.log('Tüm süt rasyonu testleri geçti.');

// 8) PDF yazıcı: geçerli bir PDF üretir (üstbilgi, sayfa sayısı, xref ve sonlandırma).
const pdfCtx = { window: {}, Math, console, btoa: s => Buffer.from(s, 'latin1').toString('base64'), TextEncoder };
pdfCtx.globalThis = pdfCtx.window; vm.createContext(pdfCtx);
vm.runInContext(fs.readFileSync(path.join(www, 'rapor.js'), 'utf8'), pdfCtx);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const pdf = Buffer.from(pdfCtx.window.SutRapor.pdfYaz([{ jpeg, w: 10, h: 10 }, { jpeg, w: 10, h: 10 }]));
const metin = pdf.toString('latin1');
assert.ok(metin.startsWith('%PDF-1.4') && metin.trimEnd().endsWith('%%EOF'), 'PDF üstbilgisi ve sonu');
assert.ok(/\/Count 2/.test(metin) && (metin.match(/\/Type \/Page /g) || []).length === 2, 'iki sayfa');
const xr = parseInt(metin.match(/startxref\n(\d+)/)[1], 10);
assert.strictEqual(metin.slice(xr, xr + 4), 'xref', 'startxref xref tablosunu göstermeli');
const ofs = [...metin.slice(xr).matchAll(/(\d{10}) 00000 n/g)].map(m => parseInt(m[1], 10));
ofs.forEach((o, i) => assert.ok(new RegExp('^' + (i + 1) + ' 0 obj').test(metin.slice(o)), 'xref ofseti nesne ' + (i + 1) + ' başına işaret etmeli'));
console.log('PDF yazıcı testi geçti (' + pdf.length + ' bayt).');
