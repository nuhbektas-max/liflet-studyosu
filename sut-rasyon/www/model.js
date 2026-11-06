// Süt sığırı rasyon hesabı.
// İhtiyaçlar NRC (2001) Süt İneği Besin Madde İhtiyaçları denklemlerinin sadeleştirilmiş hâlidir;
// karışım en düşük maliyetli doğrusal programlama ile bulunur. Sonuçlar yaklaşık değerdir:
// asıl rasyonu bir hayvan besleme uzmanı/veteriner hekimle birlikte gözden geçirin.
(function (root) {
  'use strict';

  // Yem değerleri kuru madde (KM) üzerindendir. km: yaş/kuru oranı (%), nel: net enerji laktasyon
  // (Mcal/kg KM), tdn (%KM), hp: ham protein (%KM), rdp: ham proteinin işkembede parçalanan payı,
  // ndf, nisasta, yag (ham yağ), ca, p (%KM). max: kuru maddede en fazla pay.
  // grup: kaba, tahil, kuspe, yan, hazir, mineral. fiyat: TL/kg yaş (varsayım, kullanıcı değiştirir).
  var FEEDS = [
    { id: 'silaj', ad: 'Mısır silajı', grup: 'kaba', km: 33, nel: 1.54, tdn: 71, hp: 8.0, rdp: 0.70, ndf: 45, nisasta: 30, yag: 3.2, ca: 0.25, p: 0.22, max: 0.60, fiyat: 3.5 },
    { id: 'yonca', ad: 'Yonca kuru otu', grup: 'kaba', km: 90, nel: 1.30, tdn: 58, hp: 18.0, rdp: 0.78, ndf: 45, nisasta: 2, yag: 2.5, ca: 1.40, p: 0.25, max: 0.50, fiyat: 10 },
    { id: 'fig', ad: 'Fiğ kuru otu', grup: 'kaba', km: 90, nel: 1.15, tdn: 55, hp: 15.0, rdp: 0.76, ndf: 50, nisasta: 3, yag: 2.5, ca: 1.10, p: 0.27, max: 0.50, fiyat: 8 },
    { id: 'cayir', ad: 'Çayır kuru otu', grup: 'kaba', km: 89, nel: 1.10, tdn: 54, hp: 10.0, rdp: 0.70, ndf: 60, nisasta: 2, yag: 2.5, ca: 0.60, p: 0.25, max: 0.60, fiyat: 7 },
    { id: 'bsaman', ad: 'Buğday samanı', grup: 'kaba', km: 91, nel: 0.82, tdn: 40, hp: 3.5, rdp: 0.65, ndf: 78, nisasta: 1, yag: 1.5, ca: 0.18, p: 0.05, max: 0.30, fiyat: 5 },
    { id: 'arpa', ad: 'Arpa', grup: 'tahil', km: 89, nel: 1.95, tdn: 83, hp: 12.4, rdp: 0.75, ndf: 20, nisasta: 57, yag: 2.2, ca: 0.06, p: 0.39, max: 0.30, fiyat: 11 },
    { id: 'misir', ad: 'Mısır (dane)', grup: 'tahil', km: 88, nel: 2.05, tdn: 88, hp: 9.0, rdp: 0.45, ndf: 10, nisasta: 72, yag: 4.2, ca: 0.03, p: 0.30, max: 0.35, fiyat: 12 },
    { id: 'bugday', ad: 'Buğday', grup: 'tahil', km: 89, nel: 2.00, tdn: 84, hp: 14.0, rdp: 0.77, ndf: 12, nisasta: 65, yag: 2.0, ca: 0.05, p: 0.40, max: 0.15, fiyat: 13 },
    { id: 'soya', ad: 'Soya küspesi', grup: 'kuspe', km: 89, nel: 2.13, tdn: 84, hp: 49.0, rdp: 0.65, ndf: 15, nisasta: 2, yag: 1.5, ca: 0.35, p: 0.70, max: 0.25, fiyat: 25 },
    { id: 'aycicegi', ad: 'Ayçiçeği küspesi', grup: 'kuspe', km: 91, nel: 1.45, tdn: 64, hp: 32.0, rdp: 0.72, ndf: 40, nisasta: 2, yag: 2.5, ca: 0.40, p: 1.00, max: 0.25, fiyat: 13 },
    { id: 'pamuk', ad: 'Pamuk tohumu küspesi', grup: 'kuspe', km: 91, nel: 1.75, tdn: 74, hp: 33.0, rdp: 0.57, ndf: 35, nisasta: 2, yag: 2.5, ca: 0.20, p: 1.10, max: 0.15, fiyat: 14 },
    { id: 'kanola', ad: 'Kanola küspesi', grup: 'kuspe', km: 90, nel: 1.85, tdn: 77, hp: 38.0, rdp: 0.68, ndf: 28, nisasta: 2, yag: 3.5, ca: 0.70, p: 1.10, max: 0.20, fiyat: 15 },
    { id: 'tampamuk', ad: 'Tam yağlı pamuk tohumu', grup: 'yan', km: 92, nel: 2.35, tdn: 90, hp: 23.0, rdp: 0.58, ndf: 45, nisasta: 1, yag: 20.0, ca: 0.20, p: 0.60, max: 0.12, fiyat: 15 },
    { id: 'kepek', ad: 'Buğday kepeği', grup: 'yan', km: 89, nel: 1.60, tdn: 70, hp: 17.0, rdp: 0.75, ndf: 42, nisasta: 22, yag: 4.0, ca: 0.13, p: 1.15, max: 0.20, fiyat: 9 },
    { id: 'ddgs', ad: 'Mısır DDGS', grup: 'yan', km: 90, nel: 2.10, tdn: 85, hp: 30.0, rdp: 0.43, ndf: 38, nisasta: 5, yag: 10.0, ca: 0.10, p: 0.85, max: 0.20, fiyat: 13 },
    { id: 'kuruposa', ad: 'Kuru şeker pancarı posası', grup: 'yan', km: 90, nel: 1.70, tdn: 73, hp: 9.5, rdp: 0.55, ndf: 45, nisasta: 1, yag: 1.0, ca: 0.70, p: 0.10, max: 0.20, fiyat: 10 },
    { id: 'yasposa', ad: 'Yaş şeker pancarı posası', grup: 'yan', km: 22, nel: 1.75, tdn: 75, hp: 10.0, rdp: 0.55, ndf: 45, nisasta: 1, yag: 1.0, ca: 0.70, p: 0.10, max: 0.25, fiyat: 2 },
    { id: 'melas', ad: 'Melas', grup: 'yan', km: 77, nel: 1.75, tdn: 75, hp: 8.0, rdp: 1.0, ndf: 0, nisasta: 0, yag: 0.2, ca: 0.20, p: 0.03, max: 0.05, fiyat: 9 },
    { id: 'hz_buzagi', ad: 'Buzağı başlangıç yemi', grup: 'hazir', km: 88, nel: 1.90, tdn: 80, hp: 21.0, rdp: 0.65, ndf: 20, nisasta: 38, yag: 3.5, ca: 1.0, p: 0.60, max: 0.90, fiyat: 17 },
    { id: 'hz_duve', ad: 'Düve büyütme yemi', grup: 'hazir', km: 88, nel: 1.75, tdn: 74, hp: 17.0, rdp: 0.68, ndf: 28, nisasta: 28, yag: 3.5, ca: 1.0, p: 0.60, max: 0.60, fiyat: 14 },
    { id: 'mermer', ad: 'Mermer tozu (kireç taşı)', grup: 'mineral', km: 99, nel: 0, tdn: 0, hp: 0, rdp: 0, ndf: 0, nisasta: 0, yag: 0, ca: 38.0, p: 0, max: 0.015, fiyat: 3 },
    { id: 'dcp', ad: 'Dikalsiyum fosfat', grup: 'mineral', km: 97, nel: 0, tdn: 0, hp: 0, rdp: 0, ndf: 0, nisasta: 0, yag: 0, ca: 23.0, p: 18.0, max: 0.01, fiyat: 40 }
  ];

  // Sabit katkılar (g/baş/gün): rasyonun kuru madde hesabına girmez, yalnızca maliyete eklenir.
  var KATKILAR = [
    { id: 'tuz', ad: 'Tuz', fiyat: 4, gram: { sagmal: 100, kuru: 50, gecis: 50, duve: 30, buzagi: 15 } },
    { id: 'premiks', ad: 'Vitamin-mineral karması', fiyat: 60, gram: { sagmal: 100, kuru: 100, gecis: 120, duve: 50, buzagi: 30 } }
  ];

  var GRUPLAR = {
    sagmal: { ad: 'Sağmal inek', kabaMin: 0.40, fndfMin: 0.19, ndfMin: 0.28, nisastaMax: 0.26, yagMax: 0.065, nelUst: null },
    kuru: { ad: 'Kuru dönem (kuruya çıkıştan 3 hafta öncesine)', kabaMin: 0.60, fndfMin: 0.35, ndfMin: 0.40, nisastaMax: 0.18, yagMax: 0.05, nelUst: 1.08 },
    gecis: { ad: 'Geçiş (buzağılamadan önceki son 3 hafta)', kabaMin: 0.50, fndfMin: 0.30, ndfMin: 0.35, nisastaMax: 0.22, yagMax: 0.05, nelUst: 1.08 },
    duve: { ad: 'Düve (6 ay – ilk buzağılama)', kabaMin: 0.50, fndfMin: 0.30, ndfMin: 0.32, nisastaMax: 0.25, yagMax: 0.05, nelUst: 1.08 },
    buzagi: { ad: 'Buzağı (sütten kesilmiş, 60–180 kg)', kabaMin: 0.10, fndfMin: 0.08, ndfMin: 0.20, nisastaMax: 0.40, yagMax: 0.06, nelUst: 1.10 }
  };

  var PEN = 1e4;

  function w75(bw) { return Math.pow(bw, 0.75); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // Gebelikte ek ihtiyaçlar (gün: gebelik günü); 190. günden önce sıfır.
  function gebelik(d) {
    if (!(d >= 190)) return { nel: 0, mp: 0, ca: 0, p: 0 };
    var cbw = 45;
    var caF = function (x) { return 0.02456 * Math.exp(0.05581 * x - 0.00007 * x * x); };
    var pF = function (x) { return 0.02743 * Math.exp(0.05527 * x - 0.000075 * x * x); };
    return {
      nel: (0.00318 * d - 0.0352) * (cbw / 45) / 0.218,
      mp: (0.69 * d - 69.2) * (cbw / 45) / 0.33,
      ca: caF(d) - caF(d - 1),
      p: pF(d) - pF(d - 1)
    };
  }

  // Beklenen kuru madde tüketimi (kg/gün).
  function dmiOf(grup, o) {
    var bw = o.bw;
    if (grup === 'sagmal') {
      var fcm = 0.4 * o.sut + 15 * o.sut * o.yag / 100;
      var wol = (o.dim || 100) / 7;
      return (0.372 * fcm + 0.0968 * w75(bw)) * (1 - Math.exp(-0.192 * (wol + 3.67)));
    }
    if (grup === 'kuru') return 0.018 * bw;
    if (grup === 'gecis') return 0.017 * bw;
    return bw * clamp(3.0 - 0.0025 * (bw - 100), 2.0, 3.0) / 100;
  }

  // İhtiyaçlar: nel (Mcal), mp (g), ca, p (g), dmi (kg).
  function requirements(grup, o) {
    var bw = o.bw, dmi = o.dmi > 0 ? o.dmi : dmiOf(grup, o);
    var preg = gebelik(grup === 'sagmal' || grup === 'kuru' || grup === 'gecis' ? o.gebelik : 0);
    var r = { dmi: dmi, grup: grup };
    if (grup === 'sagmal') {
      var par = o.ebe >= 3 ? 1.0 : o.ebe === 2 ? 1.1 : 1.2;   // genç ineklerde büyüme payı
      var degisim = o.agirlikDegisim || 0;
      var nelM = 0.08 * w75(bw) * par;
      var nelL = o.sut * (0.0929 * o.yag + 0.0547 * o.protein + 0.0395 * 4.85);
      var nelB = degisim > 0 ? degisim * 5.12 : degisim * 4.92;
      r.nel = nelM + nelL + preg.nel + nelB;
      r.mp = 2.9 * w75(bw) * par + o.sut * o.protein * 10 * 0.95 / 0.67 + preg.mp + (degisim > 0 ? degisim * 320 : 0);
      r.ca = (0.0154 * bw + 1.22 * o.sut) / 0.38 + preg.ca / 0.38;
      r.p = (1.0 * dmi + 0.002 * bw + 0.9 * o.sut) / 0.64 + preg.p / 0.64;
      r.parca = { bakim: nelM, sut: nelL, gebelik: preg.nel, agirlik: nelB };
    } else if (grup === 'kuru' || grup === 'gecis') {
      r.nel = 0.08 * w75(bw) + preg.nel;
      r.mp = 2.9 * w75(bw) + preg.mp;
      r.ca = (0.0154 * bw) / 0.38 + preg.ca / 0.38;
      r.p = (1.0 * dmi + 0.002 * bw) / 0.64 + preg.p / 0.64;
      r.parca = { bakim: 0.08 * w75(bw), sut: 0, gebelik: preg.nel, agirlik: 0 };
    } else {
      var adg = o.adg;
      var nelG = adg * (3.0 + 0.007 * (bw - 100)) / 0.9;      // büyüme: kg başına enerji, NEL karşılığı
      var nelM2 = 0.086 * w75(bw);
      r.nel = nelM2 + nelG;
      r.mp = 2.9 * w75(bw) + adg * 320;
      r.ca = (0.0154 * bw + 14 * adg) / 0.5;
      r.p = (1.0 * dmi + 0.002 * bw + 6.0 * adg) / 0.64;
      r.parca = { bakim: nelM2, sut: 0, gebelik: 0, agirlik: nelG };
    }
    // Yüksek tüketimde yemin enerjisi düşer (NRC: bakım düzeyinin üstündeki her kat için yaklaşık %4).
    var katsayi = r.nel / Math.max(0.1, r.parca.bakim);
    r.indirim = clamp(1 - 0.04 * (katsayi - 1), 0.85, 1);
    return r;
  }

  // Yemin metabolize olabilir protein (MP) katkısı (g/kg KM): işkembede parçalanmayan protein
  // (%80 sindirilir) + mikrobiyal protein (TDN başına 130 g, gerçek protein ve sindirilebilirlik %64).
  function mpOf(f) {
    var rup = f.hp * 10 * (1 - f.rdp) * 0.8;
    return rup + 0.64 * 130 * f.tdn / 100;
  }
  // İşkembede parçalanan protein dengesi (g/kg KM): mikroplar için gereken azot, TDN başına 130 g/0,85.
  function rdpBalance(f) { return f.hp * 10 * f.rdp - (130 / 0.85) * f.tdn / 100; }

  // gevsek: kapatılacak kısıt grupları (teşhis ve geri çekilme için).
  function solveOnce(solver, feeds, req, G, opts, gevsek) {
    var dmi = req.dmi;
    var c = {
      km: { equal: dmi },
      nel: { min: req.nel },
      mp: { min: req.mp },
      rdp: { min: 0 }
    };
    if (!gevsek.nelUst && G.nelUst) c.nelUst = { max: req.nel * G.nelUst };
    if (!gevsek.kaba) { c.kaba = { min: (opts.kabaMin >= 0 ? opts.kabaMin : G.kabaMin) * dmi }; c.fndf = { min: G.fndfMin * dmi * 100 }; }
    if (!gevsek.ndf) c.ndf = { min: G.ndfMin * dmi * 100 };
    if (!gevsek.nisasta) c.nisasta = { max: G.nisastaMax * dmi * 100 };
    if (!gevsek.yag) c.yag = { max: G.yagMax * dmi * 100 };
    if (!gevsek.mineral) {
      c.ca = { min: req.ca, max: req.ca * (gevsek.caUst ? 99 : 1.6) };
      c.p = { min: req.p, max: req.p * 1.4 };
      c.caP1 = { min: 0 };   // Ca ≥ 1,2 P
      c.caP2 = { max: 0 };   // Ca ≤ 4 P
    }
    var vars = {};
    feeds.forEach(function (f) {
      var v = {
        maliyet: f.fiyat / (f.km / 100), km: 1, nel: f.nel * req.indirim, mp: mpOf(f), rdp: rdpBalance(f),
        kaba: f.grup === 'kaba' ? 1 : 0, fndf: f.grup === 'kaba' ? f.ndf : 0, ndf: f.ndf, nisasta: f.nisasta, yag: f.yag,
        ca: f.ca * 10, p: f.p * 10, caP1: (f.ca - 1.2 * f.p) * 10, caP2: (f.ca - 4 * f.p) * 10
      };
      v.nelUst = f.nel * req.indirim;
      v['max_' + f.id] = 1;
      c['max_' + f.id] = { max: f.max * dmi };
      var lo = f.en_az > 0 ? f.en_az * f.km / 100 : 0, hi = f.en_cok >= 0 && f.en_cok !== null && f.en_cok !== undefined && f.en_cok !== '' ? f.en_cok * f.km / 100 : null;
      if (lo > 0) { v['lo_' + f.id] = 1; c['lo_' + f.id] = { min: lo }; }
      if (hi !== null) { v['hi_' + f.id] = 1; c['hi_' + f.id] = { max: hi }; }
      v.obj = v.maliyet;
      vars[f.id] = v;
    });
    var r = solver.Solve({ optimize: 'obj', opType: 'min', constraints: c, variables: vars });
    return r.feasible ? r : null;
  }

  var KISIT_AD = {
    kaba: 'kaba yem oranı ve kaba yem NDF\'si', ndf: 'toplam NDF', nisasta: 'nişasta üst sınırı',
    yag: 'ham yağ üst sınırı', mineral: 'kalsiyum/fosfor dengesi', nelUst: 'enerji üst sınırı (şişmanlama)'
  };

  function toplam(feeds, x, indirim) {
    var t = { km: 0, yas: 0, maliyet: 0, nel: 0, mp: 0, rdp: 0, tdn: 0, hp: 0, ndf: 0, fndf: 0, nisasta: 0, yag: 0, ca: 0, p: 0, kaba: 0 };
    feeds.forEach(function (f) {
      var kg = x[f.id] || 0;
      if (kg <= 1e-9) return;
      t.km += kg; t.yas += kg / (f.km / 100); t.maliyet += kg * f.fiyat / (f.km / 100);
      t.nel += kg * f.nel * (indirim || 1); t.mp += kg * mpOf(f); t.rdp += kg * f.hp * 10 * f.rdp; t.tdn += kg * f.tdn / 100;
      t.hp += kg * f.hp * 10; t.ndf += kg * f.ndf * 10; t.nisasta += kg * f.nisasta * 10; t.yag += kg * f.yag * 10;
      t.ca += kg * f.ca * 10; t.p += kg * f.p * 10;
      if (f.grup === 'kaba') { t.kaba += kg; t.fndf += kg * f.ndf * 10; }
    });
    return t;
  }

  // Ana hesap. o: grup alanları (bw, sut, yag, protein, dim, gebelik, ebe, adg...), feeds: seçili yemler.
  function compute(solver, grup, o, feeds) {
    var G = GRUPLAR[grup];
    if (!G) return { ok: false, mesaj: 'Bilinmeyen grup.' };
    if (!(o.bw > 0)) return { ok: false, mesaj: 'Canlı ağırlığı girin.' };
    if (grup === 'sagmal' && !(o.sut >= 0)) return { ok: false, mesaj: 'Günlük süt verimini girin.' };
    if (!feeds.some(function (f) { return f.grup === 'kaba'; })) {
      return { ok: false, mesaj: 'En az bir kaba yem seçin (silaj, kuru ot veya saman). Kaba yemsiz rasyon işkembeyi bozar.' };
    }
    var req = requirements(grup, o);
    var x = solveOnce(solver, feeds, req, G, o, {});
    var uyari = [];
    if (!x) {
      // Hangi sınır tek başına sorunu çözüyor?
      var aday = Object.keys(KISIT_AD).filter(function (k) {
        var g = {}; g[k] = true; return solveOnce(solver, feeds, req, G, o, g);
      });
      if (aday.length === 0) {
        return { ok: false, mesaj: 'Seçili yemlerle enerji ve protein ihtiyacı karşılanamıyor. Yüksek enerjili yem (mısır, arpa, yağlı pamuk tohumu), protein yemi (soya, küspe) ya da kaliteli kaba yem (yonca, silaj) ekleyin. İhtiyaç: ' + req.nel.toFixed(1) + ' Mcal enerji, ' + Math.round(req.mp) + ' g MP, ' + req.dmi.toFixed(1) + ' kg kuru madde.', req: req };
      }
      var g2 = {}; aday.forEach(function (k) { g2[k] = true; });
      x = solveOnce(solver, feeds, req, G, o, g2);
      if (!x) {
        g2.caUst = true;
        x = solveOnce(solver, feeds, req, G, o, g2);
      }
      if (!x) return { ok: false, mesaj: 'Seçili yemlerle uygun bir rasyon kurulamadı. Yem çeşidini artırın ya da yem sınırlarını gevşetin.', req: req };
      uyari.push('Seçili yemlerle şu sınır sağlanamadı, bu yüzden esnetildi: ' + aday.map(function (k) { return KISIT_AD[k]; }).join(', ') + '. Yem listesine bu sınırı karşılayacak yem ekleyin.');
    }
    var amounts = {};
    feeds.forEach(function (f) { if (x[f.id] > 1e-9) amounts[f.id] = x[f.id]; });
    return finish(grup, o, feeds, amounts, req, G, uyari);
  }

  function finish(grup, o, feeds, amounts, req, G, uyari) {
    var t = toplam(feeds, amounts, req.indirim);
    var satirlar = feeds.filter(function (f) { return amounts[f.id] > 1e-9; }).map(function (f) {
      var km = amounts[f.id];
      return { id: f.id, ad: f.ad, grup: f.grup, km: km, yas: km / (f.km / 100), maliyet: km * f.fiyat / (f.km / 100) };
    }).sort(function (a, b) { return b.km - a.km; });
    var katki = KATKILAR.map(function (k) {
      var kg = (k.gram[grup] || 0) / 1000;
      return { id: k.id, ad: k.ad, grup: 'katki', km: 0, yas: kg, maliyet: kg * k.fiyat };
    });
    var katkiMaliyet = katki.reduce(function (a, k) { return a + k.maliyet; }, 0);
    var gunluk = t.maliyet + katkiMaliyet;
    var dm = t.km;
    var s = {
      toplam: t, satirlar: satirlar.concat(katki), gunlukMaliyet: gunluk, yemMaliyeti: t.maliyet,
      yogunluk: t.nel / (req.indirim || 1) / dm, hpOran: t.hp / dm / 10, ndfOran: t.ndf / dm / 10, fndfOran: t.fndf / dm / 10,
      nisastaOran: t.nisasta / dm / 10, yagOran: t.yag / dm / 10, kabaOran: t.kaba / dm
    };
    var notlar = uyari.slice();
    if (s.ndfOran < G.ndfMin * 100 - 0.5) notlar.push('NDF düşük.');
    if (t.ca < req.ca - 0.5) notlar.push('Kalsiyum ihtiyacın altında.');
    if (t.p < req.p - 0.5) notlar.push('Fosfor ihtiyacın altında.');
    if (grup === 'sagmal' && o.dim < 21) notlar.push('Buzağılamadan sonraki ilk 3 haftada iştah düşüktür; kuru madde tüketimi hesaplanandan az olabilir, enerji yoğunluğunu yüksek tutun ve rasyonu kademeli artırın.');
    if (grup === 'gecis') notlar.push('Geçiş inekleri için kalsiyum fazlasından kaçının (süt humması). Rasyon Ca yüksekse yonca oranını düşürün; anyonik tuz ve DCAD ayarı için veteriner/besleme uzmanına danışın.');
    if (grup === 'buzagi') notlar.push('Bu rasyon sütten kesilmiş buzağılar içindir. İlk 8 haftada süt/süt ikamesi, temiz su ve taze başlangıç yemi verin; kolostrumu ilk 2 saatte içirin.');
    if (grup === 'kuru') notlar.push('Kuru dönemde enerji fazlası ineği şişmanlatır ve buzağılama sorunlarını artırır; vücut kondisyon puanını 3,0–3,25 arasında tutun.');
    var sonuc = {
      ok: true, grup: grup, ihtiyac: req, sonuc: s, notlar: notlar, miktarlar: amounts,
      sut: grup === 'sagmal' ? o.sut : 0
    };
    if (grup === 'sagmal' && o.sut > 0) {
      sonuc.litreBasiMaliyet = gunluk / o.sut;
      if (o.sutFiyat > 0) sonuc.yemSonrasiGelir = o.sut * o.sutFiyat - gunluk;
    }
    return sonuc;
  }

  root.SutModel = {
    FEEDS: FEEDS, KATKILAR: KATKILAR, GRUPLAR: GRUPLAR, requirements: requirements, dmiOf: dmiOf,
    gebelik: gebelik, mpOf: mpOf, rdpBalance: rdpBalance, compute: compute, toplam: toplam
  };
})(typeof window !== 'undefined' ? window : globalThis);
