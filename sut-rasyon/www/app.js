(function () {
  'use strict';
  var M = window.SutModel, KEY = 'sutRasyon.v1', SURUM = '1.2';

  var ALANLAR = {
    sagmal: [
      ['bw', 'Canlı ağırlık (kg)', 650], ['sut', 'Günlük süt (kg)', 30], ['yag', 'Süt yağı (%)', 3.8], ['protein', 'Süt proteini (%)', 3.2],
      ['dim', 'Laktasyonun kaçıncı günü', 100], ['gebelik', 'Gebelik günü (gebe değilse 0)', 0], ['ebe', 'Kaçıncı buzağılama (1, 2, 3...)', 3],
      ['agirlikDegisim', 'Günlük ağırlık değişimi (kg; kilo veriyorsa −)', 0], ['sutFiyat', 'Süt fiyatı (TL/kg)', 20], ['bas', 'Baş sayısı', 1]
    ],
    kuru: [['bw', 'Canlı ağırlık (kg)', 680], ['gebelik', 'Gebelik günü', 230], ['bas', 'Baş sayısı', 1]],
    gecis: [['bw', 'Canlı ağırlık (kg)', 680], ['gebelik', 'Gebelik günü', 270], ['bas', 'Baş sayısı', 1]],
    duve: [['bw', 'Canlı ağırlık (kg)', 300], ['adg', 'Hedef günlük artış (kg)', 0.8], ['bas', 'Baş sayısı', 1]],
    buzagi: [['bw', 'Canlı ağırlık (kg)', 100], ['adg', 'Hedef günlük artış (kg)', 0.7], ['bas', 'Baş sayısı', 1]]
  };
  var IPUCU = {
    sagmal: 'Kuru madde tüketimi NRC denklemiyle tahmin edilir. Yem tüketimi bu değerden belirgin farklıysa hayvanı gözlemleyip rasyonu ayarlayın.',
    kuru: 'Kuruya çıkış ile buzağılamadan 3 hafta öncesi arası. Enerji fazlası ve yüksek kalsiyumdan kaçınılır.',
    gecis: 'Buzağılamadan önceki son 3 hafta (close-up). Enerji yoğunluğu ve protein biraz yükseltilir, kalsiyum yüksek tutulmaz.',
    duve: '6 aylıktan ilk buzağılamaya kadar. Hedef: 13–15 aylıkta tohumlama, 22–24 ayda buzağılama.',
    buzagi: 'Sütten kesilmiş (yaklaşık 8 haftalıktan sonra) buzağılar. Daha küçük buzağılar süt/süt ikamesi ve başlangıç yemiyle beslenir.'
  };

  var st = load();
  function load() {
    var d = { grup: 'sagmal', deger: {}, yem: {} };
    try { var s = JSON.parse(localStorage.getItem(KEY) || '{}'); if (s.grup) d = s; } catch (e) {}
    d.deger = d.deger || {}; d.yem = d.yem || {};
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function $(id) { return document.getElementById(id); }
  function fmt(x, n) { return (+x).toFixed(n === undefined ? 1 : n).replace('.', ','); }
  function num(v) { v = String(v).replace(',', '.'); return v === '' ? NaN : parseFloat(v); }

  function varsayilanYemSecimi(g) {
    var ids = {
      sagmal: ['silaj', 'yonca', 'bsaman', 'arpa', 'misir', 'soya', 'aycicegi', 'kepek', 'tampamuk', 'mermer', 'dcp'],
      kuru: ['silaj', 'yonca', 'bsaman', 'cayir', 'soya', 'kepek', 'mermer', 'dcp'],
      gecis: ['silaj', 'yonca', 'bsaman', 'arpa', 'soya', 'kepek', 'mermer', 'dcp'],
      duve: ['silaj', 'yonca', 'bsaman', 'arpa', 'soya', 'kepek', 'hz_duve', 'mermer'],
      buzagi: ['hz_buzagi', 'yonca', 'bsaman', 'mermer']
    };
    return ids[g];
  }
  function secili(id) {
    var y = st.yem[st.grup] || (st.yem[st.grup] = { sec: varsayilanYemSecimi(st.grup) });
    return y.sec.indexOf(id) >= 0;
  }

  var SEKME_RENK = { sagmal: ['#0f766e', '#e0f2f1'], kuru: ['#b45309', '#fdf0dc'], gecis: ['#c2410c', '#fde8de'], duve: ['#6d28d9', '#ece6fb'], buzagi: ['#be185d', '#fbe3ee'], ayar: ['#475569', '#e9edf2'], lisans: ['#1d4ed8', '#e1e9fb'] };
  var SEKME_AD = { sagmal: 'Sağmal', kuru: 'Kuru dönem', gecis: 'Geçiş', duve: 'Düve', buzagi: 'Buzağı', ayar: 'Ayarlar', lisans: 'Lisans' };
  function yoneticiMi() { return !!(window.SutLisans && window.SutLisans.yonetici()); }
  function cizSekmeler() {
    $('gruplar').innerHTML = '';
    var liste = Object.keys(M.GRUPLAR).concat(['ayar']);
    if (yoneticiMi()) liste.push('lisans');
    liste.forEach(function (g) {
      var b = document.createElement('button');
      b.textContent = SEKME_AD[g];
      b.style.cssText = '--t:' + SEKME_RENK[g][0] + ';--tt:' + SEKME_RENK[g][1];
      if (g === st.grup) b.className = 'on';
      b.onclick = function () { st.grup = g; save(); cizHepsi(); };
      $('gruplar').appendChild(b);
    });
    document.body.setAttribute('data-sekme', st.grup);
    temaRengiYaz();
    altBosluk();
  }
  // Sekme çubuğu birkaç satıra sarılabildiği için sayfanın altına çubuk kadar boşluk bırakılır.
  function altBosluk() { document.body.style.paddingBottom = ($('gruplar').offsetHeight + 8) + 'px'; }
  window.addEventListener('resize', altBosluk);
  function cizAlanlar() {
    var v = st.deger[st.grup] || (st.deger[st.grup] = {});
    var h = '<tr><th class="l">Alan</th><th>Değer</th></tr>';
    ALANLAR[st.grup].forEach(function (a) {
      var val = v[a[0]] !== undefined ? v[a[0]] : a[2];
      h += '<tr><td class="k">' + a[1] + '</td><td class="in"><input type="number" step="any" inputmode="decimal" id="f_' + a[0] + '" data-ad="' + a[1] + '" value="' + val + '"></td></tr>';
    });
    $('alanlar').innerHTML = h;
    $('ipucu').textContent = IPUCU[st.grup];
    $('alanlar').removeAttribute('data-xl'); xlle($('alanlar'));
  }
  function cizYemler() {
    var g = st.grup, y = st.yem[g] || (st.yem[g] = { sec: varsayilanYemSecimi(g) });
    y.fiyat = y.fiyat || {}; y.en_az = y.en_az || {}; y.en_cok = y.en_cok || {};
    var h = '<tr><th class="l">Yem</th><th>✓</th><th>TL/kg</th><th>En az</th><th>En çok</th></tr>';
    M.FEEDS.forEach(function (f) {
      var fy = y.fiyat[f.id] !== undefined ? y.fiyat[f.id] : f.fiyat;
      h += '<tr><td class="k" title="KM %' + f.km + ', NEL ' + fmt(f.nel, 2) + ', HP %' + fmt(f.hp, 0) + '">' + f.ad + '</td>' +
        '<td class="mid"><input type="checkbox" data-id="' + f.id + '"' + (secili(f.id) ? ' checked' : '') + '></td>' +
        '<td class="in"><input type="number" step="any" data-ad="' + f.ad + ' fiyatı" data-fiyat="' + f.id + '" value="' + fy + '"></td>' +
        '<td class="in"><input type="number" step="any" data-ad="' + f.ad + ' en az (kg)" data-az="' + f.id + '" value="' + (y.en_az[f.id] === undefined ? '' : y.en_az[f.id]) + '"></td>' +
        '<td class="in"><input type="number" step="any" data-ad="' + f.ad + ' en çok (kg)" data-cok="' + f.id + '" value="' + (y.en_cok[f.id] === undefined ? '' : y.en_cok[f.id]) + '"></td></tr>';
    });
    $('yemtablo').innerHTML = h;
    $('yemtablo').removeAttribute('data-xl'); xlle($('yemtablo'));
    $('yemtablo').onchange = function (e) {
      var t = e.target;
      if (t.dataset.id) {
        var i = y.sec.indexOf(t.dataset.id);
        if (t.checked && i < 0) y.sec.push(t.dataset.id); else if (!t.checked && i >= 0) y.sec.splice(i, 1);
      } else if (t.dataset.fiyat) setOrDel(y.fiyat, t.dataset.fiyat, t.value);
      else if (t.dataset.az) setOrDel(y.en_az, t.dataset.az, t.value);
      else if (t.dataset.cok) setOrDel(y.en_cok, t.dataset.cok, t.value);
      save();
    };
  }
  function setOrDel(o, k, v) { var n = num(v); if (isNaN(n)) delete o[k]; else o[k] = n; }

  function girdi() {
    var v = st.deger[st.grup] = st.deger[st.grup] || {}, o = {};
    ALANLAR[st.grup].forEach(function (a) {
      var n = num($('f_' + a[0]).value);
      o[a[0]] = isNaN(n) ? a[2] : n; v[a[0]] = o[a[0]];
    });
    save();
    return o;
  }
  function seciliYemler() {
    var y = st.yem[st.grup];
    return M.FEEDS.filter(function (f) { return y.sec.indexOf(f.id) >= 0; }).map(function (f) {
      var c = Object.assign({}, f);
      if (y.fiyat[f.id] !== undefined) c.fiyat = y.fiyat[f.id];
      if (y.en_az[f.id] !== undefined) c.en_az = y.en_az[f.id];
      if (y.en_cok[f.id] !== undefined) c.en_cok = y.en_cok[f.id];
      return c;
    });
  }

  function durum(sag, ihtiyac, tolAlt, tolUst) {
    if (sag < ihtiyac * (tolAlt || 0.99)) return '<span class="low">Eksik</span>';
    if (tolUst && sag > ihtiyac * tolUst) return '<span class="hi">Fazla</span>';
    return '<span class="ok">Yeterli</span>';
  }

  function hesapla() {
    var o = girdi(), bas = Math.max(1, o.bas || 1), box = $('sonuc');
    var out;
    try { out = M.compute(window.solver, st.grup, o, seciliYemler()); }
    catch (e) { out = { ok: false, mesaj: 'Hesap yapılamadı: ' + e.message }; }
    if (!out.ok) { box.innerHTML = '<div class="hata">' + out.mesaj + '</div>'; return; }
    var s = out.sonuc, t = s.toplam, r = out.ihtiyac, G = M.GRUPLAR[st.grup];
    var h = '<h2>' + G.ad + '</h2><div class="kutu">' +
      '<div><span>Günlük yem maliyeti (baş)</span><b>' + fmt(s.gunlukMaliyet, 0) + ' TL</b></div>' +
      '<div><span>Kuru madde</span><b>' + fmt(t.km) + ' kg</b></div>' +
      '<div><span>Yaş toplam</span><b>' + fmt(t.yas) + ' kg</b></div>';
    if (out.litreBasiMaliyet) h += '<div><span>Süt başına yem maliyeti</span><b>' + fmt(out.litreBasiMaliyet, 2) + ' TL/kg</b></div>';
    else h += '<div><span>Enerji yoğunluğu</span><b>' + fmt(s.yogunluk, 2) + ' Mcal/kg</b></div>';
    h += '</div>';
    if (out.yemSonrasiGelir !== undefined) h += '<p>Yem masrafından sonra günlük süt geliri: <b>' + fmt(out.yemSonrasiGelir, 0) + ' TL/baş</b></p>';
    out.notlar.forEach(function (n) { h += '<div class="not">' + n + '</div>'; });

    h += '<h2>Günlük rasyon (baş başına)</h2><div class="scroll"><table class="xl"><tr><th>Yem</th><th>Yaş kg' + (bas > 1 ? '</th><th>' + bas + ' baş' : '') + '</th><th>KM kg</th><th>Tutar TL</th></tr>';
    s.satirlar.forEach(function (l) {
      h += '<tr><td>' + l.ad + '</td><td>' + fmt(l.yas, l.grup === 'katki' ? 2 : 1) + '</td>' + (bas > 1 ? '<td>' + fmt(l.yas * bas, 1) + '</td>' : '') +
        '<td>' + (l.km ? fmt(l.km, 2) : '–') + '</td><td>' + fmt(l.maliyet, 1) + '</td></tr>';
    });
    h += '<tr class="top"><td>Toplam</td><td>' + fmt(t.yas) + '</td>' + (bas > 1 ? '<td>' + fmt(t.yas * bas) + '</td>' : '') + '<td>' + fmt(t.km, 1) + '</td><td>' + fmt(s.gunlukMaliyet, 0) + '</td></tr></table></div>';
    if (bas > 1) h += '<p>' + bas + ' baş için günlük maliyet: <b>' + fmt(s.gunlukMaliyet * bas, 0) + ' TL</b>, aylık: <b>' + fmt(s.gunlukMaliyet * bas * 30, 0) + ' TL</b>.</p>';

    var nel = t.nel;
    h += '<h2>İhtiyaç ve karşılama</h2><div class="scroll"><table class="xl"><tr><th>Besin</th><th>İhtiyaç</th><th>Rasyon</th><th class="mid">Durum</th></tr>' +
      '<tr><td>Enerji (NEL, Mcal)</td><td>' + fmt(r.nel) + '</td><td>' + fmt(nel) + '</td><td class="mid">' + durum(nel, r.nel, 0.99, G.nelUst) + '</td></tr>' +
      '<tr><td>Metabolize protein (MP, g)</td><td>' + fmt(r.mp, 0) + '</td><td>' + fmt(t.mp, 0) + '</td><td class="mid">' + durum(t.mp, r.mp) + '</td></tr>' +
      '<tr><td>Kalsiyum (g)</td><td>' + fmt(r.ca, 0) + '</td><td>' + fmt(t.ca, 0) + '</td><td class="mid">' + durum(t.ca, r.ca, 0.99, 1.6) + '</td></tr>' +
      '<tr><td>Fosfor (g)</td><td>' + fmt(r.p, 0) + '</td><td>' + fmt(t.p, 0) + '</td><td class="mid">' + durum(t.p, r.p, 0.99, 1.4) + '</td></tr></table></div>';

    h += '<h2>Rasyonun bileşimi (kuru maddede)</h2><div class="scroll"><table class="xl"><tr><th>Ölçüt</th><th>Rasyon</th><th>Sınır</th></tr>' +
      '<tr><td>Ham protein</td><td>%' + fmt(s.hpOran) + '</td><td>–</td></tr>' +
      '<tr><td>Enerji yoğunluğu (NEL)</td><td>' + fmt(s.yogunluk, 2) + ' Mcal/kg</td><td>–</td></tr>' +
      '<tr><td>NDF</td><td>%' + fmt(s.ndfOran) + '</td><td>en az %' + fmt(G.ndfMin * 100, 0) + '</td></tr>' +
      '<tr><td>Kaba yemden NDF</td><td>%' + fmt(s.fndfOran) + '</td><td>en az %' + fmt(G.fndfMin * 100, 0) + '</td></tr>' +
      '<tr><td>Kaba yem payı</td><td>%' + fmt(s.kabaOran * 100, 0) + '</td><td>en az %' + fmt((o.kabaMin >= 0 ? o.kabaMin : G.kabaMin) * 100, 0) + '</td></tr>' +
      '<tr><td>Nişasta</td><td>%' + fmt(s.nisastaOran) + '</td><td>en çok %' + fmt(G.nisastaMax * 100, 0) + '</td></tr>' +
      '<tr><td>Ham yağ</td><td>%' + fmt(s.yagOran) + '</td><td>en çok %' + fmt(G.yagMax * 100, 1) + '</td></tr>' +
      '<tr><td>Ca : P</td><td>' + fmt(t.ca / Math.max(t.p, 0.01)) + ' : 1</td><td>1,2–4</td></tr></table></div>';
    h += '<p><button class="main" id="pdfPaylas">PDF raporu paylaş / kaydet</button> <button class="main wa" id="waGonder">WhatsApp\'ta gönder</button> ' +
      '<button class="alt" id="kopya">Rasyonu kopyala</button> <button class="alt" id="yazdir">Yazdır</button></p><p class="muted" id="paylasDurum" role="status"></p>' +
      '<p class="ipucu">Yemleme: önce kaba yemleri, sonra konsantreleri tam karışım (TMR) olarak karıştırın; tuz ve karmayı karışıma katın. Rasyon değişimini 7–10 günde kademeli yapın.</p>';
    box.innerHTML = h;
    Array.prototype.forEach.call(box.querySelectorAll('table.xl'), xlle);
    var metin = rasyonMetni(G, s, o, bas, out);
    $('pdfPaylas').onclick = function () {
      var d = $('paylasDurum'), b = this; b.disabled = true; d.textContent = 'PDF hazırlanıyor…';
      window.SutRapor.pdfUret(raporHtml(G, s, o, bas, out, r, t)).then(function (pdf) {
        return window.SutRapor.paylas(pdf, 'Süt Rasyon - ' + G.ad.split(' (')[0] + ' - ' + bugunYaz());
      }).then(function (sonuc) {
        d.textContent = sonuc === 'indirildi' ? 'PDF indirildi.' : sonuc === 'iptal' ? '' : 'PDF paylaşım ekranı açıldı.';
      }, function (e) { d.textContent = 'PDF oluşturulamadı: ' + e.message + ' (Yazdır düğmesini deneyin.)'; }).then(function () { b.disabled = false; });
    };
    $('waGonder').onclick = function () {
      if (window.SutAndroid && window.SutAndroid.shareWhatsApp) window.SutAndroid.shareWhatsApp(metin);
      else window.open('https://wa.me/?text=' + encodeURIComponent(metin), '_blank', 'noopener');
    };
    $('yazdir').onclick = function () { window.print(); };
    $('kopya').onclick = function () {
      try {
        if (window.SutAndroid && window.SutAndroid.copy) window.SutAndroid.copy(metin); else navigator.clipboard.writeText(metin);
        $('kopya').textContent = 'Kopyalandı';
      } catch (e) { prompt('Kopyalayın:', metin); }
    };
  }

  function bugunYaz() { var d = new Date(); return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear(); }
  function esc(x) { return String(x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // WhatsApp ve panoya kopyalama için düz metin özet.
  function rasyonMetni(G, s, o, bas, out) {
    var satir = ALANLAR[st.grup].filter(function (a) { return a[0] !== 'bas' && o[a[0]] !== undefined; }).map(function (a) { return a[1].replace(/ \(.*\)$/, '') + ': ' + fmt(o[a[0]], 1); });
    var m = '*Süt Rasyon — ' + G.ad.split(' (')[0] + '* (' + bugunYaz() + ')\n' + satir.join(', ') + '\n\n*Günlük rasyon (baş başına)*\n' +
      s.satirlar.map(function (l) { return '• ' + l.ad + ': ' + fmt(l.yas, l.grup === 'katki' ? 2 : 1) + ' kg'; }).join('\n') +
      '\n\nKuru madde: ' + fmt(s.toplam.km) + ' kg · Ham protein: %' + fmt(s.hpOran) + ' · NEL: ' + fmt(s.yogunluk, 2) + ' Mcal/kg' +
      '\nMaliyet: ' + fmt(s.gunlukMaliyet, 0) + ' TL/gün' + (out.litreBasiMaliyet ? ' (' + fmt(out.litreBasiMaliyet, 2) + ' TL/kg süt)' : '') +
      (bas > 1 ? '\n' + bas + ' baş: ' + fmt(s.gunlukMaliyet * bas, 0) + ' TL/gün' : '') +
      '\n\n_Tahmini rasyondur; uygulamadan önce veteriner hekim/besleme uzmanına danışın._';
    return m;
  }

  // PDF raporunun sayfa içeriği (A4): girdiler, rasyon, ihtiyaç karşılama, bileşim, notlar, sorumluluk reddi.
  function raporHtml(G, s, o, bas, out, r, t) {
    var ac = gecerliRenk();
    function tablo(baslik, satirlar, rakamSag) {
      return '<div class="blok"><table><tr>' + baslik.map(function (b, i) { return '<th' + (i === 0 ? ' class="l"' : '') + '>' + esc(b) + '</th>'; }).join('') + '</tr>' +
        satirlar.map(function (x) { return '<tr' + (x.top ? ' class="top"' : '') + '>' + x.h.map(function (c, i) { return '<td' + (i === 0 ? ' class="l"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>';
    }
    var css = '<style>h1{margin:0;font-size:20px;color:' + ac + '}h2{margin:12px 0 4px;padding:3px 8px;font-size:13px;color:#fff;background:' + ac + '}' +
      'table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #bbb;padding:3px 6px;text-align:right}th{background:#f1f1f1;color:#444}' +
      '.l{text-align:left}tr.top td{font-weight:bold;background:#f1f1f1}.kutular{display:flex}.kutular div{flex:1;border:1px solid #bbb;padding:5px 8px}' +
      '.kutular b{display:block;font-size:17px}.kutular span{font-size:10px;color:#555}.not{border:1px solid #e0b24d;background:#fff8e1;padding:4px 8px;margin:4px 0;font-size:12px}' +
      '.kucuk{font-size:10px;color:#555;margin-top:12px}</style>';
    var h = css + '<div class="blok"><h1>Süt Rasyon — Rasyon Raporu</h1><div style="color:#555;font-size:12px">' + esc(G.ad) + ' · ' + bugunYaz() + (bas > 1 ? ' · ' + bas + ' baş' : '') + '</div></div>';
    h += '<div class="blok"><h2>Hayvan bilgileri</h2><table>' + ALANLAR[st.grup].filter(function (a) { return a[0] !== 'bas' && a[0] !== 'sutFiyat'; }).map(function (a) {
      return '<tr><td class="l">' + esc(a[1]) + '</td><td>' + esc(fmt(o[a[0]], 1)) + '</td></tr>'; }).join('') + '</table></div>';
    h += '<div class="blok"><h2>Özet</h2><div class="kutular"><div><span>Günlük yem maliyeti (baş)</span><b>' + fmt(s.gunlukMaliyet, 0) + ' TL</b></div><div><span>Kuru madde</span><b>' + fmt(t.km) + ' kg</b></div><div><span>Yaş toplam</span><b>' + fmt(t.yas) + ' kg</b></div>' +
      (out.litreBasiMaliyet ? '<div><span>Süt başına yem maliyeti</span><b>' + fmt(out.litreBasiMaliyet, 2) + ' TL/kg</b></div>' : '<div><span>Enerji yoğunluğu</span><b>' + fmt(s.yogunluk, 2) + ' Mcal/kg</b></div>') + '</div></div>';
    h += '<div class="blok baslik"><h2>Günlük rasyon (baş başına)</h2></div>' + tablo(['Yem', 'Yaş kg'].concat(bas > 1 ? [bas + ' baş (kg)'] : []).concat(['KM kg', 'Tutar TL']),
      s.satirlar.map(function (l) { return { h: [esc(l.ad), fmt(l.yas, l.grup === 'katki' ? 2 : 1)].concat(bas > 1 ? [fmt(l.yas * bas, 1)] : []).concat([l.km ? fmt(l.km, 2) : '–', fmt(l.maliyet, 1)]) }; })
        .concat([{ top: 1, h: ['Toplam', fmt(t.yas)].concat(bas > 1 ? [fmt(t.yas * bas)] : []).concat([fmt(t.km, 1), fmt(s.gunlukMaliyet, 0)]) }]));
    if (bas > 1) h += '<div class="blok" style="margin-top:4px">' + bas + ' baş için günlük maliyet: <b>' + fmt(s.gunlukMaliyet * bas, 0) + ' TL</b>, aylık: <b>' + fmt(s.gunlukMaliyet * bas * 30, 0) + ' TL</b>.</div>';
    h += '<div class="blok baslik"><h2>İhtiyaç ve karşılama</h2></div>' + tablo(['Besin', 'İhtiyaç', 'Rasyon', 'Durum'], [
      { h: ['Enerji (NEL, Mcal)', fmt(r.nel), fmt(t.nel), t.nel >= r.nel * 0.99 ? 'Yeterli' : 'Eksik'] },
      { h: ['Metabolize protein (MP, g)', fmt(r.mp, 0), fmt(t.mp, 0), t.mp >= r.mp * 0.99 ? 'Yeterli' : 'Eksik'] },
      { h: ['Kalsiyum (g)', fmt(r.ca, 0), fmt(t.ca, 0), t.ca >= r.ca * 0.99 ? 'Yeterli' : 'Eksik'] },
      { h: ['Fosfor (g)', fmt(r.p, 0), fmt(t.p, 0), t.p >= r.p * 0.99 ? 'Yeterli' : 'Eksik'] }]);
    h += '<div class="blok baslik"><h2>Rasyonun bileşimi (kuru maddede)</h2></div>' + tablo(['Ölçüt', 'Rasyon', 'Sınır'], [
      { h: ['Ham protein', '%' + fmt(s.hpOran), '–'] }, { h: ['Enerji yoğunluğu (NEL)', fmt(s.yogunluk, 2) + ' Mcal/kg', '–'] },
      { h: ['NDF', '%' + fmt(s.ndfOran), 'en az %' + fmt(G.ndfMin * 100, 0)] }, { h: ['Kaba yemden NDF', '%' + fmt(s.fndfOran), 'en az %' + fmt(G.fndfMin * 100, 0)] },
      { h: ['Kaba yem payı', '%' + fmt(s.kabaOran * 100, 0), 'en az %' + fmt(G.kabaMin * 100, 0)] }, { h: ['Nişasta', '%' + fmt(s.nisastaOran), 'en çok %' + fmt(G.nisastaMax * 100, 0)] },
      { h: ['Ham yağ', '%' + fmt(s.yagOran), 'en çok %' + fmt(G.yagMax * 100, 1)] }, { h: ['Ca : P', fmt(t.ca / Math.max(t.p, 0.01)) + ' : 1', '1,2–4'] }]);
    if (out.notlar.length) h += '<div class="blok"><h2>Notlar</h2>' + out.notlar.map(function (n) { return '<div class="not">' + esc(n) + '</div>'; }).join('') + '</div>';
    h += '<div class="blok kucuk"><b>Sorumluluk reddi:</b> Bu rapor, NRC (2001) esaslı sadeleştirilmiş denklemlere ve ortalama yem değerlerine dayanan tahmini bir hesaptır; veteriner hekim ya da besleme uzmanının önerisi yerine geçmez. ' +
      'Girilen bilgilerin doğruluğu, yem analizleri, rasyonun uygulanması ve hayvan sağlığının izlenmesi kullanıcının sorumluluğundadır; programı geliştiren ve lisans veren kişi, kullanımdan doğabilecek hayvan, verim ya da para kaybından sorumlu tutulamaz.</div>';
    return h;
  }

  // Tabloyu Excel görünümüne çevirir: sütun harfleri üstte, satır numaraları solda.
  function xlle(t) {
    if (t.getAttribute('data-xl')) return;
    t.setAttribute('data-xl', '1'); t.className = 'xl';
    var rows = t.rows, n = rows[0] ? rows[0].cells.length : 0, hr = t.insertRow(0), i, c;
    hr.className = 'kol'; hr.appendChild(document.createElement('th')).className = 'rn';
    for (i = 0; i < n; i++) { c = document.createElement('th'); c.textContent = String.fromCharCode(65 + i); hr.appendChild(c); }
    for (i = 1; i < t.rows.length; i++) {
      var r = t.rows[i], rn = document.createElement('td'); rn.className = 'rn'; rn.textContent = i;
      r.insertBefore(rn, r.firstChild);
      if (r.cells[1] && !r.cells[1].classList.contains('in')) r.cells[1].classList.add('l');
      if (r.cells[1] && r.cells[1].tagName === 'TH') r.cells[1].classList.add('l');
    }
  }
  // Enter / yukarı / aşağı alttaki ya da üstteki hücreye geçer; seçili hücre formül çubuğunda görünür.
  document.addEventListener('keydown', function (e) {
    var el = e.target;
    if (el.tagName !== 'INPUT' || el.type !== 'number' || !el.closest('table.xl')) return;
    var dy = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!dy) return;
    var td = el.closest('td'), ci = td.cellIndex, tr = td.parentNode;
    var rows = el.closest('table').rows, r2 = rows[tr.rowIndex + dy];
    var tgt = r2 && r2.cells[ci] && r2.cells[ci].querySelector('input[type=number]');
    if (tgt) { e.preventDefault(); tgt.focus(); tgt.select(); }
  });
  // Excel'den kopyalanan hücreleri (sekmeyle sütun, satır sonuyla satır) seçili hücreden başlayarak yapıştırır.
  document.addEventListener('paste', function (e) {
    var el = e.target;
    if (el.tagName !== 'INPUT' || el.type !== 'number' || !el.closest('table.xl')) return;
    var txt = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(txt.replace(/\r?\n$/, ''))) {
      // Tek hücre: virgüllü ondalığı noktaya çevirip yapıştırır.
      var tek = txt.trim().replace(/\s/g, '');
      if (/^-?\d{1,3}(\.\d{3})*,\d+$|^-?\d+,\d+$/.test(tek)) { e.preventDefault(); el.value = tek.replace(/\./g, '').replace(',', '.'); el.dispatchEvent(new Event('change', { bubbles: true })); }
      return;
    }
    e.preventDefault();
    var td = el.closest('td'), tr = td.parentNode, rows = el.closest('table').rows, sayi = 0;
    txt.replace(/\r?\n$/, '').split(/\r?\n/).forEach(function (line, i) {
      var row = rows[tr.rowIndex + i];
      if (!row) return;
      line.split('\t').forEach(function (v, j) {
        var cell = row.cells[td.cellIndex + j], inp = cell && cell.querySelector('input[type=number]');
        if (!inp) return;
        v = v.trim().replace(/\s/g, '').replace(/[^\d.,-]/g, '');
        if (v.indexOf(',') >= 0) v = v.replace(/\./g, '').replace(',', '.');
        if (v !== '' && isNaN(parseFloat(v))) return;
        inp.value = v; inp.dispatchEvent(new Event('change', { bubbles: true })); sayi++;
      });
    });
    $('fxm').textContent = sayi + ' hücre yapıştırıldı';
  });
  document.addEventListener('focusin', function (e) {
    var el = e.target;
    if (el.tagName !== 'INPUT' || !el.closest('table.xl')) return;
    var td = el.closest('td'), tr = td.parentNode;
    $('ad').textContent = String.fromCharCode(64 + td.cellIndex) + tr.rowIndex;
    $('fxm').textContent = (el.getAttribute('data-ad') || '') + ' = ' + el.value;
  });
  document.addEventListener('input', function (e) {
    if (e.target.tagName === 'INPUT' && e.target.getAttribute('data-ad')) $('fxm').textContent = e.target.getAttribute('data-ad') + ' = ' + e.target.value;
  });

  function sayfaGoster() {
    $('ana').hidden = st.grup === 'ayar' || st.grup === 'lisans';
    $('ayarSayfa').hidden = st.grup !== 'ayar';
    $('lisansSayfa').hidden = st.grup !== 'lisans';
  }
  function cizHepsi() {
    if (st.grup === 'lisans' && !yoneticiMi()) st.grup = 'sagmal';
    cizSekmeler(); sayfaGoster();
    if (st.grup === 'ayar') { ayarCiz(); return; }
    if (st.grup === 'lisans') return;
    cizAlanlar(); cizYemler(); $('sonuc').innerHTML = '<p class="ipucu">Bilgileri girip "Rasyonu hesapla"ya dokun.</p>';
  }

  // ---- Ayarlar: renk, yazı boyutu, veriler, sorumluluk reddi ----
  var RENKLER = [['sekme', 'Sekme renkleri (otomatik)', 'linear-gradient(135deg,#0f766e 25%,#b45309 25% 50%,#6d28d9 50% 75%,#be185d 75%)'], ['yesil', 'Excel yeşili', '#217346'], ['lacivert', 'Lacivert', '#1f4e79'], ['bordo', 'Bordo', '#8b1e3f'], ['antrasit', 'Antrasit', '#3c4650'], ['toprak', 'Toprak', '#8a4b2a']];
  var YAZILAR = [['kucuk', 'Küçük'], ['normal', 'Normal'], ['buyuk', 'Büyük'], ['cokbuyuk', 'Çok büyük']];
  function gorunumOku() { try { return JSON.parse(localStorage.getItem('sutRasyon.gorunum') || '{}'); } catch (e) { return {}; } }
  function gecerliRenk() {
    var r = gorunumOku().renk || 'sekme';
    if (r === 'sekme') return SEKME_RENK[st.grup] ? SEKME_RENK[st.grup][0] : '#0f766e';
    return (RENKLER.filter(function (x) { return x[0] === r; })[0] || RENKLER[1])[2];
  }
  function temaRengiYaz() { var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = gecerliRenk(); }
  function gorunumYaz(g) {
    try { localStorage.setItem('sutRasyon.gorunum', JSON.stringify(g)); } catch (e) {}
    var r = document.documentElement;
    if (g.renk && g.renk !== 'sekme') r.setAttribute('data-renk', g.renk); else r.removeAttribute('data-renk');
    if (g.yazi && g.yazi !== 'normal') r.setAttribute('data-yazi', g.yazi); else r.removeAttribute('data-yazi');
    temaRengiYaz(); altBosluk();
  }
  function ayarCiz() {
    var g = gorunumOku(), box = $('ayarSayfa');
    var L = window.SutLisans;
    box.innerHTML = '<section class="card"><h2>Görünüm</h2>' +
      '<p class="muted">Renk ve yazı boyutu bu cihazda saklanır.</p>' +
      '<b>Renk</b><div class="secenek">' + RENKLER.map(function (r) { return '<button class="renkdugme' + ((g.renk || 'sekme') === r[0] ? ' on' : '') + '" data-renk="' + r[0] + '"><i style="background:' + r[2] + '"></i>' + r[1] + '</button>'; }).join('') + '</div>' +
      '<b>Yazı boyutu</b><div class="secenek">' + YAZILAR.map(function (y) { return '<button class="renkdugme' + ((g.yazi || 'normal') === y[0] ? ' on' : '') + '" data-yazi="' + y[0] + '">' + y[1] + '</button>'; }).join('') + '</div>' +
      '<p>Örnek: Tablo, düğme ve yazıların hepsi seçilen boyuta göre büyür ya da küçülür.</p></section>' +
      '<section class="card"><h2>Veriler</h2><p class="muted">Girdileri, yem seçimlerini ve fiyatları bu cihazdan siler (lisans ve görünüm ayarı silinmez).</p>' +
      '<button class="sec" id="verilerSil">Girdileri ve fiyatları sıfırla</button> <span id="verilerDurum" class="muted"></span></section>' +
      '<section class="card"><h2>Sorumluluk reddi</h2>' + (L ? L.beyanMetniHtml() : '') + '</section>' +
      '<section class="card"><h2>Lisans ve iletişim</h2><p>Süt Rasyon ' + SURUM + ' (' + (L && L.rol === 'yonetici' ? 'yönetici' : 'standart kullanıcı') + ').</p>' +
      '<p>Lisans anahtarı istemek için: WhatsApp / telefon <b>0544 524 50 62</b>, e-posta <b>nuhbektas@gmail.com</b>.</p>' +
      (L ? '<p>Cihaz kodunuz: <b>' + L.cihazKodu() + '</b></p>' : '') + '</section>';
    Array.prototype.forEach.call(box.querySelectorAll('[data-renk]'), function (b) { b.onclick = function () { var x = gorunumOku(); x.renk = b.getAttribute('data-renk'); gorunumYaz(x); ayarCiz(); }; });
    Array.prototype.forEach.call(box.querySelectorAll('[data-yazi]'), function (b) { b.onclick = function () { var x = gorunumOku(); x.yazi = b.getAttribute('data-yazi'); gorunumYaz(x); ayarCiz(); }; });
    $('verilerSil').onclick = function () {
      if (!this.classList.contains('onay')) { this.classList.add('onay'); this.textContent = 'Emin misiniz? Tekrar dokunun'; return; }
      try { localStorage.removeItem(KEY); } catch (e) {}
      st = { grup: 'sagmal', deger: {}, yem: {} };
      $('verilerDurum').textContent = 'Sıfırlandı.'; cizHepsi();
    };
  }
  document.addEventListener('sut:acildi', function () { cizSekmeler(); });
  $('hesapla').onclick = hesapla;
  cizHepsi();
})();
