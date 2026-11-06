// Ekran: girişleri okur, BesiModel ile hesaplar, sonucu gösterir.
(function () {
  'use strict';
  var M = window.BesiModel;
  // Web sürümü (yayınlanan sayfa): yazdırma ve sistem paylaşımı yok; WhatsApp bağlantısı ve kopyalama var.
  var WEB = !!window.BESI_WEB;
  // Windows uygulaması: PDF kaydetme ve WhatsApp var; "paylaş" yerine metni panoya kopyalar.
  var DESKTOP = !!window.BESI_DESKTOP;
  var KEY = 'besiRasyon.v1';
  var GROUPS = [
    ['kaba', 'Kaba yemler'], ['tahil', 'Tahıllar'], ['kuspe', 'Küspeler'],
    ['yan', 'Yan ürünler'], ['hazir', 'Hazır yem'], ['npn', 'Üre (protein olmayan azot)'], ['mineral', 'Mineraller']
  ];
  var DEFAULTS = {
    bw: 350, adg: 1.3, finalBw: 600, heads: 10, kabaMin: 20, sabitGider: 0,
    irk: 'bilinmiyor', anaIrk: '', cinsiyet: 'tosun', sicaklik: 20, sicakStres: 'yok', geceSerin: true,
    tolerans: 5, tolMineral: 5, mineralSiki: false, satis: '', alis: '',
    nisastaMax: 40, ndfMin: 20, yagMax: 6,
    analiz: {},                       // yem analizi: { id: { km, hp, me, ndf, ca, p } } (kuru maddede)
    ozelYemler: [],                   // kullanıcının eklediği yemler
    mevcut: {},                       // şu an verilen rasyon: { id: yaş kg/baş/gün }
    ayarSurum: 2,
    secili: ['arpa', 'kepek', 'aycicegi', 'silaj', 'bsaman', 'mermer', 'dcp'],
    fiyat: {},
    etiket: {},                       // hazır yem etiketleri: { id: { hp, me } }
    sinir: {},                        // kullanıcı sınırları, yaş kg/baş/gün: { id: { min, max } }
    zorunlu: [],                      // "kesin kullan" işaretli yemler
    stok: {},                         // elinizdeki stok, ton: { id: ton }
    stokGun: '',                      // stok kaç gün yetsin (boş: kesime kadar)
    katki: { tuz: { on: true }, premiks: { on: true } }  // { id: { on, doz, fiyat } }
  };

  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
    return withDefaults(s);
  }
  // Eksik ayarları varsayılanla doldurur (eski sürümlerde kaydedilmiş rasyonlar için de).
  function withDefaults(s) {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) { out[k] = s[k] !== undefined ? s[k] : JSON.parse(JSON.stringify(DEFAULTS[k])); });
    // 1.9: "Kalsiyum ve fosforu da sınırda tut" varsayılanı kapandı; 1.8'den kalan açık ayar bir kez kapatılır.
    if ((s.ayarSurum || 1) < 2) { out.mineralSiki = false; out.ayarSurum = 2; }
    return out;
  }
  function save(st) {
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* özel modda saklanamaz */ }
  }

  var nf = function (d) { return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var f0 = nf(0), f1 = nf(1), f2 = nf(2);
  var $ = function (id) { return document.getElementById(id); };
  var st = load();

  // Yemlerin sağlık için en fazla oranı (kendi eklenen yemler için gruba göre).
  var MAX_BY_GROUP = { kaba: 0.6, tahil: 0.6, kuspe: 0.25, yan: 0.3, hazir: 0.8, npn: 0.01, mineral: 0.02 };
  // Değeri girilmemiş kendi yemleri için gruba göre tipik nişasta ve yağ (% KM).
  var GRUP_NY = { kaba: [3, 2.5], tahil: [60, 2.5], kuspe: [2, 2.5], yan: [10, 3], hazir: [35, 3.5], npn: [0, 0], mineral: [0, 0] };
  // Değeri girilmemiş kendi yemleri için işkembede parçalanan protein payı (NRC 2001 grup ortalamaları).
  var GRUP_RDP = { kaba: 0.75, tahil: 0.65, kuspe: 0.65, yan: 0.6, hazir: 0.65, npn: 1.0, mineral: 0 };
  // Tablo yemleri (analiz girilmişse o değerlerle) ve kullanıcının eklediği yemler.
  function allFeeds() {
    var base = M.FEEDS.map(function (f) {
      var a = st.analiz[f.id];
      if (!a || f.grup === 'hazir') return f;
      // Yalnız kuru madde girilmişse (silaj ölçümü) "ölçülmüş kuru madde" olarak işaretlenir.
      var sadeceKm = Object.keys(a).length === 1 && a.km !== undefined;
      return Object.assign({}, f, a, sadeceKm ? { kmOlcum: true } : { analizli: true });
    });
    return base.concat((st.ozelYemler || []).map(function (f) {
      var d = GRUP_NY[f.grup] || [5, 3];
      return Object.assign({ max: MAX_BY_GROUP[f.grup] || 0.3, nisasta: d[0], yag: d[1], rdp: GRUP_RDP[f.grup] !== undefined ? GRUP_RDP[f.grup] : 0.65 }, f, { ozel: true });
    }));
  }

  function renderFeeds() {
    var box = $('feeds');
    box.innerHTML = '';
    GROUPS.forEach(function (g) {
      var t = document.createElement('div');
      t.className = 'grouptitle';
      t.textContent = g[1];
      box.appendChild(t);
      allFeeds().filter(function (f) { return f.grup === g[0]; }).forEach(function (f) {
        var on = st.secili.indexOf(f.id) >= 0;
        var row = document.createElement('label');
        row.className = 'feed' + (on ? '' : ' off');
        var price = st.fiyat[f.id] !== undefined ? st.fiyat[f.id] : f.fiyat;
        var info = '<small>%' + f1.format(f.hp * f.km / 100) + ' protein · %' + f1.format(f.km) + ' kuru madde' +
          (f.ozel ? ' · <b>sizin yeminiz</b>' : f.analizli ? ' · <b>analiz değeri</b>' : f.kmOlcum ? ' · <b>ölçülen kuru madde</b>' : '') + '</small>';
        var etiket = '';
        // Yaş yemlerde (silaj, yaş posa) kuru madde çok değişir: satırda hızlı giriş.
        if (f.km < 50 && f.grup !== 'mineral') {
          etiket = '<span class="etiket"><span><em>Kuru madde (%)</em><input type="number" inputmode="decimal" min="10" max="60" step="0.5" data-kmq="' + f.id + '" value="' + f1.format(f.km).replace(',', '.') + '" aria-label="' + esc(f.ad) + ' kuru madde yüzde"></span>' +
            '<span class="kmolc"><button type="button" class="link" data-kmrehber="' + f.id + '">Nasıl ölçülür?</button></span></span>';
        }
        if (f.grup === 'hazir' && !f.ozel) {
          var et = st.etiket[f.id] || {};
          info = '<small>Torba etiketindeki değerleri yazın</small>';
          etiket = '<span class="etiket">' +
            '<span><em>Protein (%)</em><input type="number" inputmode="decimal" min="8" max="40" step="0.5" data-ethp="' + f.id + '" value="' + (et.hp || f.etiketHp) + '" aria-label="' + f.ad + ' ham protein yüzde"></span>' +
            '<span><em>Enerji (kcal/kg)</em><input type="number" inputmode="numeric" min="1800" max="3200" step="50" data-etme="' + f.id + '" value="' + (et.me || f.etiketMe) + '" aria-label="' + f.ad + ' enerji kcal"></span>' +
            '</span>';
        }
        var sn = st.sinir[f.id] || {};
        var defMin = (f.grup === 'mineral' || f.grup === 'npn') ? M.DEFAULT_MIN.mineral : M.DEFAULT_MIN.diger;
        var zor = (st.zorunlu || []).indexOf(f.id) >= 0;
        var sinir = '<span class="sinir">' +
          '<span class="zor"><input type="checkbox" data-zor="' + f.id + '"' + (zor ? ' checked' : '') + ' aria-label="' + esc(f.ad) + ' kesin kullan"><em>Kesin kullan</em></span>' +
          '<span><em>En az (kg/gün)</em><input type="number" inputmode="decimal" min="0" step="0.05" data-smin="' + f.id + '" value="' + (sn.min > 0 ? sn.min : '') + '" placeholder="' + f2.format(defMin) + '" aria-label="' + f.ad + ' en az kg"></span>' +
          '<span><em>En fazla (kg/gün)</em><input type="number" inputmode="decimal" min="0" step="0.05" data-smax="' + f.id + '" value="' + (sn.max > 0 ? sn.max : '') + '" placeholder="sınırsız" aria-label="' + f.ad + ' en fazla kg"></span>' +
          '<span><em>Stok (ton)</em><input type="number" inputmode="decimal" min="0" step="0.1" data-stok="' + f.id + '" value="' + (st.stok[f.id] > 0 ? st.stok[f.id] : '') + '" placeholder="sınırsız" aria-label="' + f.ad + ' stok ton"></span>' +
          '</span>';
        row.innerHTML =
          '<input type="checkbox" data-id="' + f.id + '"' + (on ? ' checked' : '') + '>' +
          '<span class="name">' + esc(f.ad) + info + '</span>' +
          '<input type="number" inputmode="decimal" min="0" step="0.5" data-price="' + f.id + '" value="' + price + '" aria-label="' + f.ad + ' TL/kg">' + etiket + sinir;
        box.appendChild(row);
      });
    });
  }

  $('feeds').addEventListener('click', function (e) {
    // Satır bir <label>: alt kısımdaki yazılara dokunmak yemin seçimini değiştirmesin.
    var alt = e.target.closest('.sinir, .etiket');
    if (alt && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      var zor = e.target.closest('.zor');
      if (zor) {
        var cb = zor.querySelector('input');
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    var id = e.target.getAttribute('data-kmrehber');
    if (!id) return;
    e.preventDefault();
    $('kmRehber').open = true;
    $('kmYem').value = id;
    $('kmRehber').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---- Mikrodalga ile kuru madde ölçümü ----
  function renderKmRehber() {
    var sel = $('kmYem'), cur = sel.value;
    sel.innerHTML = allFeeds().filter(function (f) { return f.km < 50 && f.grup !== 'mineral'; }).map(function (f) {
      return '<option value="' + f.id + '">' + esc(f.ad) + ' (şimdi %' + f1.format(f.km) + ')</option>';
    }).join('');
    if (cur && sel.querySelector('option[value="' + cur + '"]')) sel.value = cur;
  }
  function kmHesap() {
    var ilk = parseFloat(String($('kmIlk').value).replace(',', '.')), son = parseFloat(String($('kmSon').value).replace(',', '.'));
    if (!(ilk > 0 && son > 0)) { $('kmSonuc').textContent = ''; $('kmUygula').disabled = true; return null; }
    if (son > ilk) { $('kmSonuc').textContent = 'Kuru ağırlık, yaş ağırlıktan büyük olamaz.'; $('kmUygula').disabled = true; return null; }
    var km = son / ilk * 100;
    $('kmSonuc').innerHTML = 'Kuru madde: <b>%' + f1.format(km) + '</b>' + (km < 18 || km > 55 ? ' (olağan dışı; tartımları kontrol edin)' : '');
    $('kmUygula').disabled = !(km >= 10 && km <= 60);
    return km;
  }
  ['kmIlk', 'kmSon'].forEach(function (id) { $(id).addEventListener('input', kmHesap); });
  $('kmUygula').addEventListener('click', function () {
    var km = kmHesap(), id = $('kmYem').value;
    if (!km || !id) return;
    km = Math.round(km * 10) / 10;
    var oz = (st.ozelYemler || []).filter(function (x) { return x.id === id; })[0];
    if (oz) oz.km = km; else st.analiz[id] = Object.assign({}, st.analiz[id], { km: km });
    save(st); renderFeeds(); renderEval(); renderAnaliz(); renderKmRehber();
    $('kmSonuc').innerHTML = 'Kaydedildi: kuru madde <b>%' + f1.format(km) + '</b>. Hesaplar bu değerle yapılacak.';
  });

  $('feeds').addEventListener('change', function (e) {
      var id = e.target.getAttribute('data-id');
      if (id) {
        st.secili = st.secili.filter(function (x) { return x !== id; });
        if (e.target.checked) st.secili.push(id);
        e.target.closest('.feed').classList.toggle('off', !e.target.checked);
        renderEval();
      }
      var pid = e.target.getAttribute('data-price');
      if (pid) st.fiyat[pid] = parseFloat(e.target.value);
      var kq = e.target.getAttribute('data-kmq');
      if (kq) {
        var kv = parseFloat(String(e.target.value).replace(',', '.'));
        var baseF = M.FEEDS.filter(function (x) { return x.id === kq; })[0];
        var oz = (st.ozelYemler || []).filter(function (x) { return x.id === kq; })[0];
        if (kv >= 10 && kv <= 60) {
          if (oz) oz.km = kv;
          else {
            st.analiz[kq] = Object.assign({}, st.analiz[kq], { km: kv });
            // Tablo değerine geri yazıldıysa ve başka analiz yoksa kaydı sil.
            if (baseF && Math.abs(kv - baseF.km) < 1e-9 && Object.keys(st.analiz[kq]).length === 1) delete st.analiz[kq];
          }
          save(st); renderFeeds(); renderEval(); renderAnaliz();
        }
        return;
      }
      var zid = e.target.getAttribute('data-zor');
      if (zid) {
        st.zorunlu = (st.zorunlu || []).filter(function (x) { return x !== zid; });
        if (e.target.checked) st.zorunlu.push(zid);
        save(st);
        return;
      }
      var sk = e.target.getAttribute('data-stok');
      if (sk) {
        var tv = parseFloat(String(e.target.value).replace(',', '.'));
        if (tv > 0) st.stok[sk] = tv; else delete st.stok[sk];
      }
      var smn = e.target.getAttribute('data-smin'), smx = e.target.getAttribute('data-smax');
      if (smn || smx) {
        var sid = smn || smx, v = parseFloat(String(e.target.value).replace(',', '.'));
        st.sinir[sid] = st.sinir[sid] || {};
        st.sinir[sid][smn ? 'min' : 'max'] = v > 0 ? v : null;
      }
      var eh = e.target.getAttribute('data-ethp'), em = e.target.getAttribute('data-etme');
      if (eh || em) {
        var k = eh || em;
        st.etiket[k] = st.etiket[k] || {};
        st.etiket[k][eh ? 'hp' : 'me'] = parseFloat(e.target.value);
      }
      save(st);
  });

  function katkiState(k) {
    var x = st.katki[k.id] || {};
    return { on: !!x.on, doz: x.doz !== undefined ? x.doz : k.doz, fiyat: x.fiyat !== undefined ? x.fiyat : k.fiyat };
  }

  function renderKatki() {
    var box = $('katkilar');
    box.innerHTML = '';
    M.KATKILAR.forEach(function (k) {
      var x = katkiState(k);
      var row = document.createElement('div');
      row.className = 'katki' + (x.on ? '' : ' off');
      row.innerHTML =
        '<label class="kname"><input type="checkbox" data-kid="' + k.id + '"' + (x.on ? ' checked' : '') + '> ' + k.ad + '</label>' +
        '<div class="kinputs">' +
        '<label><em>' + (k.tip === 'oran' ? 'Doz (% kuru madde)' : 'Doz (g/baş/gün)') + '</em><input type="number" inputmode="decimal" min="0" step="' + (k.tip === 'oran' ? '0.05' : '1') + '" data-kdoz="' + k.id + '" value="' + x.doz + '"></label>' +
        '<label><em>Fiyat (TL/kg)</em><input type="number" inputmode="decimal" min="0" step="1" data-kfiyat="' + k.id + '" value="' + x.fiyat + '"></label>' +
        '</div><small>' + k.not + '</small>';
      box.appendChild(row);
    });
  }

  $('katkilar').addEventListener('change', function (e) {
      var t = e.target, id = t.getAttribute('data-kid') || t.getAttribute('data-kdoz') || t.getAttribute('data-kfiyat');
      if (!id) return;
      var x = st.katki[id] = st.katki[id] || {};
      if (t.getAttribute('data-kid')) { x.on = t.checked; t.closest('.katki').classList.toggle('off', !t.checked); }
      if (t.getAttribute('data-kdoz')) x.doz = parseFloat(t.value);
      if (t.getAttribute('data-kfiyat')) x.fiyat = parseFloat(t.value);
      save(st);
  });

  var FORM = ['bw', 'adg', 'finalBw', 'heads', 'satis', 'alis', 'kabaMin', 'sabitGider', 'tolerans', 'tolMineral', 'nisastaMax', 'ndfMin', 'yagMax', 'sicaklik', 'stokGun'];
  var SECIM = ['irk', 'anaIrk', 'cinsiyet', 'sicakStres'];
  $('irk').innerHTML = M.IRKLAR.map(function (x) { return '<option value="' + x.id + '">' + esc(x.ad) + '</option>'; }).join('');
  $('anaIrk').innerHTML = '<option value="">Aynı (saf ırk)</option>' + $('irk').innerHTML;
  // "Geceleri serinliyor" yalnızca 35 °C üstünde hesabı değiştirir.
  function geceSerinGoster() { $('geceSerinKutu').hidden = !(num('sicaklik') > 35); }
  function fillForm() {
    FORM.forEach(function (k) { $(k).value = st[k]; });
    SECIM.forEach(function (k) { $(k).value = st[k] || ''; });
    if (!$('irk').value) $('irk').value = 'bilinmiyor';
    if (!$('cinsiyet').value) $('cinsiyet').value = 'tosun';
    if (!$('sicakStres').value) $('sicakStres').value = 'yok';
    $('mineralSiki').checked = st.mineralSiki !== false;
    $('geceSerin').checked = st.geceSerin !== false;
    geceSerinGoster();
  }
  $('mineralSiki').addEventListener('change', function () { st.mineralSiki = this.checked; save(st); });
  $('geceSerin').addEventListener('change', function () { st.geceSerin = this.checked; save(st); });
  SECIM.forEach(function (k) { $(k).addEventListener('change', function () { st[k] = this.value; save(st); }); });
  $('sicaklik').addEventListener('input', function () { geceSerinGoster(); });
  save(st);
  FORM.forEach(function (k) {
    var el = $(k);
    el.addEventListener('change', function () { st[k] = parseFloat(el.value); save(st); });
  });
  fillForm();

  function num(id) { var v = parseFloat(String($(id).value).replace(',', '.')); return isFinite(v) ? v : NaN; }

  function readInputs() {
    var o = { bw: num('bw'), adg: num('adg'), finalBw: num('finalBw'), heads: Math.round(num('heads')), kabaMin: num('kabaMin') / 100, sabitGider: num('sabitGider') || 0,
      tolerans: num('tolerans') / 100, tolMineral: num('tolMineral') / 100, mineralSiki: $('mineralSiki').checked,
      satis: num('satis') || 0, alis: num('alis') || 0,
      nisastaMax: num('nisastaMax') / 100, ndfMin: num('ndfMin') / 100, yagMax: num('yagMax') / 100,
      irk: $('irk').value, anaIrk: $('anaIrk').value, cinsiyet: $('cinsiyet').value,
      sicaklik: isFinite(num('sicaklik')) ? num('sicaklik') : 20, sicakStres: $('sicakStres').value, geceSerin: $('geceSerin').checked };
    var err = [];
    if (!(o.bw >= 80 && o.bw <= 800)) err.push('Canlı ağırlığı 80–800 kg arasında yazın.');
    if (!(o.adg >= 0.2 && o.adg <= 2.2)) err.push('Günlük artışı 0,2–2,2 kg arasında yazın.');
    if (!(o.finalBw > o.bw && o.finalBw <= 900)) err.push('Kesim kilosu, şimdiki ağırlıktan büyük ve en fazla 900 kg olmalı.');
    if (!(o.heads >= 1)) err.push('Hayvan sayısını yazın.');
    if (!(o.kabaMin >= 0.1 && o.kabaMin <= 0.8)) err.push('Kaba yem oranını %10–80 arasında yazın.');
    if (!(o.sabitGider >= 0 && o.sabitGider <= 2000)) err.push('Yem dışı günlük gideri 0–2000 TL arasında yazın.');
    if (!(o.nisastaMax >= 0.1 && o.nisastaMax <= 0.7)) err.push('Nişasta sınırını %10–70 arasında yazın.');
    if (!(o.ndfMin >= 0.05 && o.ndfMin <= 0.6)) err.push('Lif (NDF) sınırını %5–60 arasında yazın.');
    if (!(o.yagMax >= 0.02 && o.yagMax <= 0.12)) err.push('Yağ sınırını %2–12 arasında yazın.');
    if (!(o.satis >= 0 && o.satis <= 5000)) err.push('Satış fiyatını 0–5000 TL/kg arasında yazın ya da boş bırakın.');
    if (!(o.alis >= 0 && o.alis <= 5000)) err.push('Alış fiyatını 0–5000 TL/kg arasında yazın ya da boş bırakın.');
    if (!(o.tolerans >= 0.01 && o.tolerans <= 0.5)) err.push('Enerji ve protein toleransını %1–50 arasında yazın.');
    // Stoklu yem: stok, verilen gün sayısı (boşsa kesime kadar) yetsin diye günlük üst sınır olur.
    var stokGun = num('stokGun') > 0 ? num('stokGun') : (o.finalBw - o.bw) / o.adg;
    if (num('stokGun') < 0 || num('stokGun') > 2000) err.push('Stok gün sayısını 1–2000 arasında yazın ya da boş bırakın.');
    if (!(o.sicaklik >= -30 && o.sicaklik <= 45)) err.push('Ahır sıcaklığını -30 ile 45 °C arasında yazın.');
    if (!(o.tolMineral >= 0.01 && o.tolMineral <= 2)) err.push('Kalsiyum ve fosfor toleransını %1–200 arasında yazın.');
    o.feeds = allFeeds().filter(function (f) { return st.secili.indexOf(f.id) >= 0; }).map(function (f) {
      var c = Object.assign({}, f);
      var p = st.fiyat[f.id];
      if (p !== undefined && p !== null && isFinite(p)) c.fiyat = p;
      if (!(c.fiyat >= 0)) err.push(f.ad + ' için fiyat yazın.');
      var sn = st.sinir[f.id] || {};
      c.zorunlu = (st.zorunlu || []).indexOf(f.id) >= 0;
      if (sn.min > 0) c.minKg = sn.min;
      if (sn.max > 0) c.maxKg = sn.max;
      if (sn.min > 0 && sn.max > 0 && sn.min > sn.max) err.push(f.ad + ': en az miktar, en fazla miktardan büyük olamaz.');
      if (st.stok[f.id] > 0 && stokGun > 0 && o.heads >= 1) {
        var stokMax = st.stok[f.id] * 1000 / (o.heads * stokGun);
        c.stokTon = st.stok[f.id]; c.stokGun = stokGun; c.stokCarpan = o.heads * stokGun;
        if (!(c.maxKg > 0) || stokMax < c.maxKg) { c.maxKg = stokMax; c.stokSinir = true; }
      }
      if (f.grup === 'hazir' && !f.ozel) {
        var et = st.etiket[f.id] || {};
        if (et.hp >= 8 && et.hp <= 40) c.etiketHp = et.hp;
        else if (et.hp !== undefined) err.push(f.ad + ' etiket proteinini %8–40 arasında yazın.');
        if (et.me >= 1800 && et.me <= 3200) c.etiketMe = et.me;
        else if (et.me !== undefined) err.push(f.ad + ' etiket enerjisini 1800–3200 kcal arasında yazın.');
        M.applyLabel(c);
      }
      return c;
    });
    if (!o.feeds.length) err.push('En az bir yem seçin.');
    o.katkilar = M.KATKILAR.map(function (k) {
      var x = katkiState(k);
      if (!x.on) return null;
      if (!(x.doz >= 0) || !(x.fiyat >= 0)) err.push(k.ad + ' için doz ve fiyat yazın.');
      if (k.tip === 'oran' && x.doz > 2) err.push(k.ad + ' en fazla kuru maddenin %2\'si olabilir.');
      if (k.tip === 'sabit' && x.doz > 300) err.push(k.ad + ' dozu çok yüksek; etiketteki günlük dozu gram olarak yazın.');
      return Object.assign({}, k, { doz: x.doz, fiyat: x.fiyat });
    }).filter(Boolean);
    return { o: o, err: err };
  }

  var view = 'bas';

  function amount(line, mult) {
    var kg = line.yas * mult;
    if ((line.grup === 'mineral' || line.grup === 'npn' || line.grup === 'katki') && kg < 1) return f0.format(kg * 1000) + ' g';
    return (kg >= 100 ? f0 : f1).format(kg) + ' kg';
  }

  // Besin ihtiyacı ve rasyonun karşılama yüzdesi (bir hayvan, günde).
  // KM ihtiyacı: bu rasyonun enerji yoğunluğunda, enerji ihtiyacını karşılamak için gereken kuru madde.
  function coverage(o, s) {
    var t = s.toplam, r = s.ihtiyac;
    var dietMe = t.me / t.km, dne = M.neFromMe(dietMe);
    var kmNeed = r.nem / dne.nem + r.neg / dne.neg;
    var kmPct = t.km / kmNeed * 100;
    var tol = M.tolOf(o) * 100, tolM = M.tolMinOf(o) * 100;
    return [
      { ad: 'Kuru madde (KM)', gereken: f1.format(kmNeed) + ' kg', rasyon: f1.format(t.km) + ' kg', pct: kmPct, tol: tol },
      { ad: 'Enerji (ME)', gereken: f1.format(kmNeed * dietMe) + ' Mcal', rasyon: f1.format(t.me) + ' Mcal', pct: kmPct, tol: tol },
      { ad: 'Kullanılabilir protein (MP)', gereken: f0.format(r.mp) + ' g', rasyon: f0.format(t.mp) + ' g', pct: t.mp / r.mp * 100, tol: tol },
      // İşkembe mikroplarının azot ihtiyacı: fazlası zararsızdır (idrarla atılır), yalnızca eksiği önemli.
      { ad: 'İşkembe azotu (RDP)', gereken: f0.format(t.rdpIht) + ' g', rasyon: f0.format(t.rdp) + ' g', pct: t.rdpIht > 0 ? t.rdp / t.rdpIht * 100 : 100, tol: tol, altSinir: true },
      { ad: 'Kalsiyum (Ca)', gereken: f0.format(r.ca) + ' g', rasyon: f0.format(t.ca) + ' g', pct: t.ca / r.ca * 100, tol: tolM },
      { ad: 'Fosfor (P)', gereken: f0.format(r.p) + ' g', rasyon: f0.format(t.p) + ' g', pct: t.p / r.p * 100, tol: tolM }
    ];
  }
  // Protein ayrıntısı: HP, RDP, RUP, mikrobiyal protein ve kullanılabilir protein; yem yem döküm.
  function proteinHtml(s) {
    var d = M.proteinDetail(s), g = function (v) { return f0.format(v) + ' g'; };
    var satir = function (ad, aciklama, deger) {
      return '<div class="covrow"><div class="cn"><b>' + ad + '</b><span>' + aciklama + '</span></div><div class="cp pv">' + deger + '</div></div>';
    };
    return '<details class="protein" open><summary>Protein ayrıntısı (bir hayvan, günde)</summary><div class="cov">' +
      satir('Ham protein (HP)', 'Yemlerdeki toplam protein; kuru maddede %' + f1.format(d.hpYuzde), g(d.hp)) +
      satir('İşkembede parçalanan (RDP)', 'Mikropların yemi. İhtiyaç ' + g(d.rdpIht) + '; ' + (d.rdpDenge < -0.5 ? '<b>eksik ' + g(-d.rdpDenge) + '</b>' : d.rdpDenge < 0.5 ? 'tam yeterli' : 'fazla ' + g(d.rdpDenge) + ' (idrarla atılır)'), g(d.rdp)) +
      satir('İşkembeyi geçen (RUP)', 'Doğrudan bağırsağa gider; %80\'i, yani ' + g(d.rupSindirilen) + ' emilir', g(d.rup)) +
      satir('Mikrobiyal protein (MCP)', 'Mikropların yaptığı protein (en fazla ' + g(d.mcpUst) + ', enerjiye göre); %64\'ü, yani ' + g(d.mpMikrop) + ' emilir', g(d.mcp)) +
      satir('Kullanılabilir protein (MP)', 'Mikroptan ' + g(d.mpMikrop) + ' + RUP\'tan ' + g(d.mpRup) + '; ihtiyaç ' + g(d.mpIht) + ' (%' + f0.format(d.mp / d.mpIht * 100) + ')', g(d.mp)) +
      '</div><p class="muted">Yem yem (g/gün):</p><div class="scroll"><table class="pt"><thead><tr><th>Yem</th><th class="n">HP</th><th class="n">RDP</th><th class="n">RUP</th></tr></thead><tbody>' +
      d.yemler.map(function (y) { return '<tr><td>' + esc(y.ad) + '</td><td class="n">' + f0.format(y.hp) + '</td><td class="n">' + f0.format(y.rdp) + '</td><td class="n">' + f0.format(y.rup) + '</td></tr>'; }).join('') +
      '<tr><th>Toplam</th><th class="n">' + f0.format(d.hp) + '</th><th class="n">' + f0.format(d.rdp) + '</th><th class="n">' + f0.format(d.rup) + '</th></tr></tbody></table></div></details>';
  }

  // Dar ekranda ve büyük yazıda da sığsın diye iki sütun: besin + değerler | yüzde.
  function covRowHtml(c) {
    var cls = covClass(c);
    return '<div class="covrow"><div class="cn"><b>' + c.ad + '</b><span>İhtiyaç ' + c.gereken + ' · Rasyon ' + c.rasyon + '</span></div>' +
      '<div class="cp"><span class="pct ' + cls + '">%' + f0.format(c.pct) + '</span><small class="' + cls + '">' + covLabel(c) + '</small></div>' +
      '<div class="covbar" aria-hidden="true"><i class="' + cls + '" style="width:' + Math.round(Math.min(c.pct, 150) / 1.5 * 10) / 10 + '%"></i><u style="left:66.67%"></u></div></div>';
  }
  function covClass(c) { return c.pct < 99.5 ? 'low' : !c.altSinir && c.pct > 100 + c.tol + 0.5 ? 'high' : 'good'; }
  function covLabel(c) { return c.pct < 99.5 ? 'eksik' : c.altSinir ? 'yeterli' : c.pct > 100 + c.tol + 0.5 ? 'fazla' : 'uygun'; }

  // Ekonomik hedef tablosu ve besi dönemi planı: hesaplaması diğerlerinden uzun sürer,
  // sonuç gösterildikten sonra hesaplanıp aynı girdiler için saklanır.
  var extCache = {};
  function extFor(o) {
    var key = JSON.stringify(o);
    if (!extCache[key]) {
      extCache[key] = { ekonomi: M.economics(window.solver, o), donem: M.period(window.solver, o) };
      var e = extCache[key].ekonomi;
      // Öneri güvenli aralıkta kalır: 1,5 kg/gün üstü hedefler asidoz ve sağlık riski taşır.
      e.oneri = null;
      e.satirlar.forEach(function (x) { if (x.adg <= 1.5 + 1e-9 && (!e.oneri || x.toplamKg < e.oneri.toplamKg - 1e-9)) e.oneri = x; });
    }
    return extCache[key];
  }

  var guideCache = {};
  function guideFor(o) {
    var ids = o.feeds.map(function (f) { return f.id; });
    var adaylar = allFeeds().filter(function (f) { return ids.indexOf(f.id) < 0; }).map(function (f) {
      var c = Object.assign({}, f);
      if (st.fiyat[f.id] !== undefined && isFinite(st.fiyat[f.id])) c.fiyat = st.fiyat[f.id];
      if (f.grup === 'hazir' && !f.ozel) {
        var et = st.etiket[f.id] || {};
        if (et.hp) c.etiketHp = et.hp;
        if (et.me) c.etiketMe = et.me;
        M.applyLabel(c);
      }
      return c;
    });
    var key = JSON.stringify(o) + JSON.stringify(adaylar.map(function (c) { return [c.id, c.fiyat, c.hp, c.me]; }));
    if (!guideCache[key]) guideCache[key] = M.priceGuide(window.solver, o, adaylar) || [];
    return guideCache[key];
  }

  function guideHtml(g) {
    if (!g.length) return '<p class="muted">Alım rehberi hesaplanamadı.</p>';
    var tl = function (x) { return f2.format(x) + ' TL'; };
    var mevcut = g.filter(function (x) { return !x.aday; }).map(function (x) {
      var kullanilmiyor = !x.zorunlu && x.kg < 0.01;
      var m = x.tur === 'ust' ? 'Fiyatı <b>' + tl(x.deger) + '</b>\'yi geçerse rasyonda azaltılır.'
        : x.tur === 'alt' ? (kullanilmiyor ? 'Şu an kullanılmıyor; fiyatı <b>' + tl(x.deger) + '</b>\'nin altına inerse rasyona girer.' : 'Fiyatı <b>' + tl(x.deger) + '</b>\'nin altına inerse daha çok kullanılır.')
        : x.tur === 'hep' ? 'Fiyatı 5 katına çıksa da rasyondan çıkmaz.'
        : kullanilmiyor ? 'Şu an kullanılmıyor; fiyatı düşse de bu rasyona girmez.'
        : '"Kesin kullan" dediğiniz için en az miktarda; fiyatı düşse de artmaz.';
      var ar = x.aralik, d = '';
      if (ar && (ar.alt !== null || ar.ust !== null)) {
        // Fiyat dayanıklılığı: rasyonun hiç değişmediği aralık ve aşılınca yerine geçen yemler.
        d = '<br><span class="dayan">Rasyon ' + (ar.alt !== null && ar.ust !== null ? '<b>' + tl(ar.alt) + ' – ' + tl(ar.ust) + '</b> arasında'
          : ar.ust !== null ? '<b>' + tl(ar.ust) + '</b>\'ye kadar' : '<b>' + tl(ar.alt) + '</b>\'nin üstünde') + ' aynı kalır.' +
          (ar.ust !== null ? ' Üstüne çıkarsa ' + esc(x.ad.toLocaleLowerCase('tr-TR')) + ' azalır' + (ar.yerine.length ? ', yerine <b>' + ar.yerine.map(function (y) { return esc(y.ad.toLocaleLowerCase('tr-TR')); }).join('</b> ve <b>') + '</b> artar' : '') + '.' : '') +
          (ar.alt !== null ? ' Altına inerse daha çok kullanılır.' : '') + '</span>';
      } else if (ar) d = '<br><span class="dayan">Fiyatı 3 katına çıksa da sıfıra inse de rasyon değişmez.</span>';
      return '<li><b>' + esc(x.ad) + '</b> <span class="muted">(şimdi ' + tl(x.fiyat) + ')</span><br>' + m + d + '</li>';
    }).join('');
    var adaylar = g.filter(function (x) { return x.aday && x.tur === 'gir'; })
      .sort(function (a, b) { return b.deger / Math.max(b.fiyat, 0.01) - a.deger / Math.max(a.fiyat, 0.01); });
    var iyiler = adaylar.filter(function (x) { return x.deger > x.fiyat; }).map(function (x) {
      return '<li class="iyi"><b>' + esc(x.ad) + '</b> <span class="muted">(şimdi ' + tl(x.fiyat) + ')</span><br>' +
        'Şu anki fiyatıyla rasyonu ucuzlatır; <b>' + tl(x.deger) + '</b>\'ye kadar alınabilir. <button class="link" data-sec="' + x.id + '">Seç ve hesapla</button></li>';
    }).join('');
    var digerler = adaylar.filter(function (x) { return x.deger <= x.fiyat; });
    var aday = iyiler + (digerler.length ? '</ul><details class="dg"><summary>Ucuzlarsa alınabilecek diğer yemler (' + digerler.length + ')</summary><ul class="rehber">' +
      digerler.map(function (x) {
        return '<li><b>' + esc(x.ad) + '</b>: <b>' + tl(x.deger) + '</b>\'nin altında bulursanız alın <span class="muted">(şimdi ' + tl(x.fiyat) + ')</span></li>';
      }).join('') + '</ul></details><ul class="rehber">' : '');
    var girmez = g.filter(function (x) { return x.aday && x.tur === 'girmez'; }).map(function (x) { return esc(x.ad); });
    return '<p class="muted">Fiyatlar değişince rasyonun nasıl değişeceği. "Aynı kalır" aralığında o yemin fiyatı değişse de rasyonu yeniden hesaplamanıza gerek yok; yalnızca masraf değişir. Bu rasyona ve hedefe göre, yalnızca yem maliyetine bakılarak hesaplanmış yaklaşık değerlerdir; protein ya da mineral üst sınırı bağlayıcıysa program bir yemi bundan biraz farklı kullanabilir.</p>' +
      '<h4>Rasyonunuzdaki yemler</h4><ul class="rehber">' + mevcut + '</ul>' +
      (aday ? '<h4>Seçmediğiniz yemler</h4><ul class="rehber">' + aday + '</ul>' : '') +
      (girmez.length ? '<p class="muted">Fiyatı sıfır olsa da bu rasyona girmeyenler: ' + girmez.join(', ') + '.</p>' : '');
  }

  function addDays(n) {
    var d = new Date(); d.setDate(d.getDate() + Math.round(n));
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function kgOrTon(kg) { return kg >= 1000 ? f1.format(kg / 1000) + ' ton' : f0.format(kg) + ' kg'; }

  // Sonuç ekranındaki eşzamanlı ek bölümler (hızlı olanlar).
  function extrasHtml(o, s) {
    var rec = M.concentrateRecipe(s);
    var neden = '<h3>Neden bu karışım?</h3><ul class="neden">' +
      s.sinirlayanlar.map(function (x) { return '<li>' + esc(x.metin) + '</li>'; }).join('') + '</ul>' +
      '<p class="muted">Program, bu kuralların hepsine uyan karışımlar arasından en ucuzunu seçti. Listede olmayan bir kural maliyeti artırmıyor.</p>';
    var recipe = !rec ? '' : '<h3>Karma yem reçetesi (1 ton)</h3>' +
      '<p class="muted">Kesif yemleri bir kerede karıştırmak için. Kaba yemler ayrıca verilir.</p>' +
      '<table><tbody>' + rec.tonBasina.map(function (x) {
        return '<tr><td>' + esc(x.ad) + '</td><td class="n">' + (x.kg < 10 ? f1 : f0).format(x.kg) + ' kg</td></tr>';
      }).join('') + '<tr><th>Toplam</th><th class="n">1.000 kg</th></tr></tbody></table>' +
      '<p class="muted">1 ton karma: ' + f0.format(rec.tonMaliyet) + ' TL. Hayvan başı günde <b>' + f1.format(rec.karmaKgGun) + ' kg karma</b>' +
      (rec.kaba.length ? ' + ' + rec.kaba.map(function (k) { return f1.format(k.kg) + ' kg ' + esc(k.ad.toLocaleLowerCase('tr-TR')); }).join(' + ') : '') + '.</p>';
    var top = s.gunlukMaliyet;
    var dagilim = '<h3>Maliyet dağılımı</h3><div class="bars">' +
      s.satirlar.slice().sort(function (a, b) { return b.maliyet - a.maliyet; }).filter(function (l) { return l.maliyet > 0; }).map(function (l) {
        var pct = l.maliyet / top * 100;
        return '<div class="bar"><span class="bl">' + esc(l.ad) + '</span><span class="bt"><i style="width:' + Math.max(pct, 0.5).toFixed(1) + '%"></i></span><span class="bv">%' + f0.format(pct) + '</span></div>';
      }).join('') + '</div>';
    // Stok girilen yemler: bu rasyonla stok kaç gün yeter.
    var stoklu = (o.feeds || []).filter(function (f) { return f.stokTon > 0; });
    var stok = !stoklu.length ? '' : '<h3>Stok durumu</h3><table><thead><tr><th>Yem</th><th class="n">Stok</th><th class="n">Sürü/gün</th><th class="n">Yeter</th></tr></thead><tbody>' +
      stoklu.map(function (f) {
        var l = s.satirlar.filter(function (x) { return x.id === f.id; })[0], gunluk = l ? l.yas * o.heads : 0;
        return '<tr><td>' + esc(f.ad) + '</td><td class="n">' + f1.format(f.stokTon) + ' ton</td><td class="n">' + (gunluk > 0 ? kgOrTon(gunluk) : '–') + '</td><td class="n">' +
          (gunluk > 0 ? f0.format(f.stokTon * 1000 / gunluk) + ' gün' : 'kullanılmıyor') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="muted">Stoklu yemler ' + f0.format(stoklu[0].stokGun) + ' gün yetecek şekilde sınırlandı (Ayarlar\'dan değiştirebilirsiniz). Stok sınırına gelen yemin yerine program en ucuz diğer yemi koydu.</p>';
    return neden + stok + recipe + dagilim +
      '<h3>' + (o.satis > 0 ? 'En kârlı artış hedefi' : 'En ekonomik artış hedefi') + '</h3><div id="ekonomi" class="muted">Hesaplanıyor…</div>' +
      '<h3>Kesime kadar besi planı: dönem rasyonları</h3><div id="donem" class="muted">Hesaplanıyor…</div>' +
      '<h3>Alım rehberi: yemlerin değer fiyatı</h3><div id="rehber" class="muted">Hesaplanıyor…</div>';
  }

  function ekonomiHtml(o, ext) {
    var e = ext.ekonomi, fixed = e.sabitGider > 0;
    if (!e.satirlar.length) return '<p class="muted">Bu yemlerle başka hedef hesaplanamadı.</p>';
    if (e.satis > 0) return karHtml(o, e);
    return '<p class="muted">Aynı yemler ve fiyatlarla, farklı günlük artış hedeflerinde maliyet' + (fixed ? ' (yem dışı gider ' + f0.format(e.sabitGider) + ' TL/baş/gün dahil)' : '') + ':</p>' +
      '<div class="scroll"><table class="eco"><thead><tr><th class="n">Artış</th><th class="n">Yem TL/gün</th><th class="n">TL/kg artış</th><th class="n">Gün</th></tr></thead><tbody>' +
      e.satirlar.map(function (x) {
        var cls = (Math.abs(x.adg - o.adg) < 1e-6 ? ' cur' : '') + (e.oneri && x.adg === e.oneri.adg ? ' best' : '');
        return '<tr class="' + cls + '"><td class="n">' + f1.format(x.adg) + ' kg</td><td class="n">' + f2.format(x.yemGunluk) + '</td><td class="n">' + f2.format(x.toplamKg) + '</td><td class="n">' + f0.format(x.gun) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="muted">TL/kg artış: 1 kg canlı ağırlık artışının ' + (fixed ? 'yem ve yem dışı gider dahil' : 'yem') + ' maliyeti. Gün: kesim kilosuna kalan gün.</p>' +
      (e.oneri ? '<p>Güvenli aralıkta (en fazla 1,5 kg/gün) 1 kg artışın en ucuz olduğu hedef: <b>' + f1.format(e.oneri.adg) + ' kg/gün</b>, kg başına ' + f2.format(e.oneri.toplamKg) + ' TL.</p>' : '') +
      '<p class="muted">Hızlı büyüme genelde kg başına daha ucuzdur ama kesif yem artar; 1,5 kg/gün üstü hedefler asidoz ve sağlık riski taşır.' +
      (fixed ? '' : ' İşçilik, barınak gibi günlük giderlerinizi Ayarlar\'a yazarsanız hesaba katılır.') + '</p>' +
      (e.oneri && Math.abs(e.oneri.adg - o.adg) > 1e-6 ? '<button class="main" id="useBest">Hedefi ' + f1.format(e.oneri.adg) + ' kg yap ve hesapla</button>' : '');
  }

  // Satış fiyatı girildiyse: kârı en yüksek artış hedefi.
  function karHtml(o, e) {
    var guvenli = e.satirlar.filter(function (x) { return x.adg <= 1.5 + 1e-9; });
    var enKar = null, enGunluk = null;
    guvenli.forEach(function (x) {
      if (!enKar || x.karDonem > enKar.karDonem) enKar = x;
      if (!enGunluk || x.karGun > enGunluk.karGun) enGunluk = x;
    });
    var tl0 = function (v) { return (v < 0 ? '−' : '') + f0.format(Math.abs(v)); };
    return '<p class="muted">Satış fiyatı ' + f2.format(e.satis) + ' TL/kg; yem' + (e.sabitGider > 0 ? ' ve yem dışı gider (' + f0.format(e.sabitGider) + ' TL/gün)' : '') + ' düşülmüş, alış bedeli hariç:</p>' +
      '<div class="scroll"><table class="eco"><thead><tr><th class="n">Artış</th><th class="n">Kâr/gün</th><th class="n">Kesime kâr</th></tr></thead><tbody>' +
      e.satirlar.map(function (x) {
        var cls = (Math.abs(x.adg - o.adg) < 1e-6 ? ' cur' : '') + (enKar && x.adg === enKar.adg ? ' best' : '') + (x.karGun < 0 ? ' neg' : '');
        return '<tr class="' + cls + '"><td class="n">' + f1.format(x.adg) + ' kg</td><td class="n">' + tl0(x.karGun) + ' TL</td><td class="n">' + tl0(x.karDonem) + ' TL</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="muted">Kesime kâr: hayvan başı, ' + f0.format(o.bw) + ' kg\'dan ' + f0.format(o.finalBw) + ' kg\'a kadar eklenen kilonun değeri eksi masraflar.</p>' +
      (enKar ? '<p>Güvenli aralıkta (en fazla 1,5 kg/gün) <b>kesime kadar en kârlı hedef: ' + f1.format(enKar.adg) + ' kg/gün</b>, hayvan başı ' + tl0(enKar.karDonem) + ' TL' +
        (enGunluk && enGunluk.adg !== enKar.adg ? '. Ahır yeriniz sınırlıysa ve hayvanları hızlı değiştirmek istiyorsanız günlük kârın en yüksek olduğu hedef ' + f1.format(enGunluk.adg) + ' kg/gün.' : '.') + '</p>' : '') +
      (enKar && enKar.karDonem < 0 ? '<div class="msg bad">Bu fiyatlarla besi zarar ediyor: hiçbir hedefte masraflar, eklenen kilonun değerini karşılamıyor.</div>' : '') +
      (enKar && Math.abs(enKar.adg - o.adg) > 1e-6 ? '<button class="main" id="useBest" data-adg="' + enKar.adg + '">Hedefi ' + f1.format(enKar.adg) + ' kg yap ve hesapla</button>' : '');
  }

  function donemHtml(o, ext) {
    var d = ext.donem;
    if (!d.dilimler.length) return '<p class="muted">Besi planı hesaplanamadı: ' + esc(d.eksik ? d.eksik.mesaj : '') + '</p>';
    return '<p><b>' + f0.format(d.gun) + ' gün</b> sonra (yaklaşık ' + addDays(d.gun) + ') ' + f0.format(o.finalBw) + ' kg. ' +
      'Hayvan başı yem masrafı <b>' + f0.format(d.yemMaliyeti) + ' TL</b>' + (d.sabitMaliyet > 0 ? ', yem dışı gider ' + f0.format(d.sabitMaliyet) + ' TL' : '') +
      '; sürü (' + o.heads + ' baş) için <b>' + f0.format((d.yemMaliyeti + d.sabitMaliyet) * o.heads) + ' TL</b>.</p>' +
      (d.kar !== undefined ? '<div class="msg ' + (d.kar >= 0 ? 'info' : 'bad') + '">Hayvan başı: satış ' + f0.format(d.gelir) + ' TL' +
        (d.alis !== null ? ' − alış ' + f0.format(d.alis) + ' TL' : ' (alış bedeli hariç, yalnızca eklenen kilonun değeri: ' + f0.format((o.finalBw - o.bw) * o.satis) + ' TL)') +
        ' − yem ' + f0.format(d.yemMaliyeti) + ' TL' + (d.sabitMaliyet > 0 ? ' − gider ' + f0.format(d.sabitMaliyet) + ' TL' : '') +
        ' = <b>' + (d.kar >= 0 ? 'kâr ' : 'zarar ') + f0.format(Math.abs(d.kar)) + ' TL</b>; sürü (' + o.heads + ' baş) ' + f0.format(Math.abs(d.kar) * o.heads) + ' TL.</div>' : '') +
      (d.eksik ? '<div class="msg warn">' + f0.format(d.eksik.bw) + ' kg\'dan sonrası bu yemlerle hesaplanamadı: ' + esc(d.eksik.mesaj) + '</div>' : '') +
      donemTablolari(o, d, false);
  }

  // Dönem rasyonları (yem × dönem tablosu), dönem karma reçeteleri ve kesime kadar gereken yem.
  // pdf: yazdırılacak rapor için sade tablolar.
  function donemTablolari(o, d, pdf) {
    var ph = d.dilimler, head = function (ilk) {
      return '<tr><th>' + ilk + '</th>' + ph.map(function (x) { return '<th class="n">' + x.no + (pdf ? '. dönem' : '.') + '</th>'; }).join('') + '</tr>';
    };
    var sira = d.yemler.map(function (y) { return y.id; });
    var hucre = function (x, id, f) { var l = x.satirlar.filter(function (q) { return q.id === id; })[0]; return l ? f(l) : '–'; };
    var ozet = '<table><thead><tr><th>Dönem</th><th>Ağırlık</th><th class="n">Gün</th><th class="n">TL/baş/gün</th></tr></thead><tbody>' +
      ph.map(function (x) {
        return '<tr><td>' + x.no + '.</td><td>' + f0.format(x.den) + '–' + f0.format(x.e) + ' kg</td><td class="n">' + f0.format(x.gun) + '</td><td class="n">' + f2.format(x.tlGun) + '</td></tr>';
      }).join('') + '</tbody></table>';
    var rasyon = '<table class="donem"><thead>' + head('Yem (kg/baş/gün)') + '</thead><tbody>' +
      sira.map(function (id) {
        var ad = d.yemler.filter(function (y) { return y.id === id; })[0].ad;
        return '<tr><td>' + esc(ad) + '</td>' + ph.map(function (x) { return '<td class="n">' + hucre(x, id, function (l) { return amount(l, 1); }) + '</td>'; }).join('') + '</tr>';
      }).join('') +
      '<tr><th>Toplam (dönem ortası)</th>' + ph.map(function (x) { return '<th class="n">' + f1.format(x.yemKgGun) + ' kg</th>'; }).join('') + '</tr>' +
      '<tr><td>Dönem başı → sonu</td>' + ph.map(function (x) { return '<td class="n">' + f1.format(x.yemKgGun * x.basKat) + '→' + f1.format(x.yemKgGun * x.sonKat) + '</td>'; }).join('') + '</tr>' +
      '</tbody></table>';
    var recIds = [];
    ph.forEach(function (x) { if (x.recete) x.recete.tonBasina.forEach(function (r) { if (recIds.indexOf(r.id) < 0) recIds.push(r.id); }); });
    var recete = !recIds.length ? '' : '<table class="donem"><thead>' + head('1 ton karma (kg)') + '</thead><tbody>' +
      recIds.map(function (id) {
        var ad = '';
        ph.forEach(function (x) { if (x.recete) x.recete.tonBasina.forEach(function (r) { if (r.id === id) ad = r.ad; }); });
        return '<tr><td>' + esc(ad) + '</td>' + ph.map(function (x) {
          var r = x.recete && x.recete.tonBasina.filter(function (q) { return q.id === id; })[0];
          return '<td class="n">' + (r ? (r.kg < 10 ? f1 : f0).format(r.kg) : '–') + '</td>';
        }).join('') + '</tr>';
      }).join('') +
      '<tr><td>Hayvan başı karma (kg/gün)</td>' + ph.map(function (x) { return '<td class="n">' + (x.recete ? f1.format(x.recete.karmaKgGun) : '–') + '</td>'; }).join('') + '</tr>' +
      '</tbody></table>';
    var stoklu = d.yemler.some(function (y) { return y.stokTon; });
    var alim = '<table><thead><tr><th>Yem</th><th class="n">Hayvan başı</th><th class="n">Sürü</th>' + (stoklu ? '<th class="n">Stok</th>' : '') + '</tr></thead><tbody>' +
      d.yemler.map(function (y) {
        var stok = '';
        if (stoklu) {
          var eksikKg = y.kg * o.heads - (y.stokTon || 0) * 1000;
          stok = '<td class="n">' + (!y.stokTon ? '–' : eksikKg > 1 ? f1.format(y.stokTon) + ' ton, <b>' + kgOrTon(eksikKg) + ' eksik</b>' : f1.format(y.stokTon) + ' ton, yeter') + '</td>';
        }
        return '<tr><td>' + esc(y.ad) + '</td><td class="n">' + kgOrTon(y.kg) + '</td><td class="n">' + kgOrTon(y.kg * o.heads) + '</td>' + stok + '</tr>';
      }).join('') + '</tbody></table>';
    var sc = function (t) { return pdf ? t : '<div class="scroll">' + t + '</div>'; };
    var p = function (t) { return pdf ? '<p style="font-size:9.5pt">' + t + '</p>' : '<p class="muted">' + t + '</p>'; };
    return sc(ozet) +
      p('Besi ' + ph.length + ' döneme bölündü. Her dönemin rasyonu, dönemin orta ağırlığına göre en ucuz kuruldu. Dönem içinde aynı oranlarla verin; hayvan büyüdükçe toplam miktarı dönem başındaki değerden sonundakine doğru yavaş yavaş artırın.') +
      sc(rasyon) + (recete ? p('Kesif yemleri her dönem için bir kerede karıştırmak üzere 1 ton karma reçetesi (kaba yem ayrıca verilir):') + sc(recete) : '') +
      p('Kesime kadar gereken yem (satın alma listesi):') + sc(alim);
  }

  function esc(x) {
    return String(x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  // Irk, cinsiyet ve ortam: kısa ad ve NRC düzeltmelerinin etkisi (eski kayıtlarda boş).
  function hayvanAd(o) {
    if (!o.irk && !o.cinsiyet) return '';
    var irk = function (id) { return (M.IRKLAR.filter(function (x) { return x.id === id; })[0] || M.IRKLAR[0]).ad.replace(/ \(.*\)/, ''); };
    var ad = o.anaIrk && o.anaIrk !== o.irk ? irk(o.irk) + ' × ' + irk(o.anaIrk) + ' melezi' : irk(o.irk);
    return ad + ', ' + ({ tosun: 'tosun', kastre: 'öküz', dise: 'düve' }[o.cinsiyet] || 'tosun') + ', ' + f0.format(isFinite(o.sicaklik) ? o.sicaklik : 20) + ' °C' +
      (o.sicakStres === 'hizli' ? ', hızlı soluyor' : o.sicakStres === 'agiz' ? ', ağzı açık soluyor' : '');
  }
  function hayvanEtki(o) {
    if (!o.irk && !o.cinsiyet) return '';
    var hk = M.hayvanKat(o), bak = (hk.a1 + hk.a2) / 0.077 * hk.stres - 1, dmi = hk.dmi - 1;
    var pct = function (v) { return (v >= 0 ? '+' : '−') + '%' + f0.format(Math.abs(v * 100)); };
    var p = [];
    if (Math.abs(bak) > 0.005) p.push('yaşama payı enerjisi ' + pct(bak));
    if (Math.abs(dmi) > 0.005) p.push('iştah ' + pct(dmi));
    return p.length ? 'Irk, cinsiyet ve sıcaklık düzeltmesi (NRC): ' + p.join(', ') + '.' : 'Irk, cinsiyet ve sıcaklık için düzeltme gerekmedi (NRC temel değerleri).';
  }
  function today() { return new Date().toLocaleDateString('tr-TR'); }
  function defaultName(o) { return f0.format(o.bw) + ' kg · ' + f1.format(o.adg) + ' kg/gün'; }

  // WhatsApp ve diğer uygulamalar için düz metin. *kalın* ve _italik_ WhatsApp biçimidir.
  function shareText(o, s, name, date, ext) {
    var plain = function (l, mult) { return amount(l, mult).replace(/\u00a0/g, ' '); };
    var lines = function (mult) {
      var yem = s.satirlar.filter(function (l) { return l.grup !== 'katki'; });
      var kat = s.satirlar.filter(function (l) { return l.grup === 'katki'; });
      var a = yem.map(function (l) { return '• ' + l.ad + ': ' + plain(l, mult); });
      if (kat.length) a.push('_Katkılar (kesif yeme karıştırın):_');
      return a.concat(kat.map(function (l) { return '• ' + l.ad + ': ' + plain(l, mult); }));
    };
    var t = ['*Besi Rasyonu: ' + name + '*', date,
      'Hayvan: ' + f0.format(o.bw) + ' kg, hedef ' + f1.format(o.adg) + ' kg/gün artış, ' + o.heads + ' baş' + (hayvanAd(o) ? ' (' + hayvanAd(o) + ')' : ''), '',
      '*Bir hayvana günde:*'].concat(lines(1));
    if (o.heads > 1) t = t.concat(['', '*Sürüye (' + o.heads + ' baş) günde:*'], lines(o.heads));
    t = t.concat(['', '*İhtiyacı karşılama (bir hayvan):*'], coverage(o, s).map(function (c) {
      return '• ' + c.ad + ': ' + c.rasyon + ' / ' + c.gereken + ' = %' + f0.format(c.pct);
    }));
    var pd = M.proteinDetail(s);
    t = t.concat(['', '*Protein (bir hayvan, günde):*',
      '• Ham protein (HP): ' + f0.format(pd.hp) + ' g',
      '• İşkembede parçalanan (RDP): ' + f0.format(pd.rdp) + ' g (ihtiyaç ' + f0.format(pd.rdpIht) + ' g)',
      '• İşkembeyi geçen (RUP): ' + f0.format(pd.rup) + ' g',
      '• Mikrobiyal protein (MCP): ' + f0.format(pd.mcp) + ' g',
      '• Kullanılabilir protein (MP): ' + f0.format(pd.mp) + ' g (ihtiyaç ' + f0.format(pd.mpIht) + ' g)']);
    var rec = M.concentrateRecipe(s);
    if (rec) t = t.concat(['', '*1 ton karma yem:*'], rec.tonBasina.map(function (x) { return '• ' + x.ad + ': ' + (x.kg < 10 ? f1 : f0).format(x.kg) + ' kg'; }),
      ['Hayvan başı günde ' + f1.format(rec.karmaKgGun) + ' kg karma' + rec.kaba.map(function (k) { return ' + ' + f1.format(k.kg) + ' kg ' + k.ad.toLocaleLowerCase('tr-TR'); }).join('')]);
    if (ext && ext.donem.dilimler.length) {
      var d = ext.donem;
      t = t.concat(['', '*Kesime kadar (' + f0.format(o.finalBw) + ' kg):* ' + f0.format(d.gun) + ' gün, hayvan başı yem ' + f0.format(d.yemMaliyeti) + ' TL' +
        (d.kar !== undefined ? ', ' + (d.kar >= 0 ? 'kâr ' : 'zarar ') + f0.format(Math.abs(d.kar)) + ' TL' + (d.alis === null ? ' (alış hariç)' : '') : '')]);
      if (d.dilimler.length > 1) t = t.concat(d.dilimler.map(function (x) {
        return '_' + x.no + '. dönem ' + f0.format(x.den) + '–' + f0.format(x.e) + ' kg (' + f0.format(x.gun) + ' gün):_ ' +
          x.satirlar.map(function (l) { return l.ad + ' ' + amount(l, 1).replace(/\u00a0/g, ' '); }).join(', ');
      }));
    }
    t = t.concat(['',
      'Yem masrafı: ' + f2.format(s.gunlukMaliyet) + ' TL/baş/gün',
      (o.satis > 0 ? 'Günlük kâr: ' + f2.format(o.adg * o.satis - s.gunlukMaliyet - (o.sabitGider || 0)) + ' TL/baş (satış ' + f2.format(o.satis) + ' TL/kg)' : ''),
      '1 kg artışın yem masrafı: ' + f2.format(s.kgArtisMaliyet) + ' TL',
      'Sürünün 30 günlük yem masrafı: ' + f0.format(s.gunlukMaliyet * o.heads * 30) + ' TL', '',
      '_Yemi günde en az 2 öğüne bölün. Yeni rasyona 2–3 haftada yavaş geçin._',
      '_Besi Rasyon uygulamasıyla hesaplandı._']);
    return t.filter(function (x, i) { return x !== '' || t[i - 1] !== ''; }).join('\n');
  }

  // Yazdırma / PDF için A4 rapor (ayrı, sade bir HTML belgesi).
  function reportHtml(o, s, name, date) {
    var t = s.toplam, ext = extFor(o), rec = M.concentrateRecipe(s), e = ext.ekonomi, d = ext.donem;
    var yem = s.satirlar.filter(function (l) { return l.grup !== 'katki'; });
    var kat = s.satirlar.filter(function (l) { return l.grup === 'katki'; });
    var row = function (l) {
      return '<tr><td>' + esc(l.ad) + '</td><td class="n">' + amount(l, 1) + '</td><td class="n">' + amount(l, o.heads) + '</td>' +
        '<td class="n">' + amount(l, o.heads * 30) + '</td><td class="n">' + f2.format(l.maliyet) + '</td></tr>';
    };
    var cov = coverage(o, s).map(function (c) {
      var lbl = covLabel(c);
      return '<tr><td>' + c.ad + '</td><td class="n">' + c.gereken + '</td><td class="n">' + c.rasyon + '</td><td class="n"><b>%' + f0.format(c.pct) + '</b> ' + lbl + '</td></tr>';
    }).join('');
    var uyar = ['Yemi günde en az 2 öğüne bölün. Kesif yemleri ve katkıları iyice karıştırın; kaba yemle birlikte ya da önce kaba yemi verin.',
      'Yeni rasyona 2–3 haftada, her gün biraz artırarak geçin. Temiz su her zaman bulunsun.'].concat(s.uyarilar);
    return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>' + esc('Besi Rasyonu - ' + name) + '</title><style>' +
      '@page { size: A4; margin: 11mm 12mm; }' +
      'body { font: 10.5pt/1.35 "Segoe UI", Roboto, Arial, sans-serif; color: #000; margin: 0; }' +
      'h1 { font-size: 17pt; margin: 0 0 2mm; } h2 { font-size: 12pt; margin: 4.5mm 0 1.5mm; border-bottom: 1.5px solid #2f6b2f; padding-bottom: 1mm; color: #2f6b2f; }' +
      '.meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5mm 8mm; font-size: 10pt; margin: 2mm 0; }' +
      'table { width: 100%; border-collapse: collapse; font-size: 10pt; } th, td { border: 1px solid #999; padding: 1.1mm 2mm; text-align: left; }' +
      'th { background: #e8f0e5; } td.n, th.n { text-align: right; white-space: nowrap; } tr.sub td { background: #f4f4f4; font-weight: 700; }' +
      'tfoot td { font-weight: 700; } .kpi { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin-top: 3mm; }' +
      '.kpi div { border: 1px solid #999; padding: 2mm; } .kpi b { display: block; font-size: 13pt; } .kpi span { font-size: 9.5pt; }' +
      'ul { margin: 1mm 0; padding-left: 5mm; } li { margin: 0.5mm 0; } .foot { margin-top: 4mm; font-size: 9pt; color: #444; border-top: 1px solid #999; padding-top: 2mm; }' +
      'table, .kpi, h2, section { break-inside: avoid; } h2 { break-after: avoid; }' +
      '.two { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; align-items: start; }' +
      '</style></head><body>' +
      '<h1>Besi Rasyonu: ' + esc(name) + '</h1>' +
      '<div class="meta"><div>Tarih: <b>' + esc(date) + '</b></div><div>Hayvan sayısı: <b>' + o.heads + ' baş</b></div>' +
      '<div>Canlı ağırlık: <b>' + f0.format(o.bw) + ' kg</b></div><div>Hedef günlük artış: <b>' + f1.format(o.adg) + ' kg</b></div>' +
      '<div>Kesim kilosu: <b>' + f0.format(o.finalBw) + ' kg</b></div><div>Kuru madde tüketimi: <b>' + f1.format(t.km) + ' kg/baş/gün</b></div>' +
      (hayvanAd(o) ? '<div style="grid-column:1/-1">Hayvan: <b>' + esc(hayvanAd(o)) + '</b>. ' + esc(hayvanEtki(o)) + '</div>' : '') + '</div>' +
      '<h2>Günlük yem miktarları (yaş hâliyle, tartarak verin)</h2>' +
      '<table><thead><tr><th>Yem</th><th class="n">1 hayvan / gün</th><th class="n">Sürü / gün</th><th class="n">Sürü / 30 gün</th><th class="n">TL / baş / gün</th></tr></thead><tbody>' +
      yem.map(row).join('') +
      (kat.length ? '<tr class="sub"><td colspan="5">Katkılar (kesif yeme karıştırın)</td></tr>' + kat.map(row).join('') : '') +
      '</tbody><tfoot><tr><td>Toplam</td><td class="n">' + f1.format(t.yas) + ' kg</td><td class="n">' + f0.format(t.yas * o.heads) + ' kg</td>' +
      '<td class="n">' + f0.format(t.yas * o.heads * 30) + ' kg</td><td class="n">' + f2.format(s.gunlukMaliyet) + '</td></tr></tfoot></table>' +
      '<div class="kpi"><div><b>' + f2.format(s.gunlukMaliyet) + ' TL</b><span>bir hayvanın günlük yem masrafı</span></div>' +
      '<div><b>' + f2.format(s.kgArtisMaliyet) + ' TL</b><span>1 kg canlı ağırlık artışının yem masrafı</span></div>' +
      '<div><b>' + f0.format(s.gunlukMaliyet * o.heads * 30) + ' TL</b><span>sürünün 30 günlük yem masrafı</span></div></div>' +
      '<h2>İhtiyaç ve karşılama (bir hayvan, günde)</h2>' +
      '<table><thead><tr><th>Besin</th><th class="n">İhtiyaç</th><th class="n">Rasyon</th><th class="n">Karşılama</th></tr></thead><tbody>' + cov + '</tbody></table>' +
      s.asim.map(function (x) { return '<p style="font-size:9.5pt">⚠ ' + esc(x.metin) + '</p>'; }).join('') +
      (function () {
        var d = M.proteinDetail(s), g = function (v) { return f0.format(v); };
        return '<section><h2>Protein ayrıntısı (bir hayvan, günde, g)</h2><div class="two"><table><tbody>' +
          '<tr><td>Ham protein (HP)</td><td class="n">' + g(d.hp) + '</td></tr>' +
          '<tr><td>İşkembede parçalanan (RDP) / ihtiyaç</td><td class="n">' + g(d.rdp) + ' / ' + g(d.rdpIht) + '</td></tr>' +
          '<tr><td>İşkembeyi geçen (RUP)</td><td class="n">' + g(d.rup) + '</td></tr>' +
          '<tr><td>Mikrobiyal protein (MCP)</td><td class="n">' + g(d.mcp) + '</td></tr>' +
          '<tr><td>MP: mikroptan + RUP\'tan</td><td class="n">' + g(d.mpMikrop) + ' + ' + g(d.mpRup) + '</td></tr>' +
          '<tr><th>Kullanılabilir protein (MP) / ihtiyaç</th><th class="n">' + g(d.mp) + ' / ' + g(d.mpIht) + '</th></tr>' +
          '</tbody></table><table><thead><tr><th>Yem</th><th class="n">HP</th><th class="n">RDP</th><th class="n">RUP</th></tr></thead><tbody>' +
          d.yemler.map(function (y) { return '<tr><td>' + esc(y.ad) + '</td><td class="n">' + g(y.hp) + '</td><td class="n">' + g(y.rdp) + '</td><td class="n">' + g(y.rup) + '</td></tr>'; }).join('') +
          '</tbody></table></div></section>';
      })() +
      '<p style="font-size:9.5pt">Kaba yem oranı %' + f0.format(t.kaba / t.km * 100) + ' · Ca:P oranı ' + f1.format(t.ca / t.p) +
      ' · Kuru maddede %' + f1.format(t.hp / t.km / 10) + ' protein, ' + f2.format(t.me / t.km) + ' Mcal ME/kg' +
      ' · Nişasta %' + f1.format(t.nisasta / t.km * 100) + ' (en fazla %' + f0.format(M.limitOf(o, 'nisastaMax') * 100) + ')' +
      ' · Lif (NDF) %' + f1.format(t.ndf / t.km * 100) + ' (en az %' + f0.format(M.limitOf(o, 'ndfMin') * 100) + ')' +
      ' · Yağ %' + f1.format(t.yag / t.km * 100) + ' (en fazla %' + f0.format(M.limitOf(o, 'yagMax') * 100) + ')</p>' +
      '<h2>Neden bu karışım?</h2><ul>' + s.sinirlayanlar.map(function (x) { return '<li>' + esc(x.metin) + '</li>'; }).join('') + '</ul>' +
      (rec ? '<section><h2>Karma yem reçetesi (1 ton) ve maliyet dağılımı</h2><div class="two"><table><thead><tr><th>Kesif yem</th><th class="n">kg / ton</th></tr></thead><tbody>' +
        rec.tonBasina.map(function (x) { return '<tr><td>' + esc(x.ad) + '</td><td class="n">' + (x.kg < 10 ? f1 : f0).format(x.kg) + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><td>Toplam (' + f0.format(rec.tonMaliyet) + ' TL/ton)</td><td class="n">1.000</td></tr></tfoot></table>' +
        '<table><thead><tr><th>Yem</th><th class="n">Maliyetteki payı</th></tr></thead><tbody>' +
        s.satirlar.slice().sort(function (a, b) { return b.maliyet - a.maliyet; }).filter(function (l) { return l.maliyet > 0; })
          .map(function (l) { return '<tr><td>' + esc(l.ad) + '</td><td class="n">%' + f0.format(l.maliyet / s.gunlukMaliyet * 100) + '</td></tr>'; }).join('') +
        '</tbody></table></div><p style="font-size:9.5pt">Hayvan başı günde ' + f1.format(rec.karmaKgGun) + ' kg karma' +
        rec.kaba.map(function (k) { return ' + ' + f1.format(k.kg) + ' kg ' + esc(k.ad.toLocaleLowerCase('tr-TR')); }).join('') + '.</p></section>' : '') +
      (e.satirlar.length ? '<section><h2>En ekonomik artış hedefi</h2><table><thead><tr><th class="n">Günlük artış</th><th class="n">Yem TL/baş/gün</th><th class="n">1 kg artış maliyeti' + (e.sabitGider > 0 ? ' (yem + ' + f0.format(e.sabitGider) + ' TL/gün gider)' : '') + '</th><th class="n">Kesime gün</th></tr></thead><tbody>' +
        e.satirlar.map(function (x) {
          var mark = (Math.abs(x.adg - o.adg) < 1e-6 ? ' ← bu rasyon' : '') + (e.oneri && x.adg === e.oneri.adg ? ' · önerilen' : '');
          return '<tr><td class="n">' + f1.format(x.adg) + ' kg' + mark + '</td><td class="n">' + f2.format(x.yemGunluk) + '</td><td class="n">' + f2.format(x.toplamKg) + ' TL</td><td class="n">' + f0.format(x.gun) + '</td></tr>';
        }).join('') + '</tbody></table><p style="font-size:9.5pt">Önerilen: güvenli aralıkta (en fazla 1,5 kg/gün) 1 kg artışın en ucuz olduğu hedef.</p></section>' : '') +
      (d.dilimler.length ? '<section><h2>Kesime kadar besi planı</h2><p>' + f0.format(o.bw) + ' kg → ' + f0.format(o.finalBw) + ' kg: <b>' + f0.format(d.gun) + ' gün</b> (yaklaşık ' + addDays(d.gun) + '). ' +
        'Hayvan başı yem ' + f0.format(d.yemMaliyeti) + ' TL' + (d.sabitMaliyet > 0 ? ' + yem dışı gider ' + f0.format(d.sabitMaliyet) + ' TL' : '') + '; sürü (' + o.heads + ' baş) ' + f0.format((d.yemMaliyeti + d.sabitMaliyet) * o.heads) + ' TL.</p>' +
        donemTablolari(o, d, true) + (d.eksik ? '<p>' + f0.format(d.eksik.bw) + ' kg\'dan sonrası bu yemlerle hesaplanamadı.</p>' : '') +
        (d.kar !== undefined ? '<p><b>Hayvan başı ' + (d.kar >= 0 ? 'kâr' : 'zarar') + ': ' + f0.format(Math.abs(d.kar)) + ' TL</b> (satış ' + f0.format(d.gelir) + ' TL' +
          (d.alis !== null ? ' − alış ' + f0.format(d.alis) + ' TL' : ', alış bedeli hariç') + ' − yem ' + f0.format(d.yemMaliyeti) + ' TL' +
          (d.sabitMaliyet > 0 ? ' − gider ' + f0.format(d.sabitMaliyet) + ' TL' : '') + '); sürü ' + f0.format(Math.abs(d.kar) * o.heads) + ' TL.</p>' : '') + '</section>' : '') +
      (function () {
        var g = guideFor(o);
        if (!g.length) return '';
        var tl = function (x) { return f2.format(x) + ' TL'; };
        var rows = g.filter(function (x) { return !x.aday || x.tur === 'gir'; }).map(function (x) {
          var yok = !x.zorunlu && x.kg < 0.01;
          var m = x.tur === 'ust' ? 'bu fiyatı geçerse azaltılır' : x.tur === 'alt' ? (yok ? 'kullanılmıyor; bunun altına inerse girer' : 'bunun altına inerse daha çok kullanılır')
            : x.tur === 'hep' ? '5 katına çıksa da rasyondan çıkmaz' : x.tur === 'enaz' ? (yok ? 'kullanılmıyor; fiyatı düşse de girmez' : 'kesin kullan: en az miktarda')
            : x.deger > x.fiyat ? 'şu anki fiyatıyla rasyonu ucuzlatır' : 'bunun altında bulursanız alın';
          var ar = x.aralik;
          if (ar && (ar.alt !== null || ar.ust !== null)) m += '; rasyon ' + (ar.alt !== null ? tl(ar.alt) : '0') + ' – ' + (ar.ust !== null ? tl(ar.ust) : 'üstü sınırsız') + ' arasında aynı kalır' +
            (ar.yerine.length ? ', üstünde yerine ' + ar.yerine.map(function (y) { return esc(y.ad.toLocaleLowerCase('tr-TR')); }).join(' ve ') + ' artar' : '');
          return '<tr><td>' + esc(x.ad) + (x.aday ? ' <i>(seçilmedi)</i>' : '') + '</td><td class="n">' + tl(x.fiyat) + '</td><td class="n">' + (x.deger !== undefined ? tl(x.deger) : '—') + '</td><td>' + m + '</td></tr>';
        }).join('');
        return '<section><h2>Alım rehberi: yemlerin değer fiyatı</h2><table><thead><tr><th>Yem</th><th class="n">Şimdi</th><th class="n">Değer fiyatı</th><th>Anlamı</th></tr></thead><tbody>' + rows +
          '</tbody></table><p style="font-size:9.5pt">Bu rasyona ve hedefe göre yaklaşık değerlerdir.</p></section>';
      })() +
      '<h2>Uygulama notları</h2><ul>' + uyar.map(function (u) { return '<li>' + esc(u) + '</li>'; }).join('') + '</ul>' +
      '<div class="foot">Besi Rasyon uygulamasıyla hesaplanmıştır. İhtiyaçlar NRC besi sığırı standartlarına, yem değerleri ortalama tablolara dayanır; ' +
      'yemlerinizin gerçek değeri farklı olabilir. Hastalık belirtisi görürseniz veteriner hekime, rasyon için ziraat mühendisi veya zooteknistine danışın.</div>' +
      '</body></html>';
  }

  function printReport(html, title) {
    var A = window.BesiAndroid;
    if (A && A.print) { A.print(html, title); return; }
    // Tarayıcıda: gizli çerçevede açıp yazdır (yazdırma ekranında "PDF olarak kaydet" seçilebilir).
    var f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(function () {
      f.contentWindow.focus(); f.contentWindow.print();
      setTimeout(function () { f.remove(); }, 1000);
    }, 250);
  }

  function waUrl(text) { return 'https://wa.me/?text=' + encodeURIComponent(text); }

  // WhatsApp düğmesi: Android'de köprüyü çağıran düğme, web'de gerçek bağlantı.
  function waControl(text, label, attr) {
    if (WEB) return '<a class="wa" href="' + esc(waUrl(text)) + '" target="_blank" rel="noopener" ' + attr + '>' + label + '</a>';
    return '<button class="wa" ' + attr + '>' + label + '</button>';
  }

  // status: mesaj yazılacak öğe. Web'de kopyalanamazsa metin seçili bir kutuda gösterilir.
  function share(text, whatsapp, status) {
    var A = window.BesiAndroid;
    if (A && A.copy && !whatsapp) {
      A.copy(text);
      if (status) status.textContent = 'Rasyon metni kopyalandı; istediğiniz yere yapıştırabilirsiniz.';
      return;
    }
    if (A) { if (whatsapp) A.shareWhatsApp(text); else A.share(text); return; }
    if (whatsapp) { window.open(waUrl(text), '_blank'); return; }
    // iPhone ve tarayıcılarda telefonun paylaşma menüsü (yayınlanan claude.ai sayfasında değil).
    if (!WEB && navigator.share) { navigator.share({ title: 'Besi Rasyonu', text: text }).catch(function () {}); return; }
    var showBox = function () {
      if (!status) return;
      status.innerHTML = 'Kopyalanamadı. Metni aşağıdan seçip kopyalayın:<textarea class="copybox" readonly></textarea>';
      var ta = status.querySelector('textarea');
      ta.value = text; ta.focus(); ta.select();
    };
    try {
      navigator.clipboard.writeText(text).then(function () {
        if (status) status.textContent = 'Rasyon metni kopyalandı; istediğiniz yere yapıştırabilirsiniz.';
      }, showBox);
    } catch (e) { showBox(); }
  }

  // Kayıtlı rasyonlar telefonda saklanır.
  var SKEY = 'besiRasyon.kayitlar.v1';
  function loadSaved() {
    try { var a = JSON.parse(localStorage.getItem(SKEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function storeSaved(a) {
    try { localStorage.setItem(SKEY, JSON.stringify(a)); return true; } catch (e) { return false; }
  }

  function renderSaved() {
    var list = loadSaved(), box = $('saved');
    box.hidden = !list.length;
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<h2>Kayıtlı rasyonlar (' + list.length + ')</h2>' +
      (list.length > 3 ? '<input type="search" id="savedFilter" placeholder="Ada göre ara" aria-label="Kayıtlı rasyonlarda ara">' : '') +
      list.map(function (k) {
        return '<div class="saved-item" data-sid="' + k.id + '" data-name="' + esc(k.ad.toLocaleLowerCase('tr-TR')) + '">' +
          '<div><b>' + esc(k.ad) + '</b><small>' + esc(k.tarih) + (k.guncellendi ? ' (güncellendi)' : '') + ' · ' + f0.format(k.o.bw) + ' kg, ' + f1.format(k.o.adg) + ' kg/gün, ' + k.o.heads + ' baş · ' +
          f2.format(k.out.sonuc.gunlukMaliyet) + ' TL/baş/gün</small></div>' +
          '<div class="saved-btns"><button data-act="ac">Aç</button><button data-act="guncel">Bugünkü fiyatla</button>' +
          waControl(shareText(k.o, k.out.sonuc, k.ad, k.tarih), 'WhatsApp', 'data-act="wa"') +
          '<button data-act="sil" class="del">Sil</button></div></div>';
      }).join('');
    if ($('savedFilter')) $('savedFilter').addEventListener('input', function () {
      var q = this.value.trim().toLocaleLowerCase('tr-TR');
      box.querySelectorAll('.saved-item').forEach(function (el) { el.hidden = q && el.getAttribute('data-name').indexOf(q) < 0; });
    });
  }

  // Kayıtlı rasyonun girdileriyle, bugünkü fiyatlarla yeniden hesapla.
  function recalcSaved(k) {
    var ns = withDefaults(JSON.parse(JSON.stringify(k.st)));
    ns.fiyat = JSON.parse(JSON.stringify(st.fiyat));
    Object.keys(ns.katki || {}).forEach(function (id) {
      if (st.katki[id] && st.katki[id].fiyat !== undefined) ns.katki[id].fiyat = st.katki[id].fiyat;
    });
    st = ns; save(st);
    fillForm(); renderFeeds(); renderKatki(); renderAnaliz(); renderEval();
    runCalc({ onceki: k });
  }

  $('saved').addEventListener('click', function (e) {
    var act = e.target.getAttribute('data-act');
    if (!act) return;
    var id = e.target.closest('.saved-item').getAttribute('data-sid');
    var list = loadSaved(), k = list.filter(function (x) { return x.id === id; })[0];
    if (!k) return;
    if (act === 'sil') {
      // İlk dokunuşta onay ister, ikincide siler.
      if (!e.target.classList.contains('confirm')) {
        e.target.classList.add('confirm');
        e.target.textContent = 'Emin misiniz?';
        setTimeout(function () { if (e.target.isConnected) { e.target.classList.remove('confirm'); e.target.textContent = 'Sil'; } }, 4000);
        return;
      }
      storeSaved(list.filter(function (x) { return x.id !== id; }));
      renderSaved();
    } else if (act === 'wa') {
      if (WEB) return;  // web'de bağlantı kendisi açılır
      share(shareText(k.o, k.out.sonuc, k.ad, k.tarih), true);
    } else if (act === 'guncel') {
      recalcSaved(k);
    } else {
      show(k.o, k.out, k);
      $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // saved: kayıtlı rasyon gösteriliyorsa o kayıt. meta.onceki: bugünkü fiyatla yeniden hesaplanan kayıt.
  function show(o, out, saved, meta) {
    meta = meta || {};
    var box = $('result');
    box.hidden = false;
    if (!out.ok) {
      var kg = function (v, f) { return f && (f.grup === 'mineral' || f.grup === 'npn') && v < 1 ? f0.format(v * 1000) + ' g' : f2.format(v) + ' kg'; };
      var feedOf = function (id) { return allFeeds().filter(function (f) { return f.id === id; })[0]; };
      var list = (out.oneriler || []).map(function (x) {
        var f = feedOf(x.id);
        if (x.tur === 'cikar') return '<li><b>' + esc(x.ad) + '</b>: "Kesin kullan" işaretini kaldırın ve en az miktarını silin (gerekirse program yine kullanır)</li>';
        if (x.tur === 'stok') return '<li><b>' + esc(x.ad) + '</b>: stok ' + f1.format(x.eski) + ' ton yerine en az <b>' + f1.format(x.yeni) + ' ton</b> (ya da yerine geçecek başka bir yem seçin, ya da Ayarlar\'da stokun yetmesi gereken gün sayısını kısaltın)</li>';
        if (x.tur === 'min') return '<li><b>' + esc(x.ad) + '</b>: en az ' + kg(x.eski, f) + ' yerine <b>' + kg(x.yeni, f) + '</b></li>';
        return '<li><b>' + esc(x.ad) + '</b>: en fazla ' + kg(x.eski, f) + ' yerine <b>' + kg(x.yeni, f) + '</b></li>';
      }).join('');
      box.innerHTML = '<h2>Sonuç</h2><div class="msg bad">' + esc(out.mesaj) + '</div>' +
        (list ? '<ul class="oneri">' + list + '</ul><button class="main" id="applyFix">Bu değişikliklerle %100 hesapla</button>' : '') +
        (out.oneriAdg ? '<button class="main" id="applyAdg">Hedefi ' + f2.format(out.oneriAdg) + ' kg yap ve hesapla</button>' : '');
      if ($('applyFix')) $('applyFix').addEventListener('click', function () {
        out.oneriler.forEach(function (x) {
          if (x.tur === 'cikar') {
            st.zorunlu = (st.zorunlu || []).filter(function (id) { return id !== x.id; });
            if (st.sinir[x.id]) st.sinir[x.id].min = null;
            return;
          }
          if (x.tur === 'stok') { st.stok[x.id] = x.yeni; return; }
          st.sinir[x.id] = st.sinir[x.id] || {};
          st.sinir[x.id][x.tur] = Math.round(x.yeni * 1000) / 1000;
        });
        save(st); renderFeeds(); renderEval(); $('calc').click();
      });
      if ($('applyAdg')) $('applyAdg').addEventListener('click', function () {
        st.adg = out.oneriAdg; save(st); fillForm(); $('calc').click();
      });
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    var s = out.sonuc, t = s.toplam, r = s.ihtiyac;
    var mult = view === 'bas' ? 1 : o.heads;
    var limits = {};
    (o.feeds || []).forEach(function (f) {
      var p = [];
      if (f.minKg > 0) p.push('en az ' + f2.format(f.minKg * mult));
      if (f.maxKg > 0) p.push((f.stokSinir ? 'stoktan en fazla ' : 'en fazla ') + f2.format(f.maxKg * mult));
      if (p.length) limits[f.id] = p.join(' · ') + ' kg';
    });
    var row = function (l) {
      return '<tr><td>' + l.ad + (limits[l.id] ? '<small class="lim">sınır: ' + limits[l.id] + '</small>' : '') + '</td><td class="n">' + amount(l, mult) + '</td><td class="n">' + f2.format(l.maliyet * mult) + ' TL</td></tr>';
    };
    var yemler = s.satirlar.filter(function (l) { return l.grup !== 'katki'; });
    var katki = s.satirlar.filter(function (l) { return l.grup === 'katki'; });
    var rows = yemler.map(row).join('') +
      (katki.length ? '<tr class="sub"><td colspan="3">Katkılar (kesif yeme karıştırın)</td></tr>' + katki.map(row).join('') : '');
    var cov = coverage(o, s);
    var covRow = covRowHtml;
    box.innerHTML =
      (saved ? '<h2>' + esc(saved.ad) + '</h2><div class="msg info">Kayıtlı rasyon, ' + esc(saved.tarih) + '. Miktarlar ve fiyatlar kaydedildiği günkü gibidir.</div>'
             : meta.onceki ? '<h2>' + esc(meta.onceki.ad) + ': bugünkü fiyatlarla</h2>' + compareHtml(meta.onceki, s)
             : '<h2>Sonuç</h2>') +
      '<div class="tabs"><button data-v="bas" class="' + (view === 'bas' ? 'on' : '') + '">1 hayvan</button>' +
      '<button data-v="suru" class="' + (view === 'suru' ? 'on' : '') + '">Sürü (' + o.heads + ' baş)</button></div>' +
      '<p class="muted">' + (view === 'bas' ? 'Bir hayvana' : 'Bütün sürüye') + ' günde verilecek yem (yaş hâliyle, tartıp verin):</p>' +
      '<table><thead><tr><th>Yem</th><th class="n">Günde</th><th class="n">Tutar</th></tr></thead><tbody>' + rows +
      '<tr><th>Toplam</th><th class="n">' + (mult === 1 ? f1 : f0).format(t.yas * mult) + ' kg</th><th class="n">' + f2.format(s.gunlukMaliyet * mult) + ' TL</th></tr></tbody></table>' +
      (s.kullanilmayan && s.kullanilmayan.length ? '<p class="muted">Seçili ama bu rasyonda kullanılmayan: <b>' + s.kullanilmayan.map(function (x) { return esc(x.ad); }).join(', ') +
        '</b>. Bu hedefte ekonomik değil ya da gerekmiyor; mutlaka kullanmak isterseniz yemin altındaki "Kesin kullan"ı işaretleyin.</p>' : '') +
      '<div class="kpis">' +
      '<div class="kpi"><b>' + f2.format(s.gunlukMaliyet) + ' TL</b><span>bir hayvanın günlük yem masrafı</span></div>' +
      '<div class="kpi"><b>' + f2.format(s.kgArtisMaliyet) + ' TL</b><span>1 kg canlı ağırlık artışının yem masrafı</span></div>' +
      '<div class="kpi"><b>' + f0.format(s.gunlukMaliyet * o.heads * 30) + ' TL</b><span>sürünün 30 günlük yem masrafı</span></div>' +
      '<div class="kpi"><b>' + f1.format(t.km) + ' kg</b><span>hayvan başı kuru madde (iştah sınırı ' + f1.format(s.tuketimKapasitesi) + ' kg)</span></div>' +
      (o.satis > 0 ? (function () {
        var k = o.adg * o.satis - s.gunlukMaliyet - (o.sabitGider || 0);
        return '<div class="kpi' + (k < 0 ? ' neg' : '') + '"><b>' + (k < 0 ? '−' : '') + f2.format(Math.abs(k)) + ' TL</b><span>hayvan başı günlük kâr (artış × satış fiyatı − yem' + (o.sabitGider > 0 ? ' − gider' : '') + ')</span></div>' +
          '<div class="kpi' + (k < 0 ? ' neg' : '') + '"><b>' + (k < 0 ? '−' : '') + f0.format(Math.abs(k) * o.heads * 30) + ' TL</b><span>sürünün 30 günlük kârı</span></div>';
      })() : '') +
      '</div>' +
      '<h3>İhtiyaç ve karşılama (bir hayvan, günde)</h3>' +
      (hayvanAd(o) ? '<p class="muted">' + esc(hayvanAd(o)) + '. ' + esc(hayvanEtki(o)) + '</p>' : '') +
      s.asim.map(function (x) { return '<div class="msg warn">' + esc(x.metin) + '</div>'; }).join('') +
      '<div class="cov">' + cov.map(covRow).join('') + '</div>' +
      '<p class="muted">Uygun: ihtiyacın %100–' + f0.format(100 + M.tolOf(o) * 100) + '\'i' +
      (M.tolMinOf(o) !== M.tolOf(o) ? ' (kalsiyum ve fosforda %100–' + f0.format(100 + M.tolMinOf(o) * 100) + ')' : '') +
      '. Toleransları Ayarlar\'dan değiştirebilirsiniz. Kalsiyum ihtiyacı, idrar taşına karşı fosforun en az 1,5 katı alınır.</p>' +
      '<p class="muted">Protein NRC (2000) yöntemiyle iki parçada hesaplanır: işkembe mikroplarının yaptığı protein ve yem proteininin işkembeyi geçen kısmı. "Kullanılabilir protein" bağırsakta emilenin toplamıdır. "İşkembe azotu" mikropların ihtiyacıdır; eksikse sindirim bozulur, fazlası zararsızdır. Bilgi için ham protein: ' + f0.format(t.hp) + ' g (kuru maddede %' + f1.format(t.hp / t.km / 10) + ').</p>' +
      '<p class="muted">Kaba yem: %' + f0.format(t.kaba / t.km * 100) + ' (en az %' + f0.format(o.kabaMin * 100) + ') · Ca:P oranı ' + f1.format(t.ca / t.p) + ' · ' +
      'iştah sınırı ' + f1.format(s.tuketimKapasitesi) + ' kg KM (doluluk %' + f0.format(t.km / s.tuketimKapasitesi * 100) + ') · ' +
      'kuru maddede %' + f1.format(t.hp / t.km / 10) + ' protein, ' + f2.format(t.me / t.km) + ' Mcal ME/kg.</p>' +
      proteinHtml(s) +
      '<div class="sindirim">' + [
        ['Nişasta', t.nisasta / t.km, 'en fazla', M.limitOf(o, 'nisastaMax')],
        ['Lif (NDF)', t.ndf / t.km, 'en az', M.limitOf(o, 'ndfMin')],
        ['Yağ', t.yag / t.km, 'en fazla', M.limitOf(o, 'yagMax')]
      ].map(function (x) {
        var ok = x[2] === 'en az' ? x[1] >= x[3] - 0.001 : x[1] <= x[3] + 0.001;
        return '<div class="sd ' + (ok ? 'good' : 'low') + '"><b>%' + f1.format(x[1] * 100) + '</b><span>' + x[0] + '</span><small>' + x[2] + ' %' + f0.format(x[3] * 100) + '</small></div>';
      }).join('') + '</div>' +
      extrasHtml(o, s) +
      '<div class="msg warn">Yemi günde en az 2 öğüne bölün. Kesif yemleri (tahıl, kepek, küspe, mineral) iyice karıştırın; kaba yemle birlikte ya da önce kaba yemi verin.</div>' +
      s.uyarilar.map(function (u) { return '<div class="msg warn">' + u + '</div>'; }).join('') +
      '<div class="actions">' +
      (saved
        ? '<button class="sec" data-a="guncel">Bugünkü fiyatlarla yeniden hesapla</button>'
        : '<label class="field"><span>Rasyon adı</span><input type="text" id="saveName" maxlength="60" value="' + esc(meta.onceki ? meta.onceki.ad : defaultName(o)) + '"></label>' +
          (meta.onceki ? '<button class="sec" data-a="ustune">Kaydı güncelle</button><button class="sec" data-a="kaydet">Yeni kayıt olarak kaydet</button>'
                       : '<button class="sec" data-a="kaydet">Kaydet</button>')) +
      waControl(shareText(o, s, saved ? saved.ad : defaultName(o), saved ? saved.tarih : today()), 'WhatsApp\'ta paylaş', 'data-a="wa" id="waBtn"') +
      (WEB ? '' : '<button class="sec" data-a="pdf">PDF olarak kaydet / yazdır</button>') +
      '<button class="sec" data-a="diger">' + (WEB || DESKTOP || (!window.BesiAndroid && !navigator.share) ? 'Metni kopyala' : 'Başka uygulamayla paylaş') + '</button>' +
      '<p class="muted" id="saveMsg" role="status"></p></div>';
    box.querySelectorAll('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () { view = b.getAttribute('data-v'); show(o, out, saved); });
    });
    var name = function () {
      if (saved) return saved.ad;
      var v = ($('saveName').value || '').trim();
      return v || defaultName(o);
    };
    if (WEB && !saved) {
      // Ad değişince WhatsApp bağlantısının metnini güncelle.
      $('saveName').addEventListener('input', function () {
        $('waBtn').href = waUrl(shareText(o, s, name(), today()));
      });
    }
    box.querySelector('.actions').addEventListener('click', function (e) {
      var a = e.target.getAttribute('data-a');
      if (!a || (a === 'wa' && WEB)) return;
      if (a === 'pdf') {
        var nm = name(), dt = saved ? saved.tarih : today();
        printReport(reportHtml(o, s, nm, dt), 'Besi Rasyonu - ' + nm);
      } else if (a === 'wa' || a === 'diger') {
        share(shareText(o, s, name(), saved ? saved.tarih : today(), extFor(o)), a === 'wa', $('saveMsg'));
      } else if (a === 'kaydet') {
        var list = loadSaved();
        var item = { id: String(Date.now()), ad: name(), tarih: today(), o: o, out: out, st: JSON.parse(JSON.stringify(st)) };
        list.unshift(item);
        if (list.length > 50) list = list.slice(0, 50);
        $('saveMsg').textContent = storeSaved(list) ? '"' + item.ad + '" kaydedildi. Sayfanın üstündeki "Kayıtlı rasyonlar" bölümünden açabilirsiniz.' : 'Kaydedilemedi: telefonda yer kalmamış olabilir.';
        e.target.disabled = true;
        renderSaved();
      } else if (a === 'ustune') {
        var l2 = loadSaved(), id = meta.onceki.id;
        l2 = l2.map(function (x) {
          return x.id === id ? { id: id, ad: name(), tarih: today(), guncellendi: true, o: o, out: out, st: JSON.parse(JSON.stringify(st)) } : x;
        });
        $('saveMsg').textContent = storeSaved(l2) ? '"' + name() + '" bugünkü fiyatlarla güncellendi.' : 'Kaydedilemedi: telefonda yer kalmamış olabilir.';
        e.target.disabled = true;
        renderSaved();
      } else if (a === 'guncel') {
        recalcSaved(saved);
      }
    });
    // Ekonomik hedef ve besi dönemi: ekran çizildikten sonra hesaplanır.
    setTimeout(function () {
      if (!$('ekonomi')) return;
      var ext;
      try { ext = extFor(o); } catch (err) { $('ekonomi').textContent = $('donem').textContent = 'Hesaplanamadı.'; return; }
      $('ekonomi').className = ''; $('ekonomi').innerHTML = ekonomiHtml(o, ext);
      $('donem').className = ''; $('donem').innerHTML = donemHtml(o, ext);
      if ($('useBest')) $('useBest').addEventListener('click', function () {
        st.adg = parseFloat(this.getAttribute('data-adg')) || ext.ekonomi.oneri.adg; save(st); fillForm(); runCalc();
      });
      // Alım rehberi en son (en uzun süren hesap).
      setTimeout(function () {
        if (!$('rehber')) return;
        var g;
        try { g = guideFor(o); } catch (err) { $('rehber').textContent = 'Hesaplanamadı.'; return; }
        $('rehber').className = ''; $('rehber').innerHTML = guideHtml(g);
        $('rehber').querySelectorAll('button[data-sec]').forEach(function (bt) {
          bt.addEventListener('click', function () {
            var id = bt.getAttribute('data-sec');
            if (st.secili.indexOf(id) < 0) st.secili.push(id);
            save(st); renderFeeds(); renderEval(); runCalc();
          });
        });
      }, 30);
      if (WEB && $('waBtn')) $('waBtn').href = waUrl(shareText(o, s, name(), saved ? saved.tarih : today(), ext));
    }, 30);
  }

  function compareHtml(k, s) {
    var eski = k.out.sonuc.gunlukMaliyet, yeni = s.gunlukMaliyet, fark = (yeni - eski) / eski * 100;
    return '<div class="msg info">Kaydedildiğinde (' + esc(k.tarih) + '): <b>' + f2.format(eski) + ' TL</b>/baş/gün → bugünkü fiyatlarla: <b>' + f2.format(yeni) + ' TL</b> (' +
      (fark >= 0 ? '+' : '') + f1.format(fark) + '%). Sürü için ayda ' + (fark >= 0 ? 'fazladan ' : 'tasarruf ') + f0.format(Math.abs(yeni - eski) * k.o.heads * 30) + ' TL.</div>';
  }

  // meta.onceki: kayıtlı bir rasyon bugünkü fiyatlarla yeniden hesaplanıyorsa o kayıt.
  function runCalc(meta) {
    var inp = readInputs();
    if (inp.err.length) {
      var box = $('result');
      box.hidden = false;
      box.innerHTML = '<h2>Eksik bilgi</h2>' + inp.err.map(function (e) { return '<div class="msg bad">' + e + '</div>'; }).join('');
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    var btn = $('calc');
    btn.disabled = true;
    btn.textContent = 'Hesaplanıyor…';
    setTimeout(function () {
      var out;
      try { out = M.compute(window.solver, inp.o); } catch (e) { out = { ok: false, mesaj: 'Hesap yapılamadı: ' + e.message }; }
      btn.disabled = false;
      btn.textContent = 'Rasyonu hesapla';
      show(inp.o, out, null, meta);
      $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
  }
  $('calc').addEventListener('click', function () { runCalc(); });

  // ---- Yem analizi girme ve yeni yem ekleme ----
  var GRUP_AD = { kaba: 'Kaba yem', tahil: 'Tahıl', kuspe: 'Küspe', yan: 'Yan ürün', hazir: 'Hazır yem', npn: 'Üre (protein olmayan azot)', mineral: 'Mineral' };
  var AN_ALAN = [['km', 'Kuru madde (%)', 10, 100], ['hp', 'Ham protein (% KM)', 0, 90], ['me', 'Metabolik enerji (Mcal/kg KM)', 0, 4],
    ['tdn', 'veya TDN (% KM)', 0, 100], ['ndf', 'NDF (% KM)', 0, 100], ['nisasta', 'Nişasta (% KM)', 0, 85], ['yag', 'Ham yağ (% KM)', 0, 40],
    ['rdpPct', 'İşkembede parçalanan protein (% HP)', 0, 100], ['ca', 'Kalsiyum (% KM)', 0, 40], ['p', 'Fosfor (% KM)', 0, 25]];

  function renderAnaliz() {
    var sel = $('anYem'), cur = sel.value;
    var opts = '<option value="__yeni">+ Yeni yem ekle</option>' +
      allFeeds().filter(function (f) { return f.grup !== 'hazir' || f.ozel; }).map(function (f) {
        return '<option value="' + f.id + '">' + esc(f.ad) + (f.ozel ? ' (sizin)' : f.analizli ? ' (analizli)' : '') + '</option>';
      }).join('');
    sel.innerHTML = opts;
    if (cur && sel.querySelector('option[value="' + cur + '"]')) sel.value = cur;
    renderAnalizForm();
  }

  function renderAnalizForm() {
    var id = $('anYem').value, yeni = id === '__yeni';
    var f = yeni ? { grup: 'tahil', km: '', hp: '', me: '', ndf: '', nisasta: '', yag: '', rdp: '', ca: '', p: '', fiyat: '', ad: '' } : allFeeds().filter(function (x) { return x.id === id; })[0];
    var num = function (k) { return f[k] === '' || f[k] === undefined ? '' : Math.round(f[k] * 1000) / 1000; };
    var h = '';
    if (yeni || f.ozel) {
      h += '<label class="field"><span>Yemin adı</span><input type="text" id="an_ad" maxlength="40" value="' + esc(f.ad || '') + '"></label>' +
        '<div class="row2"><label class="field"><span>Grup</span><select id="an_grup">' +
        Object.keys(GRUP_AD).map(function (g) { return '<option value="' + g + '"' + (f.grup === g ? ' selected' : '') + '>' + GRUP_AD[g] + '</option>'; }).join('') +
        '</select></label><label class="field"><span>Fiyat (TL/kg)</span><input type="number" inputmode="decimal" id="an_fiyat" min="0" step="0.5" value="' + num('fiyat') + '"></label></div>';
    }
    h += '<div class="row2">' + AN_ALAN.map(function (a) {
      var val = a[0] === 'tdn' ? '' : a[0] === 'rdpPct' ? (f.rdp !== undefined && f.rdp !== '' ? Math.round(f.rdp * 100) : '') : num(a[0]);
      return '<label class="field"><span>' + a[1] + '</span><input type="number" inputmode="decimal" id="an_' + a[0] + '" min="' + a[2] + '" max="' + a[3] + '" step="0.01" value="' + val + '"></label>';
    }).join('') + '</div>' +
      '<div class="actions">' +
      '<button class="sec" id="anKaydet">' + (yeni ? 'Yemi ekle' : 'Değerleri kaydet') + '</button>' +
      (!yeni && f.analizli ? '<button class="sec" id="anSifirla">Tablo değerine dön</button>' : '') +
      (!yeni && f.ozel ? '<button class="sec del" id="anSil">Bu yemi sil</button>' : '') + '</div>';
    $('anForm').innerHTML = h;
    $('anMsg').textContent = '';
    $('anKaydet').addEventListener('click', function () { saveAnaliz(id, yeni, f); });
    if ($('anSifirla')) $('anSifirla').addEventListener('click', function () {
      delete st.analiz[id]; save(st); renderFeeds(); renderEval(); renderAnaliz();
      $('anMsg').textContent = f.ad + ' tablo değerlerine döndü.';
    });
    if ($('anSil')) $('anSil').addEventListener('click', function () {
      st.ozelYemler = st.ozelYemler.filter(function (x) { return x.id !== id; });
      st.secili = st.secili.filter(function (x) { return x !== id; });
      save(st); $('anYem').value = '__yeni'; renderFeeds(); renderEval(); renderAnaliz();
      $('anMsg').textContent = f.ad + ' silindi.';
    });
  }

  function saveAnaliz(id, yeni, f) {
    var v = {}, err = [];
    AN_ALAN.forEach(function (a) {
      var raw = String($('an_' + a[0]).value).replace(',', '.').trim();
      if (raw === '') return;
      var x = parseFloat(raw);
      if (!(x >= a[2] && x <= a[3])) err.push(a[1] + ' ' + a[2] + '–' + a[3] + ' arasında olmalı.');
      v[a[0]] = x;
    });
    // TDN verilmişse enerji ondan hesaplanır: ME = 0,82 × 0,04409 × TDN (NRC).
    if (v.me === undefined && v.tdn !== undefined) v.me = Math.round(0.82 * 0.04409 * v.tdn * 1000) / 1000;
    delete v.tdn;
    if (v.rdpPct !== undefined) v.rdp = v.rdpPct / 100;
    delete v.rdpPct;
    ['km', 'hp', 'me'].forEach(function (k) { if (v[k] === undefined) err.push((k === 'me' ? 'Enerji (ME ya da TDN)' : k === 'km' ? 'Kuru madde' : 'Ham protein') + ' gerekli.'); });
    var gd = GRUP_NY[(yeni || f.ozel) ? $('an_grup').value : f.grup] || [5, 3];
    ['ndf', 'ca', 'p', 'nisasta', 'yag'].forEach(function (k) {
      if (v[k] === undefined) v[k] = f[k] !== '' && f[k] !== undefined ? f[k] : k === 'nisasta' ? gd[0] : k === 'yag' ? gd[1] : 0;
    });
    if (v.rdp === undefined) v.rdp = f.rdp !== undefined && f.rdp !== '' ? f.rdp : (GRUP_RDP[(yeni || f.ozel) ? $('an_grup').value : f.grup] || 0.65);
    var ad = '', grup = f.grup, fiyat = f.fiyat;
    if (yeni || f.ozel) {
      ad = ($('an_ad').value || '').trim();
      grup = $('an_grup').value;
      fiyat = parseFloat(String($('an_fiyat').value).replace(',', '.'));
      if (!ad) err.push('Yemin adını yazın.');
      if (!(fiyat >= 0)) err.push('Fiyatı yazın.');
    }
    if (err.length) { $('anMsg').innerHTML = err.map(esc).join('<br>'); return; }
    if (yeni) {
      var nid = 'oz_' + Date.now();
      st.ozelYemler.push(Object.assign({ id: nid, ad: ad, grup: grup, fiyat: fiyat }, v));
      st.secili.push(nid);
      st.fiyat[nid] = fiyat;
      save(st); renderFeeds(); renderEval(); $('anYem').value = '__yeni'; renderAnaliz();
      $('anMsg').textContent = ad + ' eklendi ve seçildi.';
    } else if (f.ozel) {
      st.ozelYemler = st.ozelYemler.map(function (x) { return x.id === id ? Object.assign({}, x, v, { ad: ad, grup: grup, fiyat: fiyat }) : x; });
      st.fiyat[id] = fiyat;
      save(st); renderFeeds(); renderEval(); renderAnaliz();
      $('anMsg').textContent = ad + ' güncellendi.';
    } else {
      st.analiz[id] = v;
      save(st); renderFeeds(); renderEval(); renderAnaliz();
      $('anMsg').textContent = f.ad + ' için analiz değerleri kaydedildi; hesaplarda bunlar kullanılacak.';
    }
  }
  $('anYem').addEventListener('change', renderAnalizForm);

  // ---- Elimdeki rasyonu kontrol et ----
  function renderEval() {
    var box = $('evalList');
    var sel = allFeeds().filter(function (f) { return st.secili.indexOf(f.id) >= 0; });
    if (!sel.length) { box.innerHTML = '<p class="muted">Önce yukarıdan verdiğiniz yemleri işaretleyin.</p>'; return; }
    box.innerHTML = sel.map(function (f) {
      var v = st.mevcut[f.id];
      return '<label class="evrow"><span>' + esc(f.ad) + '</span><input type="number" inputmode="decimal" min="0" step="0.05" data-mev="' + f.id + '" value="' + (v > 0 ? v : '') + '" placeholder="0" aria-label="' + esc(f.ad) + ' kg/gün"><em>kg</em></label>';
    }).join('');
  }
  $('evalList').addEventListener('change', function (e) {
    var id = e.target.getAttribute('data-mev');
    if (!id) return;
    var v = parseFloat(String(e.target.value).replace(',', '.'));
    st.mevcut[id] = v > 0 ? v : 0;
    save(st);
  });

  $('evalBtn').addEventListener('click', function () {
    var inp = readInputs();
    var box = $('result');
    box.hidden = false;
    if (inp.err.length) {
      box.innerHTML = '<h2>Eksik bilgi</h2>' + inp.err.map(function (e) { return '<div class="msg bad">' + e + '</div>'; }).join('');
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    var amounts = {};
    inp.o.feeds.forEach(function (f) { if (st.mevcut[f.id] > 0) amounts[f.id] = st.mevcut[f.id]; });
    var ev = M.evaluate(window.solver, inp.o, amounts);
    showEval(inp.o, ev);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function showEval(o, ev) {
    var box = $('result');
    if (!ev.ok) { box.innerHTML = '<h2>Mevcut rasyonunuz</h2><div class="msg bad">' + esc(ev.mesaj) + '</div>'; return; }
    var s = ev.sonuc, b = ev.beklenen, hedefOk = b.artis >= o.adg - 0.02;
    var rows = s.satirlar.map(function (l) {
      return '<tr><td>' + esc(l.ad) + '</td><td class="n">' + amount(l, 1) + '</td><td class="n">' + f2.format(l.maliyet) + ' TL</td></tr>';
    }).join('');
    box.innerHTML = '<h2>Mevcut rasyonunuz</h2>' +
      '<div class="beklenen ' + (hedefOk ? 'good' : 'low') + '"><span>Bu rasyonla beklenen günlük artış</span><b>' + f2.format(b.artis) + ' kg</b>' +
      '<small>Hedefiniz ' + f1.format(o.adg) + ' kg · enerjiye göre ' + f2.format(b.enerji) + ' kg, proteine göre ' + f2.format(b.protein) + ' kg' +
      (b.gun ? ' · ' + f0.format(o.finalBw) + ' kg\'a yaklaşık ' + f0.format(b.gun) + ' gün' : '') + '</small></div>' +
      ev.notlar.map(function (n) { return '<div class="msg warn">' + esc(n) + '</div>'; }).join('') +
      '<h3>Hedefe (' + f1.format(o.adg) + ' kg/gün) göre ihtiyaç ve karşılama</h3>' +
      '<div class="cov">' + coverage(o, s).map(covRowHtml).join('') + '</div>' +
      proteinHtml(s) +
      '<h3>Verdiğiniz yem</h3><table><tbody>' + rows +
      '<tr><th>Toplam</th><th class="n">' + f1.format(s.toplam.yas) + ' kg</th><th class="n">' + f2.format(s.gunlukMaliyet) + ' TL</th></tr></tbody></table>' +
      '<div class="kpis"><div class="kpi"><b>' + f2.format(s.gunlukMaliyet) + ' TL</b><span>bir hayvanın günlük yem masrafı</span></div>' +
      '<div class="kpi"><b>' + (b.artis > 0.05 ? f2.format(s.gunlukMaliyet / b.artis) + ' TL' : '—') + '</b><span>beklenen 1 kg artışın yem masrafı</span></div></div>' +
      (ev.karsilastirma ? '<div class="msg info">Aynı yemlerle ' + f1.format(o.adg) + ' kg/gün hedefe en ucuz rasyon: <b>' + f2.format(ev.karsilastirma.gunluk) + ' TL</b>/baş/gün. ' +
        (ev.karsilastirma.fark > 0.5 ? 'Sizin rasyonunuz günde ' + f2.format(ev.karsilastirma.fark) + ' TL daha pahalı: sürü için ayda yaklaşık <b>' + f0.format(ev.karsilastirma.fark * o.heads * 30) + ' TL</b>.'
          : ev.karsilastirma.fark < -0.5 ? 'Sizin rasyonunuz daha ucuz ama hedefi tam karşılamıyor olabilir; yukarıdaki karşılama listesine bakın.'
          : 'Rasyonunuz zaten en ucuz rasyona çok yakın.') + '</div>' +
        '<div class="actions"><button class="main" id="showBest">En ucuz rasyonu göster</button></div>' : '');
    if ($('showBest')) $('showBest').addEventListener('click', function () { runCalc(); });
  }

  renderFeeds();
  renderKatki();
  renderSaved();
  renderAnaliz();
  renderEval();
  renderKmRehber();

  // iPhone/iPad Safari'de, ana ekrana eklenmemişse nasıl ekleneceğini bir kez göster.
  (function () {
    var ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var ekli = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    var gizli = false;
    try { gizli = localStorage.getItem('besiRasyon.iosKur') === '1'; } catch (e) { /* özel mod */ }
    if (WEB || !ios || ekli || gizli) return;
    $('iosKur').hidden = false;
    $('iosKurKapat').addEventListener('click', function () {
      $('iosKur').hidden = true;
      try { localStorage.setItem('besiRasyon.iosKur', '1'); } catch (e) { /* özel mod */ }
    });
  })();

  if (!WEB && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
