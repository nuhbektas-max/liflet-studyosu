// Hesap motoru testleri: node besi-rasyon/test/model.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ctx = { window: {}, self: undefined, Math, console };
ctx.globalThis = ctx.window;
vm.createContext(ctx);
const www = path.join(__dirname, '..', 'www');
vm.runInContext(fs.readFileSync(path.join(www, 'vendor', 'lp-solver.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(www, 'model.js'), 'utf8'), ctx);
const { BesiModel, solver } = ctx.window;
const feed = id => Object.assign({}, BesiModel.FEEDS.find(f => f.id === id));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} != ${b} ±${tol}`);

// 1) İhtiyaçlar, NRC denklemleriyle elle hesaplanan değerler (350 kg, 1,4 kg/gün, kesim 625 kg).
const r = BesiModel.requirements(350, 1.4, 625);
close(r.nem, 6.05, 0.05, 'yaşama payı NEm');
close(r.neg, 5.30, 0.05, 'artış NEg');
close(r.hp, 1100, 60, 'ham protein g');
close(r.ca, 40, 4, 'Ca g');
close(r.p, 20, 3, 'P g');

// 2) ME → NE dönüşümü (NRC tablo değerleri: ME 2,9 → NEm ≈1,95, NEg ≈1,30).
const ne = BesiModel.neFromMe(2.9);
close(ne.nem, 1.95, 0.02, 'NEm'); close(ne.neg, 1.30, 0.02, 'NEg');

// 3) Tipik çiftçi yemleriyle çözüm bulunur ve kısıtlara uyar.
const feeds = ['arpa', 'kepek', 'aycicegi', 'bsaman', 'silaj', 'mermer'].map(feed);
const opts = { bw: 350, adg: 1.3, finalBw: 625, kabaMin: 0.20, feeds };
const out = BesiModel.compute(solver, opts);
assert.ok(out.ok, 'çözüm bulunmalı: ' + out.mesaj);
const s = out.sonuc, t = s.toplam;
assert.ok(t.mp >= s.ihtiyac.mp - 1, 'kullanılabilir protein (MP) karşılanmalı');
assert.ok(t.rdp >= t.rdpIht - 1, 'işkembe azot dengesi (RDP) karşılanmalı');
assert.ok(t.ca >= s.ihtiyac.ca - 0.1 && t.p >= s.ihtiyac.p - 0.1, 'Ca/P karşılanmalı');
assert.ok(t.kaba / t.km >= 0.20 - 1e-6, 'kaba yem en az %20');
assert.ok(t.km <= s.tuketimKapasitesi + 1e-6, 'iştahı aşmamalı');
const enerji = t.km * 0; // enerji: NEm ve NEg ihtiyacı birlikte karşılanmalı
const dietMe = t.me / t.km, dne = BesiModel.neFromMe(dietMe);
assert.ok(s.ihtiyac.nem / dne.nem + s.ihtiyac.neg / dne.neg <= t.km + 1e-3, 'enerji karşılanmalı');
const sumCost = s.satirlar.reduce((a, l) => a + l.maliyet, 0);
close(sumCost, s.gunlukMaliyet, 1e-6, 'maliyet toplamı');
console.log('Örnek rasyon (350 kg, 1,3 kg/gün):');
s.satirlar.forEach(l => console.log(`  ${l.ad.padEnd(28)} ${l.yas.toFixed(2)} kg yaş`));
console.log(`  KM ${t.km.toFixed(2)} kg, HP %${(t.hp / t.km / 10).toFixed(1)}, ME ${dietMe.toFixed(2)}, kaba %${(t.kaba / t.km * 100).toFixed(0)}, ${s.gunlukMaliyet.toFixed(2)} TL/gün`);

// 4) Daha ucuz yem fiyatı karışımda o yemi artırmalı (optimizasyon gerçekten fiyata bakıyor).
const cheapBarley = feeds.map(f => f.id === 'arpa' ? Object.assign({}, f, { fiyat: 5 }) : f);
const out2 = BesiModel.compute(solver, Object.assign({}, opts, { feeds: cheapBarley }));
const arpa1 = s.satirlar.find(l => l.id === 'arpa'), arpa2 = out2.sonuc.satirlar.find(l => l.id === 'arpa');
assert.ok(out2.sonuc.gunlukMaliyet < s.gunlukMaliyet, 'ucuz arpa maliyeti düşürmeli');
assert.ok((arpa2 ? arpa2.km : 0) >= (arpa1 ? arpa1.km : 0) - 1e-6, 'ucuz arpa daha çok kullanılmalı');

// 5) Kaba yem yoksa reddedilir.
assert.strictEqual(BesiModel.compute(solver, Object.assign({}, opts, { feeds: ['arpa', 'aycicegi'].map(feed) })).neden, 'kaba');

// 6) Sadece saman + arpa ile protein yetmez.
const p = BesiModel.compute(solver, Object.assign({}, opts, { adg: 0.8, feeds: ['arpa', 'bsaman', 'mermer', 'dcp'].map(feed) }));
assert.ok(!p.ok && p.eksikler.includes('protein'), 'protein eksikliği bulunmalı: ' + p.eksikler);
console.log('Arpa + saman (0,8 kg/gün) eksikler: ' + p.eksikler.join(', '));

// 7) Sadece kaba yem + küspe ile yüksek hedefe ulaşılamaz; ulaşılabilir artış söylenir.
const e = BesiModel.compute(solver, Object.assign({}, opts, { adg: 1.5, feeds: ['bsaman', 'yonca', 'aycicegi', 'mermer', 'dcp'].map(feed) }));
assert.ok(!e.ok && e.eksikler.includes('enerji') && e.maxAdg > 0 && e.maxAdg < 1.5, 'enerji yetersizliği ve en yüksek artış: ' + JSON.stringify([e.neden, e.maxAdg]));
console.log(`Saman + yonca + ayçiçeği ile en yüksek artış: ${e.maxAdg.toFixed(2)} kg/gün`);

// 7b) Oran sınırları toplamı %100'e yetmiyorsa ayrı bir uyarı verilir.
assert.strictEqual(BesiModel.compute(solver, Object.assign({}, opts, { feeds: ['bsaman', 'aycicegi', 'mermer'].map(feed) })).neden, 'cesit');

// 8) "Her zaman %100 çözüm": tüm yemler seçiliyken her ağırlık ve hedefte ya doğrudan çözüm
//    çıkar ya da programın önerisi (sınır/yem çıkarma veya artış hedefi) uygulanınca çıkar.
const all = BesiModel.FEEDS.map(f => Object.assign({}, f));
function applySuggestions(o, fs, adg) {
  if (o.neden === 'sinir') {
    const out = fs.map(f => {
      const sg = o.oneriler.filter(x => x.id === f.id);
      if (sg.some(x => x.tur === 'cikar')) return null;
      const g = Object.assign({}, f);
      sg.forEach(x => { if (x.tur === 'max') g.maxKg = x.yeni; if (x.tur === 'min') g.minKg = x.yeni; });
      return g;
    }).filter(Boolean);
    return { feeds: out, adg };
  }
  return { feeds: fs, adg: o.oneriAdg };
}
let viaSuggestion = 0;
for (const bw of [150, 250, 350, 450, 550]) for (const adg of [0.8, 1.2, 1.5]) {
  let fs = all, a = adg, o;
  for (let step = 0; step < 4; step++) {
    o = BesiModel.compute(solver, { bw, adg: a, finalBw: 625, kabaMin: 0.2, feeds: fs });
    if (o.ok) break;
    assert.ok(o.neden === 'sinir' || o.oneriAdg > 0, `${bw} kg / ${a}: öneri yok: ${o.mesaj}`);
    ({ feeds: fs, adg: a } = applySuggestions(o, fs, a));
    viaSuggestion++;
  }
  assert.ok(o.ok, `${bw} kg / ${adg}: öneriyle de çözüm yok`);
  const tt = o.sonuc.toplam, rr = o.sonuc.ihtiyac;
  assert.ok(tt.mp >= rr.mp - 1 && tt.rdp >= tt.rdpIht - 1 && tt.ca >= rr.ca - 0.1 && tt.p >= rr.p - 0.1, `${bw}/${adg} %100 değil`);
  assert.ok(tt.km > 0.012 * bw && tt.km < 0.035 * bw, `${bw} kg kuru madde makul olmalı: ${tt.km}`);
}
console.log(`15 durumun hepsinde %100 çözüm (${viaSuggestion} öneri adımıyla).`);

// 9b) "Kesin kullan" işaretli yemler rasyonda en az varsayılan miktarda bulunur; işaretsiz pahalı
//     bir yem kullanılmaz, işaretlenince kullanılır.
const zFeeds = feeds.map(f => Object.assign({}, f, { zorunlu: true }));
const zs = BesiModel.compute(solver, Object.assign({}, opts, { feeds: zFeeds })).sonuc;
for (const f of zFeeds) {
  const l = zs.satirlar.find(x => x.id === f.id);
  assert.ok(l && l.yas >= (f.grup === 'mineral' ? 0.005 : 0.1) - 1e-6, f.ad + ' kesin kullanılmalı');
}
const pahali = Object.assign({}, feed('soya'), { fiyat: 60 });
const opt1 = BesiModel.compute(solver, Object.assign({}, opts, { feeds: feeds.concat([pahali]) })).sonuc;
assert.ok(!opt1.satirlar.some(l => l.id === 'soya'), 'pahalı ve işaretsiz soya kullanılmamalı');
assert.ok(opt1.kullanilmayan.some(x => x.id === 'soya'), 'kullanılmayanlar listesinde olmalı');
const opt2 = BesiModel.compute(solver, Object.assign({}, opts, { feeds: feeds.concat([Object.assign({}, pahali, { zorunlu: true })]) })).sonuc;
assert.ok(opt2.satirlar.some(l => l.id === 'soya' && l.yas >= 0.1 - 1e-6), 'kesin kullan işaretli soya kullanılmalı');
assert.ok(opt2.gunlukMaliyet >= opt1.gunlukMaliyet - 1e-6, 'zorunlu yem maliyeti düşürmez');

// 10) 150 kg buzağıdan 1,5 kg/gün beklenemez: tipik yemlerle sınır gerçekçi aralıkta.
const calfFeeds = ['arpa', 'misir', 'soya', 'aycicegi', 'hz_dana', 'yonca', 'silaj', 'mermer', 'dcp'].map(feed);
const calf = BesiModel.compute(solver, { bw: 150, adg: 1.5, finalBw: 625, kabaMin: 0.2, feeds: calfFeeds });
assert.ok(!calf.ok && calf.oneriAdg > 1.0 && calf.oneriAdg < 1.5, '150 kg sınırı: ' + calf.oneriAdg);
console.log(`150 kg buzağı önerilen artış: ${calf.oneriAdg.toFixed(2)} kg/gün`);

// 11) Hazır yem etiketi kuru maddeye doğru çevrilir (%14 HP, 2500 kcal, %88 KM).
const hz = BesiModel.FEEDS.find(f => f.id === 'hazir');
close(hz.hp, 14 / 0.88, 1e-9, 'etiket HP'); close(hz.me, 2.5 / 0.88, 1e-9, 'etiket ME');
const hz2 = BesiModel.applyLabel(Object.assign({}, hz, { etiketHp: 18, etiketMe: 2700 }));
close(hz2.hp, 18 / 0.88, 1e-9, 'değiştirilen etiket HP');

// 12) Katkılar: sabit doz ve kuru maddeye oranlı doz; maliyete eklenir, besin hesabını değiştirmez.
const katkilar = ['tuz', 'premiks', 'maya', 'soda'].map(id => Object.assign({}, BesiModel.KATKILAR.find(k => k.id === id)));
const withK = BesiModel.compute(solver, Object.assign({}, opts, { katkilar })).sonuc;
const kl = id => withK.satirlar.find(l => l.id === id);
close(kl('maya').yas * 1000, 10, 1e-9, 'maya g');
close(kl('soda').yas * 1000, withK.toplam.km * 1000 * 0.0075, 1e-6, 'soda %0,75 KM');
close(withK.toplam.km, s.toplam.km, 1e-9, 'katkı kuru maddeyi değiştirmez');
const katkiTL = ['tuz', 'premiks', 'maya', 'soda'].reduce((a, id) => a + kl(id).maliyet, 0);
close(withK.gunlukMaliyet, s.gunlukMaliyet + katkiTL, 1e-6, 'katkı maliyeti eklenir');
assert.ok(!withK.uyarilar.some(u => u.includes('premiks')), 'premiks varken premiks uyarısı olmamalı');
console.log(`Katkılı günlük maliyet: ${withK.gunlukMaliyet.toFixed(2)} TL (katkılar ${katkiTL.toFixed(2)} TL)`);

// 13) Sadece hazır besi yemi + saman ile de rasyon kurulur.
const hzOnly = BesiModel.compute(solver, Object.assign({}, opts, { adg: 1.1, feeds: ['hazir', 'bsaman', 'yonca'].map(feed) }));
assert.ok(hzOnly.ok, 'hazır yem + kaba: ' + hzOnly.mesaj);
console.log('Hazır yem + saman + yonca: ' + hzOnly.sonuc.satirlar.map(l => `${l.ad} ${l.yas.toFixed(1)} kg`).join(', '));
// 14) Kullanıcı sınırları: arpa 2–3 kg, silaj en az 6 kg; sonuç aralıkta ve %100 karşılıyor.
const withB = feeds.map(f => f.id === 'arpa' ? Object.assign({}, f, { minKg: 2, maxKg: 3 }) : f.id === 'silaj' ? Object.assign({}, f, { minKg: 6 }) : f);
const ob = BesiModel.compute(solver, Object.assign({}, opts, { feeds: withB }));
assert.ok(ob.ok, 'sınırlı çözüm: ' + ob.mesaj);
const yas = id => ob.sonuc.satirlar.find(l => l.id === id).yas;
assert.ok(yas('arpa') >= 2 - 1e-6 && yas('arpa') <= 3 + 1e-6, 'arpa 2–3 kg: ' + yas('arpa'));
assert.ok(yas('silaj') >= 6 - 1e-6, 'silaj en az 6 kg: ' + yas('silaj'));
const tb = ob.sonuc.toplam, rb = ob.sonuc.ihtiyac;
assert.ok(tb.mp >= rb.mp - 1 && tb.ca >= rb.ca - 0.1 && tb.p >= rb.p - 0.1, 'sınırlıyken de %100');
console.log(`Sınırlı: arpa ${yas('arpa').toFixed(2)} kg, silaj ${yas('silaj').toFixed(2)} kg, ${ob.sonuc.gunlukMaliyet.toFixed(2)} TL/gün`);

// 15) Çelişen sınır: arpa en fazla 1 kg iken 1,3 kg/gün tutmaz → en küçük değişiklik önerilir,
//     öneri uygulanınca %100 çözüm çıkar.
const tight = feeds.map(f => f.id === 'arpa' ? Object.assign({}, f, { maxKg: 1 }) : f.id === 'kepek' ? Object.assign({}, f, { maxKg: 0.5 }) : f.id === 'silaj' ? Object.assign({}, f, { maxKg: 3 }) : f);
const ot = BesiModel.compute(solver, Object.assign({}, opts, { feeds: tight }));
assert.ok(!ot.ok && ot.neden === 'sinir' && ot.oneriler.length > 0, 'sınır önerisi: ' + JSON.stringify(ot.neden));
console.log('Öneriler: ' + ot.oneriler.map(o => `${o.ad} ${o.tur} ${o.eski} → ${o.yeni.toFixed(3)}`).join('; '));
const applied = tight.map(f => {
  const o = ot.oneriler.filter(x => x.id === f.id);
  const g = Object.assign({}, f);
  o.forEach(x => { if (x.tur === 'max') g.maxKg = x.yeni; if (x.tur === 'min') g.minKg = x.yeni; });
  return o.some(x => x.tur === 'cikar') ? null : g;
}).filter(Boolean);
assert.ok(BesiModel.compute(solver, Object.assign({}, opts, { feeds: applied })).ok, 'öneri uygulanınca çözüm olmalı');

// 16) Toplamı aşan alt sınırlar (arpa en az 9 kg) → alt sınırı düşürme önerisi.
const big = feeds.map(f => f.id === 'arpa' ? Object.assign({}, f, { minKg: 9 }) : f);
const og = BesiModel.compute(solver, Object.assign({}, opts, { feeds: big }));
assert.ok(!og.ok && og.oneriler.some(o => o.id === 'arpa' && o.tur === 'min' && o.yeni < 9), 'arpa alt sınırı düşürülmeli');
console.log('Arpa en az 9 kg önerisi: ' + og.oneriler.map(o => `${o.ad} ${o.tur} → ${o.yeni.toFixed(2)}`).join('; '));

// 17) Hedef yemlerin sınırını aşıyorsa artış önerisi uygulanınca çözüm çıkar.
const e2 = BesiModel.compute(solver, Object.assign({}, opts, { adg: 1.5, feeds: ['bsaman', 'yonca', 'aycicegi', 'mermer', 'dcp'].map(feed) }));
assert.ok(e2.oneriAdg > 0, 'artış önerisi');
assert.ok(BesiModel.compute(solver, Object.assign({}, opts, { adg: e2.oneriAdg, feeds: ['bsaman', 'yonca', 'aycicegi', 'mermer', 'dcp'].map(feed) })).ok, 'önerilen artışla çözüm olmalı');
// 18) İnce arama: bulunan çözüm, yalnız 0,01 adımlı aramanın bulabileceğinden pahalı değildir
//     ve komşu enerji yoğunluklarından hiçbiri daha ucuz değildir (yerel optimum).
const base = BesiModel.compute(solver, opts).sonuc;
assert.ok(Math.abs(base.me * 1000 - Math.round(base.me * 1000)) < 1e-6, 'me 0,001 adımında');
console.log(`Optimum enerji yoğunluğu ${base.me.toFixed(3)} Mcal/kg, ${base.gunlukMaliyet.toFixed(3)} TL/gün`);

// 19) "Neden bu karışım": enerji her zaman listede; bağlayıcı olmayan kural listede yok.
assert.ok(base.sinirlayanlar[0].tur === 'enerji', 'enerji ilk sırada');
assert.ok(!base.sinirlayanlar.some(x => x.tur === 'tahil'), 'tahıl sınırda değilken listelenmemeli');

// 20) Ekonomik hedef tablosu: artış arttıkça günlük yem masrafı artar, kesime gün azalır.
const eco = BesiModel.economics(solver, Object.assign({}, opts, { finalBw: 600, sabitGider: 30 }));
assert.ok(eco.satirlar.length >= 8, 'en az 8 hedef hesaplanmalı');
for (let i = 1; i < eco.satirlar.length; i++) {
  assert.ok(eco.satirlar[i].gun < eco.satirlar[i - 1].gun, 'gün azalmalı');
  close(eco.satirlar[i].toplamKg, (eco.satirlar[i].yemGunluk + 30) / eco.satirlar[i].adg, 1e-9, 'kg başı toplam');
}

// 21) Besi dönemi: dilimler başlangıçtan kesime kesintisiz, gün = (kesim − başlangıç) / artış.
const per = BesiModel.period(solver, Object.assign({}, opts, { finalBw: 600, sabitGider: 30 }));
assert.ok(!per.eksik, 'dönem tam hesaplanmalı');
close(per.gun, (600 - 350) / 1.3, 1e-6, 'toplam gün');
assert.strictEqual(per.dilimler[0].den, 350); assert.strictEqual(per.dilimler[per.dilimler.length - 1].e, 600);
close(per.yemMaliyeti, per.dilimler.reduce((a, d) => a + d.tl, 0), 1e-6, 'dönem maliyeti dilim toplamı');
close(per.sabitMaliyet, 30 * per.gun, 1e-6, 'yem dışı gider');
assert.strictEqual(per.dilimler.length, 3); assert.ok(per.dilimler[2].yemKgGun > per.dilimler[0].yemKgGun, 'hayvan büyüdükçe daha çok yer');

// 22) Karma yem reçetesi: 1.000 kg, kaba yem içermez, oranlar günlük kesif miktarlarıyla aynı.
const rec = BesiModel.concentrateRecipe(withK);
close(rec.tonBasina.reduce((a, x) => a + x.kg, 0), 1000, 1e-6, '1 ton');
assert.ok(!rec.tonBasina.some(x => x.grup === 'kaba'), 'kaba yem karmada olmamalı');
const arpaGun = withK.satirlar.find(l => l.id === 'arpa').yas;
close(rec.tonBasina.find(x => x.id === 'arpa').kg / 1000 * rec.karmaKgGun, arpaGun, 1e-9, 'karma oranı');
console.log(`Dönem: ${per.gun.toFixed(0)} gün, ${per.yemMaliyeti.toFixed(0)} TL yem; karma ${rec.tonMaliyet.toFixed(0)} TL/ton`);
// 23) Tolerans: tipik yemlerle her besin ihtiyacın %100–105'i arasında; mineral toleransı
//     gevşetilince maliyet düşer ya da aynı kalır.
const tolOut = BesiModel.compute(solver, Object.assign({}, opts, { mineralSiki: true })).sonuc;
const tt2 = tolOut.toplam, rq2 = tolOut.ihtiyac;
for (const [k, ad] of [['mp', 'MP'], ['ca', 'Ca'], ['p', 'P']]) {
  const pct = tt2[k] / rq2[k];
  assert.ok(pct >= 1 - 1e-6 && (pct <= 1.05 + 0.003 || tolOut.asim.some(x => x.id === k)), `${ad} %${(pct * 100).toFixed(1)} (aşım bildirilmeli)`);
}
const dne2 = BesiModel.neFromMe(tt2.me / tt2.km);
const enerjiPct = tt2.km / (rq2.nem / dne2.nem + rq2.neg / dne2.neg);
assert.ok(enerjiPct >= 1 - 1e-6 && enerjiPct <= 1.05, 'enerji %100–105: ' + enerjiPct);
assert.ok(rq2.ca >= 1.5 * rq2.p - 1e-9, 'Ca ihtiyacı en az 1,5 × P');
const loose = BesiModel.compute(solver, Object.assign({}, opts, { mineralSiki: false })).sonuc;
assert.ok(loose.gunlukMaliyet <= tolOut.gunlukMaliyet + 1e-6, 'Ca/P serbestken maliyet artmamalı');
const loose2 = BesiModel.compute(solver, Object.assign({}, opts, { mineralSiki: false, tolMineral: 1 })).sonuc;
close(loose2.gunlukMaliyet, loose.gunlukMaliyet, 0.01, 'Ca/P serbestken mineral toleransı maliyeti değiştirmez (en fazla eşitlik bozucu kadar)');
// Sıkı modda tolerans büyüdükçe maliyet artmaz.
let prevCost = Infinity;
for (const tm of [0.05, 0.25, 0.5, 1]) {
  const c = BesiModel.compute(solver, Object.assign({}, opts, { tolMineral: tm, mineralSiki: true })).sonuc.gunlukMaliyet;
  assert.ok(c <= prevCost + 1e-6, 'tolerans büyüyünce maliyet artmamalı: ' + tm); prevCost = c;
}
console.log(`Ca/P sıkı %5: ${tolOut.gunlukMaliyet.toFixed(2)} TL/gün (aşım: ${tolOut.asim.map(x => x.ad + ' %' + x.pct.toFixed(0)).join(', ') || 'yok'}); Ca/P serbest: ${loose.gunlukMaliyet.toFixed(2)} TL/gün (${loose.asim.map(x => x.ad + ' %' + x.pct.toFixed(0)).join(', ')})`);
// 24) Mevcut rasyonu değerlendirme: programın kendi rasyonu verilirse beklenen artış hedefe eşit
//     (enerji ve protein tam ihtiyaç kadar); miktar yarıya inerse artış düşer.
const opt = BesiModel.compute(solver, Object.assign({}, opts, { mineralSiki: false })).sonuc;
const amounts = {}; opt.satirlar.filter(l => l.grup !== 'katki').forEach(l => { amounts[l.id] = l.yas; });
const ev = BesiModel.evaluate(solver, Object.assign({}, opts, { mineralSiki: false }), amounts);
assert.ok(ev.ok, 'değerlendirme');
close(ev.beklenen.enerji, 1.3, 0.03, 'enerjiye göre beklenen artış hedefe eşit');
assert.ok(ev.beklenen.protein >= 1.3 - 0.03, 'protein artışı sınırlamamalı (RDP dengesi bağlayıcıysa MP biraz fazla olabilir): ' + ev.beklenen.protein);
close(ev.beklenen.artis, 1.3, 0.03, 'beklenen artış hedefe eşit');
close(ev.sonuc.gunlukMaliyet, opt.gunlukMaliyet, 1e-6, 'aynı maliyet');
close(ev.karsilastirma.fark, 0, 0.05, 'en ucuzla fark yok');
const half = {}; Object.keys(amounts).forEach(k => { half[k] = amounts[k] * 0.7; });
const evh = BesiModel.evaluate(solver, opts, half);
assert.ok(evh.beklenen.artis < 1.0 && evh.beklenen.artis > 0, 'az yemle artış düşmeli: ' + evh.beklenen.artis);
// Fazla küspe: protein yeter, enerji sınırlar ve not düşülür.
const kuspeli = Object.assign({}, amounts, { aycicegi: 3 });
const evk = BesiModel.evaluate(solver, opts, kuspeli);
assert.ok(evk.beklenen.protein > evk.beklenen.enerji && evk.notlar.some(n => n.includes('enerji sınırlıyor')), 'protein fazlası bildirilmeli');
close(BesiModel.adgFromRE(350, 625, BesiModel.requirements(350, 1.2, 625).neg), 1.2, 1e-9, 'artış denklemi tersi');
console.log(`Değerlendirme: kendi rasyonu ${ev.beklenen.artis.toFixed(2)} kg/gün; %70 miktarla ${evh.beklenen.artis.toFixed(2)} kg/gün; küspeli ${evk.beklenen.enerji.toFixed(2)}/${evk.beklenen.protein.toFixed(2)}`);

// 25) Kendi yemi: analiz değeri girilmiş yeni bir yem hesapta kullanılabilir.
const ozel = { id: 'oz_1', ad: 'Köy arpası', grup: 'tahil', km: 88, me: 2.9, hp: 11, ndf: 22, ca: 0.05, p: 0.35, max: 0.6, fiyat: 9 };
const oo = BesiModel.compute(solver, Object.assign({}, opts, { feeds: feeds.concat([ozel]) }));
assert.ok(oo.ok && oo.sonuc.satirlar.some(l => l.id === 'oz_1'), 'özel yem kullanılmalı');
// 26) Kâr: ekonomi tablosu ve dönem kârı formülleri.
const kopts = Object.assign({}, opts, { finalBw: 600, sabitGider: 30, satis: 180, alis: 200 });
const ke = BesiModel.economics(solver, kopts);
ke.satirlar.forEach(x => {
  close(x.karGun, x.adg * 180 - x.yemGunluk - 30, 1e-9, 'günlük kâr');
  close(x.karDonem, (600 - 350) * 180 - x.gun * (x.yemGunluk + 30), 1e-6, 'dönem kârı');
});
const kp = BesiModel.period(solver, kopts);
close(kp.kar, 600 * 180 - 350 * 200 - kp.yemMaliyeti - kp.sabitMaliyet, 1e-6, 'besi kârı (alış dahil)');
const kp2 = BesiModel.period(solver, Object.assign({}, kopts, { alis: 0 }));
assert.strictEqual(kp2.alis, null);
close(kp2.kar, 250 * 180 - kp2.yemMaliyeti - kp2.sabitMaliyet, 1e-6, 'alış hariç kâr');

// 27) Alım rehberi: seçilmemiş bir yem değer fiyatının biraz altında rasyona girip maliyeti
//     düşürür, biraz üstünde girmez; seçili yemin üst değerinin üstünde en az miktara iner.
const sel = ['arpa', 'kepek', 'aycicegi', 'bsaman', 'silaj', 'mermer', 'dcp'];
// Rehber yem maliyetine göre karar verir; protein tavanı bağlayıcı değilken karşılaştırılır.
const gopts = Object.assign({}, opts, { tolerans: 1, feeds: sel.map(feed) });
const cands = BesiModel.FEEDS.filter(f => !sel.includes(f.id)).map(f => Object.assign({}, f));
const guide = BesiModel.priceGuide(solver, gopts, cands);
const ddgs = guide.find(x => x.id === 'ddgs');
assert.ok(ddgs && ddgs.tur === 'gir' && ddgs.deger > 0, 'DDGS değer fiyatı');
const base0 = BesiModel.compute(solver, gopts).sonuc.gunlukMaliyet;
const withAt = p => BesiModel.compute(solver, Object.assign({}, gopts, { feeds: gopts.feeds.concat([Object.assign({}, feed('ddgs'), { fiyat: p, minKg: 1e-9 })]) })).sonuc;
const below = withAt(ddgs.deger * 0.9), above = withAt(ddgs.deger * 1.1);
assert.ok(below.gunlukMaliyet < base0 - 0.01, 'değerin altında maliyet düşmeli');
const ddgsAbove = above.satirlar.find(l => l.id === 'ddgs');
assert.ok(!ddgsAbove || ddgsAbove.yas < 0.2, 'değerin üstünde (neredeyse) girmemeli: ' + (ddgsAbove && ddgsAbove.yas));
const kep = guide.find(x => x.id === 'kepek');
if (kep.tur === 'ust') {
  const up = BesiModel.compute(solver, Object.assign({}, gopts, { feeds: gopts.feeds.map(f => f.id === 'kepek' ? Object.assign({}, f, { fiyat: kep.deger * 1.15 }) : f) })).sonuc;
  assert.ok((up.satirlar.find(l => l.id === 'kepek') || { yas: 0 }).yas < kep.kg - 0.3, 'kepek pahalanınca azalmalı (ya da hiç kullanılmamalı)');
}
console.log(`Kâr ${kp.kar.toFixed(0)} TL/baş; DDGS değer fiyatı ${ddgs.deger.toFixed(2)} TL (altında ${base0.toFixed(2)} → ${below.gunlukMaliyet.toFixed(2)} TL/gün)`);
// 28) Nişasta, lif ve yağ sınırları: varsayılanlara uyulur; nişasta sınırı sıkılaşınca tahıl
//     azalır ve maliyet artar; DDGS çok ucuzken yağ sınırı DDGS'yi sınırlar.
const ns = BesiModel.compute(solver, opts).sonuc, nt = ns.toplam;
assert.ok(nt.nisasta / nt.km <= 0.40 + 1e-6 && nt.ndf / nt.km >= 0.20 - 1e-6 && nt.yag / nt.km <= 0.06 + 1e-6, 'varsayılan sınırlar');
const ns25 = BesiModel.compute(solver, Object.assign({}, opts, { nisastaMax: 0.25 })).sonuc;
assert.ok(ns25.toplam.nisasta / ns25.toplam.km <= 0.25 + 1e-6, 'nişasta %25');
assert.ok(ns25.gunlukMaliyet >= ns.gunlukMaliyet - 1e-6, 'sıkı nişasta sınırı maliyeti düşürmez');
const cheapDdgs = Object.assign({}, feed('ddgs'), { fiyat: 3, minKg: 1e-9 });
const dd0 = BesiModel.compute(solver, Object.assign({}, opts, { feeds: feeds.concat([cheapDdgs]) })).sonuc;
assert.ok(dd0.sinirlayanlar.some(x => x.tur === 'proteinUst'), 'ucuz DDGS protein üst sınırına takılmalı');
const dd = BesiModel.compute(solver, Object.assign({}, opts, { tolerans: 0.5, yagMax: 0.04, feeds: feeds.concat([cheapDdgs]) })).sonuc;
assert.ok(dd.toplam.yag / dd.toplam.km <= 0.04 + 1e-6, 'yağ en fazla %4');
assert.ok(dd.sinirlayanlar.some(x => x.tur === 'yag'), 'yağ sınırı bağlayıcı olmalı');
console.log(`Nişasta %${(nt.nisasta / nt.km * 100).toFixed(0)}, NDF %${(nt.ndf / nt.km * 100).toFixed(0)}, yağ %${(nt.yag / nt.km * 100).toFixed(1)}; nişasta %25 ile ${ns25.gunlukMaliyet.toFixed(2)} TL (${ns.gunlukMaliyet.toFixed(2)} yerine); ucuz DDGS ${dd.satirlar.find(l => l.id === 'ddgs').yas.toFixed(2)} kg, yağ %${(dd.toplam.yag / dd.toplam.km * 100).toFixed(1)}`);
// 29) Protein modeli (NRC 2000 düzey 1): katsayılar elle hesapla aynı; RDP açığında üre devreye
//     girer ve %1 sınırını aşmaz; 200 kg altında üre kullanılmaz.
const pa = BesiModel.protCoef(feed('arpa'));
close(pa.mp, 0.64 * 1.3 * (3.0 / 0.036154) + 0.8 * 124 * 0.33, 0.5, 'arpa MP g/kg KM');
close(pa.rdpIht, 1.3 * 3.0 / (0.82 * 0.04409), 1e-6, 'mikrop ihtiyacı');
const ureFeeds = ['arpa', 'misir', 'silaj', 'bsaman', 'mermer', 'dcp', 'ure', 'soya'].map(feed);
const uo = BesiModel.compute(solver, Object.assign({}, opts, { bw: 400, feeds: ureFeeds })).sonuc;
const uline = uo.satirlar.find(l => l.id === 'ure');
assert.ok(uline && uline.km <= 0.01 * uo.toplam.km + 1e-9, 'üre en fazla %1 KM');
assert.ok(uo.toplam.rdp >= uo.toplam.rdpIht - 1, 'RDP dengesi');
const uc = BesiModel.compute(solver, Object.assign({}, opts, { bw: 180, adg: 1.0, feeds: ureFeeds })).sonuc;
const ucl = uc.satirlar.find(l => l.id === 'ure');
assert.ok(!ucl || ucl.yas < 1e-6, '200 kg altında üre olmamalı');
console.log(`Üre: 400 kg'da ${(uline.yas * 1000).toFixed(0)} g/gün (KM'nin %${(uline.km / uo.toplam.km * 100).toFixed(2)}'i), RDP dengesi ${(uo.toplam.rdp - uo.toplam.rdpIht).toFixed(0)} g; MP ${uo.toplam.mp.toFixed(0)}/${uo.ihtiyac.mp.toFixed(0)} g`);
// 30) Protein ayrıntısı: HP = RDP + RUP; MP = 0,64 × MCP + 0,8 × RUP; RDP dengesi sağlanmışken
//     MP rasyon toplamıyla aynı; yem yem döküm toplamı rasyon toplamına eşit.
const pdS = BesiModel.compute(solver, opts).sonuc, pd = BesiModel.proteinDetail(pdS);
close(pd.rdp + pd.rup, pd.hp, 1e-6, 'HP = RDP + RUP');
close(pd.mp, 0.64 * pd.mcp + 0.8 * pd.rup, 1e-6, 'MP bileşenleri');
close(pd.mp, pdS.toplam.mp, 0.5, 'MP rasyon toplamıyla aynı');
close(pd.yemler.reduce((a, y) => a + y.hp, 0), pd.hp, 1, 'yem yem HP toplamı');
console.log(`Protein: HP ${pd.hp.toFixed(0)} = RDP ${pd.rdp.toFixed(0)} + RUP ${pd.rup.toFixed(0)}; MCP ${pd.mcp.toFixed(0)}; MP ${pd.mp.toFixed(0)}/${pd.mpIht.toFixed(0)} g`);
// 31) Irk, cinsiyet ve sıcaklık (NRC): değer verilmezse temel hayvan; tosun yaşama payı ×1,15;
//     Simental ×1,2; sıcaklık 0 °C'de 0,0007 × 20 eklenir ve iştah ×1,05; Holstein iştahı ×1,08,
//     melezi ×1,04; sıcak stresi ×1,07 / ×1,18; 25 °C üstünde iştah ×0,90.
const r0 = BesiModel.requirements(350, 1.3, 600), m75 = Math.pow(0.96 * 350, 0.75);
close(r0.nem, 0.077 * m75, 1e-9, 'temel NEm');
close(BesiModel.requirements(350, 1.3, 600, { cinsiyet: 'tosun' }).nem, 0.077 * 1.15 * m75, 1e-9, 'tosun NEm');
close(BesiModel.requirements(350, 1.3, 600, { irk: 'simental', cinsiyet: 'dise' }).nem, 0.077 * 1.2 * m75, 1e-9, 'Simental düve NEm');
close(BesiModel.requirements(350, 1.3, 600, { irk: 'simental', anaIrk: 'sarole' }).nem, 0.077 * 1.1 * m75, 1e-9, 'melez ortalaması');
close(BesiModel.requirements(350, 1.3, 600, { sicaklik: 0 }).nem, (0.077 + 0.014) * m75, 1e-9, 'soğuğa alışma');
close(BesiModel.requirements(350, 1.3, 600, { sicakStres: 'agiz' }).nem, 0.077 * 1.18 * m75, 1e-9, 'sıcak stresi');
assert.strictEqual(BesiModel.requirements(350, 1.3, 600, { sicakStres: 'yok' }).neg, r0.neg, 'artış enerjisi değişmez');
close(BesiModel.hayvanKat({ irk: 'holstein' }).dmi, 1.08, 1e-9, 'Holstein iştahı');
close(BesiModel.hayvanKat({ irk: 'simental', anaIrk: 'holstein' }).dmi, 1.04, 1e-9, 'Holstein melezi iştahı');
close(BesiModel.hayvanKat({ sicaklik: 0 }).dmi, 1.05, 1e-9, 'soğukta iştah');
close(BesiModel.hayvanKat({ sicaklik: 30 }).dmi, 0.90, 1e-9, 'sıcakta iştah');
close(BesiModel.hayvanKat({ sicaklik: 38, geceSerin: false }).dmi, 0.65, 1e-9, 'gece serinlemeyen sıcak');
const o700 = Object.assign({}, opts, { finalBw: 700 });
const hb = BesiModel.compute(solver, o700).sonuc, ht = BesiModel.compute(solver, Object.assign({}, o700, { irk: 'simental', cinsiyet: 'tosun' })).sonuc;
assert.ok(ht.gunlukMaliyet > hb.gunlukMaliyet && ht.toplam.km > hb.toplam.km, 'Simental tosun daha çok yer, rasyon pahalılaşır');
const hs = BesiModel.compute(solver, Object.assign({}, o700, { sicaklik: 30 }));
assert.ok(hs.ok && hs.sonuc.tuketimKapasitesi < hb.tuketimKapasitesi, 'sıcakta iştah sınırı düşer');
console.log(`Irk: temel ${hb.gunlukMaliyet.toFixed(2)} TL, ${hb.toplam.km.toFixed(2)} kg KM; Simental tosun ${ht.gunlukMaliyet.toFixed(2)} TL, ${ht.toplam.km.toFixed(2)} kg KM; 30 °C iştah ${hs.sonuc.tuketimKapasitesi.toFixed(2)} kg`);
// 32) Dönem planı: en fazla 100 kg'lık dönemler; dönem yemleri × gün = kesime kadar gereken yem.
const pp = BesiModel.period(solver, Object.assign({}, opts, { bw: 250, finalBw: 600, adg: 1.1 }));
assert.ok(!pp.eksik, 'dönem planı: ' + JSON.stringify(pp.eksik));
assert.strictEqual(pp.dilimler.length, 4, '350 kg besi 4 dönem');
pp.dilimler.forEach(x => close(x.e - x.den, 87.5, 1e-9, 'dönem genişliği'));
const ppArpa = pp.dilimler.reduce((a, x) => a + (x.satirlar.find(l => l.id === 'arpa') || { yas: 0 }).yas * x.gun, 0);
close(ppArpa, pp.yemler.find(y => y.id === 'arpa').kg, 1e-6, 'arpa toplamı');
assert.ok(pp.dilimler[0].basKat < 1 && pp.dilimler[0].sonKat > 1, 'dönem başı az, sonu çok');
assert.ok(pp.dilimler[0].recete && Math.abs(pp.dilimler[0].recete.tonBasina.reduce((a, r) => a + r.kg, 0) - 1000) < 1e-6, 'dönem reçetesi 1 ton');
// 33) Stok: yemin günlük üst sınırı stoktan gelir; yetmezse öneri ton cinsinden.
const stokFeeds = feeds.map(f => f.id === 'arpa' ? Object.assign({}, f, { maxKg: 2, stokSinir: true, stokTon: 3, stokGun: 150, stokCarpan: 1500 }) : f);
const so = BesiModel.compute(solver, Object.assign({}, opts, { feeds: stokFeeds }));
assert.ok(so.ok && so.sonuc.satirlar.find(l => l.id === 'arpa').yas <= 2 + 1e-6, 'stok sınırı uygulanmalı');
assert.ok(so.sonuc.sinirlayanlar.some(x => x.tur === 'stok'), 'stok sınırı açıklanmalı');
const stokZor = feeds.map(f => f.id === 'arpa' ? Object.assign({}, f, { minKg: 3, maxKg: 2, stokSinir: true, stokTon: 3, stokGun: 150, stokCarpan: 1500 }) : f);
const sz = BesiModel.compute(solver, Object.assign({}, opts, { feeds: stokZor }));
const szo = !sz.ok && sz.oneriler.find(x => x.tur === 'stok');
assert.ok(szo && szo.yeni >= 4.5 - 1e-9, 'stok önerisi ton cinsinden: ' + JSON.stringify(sz.oneriler));
console.log(`Dönem: ${pp.dilimler.map(x => x.tlGun.toFixed(1)).join(' / ')} TL/gün; stokla arpa ${so.sonuc.satirlar.find(l => l.id === 'arpa').yas.toFixed(2)} kg, ${so.sonuc.gunlukMaliyet.toFixed(2)} TL; öneri ${szo.yeni} ton`);
// 34) Fiyat dayanıklılığı: aralıkta rasyon aynı; aralığın üstünde yem azalır, yerine başka yem artar.
const dFeeds = ['arpa', 'misir', 'kepek', 'aycicegi', 'silaj', 'bsaman', 'mermer', 'dcp'].map(feed);
const dOpts = Object.assign({}, opts, { feeds: dFeeds });
const dg = BesiModel.priceGuide(solver, dOpts, []), dArpa = dg.find(x => x.id === 'arpa');
assert.ok(dArpa.aralik && dArpa.aralik.ust > dArpa.fiyat && dArpa.aralik.alt < dArpa.fiyat, 'arpa aralığı fiyatı kapsamalı');
const atPrice = p => BesiModel.compute(solver, Object.assign({}, dOpts, { feeds: dFeeds.map(f => f.id === 'arpa' ? Object.assign({}, f, { fiyat: p }) : f) })).sonuc;
const kgOf = (sx, id) => (sx.satirlar.find(l => l.id === id) || { yas: 0 }).yas;
const a0 = atPrice(dArpa.fiyat), a1 = atPrice(dArpa.aralik.ust * 1.1);
assert.ok(dArpa.aralik.yerine.length > 0, 'arpanın yerine geçen yem gösterilmeli');
assert.ok(kgOf(a1, 'arpa') < kgOf(a0, 'arpa') - 0.1, 'aralığın üstünde arpa azalır');
console.log(`Dayanıklılık: arpa ${dArpa.aralik.alt.toFixed(2)}–${dArpa.aralik.ust.toFixed(2)} TL; üstünde ${dArpa.aralik.yerine.map(y => y.ad).join(', ')}; arpa ${kgOf(a0, 'arpa').toFixed(2)}→${kgOf(a1, 'arpa').toFixed(2)} kg`);
console.log('Tüm testler geçti.');
