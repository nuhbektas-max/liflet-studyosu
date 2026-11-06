// Besi sığırı rasyon hesabı.
// İhtiyaçlar NRC (2000) Besi Sığırı Besin Madde İhtiyaçları denklemlerinden,
// karışım en düşük maliyetli doğrusal programlama ile bulunur.
(function (root) {
  'use strict';

  // Yem değerleri kuru madde (KM) üzerindendir; km yaş/kuru oranıdır (%).
  // me: metabolik enerji (Mcal/kg KM), hp: ham protein (%KM), ndf (%KM),
  // ca / p: kalsiyum / fosfor (%KM). Değerler NRC ve Türkiye yem tablolarının
  // ortalamalarıdır; analiz sonucu olan çiftçi kendi değerini girebilir.
  // grup: 'kaba' (kaba yem), 'tahil', 'kuspe', 'yan' (yan ürün), 'hazir', 'mineral'.
  // max: kuru maddede en fazla oran (sindirim sağlığı için).
  // nisasta / yag: nişasta ve ham yağ (% KM); NRC (2001, 2016) ve Feedipedia ortalamaları.
  // rdp: ham proteinin işkembede parçalanan payı (NRC 2001 tablo ortalamaları); kalanı (RUP)
  //      işkembeyi geçip bağırsakta %80 sindirilir.
  var FEEDS = [
    // Tahıllar
    { id: 'arpa', ad: 'Arpa', grup: 'tahil', km: 89, me: 3.00, hp: 12.4, ndf: 20, ca: 0.06, p: 0.39, nisasta: 57, yag: 2.2, rdp: 0.67, max: 0.60, fiyat: 11 },
    { id: 'misir', ad: 'Mısır (dane)', grup: 'tahil', km: 88, me: 3.25, hp: 9.0, ndf: 10, ca: 0.03, p: 0.30, nisasta: 72, yag: 4.2, rdp: 0.45, max: 0.60, fiyat: 12 },
    { id: 'bugday', ad: 'Buğday', grup: 'tahil', km: 89, me: 3.20, hp: 14.0, ndf: 12, ca: 0.05, p: 0.40, nisasta: 65, yag: 2.0, rdp: 0.77, max: 0.25, fiyat: 13 },
    { id: 'tritikale', ad: 'Tritikale', grup: 'tahil', km: 89, me: 3.10, hp: 13.0, ndf: 14, ca: 0.05, p: 0.35, nisasta: 62, yag: 1.8, rdp: 0.75, max: 0.40, fiyat: 11 },
    { id: 'yulaf', ad: 'Yulaf', grup: 'tahil', km: 89, me: 2.75, hp: 13.0, ndf: 30, ca: 0.10, p: 0.38, nisasta: 44, yag: 5.0, rdp: 0.8, max: 0.40, fiyat: 11 },
    // Küspeler
    { id: 'aycicegi', ad: 'Ayçiçeği küspesi', grup: 'kuspe', km: 91, me: 2.30, hp: 32.0, ndf: 40, ca: 0.40, p: 1.00, nisasta: 2, yag: 2.5, rdp: 0.72, max: 0.25, fiyat: 13 },
    { id: 'pamuk', ad: 'Pamuk tohumu küspesi', grup: 'kuspe', km: 91, me: 2.60, hp: 33.0, ndf: 35, ca: 0.20, p: 1.10, nisasta: 2, yag: 2.5, rdp: 0.57, max: 0.15, fiyat: 14 },
    { id: 'soya', ad: 'Soya küspesi', grup: 'kuspe', km: 89, me: 3.10, hp: 49.0, ndf: 15, ca: 0.35, p: 0.70, nisasta: 2, yag: 1.5, rdp: 0.65, max: 0.20, fiyat: 25 },
    { id: 'kanola', ad: 'Kanola küspesi', grup: 'kuspe', km: 90, me: 2.80, hp: 38.0, ndf: 28, ca: 0.70, p: 1.10, nisasta: 2, yag: 3.5, rdp: 0.68, max: 0.20, fiyat: 15 },
    // Yan ürünler
    { id: 'kepek', ad: 'Buğday kepeği', grup: 'yan', km: 89, me: 2.50, hp: 17.0, ndf: 42, ca: 0.13, p: 1.15, nisasta: 22, yag: 4.0, rdp: 0.75, max: 0.30, fiyat: 9 },
    { id: 'ddgs', ad: 'Mısır DDGS (kurutulmuş damıtık tane)', grup: 'yan', km: 90, me: 3.30, hp: 30.0, ndf: 38, ca: 0.10, p: 0.85, nisasta: 5, yag: 10.0, rdp: 0.43, max: 0.30, fiyat: 13 },
    { id: 'kuruposa', ad: 'Kuru şeker pancarı posası', grup: 'yan', km: 90, me: 2.80, hp: 9.5, ndf: 45, ca: 0.70, p: 0.10, nisasta: 1, yag: 1.0, rdp: 0.55, max: 0.30, fiyat: 10 },
    { id: 'yasposa', ad: 'Yaş şeker pancarı posası', grup: 'yan', km: 22, me: 2.80, hp: 10.0, ndf: 45, ca: 0.70, p: 0.10, nisasta: 1, yag: 1.0, rdp: 0.55, max: 0.30, fiyat: 2 },
    { id: 'melas', ad: 'Melas', grup: 'yan', km: 77, me: 2.90, hp: 8.0, ndf: 0, ca: 0.20, p: 0.03, nisasta: 0, yag: 0.2, rdp: 1.0, max: 0.07, fiyat: 9 },
    // Hazır (fabrika) yemler: değerler etiket (yaş) değerlerinden kuru maddeye çevrilmiştir.
    // etiketHp (%) ve etiketMe (kcal/kg) çiftçinin torbadan okuyacağı değerlerdir.
    { id: 'hz_dana', ad: 'Dana büyütme yemi', grup: 'hazir', km: 88, etiketHp: 18, etiketMe: 2600, ndf: 26, ca: 1.0, p: 0.60, nisasta: 30, yag: 3.5, rdp: 0.65, max: 0.70, fiyat: 16 },
    { id: 'hz_baslangic', ad: 'Besi başlangıç yemi', grup: 'hazir', km: 88, etiketHp: 16, etiketMe: 2600, ndf: 28, ca: 1.0, p: 0.60, nisasta: 32, yag: 3.5, rdp: 0.65, max: 0.80, fiyat: 15 },
    { id: 'hazir', ad: 'Besi yemi', grup: 'hazir', km: 88, etiketHp: 14, etiketMe: 2500, ndf: 30, ca: 1.0, p: 0.60, nisasta: 35, yag: 3.5, rdp: 0.65, max: 0.80, fiyat: 13.5 },
    { id: 'hz_bitis', ad: 'Besi bitiş yemi', grup: 'hazir', km: 88, etiketHp: 12, etiketMe: 2650, ndf: 26, ca: 0.9, p: 0.55, nisasta: 40, yag: 3.5, rdp: 0.65, max: 0.80, fiyat: 13 },
    // Kaba yemler
    { id: 'silaj', ad: 'Mısır silajı', grup: 'kaba', km: 33, me: 2.50, hp: 8.0, ndf: 45, ca: 0.25, p: 0.22, nisasta: 30, yag: 3.2, rdp: 0.75, max: 0.70, fiyat: 3.5 },
    { id: 'yonca', ad: 'Yonca kuru otu', grup: 'kaba', km: 90, me: 2.20, hp: 18.0, ndf: 45, ca: 1.40, p: 0.25, nisasta: 2, yag: 2.5, rdp: 0.8, max: 0.50, fiyat: 10 },
    { id: 'fig', ad: 'Fiğ kuru otu', grup: 'kaba', km: 90, me: 2.10, hp: 15.0, ndf: 50, ca: 1.10, p: 0.27, nisasta: 3, yag: 2.5, rdp: 0.78, max: 0.50, fiyat: 8 },
    { id: 'cayir', ad: 'Çayır kuru otu', grup: 'kaba', km: 89, me: 2.00, hp: 10.0, ndf: 60, ca: 0.60, p: 0.25, nisasta: 2, yag: 2.5, rdp: 0.7, max: 0.60, fiyat: 7 },
    { id: 'bsaman', ad: 'Buğday samanı', grup: 'kaba', km: 91, me: 1.60, hp: 3.5, ndf: 78, ca: 0.18, p: 0.05, nisasta: 1, yag: 1.5, rdp: 0.65, max: 0.40, fiyat: 5 },
    { id: 'asaman', ad: 'Arpa samanı', grup: 'kaba', km: 90, me: 1.65, hp: 4.0, ndf: 75, ca: 0.30, p: 0.07, nisasta: 1, yag: 1.5, rdp: 0.65, max: 0.40, fiyat: 5 },
    // Protein olmayan azot: işkembe mikropları proteine çevirir; en fazla %1 KM (zehirlenme riski).
    { id: 'ure', ad: 'Üre (yem sınıfı)', grup: 'npn', km: 99, me: 0, hp: 287, ndf: 0, ca: 0, p: 0, nisasta: 0, yag: 0, rdp: 1.0, max: 0.01, fiyat: 25 },
    // Mineraller
    { id: 'mermer', ad: 'Mermer tozu (kireç taşı)', grup: 'mineral', km: 99, me: 0, hp: 0, ndf: 0, ca: 38.0, p: 0, nisasta: 0, yag: 0, rdp: 0, max: 0.02, fiyat: 3 },
    { id: 'dcp', ad: 'Dikalsiyum fosfat', grup: 'mineral', km: 97, me: 0, hp: 0, ndf: 0, ca: 23.0, p: 18.0, nisasta: 0, yag: 0, rdp: 0, max: 0.015, fiyat: 40 }
  ];

  // Hazır yemlerin etiket (yaş) değerlerini kuru madde değerine çevirir.
  function applyLabel(f) {
    if (f.etiketHp !== undefined) f.hp = f.etiketHp / (f.km / 100);
    if (f.etiketMe !== undefined) f.me = f.etiketMe / 1000 / (f.km / 100);
    return f;
  }
  FEEDS.forEach(applyLabel);

  // Katkılar: besin hesabına girmez, etiketteki doza göre eklenir.
  // tip 'sabit': hayvan başı günlük gram; tip 'oran': kuru madde tüketiminin yüzdesi.
  var KATKILAR = [
    { id: 'tuz', ad: 'Tuz (veya yalama taşı)', tip: 'sabit', doz: 30, fiyat: 5,
      not: 'Yalama taşı koyuyorsanız tuzu işaretlemeyin.' },
    { id: 'premiks', ad: 'Vitamin-mineral premiksi', tip: 'sabit', doz: 25, fiyat: 120,
      not: 'Dozu torbanın etiketinden yazın (çoğu besi premiksinde hayvan başı 20–50 g).' },
    { id: 'maya', ad: 'Canlı maya', tip: 'sabit', doz: 10, fiyat: 300,
      not: 'İşkembeyi dengeler, yem tüketimini artırabilir. Dozu etiketten yazın (çoğunda 5–15 g).' },
    { id: 'soda', ad: 'Sodyum bikarbonat (soda)', tip: 'oran', doz: 0.75, fiyat: 25,
      not: 'Kesif yemi çok olan rasyonda asidoza karşı tampon. Kuru maddenin %0,5–1\'i kadar.' }
  ];

  var LIMITS = {
    kabaMin: 0.20,   // kuru maddenin en az %20'si kaba yem (asidoz riskine karşı)
    tahilMax: 0.70,  // tahılların toplamı en fazla %70 (asıl sınır nişasta)
    nisastaMax: 0.40, // nişasta en fazla %40 (asidoz riskine karşı; ayarlanabilir)
    ndfMin: 0.20,    // lif (NDF) en az %20
    yagMax: 0.06,    // ham yağ en fazla %6 (işkembe sindirimini bozmasın)
    caPmin: 1.5,     // Ca:P oranı en az 1.5 (idrar taşı riskine karşı)
    caPmax: 4.0,     // Ca:P oranı en fazla 4
    tolerans: 0.05,      // enerji ve protein ihtiyacın en fazla %5 üstünde (kullanıcı değiştirebilir)
    tolMineral: 0.05     // kalsiyum ve fosfor için aynı sınır (ayrıca değiştirilebilir)
  };
  // Tolerans aşımının bedeli (tolerans tutturulamadığında, en yakın çözümde): ihtiyacın %1'i kadar
  // fazlalık 1.000 TL sayılır, yani önce fazlalık en aza indirilir, sonra maliyet.
  // Kalsiyum/fosfor "sıkı" değilse (varsayılan; opts.mineralSiki !== true) üst sınırları hiç zorlanmaz:
  // %100 fazlalık 0,01 TL sayılır, yalnızca eşit maliyetli seçenekler arasında ayırt eder.
  var PEN_UST = 1e5, PEN_UST_GEVSEK = 0.01;

  // Protein (NRC 2000, düzey 1): işkembe mikropları yenen TDN'nin kg'ı başına 130 g mikrobiyal
  // protein yapar (yeterli RDP varsa); bunun %64'ü, yem proteininin işkembeyi geçen kısmının
  // (RUP) %80'i metabolize olabilir proteine (MP) dönüşür. TDN = ME / (0,82 × 0,04409).
  function tdnOf(f) { return f.me / (0.82 * 0.04409); }          // % KM
  function protCoef(f) {
    var rdp = f.rdp !== undefined ? f.rdp : 0.65, hpg = f.hp * 10;  // g/kg KM
    var tdn = tdnOf(f);
    return {
      mp: 0.64 * 1.3 * tdn + 0.8 * hpg * (1 - rdp),  // g MP / kg KM
      rdp: hpg * rdp,                                // g RDP / kg KM
      rdpIht: 1.3 * tdn,                             // mikropların ihtiyacı, g / kg KM
      rup: hpg * (1 - rdp)
    };
  }

  // Metabolik enerjiden net enerjiye (NRC 2000).
  function neFromMe(me) {
    return {
      nem: 1.37 * me - 0.138 * me * me + 0.0105 * me * me * me - 1.12,
      neg: 1.42 * me - 0.174 * me * me + 0.0122 * me * me * me - 1.65
    };
  }

  // Irk (NRC 1996/2000, Tablo 1-1): yaşama payı enerji katsayısı. Süt ve kombine ırklar
  // (Holstein, Simental, Montofon) %20 daha fazla enerji harcar. Holstein'ın iştahı da %8
  // (melezinde %4) yüksektir (NRC 1996 kuru madde tüketimi düzeltmesi).
  var IRKLAR = [
    { id: 'bilinmiyor', ad: 'Bilinmiyor / yerli', be: 1.0 },
    { id: 'simental', ad: 'Simental', be: 1.2 },
    { id: 'holstein', ad: 'Holstein (siyah alaca)', be: 1.2, holstein: true },
    { id: 'montofon', ad: 'Montofon (Brown Swiss)', be: 1.2 },
    { id: 'sarole', ad: 'Şarole', be: 1.0 },
    { id: 'limuzin', ad: 'Limuzin', be: 1.0 },
    { id: 'angus', ad: 'Angus', be: 1.0 },
    { id: 'hereford', ad: 'Hereford', be: 1.0 }
  ];
  // Kastre edilmemiş erkeğin (tosun) yaşama payı enerjisi %15 fazladır (NRC 2000).
  var CINSIYET = { tosun: 1.15, dise: 1.0, kastre: 1.0 };
  // Sıcak stresi: yaşama payı enerjisi hızlı solumada %7, ağzı açık solumada %18 artar (NRC).
  var SICAK_STRES = { yok: 1.0, hizli: 1.07, agiz: 1.18 };

  function irkOf(id) { return IRKLAR.filter(function (x) { return x.id === id; })[0] || IRKLAR[0]; }

  // Irk, cinsiyet ve ortam düzeltmeleri. Değer verilmemişse NRC'nin temel hayvanı:
  // ırk katsayısı 1, dişi ya da kastre, 20 °C, sıcak stresi yok.
  // sicaklik: son ayın ortalama sıcaklığı (°C); hayvan buna alışır (NRC: 0,0007 × (20 − T)).
  function hayvanKat(opts) {
    opts = opts || {};
    var baba = irkOf(opts.irk), ana = opts.anaIrk ? irkOf(opts.anaIrk) : baba;
    var be = (baba.be + ana.be) / 2;
    var hol = (baba.holstein ? 1 : 0) + (ana.holstein ? 1 : 0);
    var cins = CINSIYET[opts.cinsiyet] || 1;
    var t = isFinite(opts.sicaklik) && opts.sicaklik !== null && opts.sicaklik !== '' ? +opts.sicaklik : 20;
    var stres = SICAK_STRES[opts.sicakStres] || 1;
    // NRC 1996 kuru madde tüketimi sıcaklık düzeltmesi.
    var dmiT = t > 35 ? (opts.geceSerin === false ? 0.65 : 0.90) : t > 25 ? 0.90 : t > 15 ? 1.0 : t > 5 ? 1.03 : t > -5 ? 1.05 : t > -15 ? 1.07 : 1.16;
    return {
      a1: 0.077 * be * cins, a2: 0.0007 * (20 - t), stres: stres,
      dmi: (hol === 2 ? 1.08 : hol === 1 ? 1.04 : 1) * dmiT,
      be: be, cinsiyet: cins, sicaklik: t, dmiSicaklik: dmiT
    };
  }

  // Bir hayvanın günlük ihtiyacı.
  // bw: canlı ağırlık (kg), adg: hedef günlük artış (kg), finalBw: kesim kilosu (kg),
  // opts: ırk, cinsiyet ve sıcaklık (hayvanKat).
  function requirements(bw, adg, finalBw, opts) {
    var hk = hayvanKat(opts);
    var sbw = 0.96 * bw;                       // aç karına ağırlık
    var m75 = Math.pow(sbw, 0.75);             // metabolik ağırlık
    var nem = (hk.a1 + hk.a2) * m75 * hk.stres;  // yaşama payı net enerji (Mcal)
    var eqsbw = sbw * 478 / (0.96 * finalBw);  // standart referans ağırlığa eşdeğer
    var eqebw = 0.891 * eqsbw;
    var swg = adg;
    var neg = 0, npg = 0;
    if (adg > 0) {
      neg = 0.0635 * Math.pow(eqebw, 0.75) * Math.pow(0.956 * swg, 1.097);
      npg = swg * (268 - 29.4 * neg / swg);    // artışta tutulan protein (g)
    }
    // MP'nin artışta kullanım verimi (NRC 2000): hafif hayvanda yüksek, ağırlıkla azalır;
    // eşdeğer ağırlık 300 kg'ın üstünde 0,492 sabit.
    var effG = eqsbw <= 300 ? 0.834 - 0.00114 * eqsbw : 0.492;
    var mp = 3.8 * m75 + npg / effG;           // metabolize olabilir protein (g)
    var p = (0.016 * sbw + 0.039 * npg) / 0.68;      // g
    var caNrc = (0.0154 * sbw + 0.071 * npg) / 0.5;  // g
    return {
      nem: nem,
      neg: neg,
      mp: mp,
      hp: mp / 0.67,                           // ham protein (g); MP ≈ HP × 0.67
      // Kalsiyum en az fosforun 1,5 katı (idrar taşına karşı); NRC değeri bundan azsa bu alınır.
      ca: Math.max(caNrc, LIMITS.caPmin * p),
      caNrc: caNrc,
      p: p,
      calf: bw < 300,
      dmiKat: hk.dmi,
      nemTemel: 0.077 * m75
    };
  }

  // Artış için ayrılabilen net enerjiden (RE, Mcal) beklenen günlük artış: NRC artış
  // denkleminin tersi.
  function adgFromRE(bw, finalBw, re) {
    if (re <= 0) return 0;
    var eqebw = 0.891 * (0.96 * bw) * 478 / (0.96 * finalBw);
    return Math.pow(re / (0.0635 * Math.pow(eqebw, 0.75)), 1 / 1.097) / 0.956;
  }

  // NRC (1996) kuru madde tüketim kapasitesi (kg/gün).
  // kat: ırk ve sıcaklık düzeltmesi (hayvanKat().dmi).
  function intakeCapacity(bw, nemDiet, calf, kat) {
    var n = Math.max(nemDiet, 0.95);
    var k = calf ? 0.1128 : 0.0869;
    return Math.pow(0.96 * bw, 0.75) * (0.2435 * n - 0.0466 * n * n - k) / n * (kat > 0 ? kat : 1);
  }

  // Verilen enerji yoğunluğu (Mcal ME/kg KM) için en ucuz karışım.
  // Seçilen yem yalnızca ekonomikse ya da gerekiyorsa kullanılır. "Kesin kullan" işaretli
  // (f.zorunlu) ya da en az miktarı yazılmış yem mutlaka girer; en az miktar yazılmadıysa bu kadar
  // (yaş kg/baş/gün).
  var DEFAULT_MIN = { mineral: 0.005, diger: 0.1 };
  var PENALTY = 1e5;  // sınır esnetmenin bedeli (TL/kg); maliyetten her zaman ağır basar

  // Yemin alt/üst sınırı, kuru madde kg olarak. maxKg yoksa hi null.
  function bounds(f) {
    var k = f.km / 100, zorunlu = f.zorunlu === true || f.minKg > 0;
    var minKg = !zorunlu ? 0 : f.minKg > 0 ? f.minKg : (f.grup === 'mineral' || f.grup === 'npn' ? DEFAULT_MIN.mineral : DEFAULT_MIN.diger);
    return { lo: minKg * k, hi: f.maxKg > 0 ? f.maxKg * k : null, minKg: minKg, kullaniciMin: f.minKg > 0, zorunlu: zorunlu };
  }

  // relax: { protein, mineral, intake, bounds (sınırları yok say), elastic (sınırları cezayla esnet),
  //         ustYumusak (tolerans üst sınırı aşılabilir ama cezalı: en yakın çözüm) }
  function solveAt(solver, feeds, req, me, opts, relax) {
    var ne = neFromMe(me);
    if (ne.nem <= 0 || ne.neg <= 0) return null;
    var dmi = req.nem / ne.nem + req.neg / ne.neg;
    var cap = intakeCapacity(opts.bw, ne.nem, req.calf, req.dmiKat);
    if (!relax.intake && dmi > cap) return null;

    var c = {
      km: { equal: dmi },
      me: { min: me * dmi },
      kaba: { min: opts.kabaMin * dmi },
      tahil: { max: LIMITS.tahilMax * dmi },
      nisasta: { max: limitOf(opts, 'nisastaMax') * dmi * 100 },
      ndf: { min: limitOf(opts, 'ndfMin') * dmi * 100 },
      yag: { max: limitOf(opts, 'yagMax') * dmi * 100 }
    };
    var tol = opts.tolerans >= 0 ? opts.tolerans : LIMITS.tolerans;
    // Üst sınırlar: besinler ihtiyacın en fazla (1 + tol) katı. Enerji yoğunluğu ızgarada
    // ayrıca arandığı için enerji %1 içinde tutulur.
    // [kısıt adı, besin, üst sınır, aşım bedeli, her zaman yumuşak mı]
    var ust = [['meUst', 'me', me * dmi * 1.01, PEN_UST, false]];
    if (!relax.protein) {
      c.mp = { min: req.mp };          // metabolize olabilir protein
      c.rdpDenge = { min: 0 };         // işkembe mikroplarının azot ihtiyacı karşılanmalı
      ust.push(['mpUst', 'mp', req.mp * (1 + tol), PEN_UST, false]);
    }
    if (!relax.mineral) {
      c.ca = { min: req.ca };
      c.p = { min: req.p };
      var tolM = tolMinOf(opts);
      var siki = opts.mineralSiki === true;  // varsayılan: serbest (en ucuz rasyon)
      ust.push(['caUst', 'ca', req.ca * (1 + tolM), siki ? PEN_UST : PEN_UST_GEVSEK, !siki],
               ['pUst', 'p', req.p * (1 + tolM), siki ? PEN_UST : PEN_UST_GEVSEK, !siki]);
      c.caP1 = { min: 0 };  // Ca − 1.5 P ≥ 0
      c.caP2 = { max: 0 };  // Ca − 4 P ≤ 0
    }
    var vars = {};
    ust.forEach(function (u) {
      c[u[0]] = { max: u[2] };
      if (relax.ustYumusak || relax.ustGevsek || u[4]) {
        // Aşım değişkeni: üst sınırın üstüne çıkılan miktar; bedeli ihtiyaca göre ölçeklenir.
        // ustGevsek: yalnızca eşitlik bozucu kadar (alım rehberi gerçek yem maliyetini karşılaştırır).
        vars['as_' + u[0]] = { obj: (relax.ustGevsek ? PEN_UST_GEVSEK : u[3]) / u[2] };
        vars['as_' + u[0]][u[0]] = -1;
      }
    });
    feeds.forEach(function (f) {
      var v = {
        maliyet: f.fiyat / (f.km / 100),
        km: 1,
        me: f.me,
        hp: f.hp * 10,
        mp: protCoef(f).mp,
        rdpDenge: protCoef(f).rdp - protCoef(f).rdpIht,
        ca: f.ca * 10,
        p: f.p * 10,
        caP1: (f.ca - LIMITS.caPmin * f.p) * 10,
        caP2: (f.ca - LIMITS.caPmax * f.p) * 10,
        kaba: f.grup === 'kaba' ? 1 : 0,
        tahil: f.grup === 'tahil' ? 1 : 0,
        nisasta: f.nisasta || 0,
        ndf: f.ndf || 0,
        yag: f.yag || 0
      };
      ust.forEach(function (u) { v[u[0]] = v[u[1]]; });
      v['max_' + f.id] = 1;
      // Üre 200 kg altındaki danalarda kullanılmaz (işkembe henüz gelişmemiş).
      c['max_' + f.id] = { max: f.grup === 'npn' && opts.bw < 200 ? 0 : f.max * dmi };
      // 200 kg altında üre kullanılmadığından seçili olsa da alt sınırı uygulanmaz.
      var ureYasak = f.grup === 'npn' && opts.bw < 200;
      if (!relax.bounds && !ureYasak) {
        var b = bounds(f);
        if (b.lo > 0) { v['lo_' + f.id] = 1; c['lo_' + f.id] = { min: b.lo }; }
        if (b.hi !== null) { v['hi_' + f.id] = 1; c['hi_' + f.id] = { max: b.hi }; }
        if (relax.elastic) {
          // Esnetme değişkenleri: alt sınırın altına inmek / üst sınırın üstüne çıkmak.
          // Kullanıcının yazmadığı (varsayılan) alt sınırı esnetmek, yani seçilen bir yemi
          // azaltıp çıkarmak, kullanıcının sayılarını değiştirmekten çok daha pahalıdır.
          var pen = PENALTY / (f.km / 100);
          if (b.lo > 0) {
            vars['slo_' + f.id] = { obj: b.kullaniciMin ? pen : pen * 100 };
            vars['slo_' + f.id]['lo_' + f.id] = 1;
          }
          if (b.hi !== null) {
            vars['shi_' + f.id] = { obj: pen };
            vars['shi_' + f.id]['hi_' + f.id] = -1;
          }
        }
      }
      v.obj = v.maliyet;
      vars[f.id] = v;
    });
    var r = solver.Solve({ optimize: 'obj', opType: 'min', constraints: c, variables: vars });
    if (!r.feasible) return null;
    return { me: me, dmi: dmi, cap: cap, cost: r.result, x: r };
  }

  // En ucuz karışımı enerji yoğunluğu üzerinde arar: önce 0,01 adımla bütün aralık,
  // sonra en iyinin çevresinde 0,001 adımla incelterek.
  function search(solver, feeds, req, opts, relax) {
    var best = null;
    var tryMe = function (me) {
      var s = solveAt(solver, feeds, req, Math.round(me * 1000) / 1000, opts, relax);
      if (s && (!best || s.cost < best.cost - 1e-9)) best = s;
    };
    for (var me = 2.0; me <= 3.30001; me += 0.01) tryMe(me);
    // Sınır önerisi (elastic) yalnız kaba ızgarada aranır: önerilen sınırlar uygulanınca
    // aynı çözüm normal aramada da bulunur.
    if (best && !relax.elastic) {
      var c = best.me;
      for (var d = -0.009; d <= 0.00901; d += 0.001) if (Math.abs(d) > 1e-9) tryMe(c + d);
    }
    return best;
  }

  // Ana hesap. opts: { bw, adg, finalBw, heads, kabaMin, feeds: [{...FEEDS öğesi, fiyat}] }
  function compute(solver, opts) {
    var feeds = opts.feeds;
    if (!feeds.some(function (f) { return f.grup === 'kaba'; })) {
      return { ok: false, neden: 'kaba', mesaj: 'En az bir kaba yem seçin (saman, kuru ot veya silaj). Kaba yemsiz besi hayvanı hasta eder.' };
    }
    var maxSum = feeds.reduce(function (a, f) { return a + f.max; }, 0);
    if (maxSum < 1) {
      return { ok: false, neden: 'cesit', eksikler: ['cesit'], mesaj: 'Seçtiğiniz yemler bir rasyonu doldurmaya yetmiyor: sağlık için her yemden en fazla belli bir oranda verilebilir. Bir yem daha ekleyin (ör. arpa, kuru ot veya silaj).' };
    }
    var req = requirements(opts.bw, opts.adg, opts.finalBw, opts);
    var best = search(solver, feeds, req, opts, {});
    if (best) return { ok: true, req: req, sonuc: describe(best, feeds, req, opts) };

    // Sınırlarla çözüm yok. Sınırlar olmadan var mı? Varsa sorun sınırlarda: en küçük değişikliği bul.
    if (search(solver, feeds, req, opts, { bounds: true })) {
      var el = search(solver, feeds, req, opts, { elastic: true });
      return {
        ok: false, req: req, neden: 'sinir', eksikler: ['sinir'], oneriler: boundSuggestions(el, feeds),
        mesaj: 'Verdiğiniz sınırlarla ihtiyacı %100–' + Math.round(100 + tolOf(opts) * 100) + ' arasında karşılayan bir karışım yok. Şu değişikliklerle var:'
      };
    }
    // Seçilen yemler bir besini kendiliğinden toleranstan fazla veriyor. İhtiyaçlar yine %100
    // karşılanır; fazlalığı en aza indiren en yakın çözüm aranır.
    if (search(solver, feeds, req, opts, { bounds: true, ustYumusak: true })) {
      var yakin = search(solver, feeds, req, opts, { ustYumusak: true });
      if (yakin) return { ok: true, req: req, sonuc: describe(yakin, feeds, req, opts) };
      var el2 = search(solver, feeds, req, opts, { elastic: true, ustYumusak: true });
      return {
        ok: false, req: req, neden: 'sinir', eksikler: ['sinir'], oneriler: boundSuggestions(el2, feeds),
        mesaj: 'Verdiğiniz sınırlarla ihtiyacı %100 karşılayan bir karışım yok. Şu değişikliklerle var:'
      };
    }
    return nutrientFailure(solver, feeds, req, opts);
  }

  // Kullanıcının ayarladığı sınır (opts.nisastaMax gibi) ya da varsayılan.
  function limitOf(opts, k) { return opts[k] >= 0 ? opts[k] : LIMITS[k]; }

  function tolOf(opts) { return opts.tolerans >= 0 ? opts.tolerans : LIMITS.tolerans; }
  function tolMinOf(opts) { return opts.tolMineral >= 0 ? opts.tolMineral : LIMITS.tolMineral; }

  // Esnetilmiş çözümden kullanıcıya önerilecek en küçük sınır değişiklikleri.
  // Değerler, öneriyle hesap kesin tutsun diye 0,05 kg'a (minerallerde 1 g'a) yuvarlanır.
  function boundSuggestions(el, feeds) {
    var out = [];
    feeds.forEach(function (f) {
      var k = f.km / 100, b = bounds(f);
      var step = (f.grup === 'mineral' || f.grup === 'npn') ? 0.001 : 0.05;
      var lo = (el.x['slo_' + f.id] || 0) / k, hi = (el.x['shi_' + f.id] || 0) / k;
      if (lo > 1e-6) {
        var yeniMin = Math.floor((b.minKg - lo) / step + 1e-9) * step;
        if (yeniMin >= step) out.push({ id: f.id, ad: f.ad, tur: 'min', eski: b.minKg, yeni: yeniMin });
        else out.push({ id: f.id, ad: f.ad, tur: 'cikar', eski: b.minKg, yeni: 0 });
      }
      if (hi > 1e-6) {
        var yeniMax = Math.ceil((f.maxKg + hi) / step - 1e-9) * step;
        // Stok yüzünden konan sınır: kaç ton stok gerektiği söylenir (0,1 ton yukarı yuvarlanır).
        if (f.stokSinir) out.push({ id: f.id, ad: f.ad, tur: 'stok', eski: f.stokTon, yeni: Math.ceil(yeniMax * f.stokCarpan / 100 - 1e-9) / 10 });
        else out.push({ id: f.id, ad: f.ad, tur: 'max', eski: f.maxKg, yeni: yeniMax });
      }
    });
    return out;
  }

  // Sınırlar olmadan da çözüm yoksa: enerji / protein / mineral eksikliği.
  function nutrientFailure(solver, feeds, req, opts) {
    // Neyin yetmediğini bul: enerji (iştah), protein, mineral. Birden fazlası olabilir.
    var eksik = [];
    var energyOk = !!search(solver, feeds, req, opts, { protein: true, mineral: true, bounds: true, ustYumusak: true });
    if (!energyOk) eksik.push('enerji');
    // Protein: karışımda ulaşılabilecek en yüksek protein oranı, hayvanın
    // yiyebileceği miktara göre gereken orandan düşükse protein de eksiktir.
    var capTypical = intakeCapacity(opts.bw, neFromMe(2.7).nem, req.calf, req.dmiKat);
    // İşkembe azotu: karışımda RDP, mikropların ihtiyacını hiçbir oranda karşılayamıyorsa protein eksik.
    if (bestShare(solver, feeds, opts, 'mp') < req.mp / capTypical || bestShare(solver, feeds, opts, 'rdpDenge') < 0) eksik.push('protein');
    else if (energyOk && !search(solver, feeds, req, opts, { mineral: true, bounds: true, ustYumusak: true })) eksik.push('denge');
    if (energyOk && !search(solver, feeds, req, opts, { protein: true, bounds: true, ustYumusak: true })) {
      // Mineraller iştah sınırsız olsa karşılanıyorsa asıl sorun enerji: mineraller de midede yer
      // kaplar, hayvan bu hedef için yeterince yiyemiyor.
      if (search(solver, feeds, req, opts, { protein: true, bounds: true, ustYumusak: true, intake: true })) { if (eksik.indexOf('enerji') < 0) eksik.unshift('enerji'); }
      else eksik.push('mineral');
    }
    if (!eksik.length) eksik.push('denge');  // tek tek yetiyor, birlikte sığmıyor
    var res = { ok: false, req: req, neden: eksik[0], eksikler: eksik, maxAdg: maxAdg(solver, opts) };
    var m = [];
    if (eksik.indexOf('enerji') >= 0) {
      m.push('Bu yemlerle hayvan bu kadar hızlı kilo alamaz; yiyebileceği miktarda yeterli enerji yok. Arpa, mısır gibi enerjisi yüksek bir yem ekleyin ya da hedefi düşürün.' +
        (req.dmiKat < 0.99 ? ' Sıcakta hayvan az yer: yaz aylarında hedefi düşük tutmak normaldir.' : ''));
    }
    if (eksik.indexOf('protein') >= 0) {
      m.push('Protein yetmiyor (işkembe mikroplarına giden azot ya da toplam protein). Ayçiçeği, kanola, pamuk veya soya küspesi, hazır besi yemi ya da az miktarda üre ekleyin.');
    }
    if (eksik.indexOf('denge') >= 0) {
      m.push('Enerjiyi ve proteini aynı anda karşılayan bir karışım çıkmıyor: hayvan bu ağırlıkta bu kadar hızlı büyüyemez. Hedefi düşürün ya da soya küspesi, hazır besi yemi gibi proteini yüksek bir yem ekleyin.');
    }
    if (eksik.indexOf('mineral') >= 0) {
      m.push('Kalsiyum/fosfor dengesi kurulamıyor. Mermer tozu ve dikalsiyum fosfatı seçin.');
    }
    if (res.maxAdg > 0.05) {
      // Önerilen hedef aşağı yuvarlanır ki öneriyle hesap kesin tutsun.
      res.oneriAdg = Math.floor(res.maxAdg * 20) / 20;
      m.push('Bu yemlerle ve verdiğiniz sınırlarla %100 karşılanabilecek en yüksek günlük artış ' + res.oneriAdg.toFixed(2).replace('.', ',') + ' kg.');
    }
    res.mesaj = m.join(' ');
    return res;
  }

  // 1 kg kuru maddede, oran sınırlarına uyarak ulaşılabilecek en yüksek besin miktarı
  // (hp için g/kg KM).
  function bestShare(solver, feeds, opts, key) {
    var c = { km: { equal: 1 }, kaba: { min: opts.kabaMin }, tahil: { max: LIMITS.tahilMax },
      nisasta: { max: limitOf(opts, 'nisastaMax') * 100 }, ndf: { min: limitOf(opts, 'ndfMin') * 100 }, yag: { max: limitOf(opts, 'yagMax') * 100 } };
    var vars = {};
    feeds.forEach(function (f) {
      var v = { km: 1, kaba: f.grup === 'kaba' ? 1 : 0, tahil: f.grup === 'tahil' ? 1 : 0, nisasta: f.nisasta || 0, ndf: f.ndf || 0, yag: f.yag || 0 };
      v[key] = key === 'mp' ? protCoef(f).mp : key === 'rdpDenge' ? protCoef(f).rdp - protCoef(f).rdpIht : f[key] * 10;
      v['max_' + f.id] = 1;
      c['max_' + f.id] = { max: f.max };
      vars[f.id] = v;
    });
    var r = solver.Solve({ optimize: key, opType: 'max', constraints: c, variables: vars });
    return r.feasible ? r.result : 0;
  }

  // En yüksek ulaşılabilir günlük artış (ikiye bölme ile).
  function maxAdg(solver, opts) {
    var lo = 0, hi = 2.5;
    var req0 = requirements(opts.bw, 0.05, opts.finalBw, opts);
    if (!search(solver, opts.feeds, req0, opts, { ustYumusak: true })) return 0;
    for (var i = 0; i < 14; i++) {
      var mid = (lo + hi) / 2;
      var ok = search(solver, opts.feeds, requirements(opts.bw, mid, opts.finalBw, opts), opts, { ustYumusak: true });
      if (ok) lo = mid; else hi = mid;
    }
    return lo;
  }

  function katkiGram(k, dmKg) {
    return k.tip === 'oran' ? dmKg * 1000 * k.doz / 100 : k.doz;
  }

  function describe(best, feeds, req, opts) {
    var lines = [];
    var tot = { km: 0, me: 0, hp: 0, mp: 0, rdp: 0, rdpIht: 0, rup: 0, ca: 0, p: 0, ndf: 0, nisasta: 0, yag: 0, kaba: 0, tahil: 0, yas: 0, maliyet: 0 };
    feeds.forEach(function (f) {
      var dm = best.x[f.id] || 0;
      if (dm < 1e-4) return;
      var asFed = dm / (f.km / 100);
      var pcl = protCoef(f);
      lines.push({ id: f.id, ad: f.ad, grup: f.grup, km: dm, yas: asFed, maliyet: asFed * f.fiyat,
        hp: dm * f.hp * 10, rdp: dm * pcl.rdp, rup: dm * pcl.rup, mikropIht: dm * pcl.rdpIht });
      tot.km += dm; tot.yas += asFed; tot.maliyet += asFed * f.fiyat;
      tot.me += dm * f.me; tot.hp += dm * f.hp * 10; tot.ca += dm * f.ca * 10; tot.p += dm * f.p * 10;
      tot.ndf += dm * f.ndf / 100;
      var pc = protCoef(f);
      tot.mp += dm * pc.mp; tot.rdp += dm * pc.rdp; tot.rdpIht += dm * pc.rdpIht; tot.rup += dm * pc.rup;
      tot.nisasta += dm * (f.nisasta || 0) / 100;
      tot.yag += dm * (f.yag || 0) / 100;
      if (f.grup === 'kaba') tot.kaba += dm;
      if (f.grup === 'tahil') tot.tahil += dm;
    });
    lines.sort(function (a, b) { return b.yas - a.yas; });
    var km0 = tot.km;
    (opts.katkilar || []).forEach(function (k) {
      var kg = katkiGram(k, km0) / 1000;
      if (kg <= 0) return;
      lines.push({ id: k.id, ad: k.ad, grup: 'katki', km: kg, yas: kg, maliyet: kg * k.fiyat });
      tot.yas += kg; tot.maliyet += kg * k.fiyat;
    });
    var uyarilar = [];
    if (opts.adg > 1.6) uyarilar.push('Günlük ' + opts.adg.toString().replace('.', ',') + ' kg artış çok yüksek bir hedef; çoğu sürüde 1,0–1,5 kg gerçekçidir.');
    if (tot.kaba / tot.km < 0.25) uyarilar.push('Kaba yem oranı düşük (%' + Math.round(tot.kaba / tot.km * 100) + '). Hayvanları bu rasyona 2–3 haftada, her gün biraz artırarak alıştırın; ishal, yem yememe veya topallık görürseniz veterinere danışın.');
    if (tot.nisasta / tot.km > 0.30) uyarilar.push('Nişasta %' + Math.round(tot.nisasta / tot.km * 100) + ': hayvanları bu rasyona 2–3 haftada yavaş alıştırın, yemi günde en az 2 öğüne bölün.');
    if (opts.sicakStres === 'hizli' || opts.sicakStres === 'agiz' || opts.sicaklik > 25) uyarilar.push('Sıcak hava: yemi sabah erken ve akşam serinde verin, gölge ve bol temiz su sağlayın. Yemlikte kızışan (ısınan) yem bırakmayın.');
    var ids = lines.map(function (l) { return l.id; });
    if (tot.kaba / tot.km < 0.30 && ids.indexOf('soda') < 0) uyarilar.push('Kesif yem oranı yüksek: rasyona sodyum bikarbonat (soda) eklemeyi düşünün; asidoz riskini azaltır.');
    if (ids.indexOf('premiks') < 0 && !lines.some(function (l) { return l.grup === 'hazir'; })) uyarilar.push('Vitamin-mineral premiksi seçilmedi. Hazır yem kullanmıyorsanız A, D, E vitamini ve iz mineraller için premiks verin.');
    var ure = lines.filter(function (l) { return l.id === 'ure'; })[0];
    if (opts.bw < 200 && feeds.some(function (f) { return f.grup === 'npn'; })) uyarilar.push('Üre 200 kg altındaki danalarda kullanılmaz; seçili olsa da rasyona konmadı.');
    if (ure) uyarilar.push('Üre: hayvanları 2–3 haftada, azar azar artırarak alıştırın; günlük miktarı kesif yeme çok iyi karıştırıp öğünlere bölün, asla tek seferde ya da suya katarak vermeyin. 200 kg altındaki danalarda ve aç hayvanlarda kullanmayın.');
    var pamuk = lines.filter(function (l) { return l.id === 'pamuk'; })[0];
    if (pamuk && pamuk.km / tot.km > 0.10) uyarilar.push('Pamuk tohumu küspesi genç hayvanda zehirlenme (gossipol) yapabilir; 6 aylıktan küçük danalarda kullanmayın.');
    var kullanilan = lines.map(function (l) { return l.id; });
    return {
      satirlar: lines,
      kullanilmayan: feeds.filter(function (f) { return kullanilan.indexOf(f.id) < 0; }).map(function (f) { return { id: f.id, ad: f.ad }; }),
      toplam: tot,
      asim: excess(feeds, best, req, opts, tot),
      sinirlayanlar: limiting(best, feeds, req, opts, tot),
      me: best.me,
      ne: neFromMe(best.me),
      tuketimKapasitesi: best.cap,
      ihtiyac: req,
      gunlukMaliyet: tot.maliyet,
      kgArtisMaliyet: opts.adg > 0 ? tot.maliyet / opts.adg : null,
      uyarilar: uyarilar
    };
  }

  // Toleransı aşan besinler ve bu fazlalığı en çok veren yemler.
  function excess(feeds, best, req, opts, tot) {
    var out = [];
    [['mp', 'Kullanılabilir protein', req.mp, 1, tolOf(opts)], ['ca', 'Kalsiyum', req.ca, 10, tolMinOf(opts)], ['p', 'Fosfor', req.p, 10, tolMinOf(opts)]].forEach(function (n) {
      var pct = tot[n[0]] / n[2];
      if (pct <= 1 + n[4] + 0.002) return;
      var kaynak = feeds.map(function (f) { return { ad: f.ad, g: (best.x[f.id] || 0) * (n[0] === 'mp' ? protCoef(f).mp : f[n[0]]) * n[3] }; })
        .filter(function (k) { return k.g > 0; })
        .sort(function (a, b) { return b.g - a.g; }).slice(0, 2)
        .map(function (k) { return k.ad + ' (%' + Math.round(k.g / tot[n[0]] * 100) + ')'; });
      out.push({ id: n[0], ad: n[1], pct: pct * 100, kaynak: kaynak,
        metin: n[0] === 'ca' && tot.ca <= LIMITS.caPmin * tot.p * 1.01
          ? 'Kalsiyum %' + Math.round(pct * 100) + ': fosfor fazla olduğu için, idrar taşına karşı kalsiyum fosforun en az 1,5 katı tutuldu. Fosfor düşerse bu da düşer.'
          : n[0] === 'mp' && Math.abs(tot.rdp - tot.rdpIht) <= Math.max(1, tot.rdpIht * 0.005)
          ? 'Kullanılabilir protein %' + Math.round(pct * 100) + ': işkembe mikroplarının azot ihtiyacını karşılamak için gereken küspe, bir miktar fazla protein de getiriyor. ' +
            (feeds.some(function (f) { return f.grup === 'npn'; }) ? 'Bu yemlerle daha aşağı inmiyor.' : 'Az miktarda üre seçerseniz (200 kg üstü hayvanlarda) bu fazlalık kalkar ve rasyon ucuzlar.')
          : n[0] === 'mp'
          ? 'Kullanılabilir protein %' + Math.round(pct * 100) + ': seçtiğiniz yemlerle ve sınırlarla daha aşağı inmiyor. En çok ' + kaynak.join(' ve ') + ' veriyor; bu yemi azaltmak ya da çıkarmak fazlalığı ve maliyeti düşürür.'
          : opts.mineralSiki !== true
            ? n[1] + ' %' + Math.round(pct * 100) + ': en ucuz rasyonda yemlerden kendiliğinden geliyor (en çok ' + kaynak.join(' ve ') + '). Bu düzeyde fazlası hayvana zarar vermez. %' + Math.round(100 + n[4] * 100) + '\'te tutmak için Ayarlar\'dan "Kalsiyum ve fosforu da sınırda tut"u açın; rasyon pahalılaşabilir.'
            : n[1] + ' %' + Math.round(pct * 100) + ': seçtiğiniz yemlerle %' + Math.round(100 + n[4] * 100) + '\'e inmiyor, bu en düşük değer. En çok ' + kaynak.join(' ve ') + ' veriyor; bu yemi azaltmak ya da çıkarmak düşürür. Bu düzeyde fazlası hayvana zarar vermez.' });
    });
    return out;
  }

  // Maliyeti belirleyen (sınırında çalışan) kısıtlar: "neden bu karışım?"
  function limiting(best, feeds, req, opts, tot) {
    var out = [], near = function (a, b) { return Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 0.005); };
    out.push({ tur: 'enerji', metin: 'Enerji ihtiyacı tam karşılanıyor (%100); daha fazlası para israfı olurdu.' });
    if (near(tot.mp, req.mp)) out.push({ tur: 'protein', metin: 'Kullanılabilir protein tam ihtiyaç kadar: protein kaynakları pahalı olduğu için fazlası konmadı.' });
    else if (near(tot.mp, req.mp * (1 + tolOf(opts)))) out.push({ tur: 'proteinUst', metin: 'Protein izin verilen en üst düzeyde (%' + Math.round(100 + tolOf(opts) * 100) + '): proteini yüksek ucuz yemler bu yüzden daha fazla kullanılamadı.' });
    if (Math.abs(tot.rdp - tot.rdpIht) <= Math.max(1, tot.rdpIht * 0.005)) out.push({ tur: 'rdp', metin: 'İşkembe mikroplarının protein (azot) ihtiyacı tam karşılanıyor; daha azı sindirimi bozardı.' });
    if (near(tot.ca, req.ca)) out.push({ tur: 'ca', metin: 'Kalsiyum tam ihtiyaç kadar.' });
    if (near(tot.p, req.p)) out.push({ tur: 'p', metin: 'Fosfor tam ihtiyaç kadar.' });
    if (near(tot.kaba / tot.km, opts.kabaMin)) out.push({ tur: 'kaba', metin: 'Kaba yem en alt sınırda (%' + Math.round(opts.kabaMin * 100) + '): kaba yem bu rasyonda enerjiye göre pahalı, sağlık için gereken kadar konuldu.' });
    if (near(tot.tahil / tot.km, LIMITS.tahilMax)) out.push({ tur: 'tahil', metin: 'Tahıl en üst sınırda (%' + Math.round(LIMITS.tahilMax * 100) + ').' });
    if (near(tot.nisasta / tot.km, limitOf(opts, 'nisastaMax'))) out.push({ tur: 'nisasta', metin: 'Nişasta en üst sınırda (%' + Math.round(limitOf(opts, 'nisastaMax') * 100) + '): daha fazla tahıl asidoz riski taşır.' });
    if (near(tot.ndf / tot.km, limitOf(opts, 'ndfMin'))) out.push({ tur: 'ndf', metin: 'Lif (NDF) en alt sınırda (%' + Math.round(limitOf(opts, 'ndfMin') * 100) + '): işkembe sağlığı için gereken kadar.' });
    if (near(tot.yag / tot.km, limitOf(opts, 'yagMax'))) out.push({ tur: 'yag', metin: 'Yağ en üst sınırda (%' + Math.round(limitOf(opts, 'yagMax') * 100) + '): fazlası işkembede lif sindirimini bozar.' });
    if (best.dmi >= best.cap * 0.995) out.push({ tur: 'istah', metin: 'Hayvan iştahının sınırında yiyor; hedef artış bu yemlerle zorlanıyor.' });
    feeds.forEach(function (f) {
      var x = (best.x[f.id] || 0) / (f.km / 100), b = bounds(f);
      if (b.zorunlu && near(x, b.minKg)) out.push({ tur: 'sinir', id: f.id, metin: f.ad + ': ' + (b.kullaniciMin ? 'verdiğiniz en az miktarda' : '"kesin kullan" dediğiniz için en az miktarda; daha fazlası maliyeti artırırdı') + '.' });
      else if (f.stokSinir && near(x, f.maxKg)) out.push({ tur: 'stok', id: f.id, metin: f.ad + ': stok sınırında. Elinizdeki ' + String(f.stokTon).replace('.', ',') + ' ton ' + Math.round(f.stokGun) + ' gün yetsin diye hayvan başı günde en fazla ' + (Math.round(f.maxKg * 100) / 100).toString().replace('.', ',') + ' kg; stok olsa daha çok kullanılırdı.' });
      else if (f.maxKg > 0 && near(x, f.maxKg)) out.push({ tur: 'sinir', id: f.id, metin: f.ad + ': verdiğiniz en fazla miktarda; sınır olmasa daha çok kullanılırdı.' });
      else if (near(best.x[f.id] || 0, f.max * best.dmi)) out.push({ tur: 'sinir', id: f.id, metin: f.ad + ': sağlık için izin verilen en yüksek oranda (%' + Math.round(f.max * 100) + ').' });
    });
    return out;
  }

  // Farklı günlük artış hedeflerinde maliyet: en ekonomik hedef.
  // sabitGider: yem dışı günlük gider (TL/baş: işçilik, barınak, faiz); hızlı büyüme bu gideri azaltır.
  function economics(solver, opts) {
    var rows = [], fixed = opts.sabitGider > 0 ? opts.sabitGider : 0;
    for (var adg = 0.6; adg <= 2.00001; adg += 0.1) {
      var a = Math.round(adg * 10) / 10;
      var r = compute(solver, Object.assign({}, opts, { adg: a }));
      if (!r.ok) continue;
      var g = r.sonuc.gunlukMaliyet, gun = (opts.finalBw - opts.bw) / a;
      var row = { adg: a, yemGunluk: g, yemKg: g / a, toplamKg: (g + fixed) / a, gun: gun };
      if (opts.satis > 0) {
        // Kâr, yem ve yem dışı gider düşüldükten sonra (hayvanın alış bedeli hariç).
        row.karGun = a * opts.satis - g - fixed;
        row.karDonem = (opts.finalBw - opts.bw) * opts.satis - gun * (g + fixed);
      }
      rows.push(row);
    }
    var best = null;
    rows.forEach(function (x) { if (!best || x.toplamKg < best.toplamKg - 1e-9) best = x; });
    return { satirlar: rows, enIyi: best, sabitGider: fixed, satis: opts.satis > 0 ? opts.satis : 0 };
  }

  // Kesime kadar besi planı: besi, her biri en fazla 100 kg'lık 1–5 döneme bölünür. Her dönemin
  // rasyonu dönemin orta ağırlığına göre en ucuz kurulur ve dönem boyunca aynı oranlarla verilir;
  // miktar hayvan büyüdükçe artırılır (kuru madde tüketimi metabolik ağırlıkla, ağırlığın 0,75.
  // kuvvetiyle orantılı). Gün, yem ve maliyet dönemlerden toplanır.
  function period(solver, opts) {
    var rows = [], toplamYem = {}, adlar = {}, gun = 0, maliyet = 0, eksik = null;
    var fixed = opts.sabitGider > 0 ? opts.sabitGider : 0;
    var span = opts.finalBw - opts.bw, n = Math.max(1, Math.min(5, Math.ceil(span / 100 - 1e-9))), adim = span / n;
    for (var i = 0; i < n; i++) {
      var w = opts.bw + i * adim, w2 = i === n - 1 ? opts.finalBw : w + adim, orta = (w + w2) / 2, d = (w2 - w) / opts.adg;
      var r = compute(solver, Object.assign({}, opts, { bw: orta }));
      if (!r.ok) { eksik = { bw: w, mesaj: r.mesaj }; break; }
      var s = r.sonuc;
      s.satirlar.forEach(function (l) { toplamYem[l.id] = (toplamYem[l.id] || 0) + l.yas * d; adlar[l.id] = { ad: l.ad, grup: l.grup }; });
      rows.push({ no: i + 1, den: w, e: w2, orta: orta, gun: d, yemKgGun: s.toplam.yas, tlGun: s.gunlukMaliyet, tl: s.gunlukMaliyet * d,
        basKat: Math.pow(w / orta, 0.75), sonKat: Math.pow(w2 / orta, 0.75),
        satirlar: s.satirlar.map(function (l) { return { id: l.id, ad: l.ad, grup: l.grup, yas: l.yas, maliyet: l.maliyet }; }),
        recete: concentrateRecipe(s) });
      gun += d; maliyet += s.gunlukMaliyet * d;
    }
    var yemler = Object.keys(toplamYem).map(function (id) {
      var f = opts.feeds.filter(function (x) { return x.id === id; })[0];
      return { id: id, ad: adlar[id].ad, grup: adlar[id].grup, kg: toplamYem[id], stokTon: f && f.stokTon > 0 ? f.stokTon : null };
    }).sort(function (a, b) { return b.kg - a.kg; });
    var out = { dilimler: rows, gun: gun, yemMaliyeti: maliyet, sabitMaliyet: fixed * gun, yemler: yemler, eksik: eksik };
    if (opts.satis > 0 && !eksik) {
      out.gelir = opts.finalBw * opts.satis;
      out.alis = opts.alis > 0 ? opts.bw * opts.alis : null;
      out.kar = out.gelir - (out.alis || 0) - maliyet - fixed * gun;
      // Alış bedeli verilmediyse kâr, besi süresince eklenen kilonun değerinden hesaplanır.
      if (out.alis === null) out.kar = (opts.finalBw - opts.bw) * opts.satis - maliyet - fixed * gun;
    }
    return out;
  }

  // Alım rehberi: her yem için "değer fiyatı". Fiyat ikiye bölme ile aranır; her denemede rasyon,
  // hesaplanan enerji yoğunluğunun ±0,15 Mcal çevresinde yeniden en ucuza kurulur (yaklaşık ama hızlı).
  // - Seçilmemiş yem: bu fiyatın altında bulunursa rasyona girer ve masrafı düşürür.
  // - Seçili, en az miktarın üstünde kullanılan yem: fiyatı bunu geçerse en az miktara iner.
  // - Seçili, en az miktarda kullanılan yem: fiyatı bunun altına inerse daha çok kullanılır.
  function priceGuide(solver, opts, adaylar) {
    var r = compute(solver, opts);
    if (!r.ok) return null;
    // Tolerans üst sınırları burada yalnızca eşitlik bozucu: aksi halde fazlalığı azaltan her yem
    // "her fiyata değer" görünürdü. Rehber gerçek yem maliyetine göre karar verir.
    var me = r.sonuc.me, req = r.req, relax = { ustGevsek: true };
    // Bir yemin fiyatı değişince bütün yemlerin kullanımı (yaş kg/baş/gün).
    var usageAll = function (feeds, id, price) {
      var fs = feeds.map(function (f) { return f.id === id ? Object.assign({}, f, { fiyat: price }) : f; });
      var sol = null;
      for (var d = -0.15; d <= 0.15001; d += 0.03) {
        var t = solveAt(solver, fs, req, Math.round((me + d) * 1000) / 1000, opts, relax);
        if (t && (!sol || t.cost < sol.cost - 1e-9)) sol = t;
      }
      if (!sol) return null;
      var u = {};
      fs.forEach(function (f) { u[f.id] = (sol.x[f.id] || 0) / (f.km / 100); });
      return u;
    };
    var usage = function (feeds, id, price) { var u = usageAll(feeds, id, price); return u ? u[id] : null; };
    var adOf = {};
    opts.feeds.forEach(function (f) { adOf[f.id] = f.ad; });
    var stepOf = function (f) { return (f.grup === 'mineral' || f.grup === 'npn') ? 0.002 : 0.05; };
    // Fiyat dayanıklılığı: rasyonun (bütün yemlerin miktarının) değişmediği fiyat aralığı ve
    // aralığın üstünde azalan yemin yerine artan yemler.
    var ayni = function (u, base) {
      return !!u && opts.feeds.every(function (f) { return Math.abs(u[f.id] - base[f.id]) <= Math.max(stepOf(f), base[f.id] * 0.05); });
    };
    var dayaniklilik = function (f, base, pDus) {
      var ust = f.fiyat * 3 + 1, alt = 0, i, lo, hi;
      var same = function (p) { return ayni(usageAll(opts.feeds, f.id, p), base); };
      var ustSinirsiz = same(ust), altSinirsiz = same(0);
      if (!ustSinirsiz) { lo = f.fiyat; hi = ust; for (i = 0; i < 12; i++) { var m = (lo + hi) / 2; if (same(m)) lo = m; else hi = m; } ust = lo; }
      if (!altSinirsiz) { lo = 0; hi = f.fiyat; for (i = 0; i < 12; i++) { var m2 = (lo + hi) / 2; if (same(m2)) hi = m2; else lo = m2; } alt = hi; }
      var yerine = [];
      if (!ustSinirsiz) {
        // Aralığın biraz üstünde; yem belirgin azalmadıysa en az miktara indiği fiyatta.
        var yeni = null;
        [ust * 1.03 + 0.01, (pDus > ust ? pDus : ust * 1.5) * 1.03 + 0.01].some(function (p) {
          var y = usageAll(opts.feeds, f.id, p);
          if (y && y[f.id] < base[f.id] - stepOf(f)) { yeni = y; return true; }
          return false;
        });
        if (yeni) {
          opts.feeds.forEach(function (g) {
            var fark = yeni[g.id] - base[g.id];
            if (g.id !== f.id && g.grup !== 'mineral' && fark > stepOf(g)) yerine.push({ id: g.id, ad: g.ad, kg: fark });
          });
        }
        yerine = yerine.sort(function (a, b) { return b.kg - a.kg; }).slice(0, 2);
      }
      return { alt: altSinirsiz ? null : alt, ust: ustSinirsiz ? null : ust, yerine: yerine };
    };
    var base0 = usageAll(opts.feeds, null, 0);
    // pred(p) fiyat arttıkça doğrudan yanlışa döner; doğru olduğu en yüksek fiyatı bul.
    var lastTrue = function (lo, hi, pred) {
      for (var i = 0; i < 18; i++) { var mid = (lo + hi) / 2; if (pred(mid)) lo = mid; else hi = mid; }
      return lo;
    };
    var out = [];
    opts.feeds.forEach(function (f) {
      var b = bounds(f), u0 = usage(opts.feeds, f.id, f.fiyat);
      if (u0 === null) return;
      var step = (f.grup === 'mineral' || f.grup === 'npn') ? 0.002 : 0.05;
      var hi = f.maxKg > 0 ? f.maxKg : Infinity;
      if (u0 > b.minKg + step) {
        var top = f.fiyat * 5 + 1;
        var dynOf = function (pDus) { return base0 && f.fiyat > 0 ? dayaniklilik(f, base0, pDus) : null; };
        if (usage(opts.feeds, f.id, top) > b.minKg + step) { out.push({ id: f.id, ad: f.ad, tur: 'hep', fiyat: f.fiyat, kg: u0, aralik: dynOf() }); return; }
        var pUp = lastTrue(f.fiyat, top, function (p) { return usage(opts.feeds, f.id, p) > b.minKg + step; });
        out.push({ id: f.id, ad: f.ad, tur: 'ust', fiyat: f.fiyat, deger: pUp, kg: u0, aralik: dynOf(pUp) });
      } else {
        if (!(usage(opts.feeds, f.id, 0) > b.minKg + step)) { out.push({ id: f.id, ad: f.ad, tur: 'enaz', fiyat: f.fiyat, kg: u0, zorunlu: b.zorunlu }); return; }
        var pDown = lastTrue(0, f.fiyat, function (p) { return usage(opts.feeds, f.id, p) > b.minKg + step; });
        out.push({ id: f.id, ad: f.ad, tur: 'alt', fiyat: f.fiyat, deger: pDown, kg: u0, zorunlu: b.zorunlu });
      }
      if (hi < Infinity && u0 >= hi - step) out[out.length - 1].sinirda = true;
    });
    (adaylar || []).forEach(function (c) {
      // Seçilmemiş yem, zorunlu tutulmadan eklenir: girip girmeyeceğine fiyat karar verir.
      var cand = Object.assign({}, c, { minKg: 0, zorunlu: false });
      var feeds = opts.feeds.concat([cand]);
      var enters = function (p) { var u = usage(feeds, c.id, p); return u !== null && u > ((c.grup === 'mineral' || c.grup === 'npn') ? 0.002 : 0.05); };
      if (!enters(0)) { out.push({ id: c.id, ad: c.ad, tur: 'girmez', fiyat: c.fiyat, aday: true }); return; }
      var pE = lastTrue(0, Math.max(c.fiyat, 1) * 5, enters);
      out.push({ id: c.id, ad: c.ad, tur: 'gir', fiyat: c.fiyat, deger: pE, aday: true });
    });
    return out;
  }

  // Protein ayrıntısı (bir hayvan, günde, g): NRC 2000 düzey 1.
  // Mikrobiyal protein (MCP), TDN'nin izin verdiği kadar ama RDP'den fazla olamaz.
  function proteinDetail(sonuc) {
    var t = sonuc.toplam, r = sonuc.ihtiyac;
    var mcp = Math.min(t.rdp, t.rdpIht);
    var mpMikrop = 0.64 * mcp, mpRup = 0.8 * t.rup;
    return {
      hp: t.hp, hpYuzde: t.hp / t.km / 10,
      rdp: t.rdp, rdpIht: t.rdpIht, rdpDenge: t.rdp - t.rdpIht,
      rup: t.rup, rupSindirilen: mpRup,
      mcp: mcp, mcpUst: t.rdpIht,
      mpMikrop: mpMikrop, mpRup: mpRup, mp: mpMikrop + mpRup, mpIht: r.mp,
      yemler: sonuc.satirlar.filter(function (l) { return l.hp > 0.5; })
        .map(function (l) { return { ad: l.ad, hp: l.hp, rdp: l.rdp, rup: l.rup }; })
        .sort(function (a, b) { return b.hp - a.hp; })
    };
  }

  // 1 ton kesif karma yem reçetesi: kaba yemler dışındaki her şey (tahıl, küspe, yan ürün,
  // hazır yem, mineral, katkı) oranlanır. Kaba yem hayvana ayrıca verilir.
  function concentrateRecipe(sonuc) {
    var kesif = sonuc.satirlar.filter(function (l) { return l.grup !== 'kaba'; });
    var kaba = sonuc.satirlar.filter(function (l) { return l.grup === 'kaba'; });
    var top = kesif.reduce(function (a, l) { return a + l.yas; }, 0);
    if (top <= 0) return null;
    return {
      tonBasina: kesif.map(function (l) { return { id: l.id, ad: l.ad, grup: l.grup, kg: l.yas / top * 1000 }; }),
      karmaKgGun: top,
      kaba: kaba.map(function (l) { return { id: l.id, ad: l.ad, kg: l.yas }; }),
      tonMaliyet: kesif.reduce(function (a, l) { return a + l.maliyet; }, 0) / top * 1000
    };
  }

  // Çiftçinin şu an verdiği rasyonu değerlendirir. amounts: { yemId: yaş kg/baş/gün }.
  // Hedef artışa göre karşılama, bu rasyonla beklenen artış (enerjiye ve proteine göre)
  // ve aynı yemlerle hesaplanan en ucuz rasyonla karşılaştırma döner.
  function evaluate(solver, opts, amounts) {
    var feeds = opts.feeds.filter(function (f) { return amounts[f.id] > 0; });
    if (!feeds.length) return { ok: false, mesaj: 'Verdiğiniz yemlerin günlük miktarlarını yazın.' };
    var x = {}, km = 0, me = 0, rdp = 0, rdpIht = 0, rup = 0;
    feeds.forEach(function (f) {
      var dm = amounts[f.id] * f.km / 100, pc = protCoef(f);
      x[f.id] = dm; km += dm; me += dm * f.me; rdp += dm * pc.rdp; rdpIht += dm * pc.rdpIht; rup += dm * pc.rup;
    });
    var dietMe = me / km, ne = neFromMe(dietMe);
    var req = requirements(opts.bw, opts.adg, opts.finalBw, opts);
    var cap = intakeCapacity(opts.bw, ne.nem, req.calf, req.dmiKat);
    var sonuc = describe({ x: x, me: dietMe, dmi: km, cap: cap }, feeds, req, opts);
    delete sonuc.sinirlayanlar;
    // Hayvan iştahından fazlasını yiyemez: beklenen artış yenebilecek kısım üzerinden hesaplanır
    // (aynı karışımdan iştah kadar).
    var yenen = Math.min(km, cap), oran = yenen / km;
    // Enerjiye göre beklenen artış: yaşama payından artan kuru maddenin net enerjisi.
    var dmM = ne.nem > 0 ? req.nem / ne.nem : Infinity;
    var adgE = yenen > dmM ? adgFromRE(opts.bw, opts.finalBw, (yenen - dmM) * ne.neg) : 0;
    // Proteine göre: mikrobiyal protein RDP kadar yapılabilir (TDN'nin izin verdiğinden fazla değil).
    var mp = (0.64 * Math.min(rdp, rdpIht) + 0.8 * rup) * oran;
    var lo = 0, hi = 3;
    if (requirements(opts.bw, 0.001, opts.finalBw, opts).mp > mp) hi = 0;
    for (var i = 0; i < 30 && hi > 0; i++) {
      var mid = (lo + hi) / 2;
      if (requirements(opts.bw, mid, opts.finalBw, opts).mp <= mp) lo = mid; else hi = mid;
    }
    var adgP = hi > 0 ? lo : 0;
    var beklenen = Math.min(adgE, adgP);
    var notlar = [];
    if (km > cap * 1.02) notlar.push('Hayvan bu kadar yiyemez: iştah sınırı yaklaşık ' + cap.toFixed(1).replace('.', ',') + ' kg kuru madde, rasyon ' + km.toFixed(1).replace('.', ',') + ' kg. Beklenen artış yiyebileceği kadar (%' + Math.round(oran * 100) + ') üzerinden hesaplandı; fazlası yemlikte kalır, boşa gider.');
    if (adgP + 0.1 < adgE) notlar.push('Artışı protein sınırlıyor: enerji ' + adgE.toFixed(2).replace('.', ',') + ' kg/gün artışa yeter ama protein ' + adgP.toFixed(2).replace('.', ',') + ' kg/gün\'e yetiyor. Biraz küspe eklemek artışı yükseltir.');
    else if (adgE + 0.1 < adgP) notlar.push('Artışı enerji sınırlıyor: protein ' + adgP.toFixed(2).replace('.', ',') + ' kg/gün artışa yeter ama enerji ' + adgE.toFixed(2).replace('.', ',') + ' kg/gün\'e yetiyor; protein fazlası boşa gidiyor. Küspeyi azaltıp tahılı artırmak daha verimli olur.');
    if (rdp < rdpIht * 0.98) notlar.push('İşkembe mikroplarına yeterli protein (azot) gitmiyor (%' + Math.round(rdp / rdpIht * 100) + '): sindirim ve artış düşer. Ayçiçeği, kanola küspesi ya da az miktarda üre ekleyin.');
    if (sonuc.toplam.ca < req.ca) notlar.push('Kalsiyum yetmiyor: mermer tozu ekleyin.');
    if (sonuc.toplam.p < req.p) notlar.push('Fosfor yetmiyor: dikalsiyum fosfat ya da kepek ekleyin.');
    if (sonuc.toplam.ca < LIMITS.caPmin * sonuc.toplam.p) notlar.push('Kalsiyum/fosfor oranı ' + (sonuc.toplam.ca / sonuc.toplam.p).toFixed(1).replace('.', ',') + ': en az 1,5 olmalı (idrar taşı riski). Mermer tozu ekleyin.');
    if (sonuc.toplam.kaba / km < opts.kabaMin) notlar.push('Kaba yem oranı %' + Math.round(sonuc.toplam.kaba / km * 100) + ': en az %' + Math.round(opts.kabaMin * 100) + ' olmalı (asidoz riski).');
    // Aynı yemlerle, aynı hedefe en ucuz rasyon.
    var en = compute(solver, opts);
    return {
      ok: true, sonuc: sonuc, ihtiyac: req, istah: cap, yenenOran: oran,
      beklenen: { enerji: adgE, protein: adgP, artis: beklenen, gun: beklenen > 0 ? (opts.finalBw - opts.bw) / beklenen : null },
      notlar: notlar,
      karsilastirma: en.ok ? { gunluk: en.sonuc.gunlukMaliyet, fark: sonuc.gunlukMaliyet - en.sonuc.gunlukMaliyet } : null
    };
  }

  root.BesiModel = { IRKLAR: IRKLAR, hayvanKat: hayvanKat, protCoef: protCoef, tdnOf: tdnOf, limitOf: limitOf, tolOf: tolOf, tolMinOf: tolMinOf, FEEDS: FEEDS, DEFAULT_MIN: DEFAULT_MIN, bounds: bounds, KATKILAR: KATKILAR, applyLabel: applyLabel, katkiGram: katkiGram, LIMITS: LIMITS, requirements: requirements, neFromMe: neFromMe, intakeCapacity: intakeCapacity, compute: compute, maxAdg: maxAdg, evaluate: evaluate, adgFromRE: adgFromRE, economics: economics, period: period, priceGuide: priceGuide, concentrateRecipe: concentrateRecipe, proteinDetail: proteinDetail };
})(typeof window !== 'undefined' ? window : globalThis);
