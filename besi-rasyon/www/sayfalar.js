// Sayfalar: ana sayfa, rasyon (asıl hesap ekranı), yem kütüphanesi, hayvan takibi ve sorumluluk beyanı.
// Sayfalar arasında üstteki (telefonda alttaki) menüyle geçilir. Hayvan kayıtları yalnızca bu cihazda saklanır.
(function () {
  'use strict';
  var M = window.BesiModel, A = window.BesiApp;
  var $ = function (id) { return document.getElementById(id); };
  var nf = function (d) { return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var f0 = nf(0), f1 = nf(1), f2 = nf(2);
  var HKEY = 'besiRasyon.hayvanlar.v1';
  var GRUP_AD = { kaba: 'Kaba yem', tahil: 'Tahıl', kuspe: 'Küspe', yan: 'Yan ürün', hazir: 'Hazır yem', npn: 'Üre', mineral: 'Mineral' };
  var CINS_AD = { tosun: 'Tosun', kastre: 'Öküz', dise: 'Düve' };

  function esc(x) { return String(x === undefined || x === null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function oku(k, varsay) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v === null ? varsay : v; } catch (e) { return varsay; } }
  function yaz(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function bugunIso() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function gunFark(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5); }
  function tarih(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : ''; }
  function num(v) { var x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : NaN; }
  function kopyala(metin, durum, mesaj) {
    var B = window.BesiAndroid, tamam = function () { if (durum) durum.textContent = mesaj; };
    if (B && B.copy) { B.copy(metin); tamam(); return; }
    var yedek = function () {
      var t = document.createElement('textarea'); t.value = metin; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); tamam(); } catch (e) { if (durum) durum.textContent = 'Kopyalanamadı.'; }
      t.remove();
    };
    try { navigator.clipboard.writeText(metin).then(tamam, yedek); } catch (e) { yedek(); }
  }

  // ---- Menü ----
  var SAYFALAR = ['ana', 'rasyon', 'yem', 'hayvan', 'beyan', 'lisans', 'ayarlar', 'kar', 'yemleme', 'depo', 'takvim'];
  var aktif = 'ana';
  // Rasyon sayfası adımları: akıştakiler (hayvan → yemler → katkılar → ayarlar → sonuç) Önceki/Sonraki ile
  // geçilir; kayıtlar, kontrol ve silaj ölçümü bağımsız sayfalardır.
  var ADIM = {
    hayvan: ['🐂', 'Hayvan bilgileri', 'Kilo, hedef artış, kesim kilosu, ırk ve ortam.'],
    yemler: ['🌾', 'Yemler ve fiyatlar', 'Elinizdeki yemleri işaretleyin, kilo fiyatını yazın.'],
    katki: ['🧂', 'Katkılar', 'Tuz, premiks, maya ve soda: doz ve fiyat.'],
    ayar: ['⚙️', 'Hesap ayarları', 'İsteğe bağlı sınırlar ve toleranslar. Değiştirmeden geçebilirsiniz.'],
    sonuc: ['🧾', 'Sonuç', 'En ucuz dengeli rasyon, besin değeri, reçete, plan ve alım rehberi.'],
    kayit: ['💾', 'Kayıtlı rasyonlar', 'Kaydettiğiniz rasyonları açın, bugünkü fiyatlarla yeniden hesaplayın.'],
    kontrol: ['🔍', 'Elimdeki rasyonu kontrol et', 'Şu an verdiğiniz rasyon ihtiyacı karşılıyor mu?'],
    silaj: ['🌽', 'Silaj kuru maddesi', 'Mikrodalgayla ölçün, rasyon bu değerle hesaplansın.']
  };
  var AKIS = ['hayvan', 'yemler', 'katki', 'ayar', 'sonuc'];
  var KISA = { hayvan: 'Hayvan', yemler: 'Yemler', katki: 'Katkılar', ayar: 'Ayarlar', sonuc: 'Sonuç' };
  function adim(ad) {
    if (!ADIM[ad]) ad = 'hayvan';
    var m = document.querySelector('main'), a = ADIM[ad], i = AKIS.indexOf(ad);
    m.setAttribute('data-aktif', ad);
    $('adimBas').innerHTML = '<h1><i aria-hidden="true">' + a[0] + '</i>' + a[1] + '</h1><p>' + a[2] + '</p>' +
      (i >= 0 ? '<nav class="adimcubuk" aria-label="Rasyon adımları">' + AKIS.map(function (x, j) {
        return '<button data-adimgit="' + x + '"' + (j < i ? ' class="gecti"' : '') + (j === i ? ' aria-current="step"' : '') + '>' + (j + 1) + '. ' + KISA[x] + '</button>';
      }).join('') + '</nav>' : '');
    var alt = '';
    if (i > 0) alt += '<button class="geri" data-adimgit="' + AKIS[i - 1] + '">← ' + KISA[AKIS[i - 1]] + '</button>';
    if (i >= 0 && i < AKIS.length - 2) alt += '<button class="ileri" data-adimgit="' + AKIS[i + 1] + '">' + KISA[AKIS[i + 1]] + ' →</button>';
    if (ad === 'ayar') alt += '<button class="ileri" id="adimHesapla">Rasyonu hesapla →</button>';
    if (ad === 'sonuc') alt += '<button class="ileri" data-git="ana">Ana sayfa</button>';
    if (i < 0) alt += '<button class="geri" data-git="ana">← Ana sayfa</button>' + (ad === 'kayit' ? '' : '<button class="ileri" data-adimgit="hayvan">Rasyon hesapla →</button>');
    $('adimAlt').innerHTML = alt;
    if ($('adimHesapla')) $('adimHesapla').addEventListener('click', function () { adim('sonuc'); $('calc').click(); });
    window.scrollTo(0, 0);
  }
  // ---- Excel gibi tablolar (table.xl) ----
  // Enter / aşağı ok alttaki hücreye, yukarı ok üstteki hücreye geçer; gizli ve girişsiz satırlar atlanır.
  function hucreGit(inp, yon) {
    var td = inp.closest('td'), tr = td && td.parentElement, tablo = tr && tr.closest('table.xl');
    if (!tablo) return false;
    var sira = td.cellIndex, satirlar = [].slice.call(tablo.tBodies[0] ? tablo.tBodies[0].rows : []);
    for (var i = satirlar.indexOf(tr) + yon; i >= 0 && i < satirlar.length; i += yon) {
      var r = satirlar[i];
      if (r.hidden || r.cells.length <= sira) continue;
      var h = r.cells[sira].querySelector('input:not([type=checkbox]),select');
      if (h && !h.disabled) { h.focus(); if (h.select) try { h.select(); } catch (e) { /* tarih alanı */ } return true; }
    }
    return false;
  }
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (!t.closest || !t.closest('table.xl td') || t.type === 'checkbox' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      var yon = e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey) ? -1 : 1;
      if (t.tagName === 'SELECT' && e.key !== 'Enter') return;
      e.preventDefault();
      t.dispatchEvent(new Event('change', { bubbles: true }));
      if (!hucreGit(t, yon) && e.key === 'Enter') t.blur();
    }
  });
  // Excel'den kopyalanan sütun (alt alta) ya da satır (sekmeyle ayrılmış) hücrelere dağıtılır.
  document.addEventListener('paste', function (e) {
    var t = e.target;
    if (!t.closest || !t.closest('table.xl td') || t.tagName !== 'INPUT') return;
    var metin = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(metin.trim())) return;
    e.preventDefault();
    var satirlar = metin.replace(/\r/g, '').replace(/\n+$/, '').split('\n');
    var td0 = t.closest('td'), tr = td0.parentElement;
    var sayi = function (v) { v = String(v).trim().replace(/\s|TL|₺|kg/gi, ''); if (/,\d{1,3}$/.test(v) || /\.\d{3},/.test(v)) v = v.replace(/\./g, '').replace(',', '.'); return v; };
    satirlar.forEach(function (sat, i) {
      if (i > 0) {
        do { tr = tr.nextElementSibling; } while (tr && (tr.hidden || tr.cells.length <= td0.cellIndex || !tr.cells[td0.cellIndex].querySelector('input')));
      }
      if (!tr) return;
      sat.split('\t').forEach(function (v, j) {
        var c = tr.cells[td0.cellIndex + j], inp = c && c.querySelector('input:not([type=checkbox])');
        if (!inp) return;
        inp.value = inp.type === 'number' ? sayi(v) : v.trim();
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  });
  // Uzun açıklamalar (.ipucu) gizli; kartın başlığındaki "?" düğmesi açar.
  function ipucuKur() {
    document.querySelectorAll('.card').forEach(function (c) {
      if (!c.querySelector('.ipucu')) return;
      var bas = c.querySelector('h2, summary');
      if (!bas || bas.querySelector('.ipucubtn')) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ipucubtn'; b.textContent = '?';
      b.setAttribute('aria-label', 'Açıklamayı göster'); b.setAttribute('aria-expanded', String(c.classList.contains('ipucu-acik')));
      bas.appendChild(b);
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.ipucubtn');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var c = b.closest('.card'), ac = !c.classList.contains('ipucu-acik');
    c.classList.toggle('ipucu-acik', ac);
    c.querySelectorAll('.ipucubtn').forEach(function (x) { x.setAttribute('aria-expanded', String(ac)); });
  }, true);
  var ipucuZaman = 0;
  new MutationObserver(function () { clearTimeout(ipucuZaman); ipucuZaman = setTimeout(ipucuKur, 30); })
    .observe(document.body, { childList: true, subtree: true });
  ipucuKur();
  // Yem tablosunun başlık satırı üst çubuğun hemen altında sabit kalır.
  function ustYukseklik() { var h = document.querySelector('header.ust'); if (h) document.documentElement.style.setProperty('--ust-h', h.offsetHeight + 'px'); }
  window.addEventListener('resize', ustYukseklik); ustYukseklik();

  // Rasyon hesaplanınca (başka sayfadan başlatılsa da) sonuç adımına geçilir.
  new MutationObserver(function (l) {
    var m = document.querySelector('main');
    if (l.some(function (x) { return x.addedNodes.length; }) && !$('result').hidden && m.getAttribute('data-aktif') !== 'sonuc') adim('sonuc');
  }).observe($('result'), { childList: true });

  function git(ad, kaydir, adimAd) {
    aktif = ad;
    if (ad === 'rasyon') adim(adimAd || 'hayvan');
    document.querySelector('main').hidden = ad !== 'rasyon';
    SAYFALAR.forEach(function (s) { if (s !== 'rasyon') $('sayfa-' + s).hidden = s !== ad; });
    document.querySelectorAll('#anaMenu button').forEach(function (b) { b.setAttribute('aria-current', b.getAttribute('data-git') === ad ? 'page' : 'false'); });
    if (ad === 'ana') anaSayfa();
    if (ad === 'yem') yemSayfa();
    if (ad === 'hayvan') hayvanSayfa();
    if (ad === 'beyan') beyanSayfa();
    if (ad === 'ayarlar') ayarSayfa();
    if (ad === 'kar') karSayfa();
    if (ad === 'yemleme') yemlemeSayfa();
    if (ad === 'depo') depoSayfa();
    if (ad === 'takvim') takvimSayfa();
    cekmece(false); zilPanel(false); zilGuncelle();
    if (kaydir !== false) window.scrollTo(0, 0);
  }

  // Yan menü (çekmece) ve hatırlatma zili.
  function cekmece(ac) {
    $('cekmece').hidden = !ac; $('perde').hidden = !ac;
    $('menuAc').setAttribute('aria-expanded', String(!!ac));
    if (ac) { var s = document.body.innerHTML.match(/Sürüm (\d+\.\d+)/); $('cekSurum').textContent = (s ? 'Sürüm ' + s[1] + ' · ' : '') + 'İnternet gerekmez'; }
  }
  function zilPanel(ac) {
    $('zilPanel').hidden = !ac; $('zil').setAttribute('aria-expanded', String(!!ac));
    if (!ac) return;
    var h = hatirlatmalar();
    $('zilPanel').innerHTML = '<h3>Hatırlatmalar</h3>' + (h.length ? '<ul>' + h.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' : '<p class="muted">Şu an hatırlatma yok.</p>');
  }
  function zilGuncelle() {
    var n = hatirlatmalar().length, r = $('zilSayi');
    r.hidden = !n; r.textContent = n > 9 ? '9+' : n;
  }
  $('menuAc').addEventListener('click', function () { cekmece($('cekmece').hidden); });
  $('perde').addEventListener('click', function () { cekmece(false); });
  $('zil').addEventListener('click', function (e) { e.stopPropagation(); zilPanel($('zilPanel').hidden); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { cekmece(false); zilPanel(false); } });
  document.addEventListener('click', function (e) { if (!$('zilPanel').hidden && !e.target.closest('#zilPanel')) zilPanel(false); });

  document.addEventListener('click', function (e) {
    var ag = e.target.closest('[data-adimgit]');
    if (ag && !ag.closest('[data-git]') && !ag.hasAttribute('data-git')) { e.preventDefault(); if (aktif !== 'rasyon') git('rasyon', true, ag.getAttribute('data-adimgit')); else adim(ag.getAttribute('data-adimgit')); return; }
    var b = e.target.closest('[data-git]');
    if (!b) return;
    e.preventDefault();
    git(b.getAttribute('data-git'), true, b.getAttribute('data-adimgit'));
    var hedef = b.getAttribute('data-hedef');
    if (hedef && $(hedef)) setTimeout(function () { var h = $(hedef); if (h.tagName === 'DETAILS') h.open = true; if (h.tagName === 'BUTTON') h.click(); h.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  });

  // ---- Hayvan fotoğrafları: cihazda IndexedDB'de (localStorage'a sığmaz), küçültülmüş JPEG ----
  var Foto = (function () {
    var dbP = null;
    function db() {
      if (!dbP) dbP = new Promise(function (ok, hata) {
        if (!window.indexedDB) { hata(); return; }
        var r = indexedDB.open('besiRasyonFoto', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('foto'); };
        r.onsuccess = function () { ok(r.result); }; r.onerror = function () { hata(r.error); };
      });
      return dbP;
    }
    function islem(tip, f) {
      return db().then(function (d) {
        return new Promise(function (ok, hata) {
          var t = d.transaction('foto', tip), st = t.objectStore('foto'), r = f(st);
          t.oncomplete = function () { ok(r && r.result); }; t.onerror = function () { hata(t.error); };
        });
      });
    }
    return {
      al: function (id) { return islem('readonly', function (st) { return st.get(id); }).catch(function () { return null; }); },
      koy: function (id, veri) { return islem('readwrite', function (st) { st.put(veri, id); }); },
      sil: function (id) { return islem('readwrite', function (st) { st.delete(id); }).catch(function () {}); },
      // Yedek için bütün fotoğraflar: { id: veri }.
      hepsi: function () {
        return db().then(function (d) {
          return new Promise(function (ok) {
            var out = {}, c = d.transaction('foto', 'readonly').objectStore('foto').openCursor();
            c.onsuccess = function () { var x = c.result; if (x) { out[x.key] = x.value; x.continue(); } else ok(out); };
            c.onerror = function () { ok(out); };
          });
        }).catch(function () { return {}; });
      }
    };
  })();
  // Çekilen fotoğrafı en fazla 900 px'e küçültüp JPEG'e çevirir.
  function fotoKucult(dosya) {
    return new Promise(function (ok, hata) {
      var fr = new FileReader();
      fr.onerror = hata;
      fr.onload = function () {
        var img = new Image();
        img.onerror = hata;
        img.onload = function () {
          var k = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          ok(c.toDataURL('image/jpeg', 0.75));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(dosya);
    });
  }
  // Listedeki fotoğraf yerlerini doldurur.
  function fotolariYukle(kok) {
    (kok || document).querySelectorAll('[data-foto]').forEach(function (el) {
      Foto.al(el.getAttribute('data-foto')).then(function (v) {
        if (!v) return;
        var img = document.createElement('img');
        img.className = el.className; img.alt = el.getAttribute('aria-label') || 'Hayvan fotoğrafı'; img.src = v;
        el.replaceWith(img);
      });
    });
  }
  var ISLEM_TUR = ['Aşı', 'İlaç / tedavi', 'Parazit (iç/dış)', 'Muayene', 'Diğer'];

  // ---- Hayvan kayıtları ----
  function hayvanlar() { var l = oku(HKEY, []); return Array.isArray(l) ? l.filter(function (h) { return h && h.kupe && h.giris && h.girisKg > 0; }) : []; }
  function hayvanKaydet(l) { return yaz(HKEY, l); }
  function tartimlar(h) {
    return [{ t: h.giris, kg: h.girisKg, giris: true }].concat((h.tartim || []).slice().sort(function (a, b) { return a.t < b.t ? -1 : 1; }));
  }
  function sonTartim(h) { var t = tartimlar(h); return t[t.length - 1]; }
  // Son iki tartım arasındaki ve girişten bu yana günlük canlı ağırlık artışı (kg/gün).
  function artis(h) {
    var t = tartimlar(h), son = t[t.length - 1], once = t[t.length - 2];
    var donem = once && gunFark(once.t, son.t) > 0 ? (son.kg - once.kg) / gunFark(once.t, son.t) : null;
    var genel = gunFark(h.giris, son.t) > 0 ? (son.kg - h.girisKg) / gunFark(h.giris, son.t) : null;
    return { donem: donem, genel: genel };
  }
  function aktifler() { return hayvanlar().filter(function (h) { return !h.cikis; }); }
  function ozet() {
    var l = aktifler(), n = l.length;
    if (!n) return { n: 0 };
    var top = 0, art = 0, artN = 0;
    l.forEach(function (h) { top += sonTartim(h).kg; var a = artis(h).genel; if (a !== null) { art += a; artN++; } });
    return { n: n, ort: top / n, top: top, artis: artN ? art / artN : null };
  }

  // ---- Ana sayfa ----
  // Kilo takibi ve lisansla ilgili hatırlatmalar (zil ve ana sayfa).
  function hatirlatmalar() {
    var st = A.durum(), hat = [];
    aktifler().forEach(function (h) {
      var s = sonTartim(h);
      if (st.finalBw && s.kg >= st.finalBw) hat.push('<b>' + esc(h.kupe) + '</b> kesim kilosuna ulaştı (' + f0.format(s.kg) + ' kg).');
      var a = artis(h).donem;
      if (a !== null && st.adg && a < st.adg * 0.7) hat.push('<b>' + esc(h.kupe) + '</b> son dönemde günde ' + f2.format(a) + ' kg alıyor; hedefin (' + f1.format(st.adg) + ') altında.');
    });
    if ($('lisansUyari') && !$('lisansUyari').hidden) hat.unshift($('lisansUyari').innerHTML);
    // Takvimde bugün ya da geçmiş olan işler ve 10 günden az kalan yemler.
    var yarin = gunEkleIso(bugunIso(), 1), tolay = takvimOlaylari(), enSon = {};
    // Tekrarlanan olaylardan yalnızca yarına kadarki en son tekrar hatırlatılır.
    tolay.forEach(function (o) { if (o.kendi && o.tekrar && o.tekrar !== 'yok' && o.t <= yarin) enSon[o.k] = o.t; });
    tolay.forEach(function (o) {
      if (o.tamam) return;
      if (o.kendi && o.tekrar && o.tekrar !== 'yok' && enSon[o.k] !== o.t) return;
      if (o.t <= bugunIso()) hat.push(o.tur + ' <b>' + tarih(o.t) + '</b> ' + (o.saat ? esc(o.saat) + ' ' : '') + o.metin);
      else if (o.kendi && o.t === yarin) hat.push(o.tur + ' <b>Yarın</b> ' + (o.saat ? esc(o.saat) + ' ' : '') + o.metin);
    });
    depoDurumu().forEach(function (d) { if (d.gun !== null && d.gun < 10) hat.push('<b>' + esc(d.ad) + '</b> stoğu yaklaşık ' + Math.max(0, Math.floor(d.gun)) + ' gün yeter; alım zamanı.'); });
    var sy = oku('besiRasyon.sonYedek', null);
    if ((hayvanlar().length || A.kayitlar().length) && (!sy || gunFark(sy, bugunIso()) >= 7)) hat.push(sy ? 'Son yedek ' + gunFark(sy, bugunIso()) + ' gün önce alındı. <button class="link" data-git="ayarlar">Yedek alın</button>' : 'Henüz yedek almadınız. <button class="link" data-git="ayarlar">Yedek alın</button>');
    return hat;
  }

  function anaSayfa() {
    var st = A.durum(), o = ozet(), son = oku('besiRasyon.sonHesap', null), kay = A.kayitlar();
    var L = window.BesiLisans, b = L && L.beyanKaydi(), ad = b && b.ad ? b.ad.split(' ')[0] : '';
    var saat = new Date().getHours();
    var selam = saat < 11 ? 'Günaydın' : saat < 18 ? 'İyi günler' : 'İyi akşamlar';
    var hat = hatirlatmalar();
    // Kesime en yakın hayvan: kalan gün = (kesim kilosu − son kilo) / genel günlük artış.
    var yakin = null;
    aktifler().forEach(function (h) {
      var s = sonTartim(h), a = artis(h).genel;
      if (!(a > 0.1) || !(st.finalBw > s.kg)) return;
      var gun = Math.ceil((st.finalBw - s.kg) / a);
      if (!yakin || gun < yakin.gun) yakin = { h: h, gun: gun };
    });
    var kahraman = o.n
      ? '<section class="kahraman"><span class="etiket">' + selam + (ad ? ', ' + esc(ad) : '') + ' · ' + bugunKisa() + '</span>' +
        '<b class="buyuk">' + f0.format(o.n) + ' baş</b><span class="alt">Toplam ' + f1.format(o.top / 1000) + ' ton canlı ağırlık' +
        (yakin ? ' · kesime en yakın <b>' + esc(yakin.h.kupe) + '</b>, ~' + yakin.gun + ' gün' : '') + '</span>' +
        '<div class="ikili"><div><b>' + f0.format(o.ort) + ' kg</b><span>ortalama ağırlık</span></div>' +
        '<div><b>' + (o.artis !== null ? f2.format(o.artis) : '–') + ' kg</b><span>günlük artış</span></div>' +
        '<div><b>' + (son ? f0.format(son.maliyet) + ' ₺' : '–') + '</b><span>yem, baş/gün</span></div></div></section>'
      : '<section class="kahraman"><span class="etiket">' + selam + (ad ? ', ' + esc(ad) : '') + ' · ' + bugunKisa() + '</span>' +
        '<b class="buyuk">Besi Rasyon</b><span class="alt">Hayvanlarınızı ekleyin, tartımlarını girin; en ucuz dengeli rasyonu birlikte hesaplayalım.</span>' +
        '<button data-git="hayvan">🐂 İlk hayvanı ekle</button></section>';
    var k = function (sayfa, hedef, ikon, ad) {
      var h = !hedef ? '' : sayfa === 'rasyon' ? ' data-adimgit="' + hedef + '"' : ' data-hedef="' + hedef + '"';
      return '<button class="kisayol" data-git="' + sayfa + '"' + h + '><i aria-hidden="true">' + ikon + '</i>' + ad + '</button>';
    };
    $('sayfa-ana').innerHTML =
      kahraman +
      '<section class="card"><div class="izgara">' +
      k('rasyon', '', '🧮', 'Rasyon') +
      k('hayvan', '', '🐂', 'Hayvanlar') +
      k('hayvan', 'hvTopluAc', '⚖️', 'Tartım') +
      k('rasyon', 'yemler', '🏷️', 'Fiyatlar') +
      k('yemleme', '', '🥣', 'Yemleme') +
      k('kar', '', '💰', 'Kâr') +
      k('depo', '', '📦', 'Depo') +
      k('rasyon', 'kayit', '💾', 'Kayıtlar') +
      '</div></section>' +
      (hat.length ? '<section class="card"><h2>🔔 Hatırlatmalar</h2><ul class="hatir">' + hat.slice(0, 8).map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></section>' : '') +
      (son ? '<section class="card"><h2>🧾 Son hesaplanan rasyon</h2><p class="muted">' + new Date(son.t).toLocaleDateString('tr-TR') + ' · ' + f0.format(son.bw) + ' kg, ' + f1.format(son.adg) + ' kg/gün hedef, ' + f0.format(+son.heads || 0) + ' baş</p>' +
        '<table class="xl"><tbody>' + son.yemler.map(function (y) { return '<tr><td>' + esc(y[0]) + '</td><td class="n">' + (y[1] < 1 && (y[2] === 'mineral' || y[2] === 'npn') ? f0.format(y[1] * 1000) + ' g' : f1.format(y[1]) + ' kg') + '</td></tr>'; }).join('') + '</tbody></table>' +
        '<p>Hayvan başı günde <b>' + f2.format(son.maliyet) + ' TL</b>; 1 kg artış ' + f2.format(son.kg) + ' TL.</p>' +
        '<button class="sec genis" data-git="rasyon" data-adimgit="sonuc">Sonuca git</button></section>' : '') +
      '<section class="card yardim" id="yardim" hidden><h2>❓ Nasıl kullanılır?</h2><ol>' +
      '<li><b>Hayvanlar</b> sayfasından hayvanlarınızı küpe numarası ve giriş kilosuyla ekleyin; isterseniz fotoğrafını çekin.</li>' +
      '<li>Tartım günlerinde <b>Tartım</b> ile kiloları girin; program günlük artışı ve kesime kalan günü hesaplar.</li>' +
      '<li><b>Rasyon</b> sayfasında elinizdeki yemleri işaretleyip fiyatlarını yazın, <b>Rasyonu hesapla</b>ya basın.</li>' +
      '<li>Sonucu kaydedin, WhatsApp ile paylaşın ya da PDF olarak yazdırın.</li></ol></section>' +
      '<p class="muted ortala"><button class="link" data-yardim>❓ Nasıl kullanılır?</button> · <button class="link" data-git="takvim">📅 Takvim</button> · <button class="link" data-git="ayarlar">⚙️ Ayarlar</button></p>' +
      '<p class="muted ortala"><button class="link" data-git="beyan">Kullanım ve sorumluluk beyanı</button></p>';
    var y = document.querySelector('[data-yardim]');
    if (y) y.addEventListener('click', function () { $('yardim').hidden = !$('yardim').hidden; if (!$('yardim').hidden) $('yardim').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  function bugunKisa() { return new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }); }
  function gosterge(deger, ad) { return '<div><b>' + deger + '</b><span>' + ad + '</span></div>'; }

  // ---- Yem kütüphanesi ----
  var yemFiltre = { q: '', g: '' };
  function yemSayfa() {
    var gruplar = ['kaba', 'tahil', 'kuspe', 'yan', 'hazir', 'npn', 'mineral'];
    $('sayfa-yem').innerHTML = '<section class="card"><h2>Yem hammadde kütüphanesi</h2>' +
      '<p class="muted">Programdaki bütün yemlerin besin değerleri (kuru madde üzerinden). "Elimde var" işaretli yemler rasyon hesabında kullanılır. Kendi analiz sonucunuzu girerseniz o değer kullanılır.</p>' +
      '<input type="search" id="yemAra" placeholder="Yem ara (ör. arpa, küspe)" value="' + esc(yemFiltre.q) + '" aria-label="Yem ara">' +
      '<div class="cipler" id="yemGrup"><button data-g=""' + (yemFiltre.g ? '' : ' class="on"') + '>Tümü</button>' +
      gruplar.map(function (g) { return '<button data-g="' + g + '"' + (yemFiltre.g === g ? ' class="on"' : '') + '>' + GRUP_AD[g] + '</button>'; }).join('') + '</div>' +
      '<div id="yemListe"></div>' +
      '<p class="muted">Değerler ortalama tablo değerleridir (NRC). Yemin gerçek değeri hasada, depolamaya ve kaynağa göre değişir; mümkünse analiz yaptırın.</p></section>';
    $('yemAra').addEventListener('input', function () { yemFiltre.q = this.value; yemListe(); });
    $('yemGrup').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      yemFiltre.g = b.getAttribute('data-g');
      this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      yemListe();
    });
    yemListe();
  }
  function yemListe() {
    var st = A.durum(), q = yemFiltre.q.trim().toLocaleLowerCase('tr-TR');
    var l = A.yemler().filter(function (f) { return (!yemFiltre.g || f.grup === yemFiltre.g) && (!q || f.ad.toLocaleLowerCase('tr-TR').indexOf(q) >= 0); });
    var v = function (x, d, son) { return x === undefined || x === null || !isFinite(x) ? '–' : nf(d).format(x) + (son || ''); };
    $('yemListe').innerHTML = !l.length ? '<p class="muted">Aramaya uyan yem yok.</p>' : l.map(function (f) {
      var secili = st.secili.indexOf(f.id) >= 0, fiyat = st.fiyat[f.id] !== undefined ? st.fiyat[f.id] : f.fiyat;
      var hazir = f.grup === 'hazir' && !f.ozel;
      var kaynak = f.ozel ? 'sizin yeminiz' : f.analizli ? 'analiz değeri' : f.kmOlcum ? 'ölçülen kuru madde' : hazir ? 'torba etiketine göre' : 'tablo değeri';
      return '<article class="yemkart' + (secili ? ' secili' : '') + '">' +
        '<header><div><b>' + esc(f.ad) + '</b><small>' + GRUP_AD[f.grup] + ' · ' + kaynak + '</small></div>' +
        '<label class="check"><input type="checkbox" data-yemsec="' + f.id + '"' + (secili ? ' checked' : '') + '> Elimde var</label></header>' +
        '<dl class="degerler">' +
        '<div><dt>Kuru madde</dt><dd>' + v(f.km, 0, '%') + '</dd></div>' +
        '<div><dt>Ham protein</dt><dd>' + (hazir ? 'etiket' : v(f.hp, 1, '%')) + '</dd></div>' +
        '<div><dt>Enerji (ME)</dt><dd>' + (hazir ? 'etiket' : v(f.me, 2)) + '</dd></div>' +
        '<div><dt>NDF</dt><dd>' + v(f.ndf, 0, '%') + '</dd></div>' +
        '<div><dt>Nişasta</dt><dd>' + v(f.nisasta, 0, '%') + '</dd></div>' +
        '<div><dt>Yağ</dt><dd>' + v(f.yag, 1, '%') + '</dd></div>' +
        '<div><dt>Kalsiyum</dt><dd>' + v(f.ca, 2, '%') + '</dd></div>' +
        '<div><dt>Fosfor</dt><dd>' + v(f.p, 2, '%') + '</dd></div>' +
        '<div><dt>İşkembede yıkılan</dt><dd>' + (f.rdp !== undefined ? v(f.rdp * 100, 0, '%') : '–') + '</dd></div>' +
        '<div><dt>Rasyonda en fazla</dt><dd>' + v(f.max * 100, f.max < 0.05 ? 1 : 0, '%') + '</dd></div>' +
        '</dl>' +
        '<footer><span>Fiyat: <b>' + v(fiyat, 2) + ' TL/kg</b></span>' +
        (f.grup !== 'hazir' || f.ozel ? '<button class="link" data-analiz="' + f.id + '">Analiz değeri gir</button>' : '') + '</footer></article>';
    }).join('');
    $('yemListe').onclick = function (e) {
      var a = e.target.getAttribute('data-analiz');
      if (a) { git('rasyon', false, 'yemler'); A.analizAc(a); }
    };
    $('yemListe').onchange = function (e) {
      var id = e.target.getAttribute('data-yemsec');
      if (!id) return;
      A.secim(id, e.target.checked);
      e.target.closest('.yemkart').classList.toggle('secili', e.target.checked);
    };
  }

  // ---- Hayvan takibi ----
  var acikHayvan = null;
  function hayvanSayfa() {
    var st = A.durum(), o = ozet(), l = hayvanlar();
    var akt = l.filter(function (h) { return !h.cikis; }), cik = l.filter(function (h) { return h.cikis; });
    $('sayfa-hayvan').innerHTML =
      '<section class="card"><h2>Hayvan takibi</h2>' +
      '<div class="gostergeler">' +
      gosterge(f0.format(o.n || 0), 'besideki hayvan') +
      gosterge(o.n ? f0.format(o.ort) + ' kg' : '–', 'ortalama ağırlık') +
      gosterge(o.n && o.artis !== null ? f2.format(o.artis) + ' kg' : '–', 'ortalama günlük artış') +
      gosterge(o.n ? f1.format(o.top / 1000) + ' ton' : '–', 'toplam canlı ağırlık') + '</div>' +
      (o.n ? '<button class="main" id="hvRasyon">Bu ' + o.n + ' hayvan için rasyon hesapla (' + f0.format(Math.round(o.ort / 5) * 5) + ' kg)</button>' : '') +
      '<div class="dugmeler"><button class="sec" id="hvEkleAc">+ Hayvan ekle</button>' +
      (akt.length ? '<button class="sec" id="hvTopluAc">Toplu tartım</button>' : '') +
      (l.length ? '<button class="sec" id="hvKopyala">Listeyi kopyala (Excel)</button>' : '') + '</div>' +
      '<p class="muted" id="hvDurum" role="status"></p>' +
      '<div id="hvForm"></div></section>' +
      '<section class="card"><h2>Besideki hayvanlar (' + akt.length + ')' + (akt.length ? '<span class="secmeli kucuk" role="group" aria-label="Görünüm" id="hvGorunum">' +
        '<button data-deger="tablo" aria-pressed="' + (hvGor() === 'tablo') + '">▦ Tablo</button><button data-deger="kart" aria-pressed="' + (hvGor() === 'kart') + '">▤ Kart</button></span>' : '') + '</h2>' +
      (akt.length ? (hvGor() === 'tablo' ? hayvanTablo(akt) : '<div class="hvliste">' + akt.map(hayvanSatir).join('') + '</div>') :
        '<p class="muted">Henüz hayvan eklenmedi. "Hayvan ekle" ile küpe numarası, giriş tarihi ve giriş ağırlığını yazın; sonra tartımları girdikçe günlük artışı program hesaplar.</p>') + '</section>' +
      (cik.length ? '<details class="card"><summary>Besiden çıkanlar (' + cik.length + ')</summary><div class="hvliste">' + cik.map(hayvanSatir).join('') + '</div></details>' : '') +
      '<p class="muted ortala">Hayvan kayıtları yalnızca bu cihazda saklanır. Kesim kilosu ve hedef artış Rasyon sayfasındaki değerlerdir (' + f0.format(st.finalBw) + ' kg, ' + f1.format(st.adg) + ' kg/gün).</p>';
    if ($('hvRasyon')) $('hvRasyon').addEventListener('click', function () {
      git('rasyon', true, 'sonuc');
      A.hesapla({ bw: Math.round(o.ort / 5) * 5, heads: o.n });
    });
    $('hvEkleAc').addEventListener('click', hayvanFormu);
    if ($('hvTopluAc')) $('hvTopluAc').addEventListener('click', topluTartim);
    if ($('hvKopyala')) $('hvKopyala').addEventListener('click', function () {
      var satir = ['Küpe no\tAd/not\tIrk\tCinsiyet\tDoğum\tRenk\tNereden\tBölme\tGiriş tarihi\tGiriş kg\tSon tartım\tSon kg\tGünlük artış (son dönem)\tGünlük artış (genel)\tDurum\tNot'];
      hayvanlar().forEach(function (h) {
        var s = sonTartim(h), a = artis(h);
        satir.push([h.kupe, h.ad || '', irkAd(h.irk), CINS_AD[h.cinsiyet] || '', tarih(h.dogum), h.renk || '', h.kaynak || '', h.bolme || '', tarih(h.giris), h.girisKg, tarih(s.t), s.kg,
          a.donem !== null ? f2.format(a.donem) : '', a.genel !== null ? f2.format(a.genel) : '', h.cikis ? 'Çıktı ' + tarih(h.cikis.t) : 'Besi', h.not || ''].join('\t'));
      });
      kopyala(satir.join('\n'), $('hvDurum'), 'Liste kopyalandı; Excel\'e yapıştırabilirsiniz.');
    });
    document.querySelectorAll('.hvsatir').forEach(function (el) { el.addEventListener('click', hayvanTik); });
    if ($('hvGorunum')) $('hvGorunum').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-deger]'); if (!b) return;
      yaz('besiRasyon.hvGorunum', b.getAttribute('data-deger')); hayvanSayfa();
    });
    var tb = document.querySelector('#sayfa-hayvan .hvtab');
    if (tb) tb.addEventListener('click', function (e) {
      var th = e.target.closest('th[data-sira]');
      if (th) { var k = th.getAttribute('data-sira'); hvSira = { k: k, yon: hvSira.k === k ? -hvSira.yon : 1 }; hayvanSayfa(); return; }
      var tr = e.target.closest('tr[data-hv]');
      if (tr) { acikHayvan = acikHayvan === tr.getAttribute('data-hv') ? null : tr.getAttribute('data-hv'); hayvanSayfa(); if (acikHayvan && $('hvSecili')) $('hvSecili').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
    fotolariYukle($('sayfa-hayvan'));
  }
  // Hayvan listesi Excel gibi tablo: başlığa dokununca o sütuna göre sıralanır, satıra dokununca ayrıntı açılır.
  var hvSira = { k: 'kupe', yon: 1 };
  function hvGor() { return oku('besiRasyon.hvGorunum', 'tablo') === 'kart' ? 'kart' : 'tablo'; }
  function hayvanTablo(akt) {
    var st = A.durum();
    var satir = akt.map(function (h) {
      var s = sonTartim(h), a = artis(h);
      return { h: h, kupe: h.kupe, bolme: h.bolme || '', kg: s.kg, artis: a.genel, donem: a.donem,
        kalan: a.genel > 0.1 && st.finalBw > s.kg ? Math.ceil((st.finalBw - s.kg) / a.genel) : (st.finalBw && s.kg >= st.finalBw ? 0 : null) };
    });
    var k = hvSira.k, y = hvSira.yon;
    satir.sort(function (a, b) {
      var x = a[k], z = b[k];
      if (x === null || x === undefined || x === '') return 1;
      if (z === null || z === undefined || z === '') return -1;
      return (typeof x === 'string' ? x.localeCompare(z, 'tr', { numeric: true }) : x - z) * y;
    });
    var bas = function (anah, ad, n) { return '<th scope="col"' + (n ? ' class="n"' : '') + ' data-sira="' + anah + '" aria-sort="' + (k === anah ? (y > 0 ? 'ascending' : 'descending') : 'none') + '">' + ad + (k === anah ? (y > 0 ? ' ▲' : ' ▼') : '') + '</th>'; };
    var sec = acikHayvan && akt.filter(function (h) { return h.id === acikHayvan; })[0];
    var topKg = satir.reduce(function (a, x) { return a + x.kg; }, 0);
    return '<div class="scroll"><table class="xl hvtab"><thead><tr>' + bas('kupe', 'Küpe') + bas('bolme', 'Bölme') + bas('kg', 'Son kg', 1) + bas('artis', 'Artış<small>kg/gün</small>', 1) + bas('kalan', 'Kesime<small>gün</small>', 1) + '</tr></thead><tbody>' +
      satir.map(function (x) {
        var dusuk = x.donem !== null && st.adg && x.donem < st.adg * 0.7;
        return '<tr data-hv="' + esc(x.h.id) + '"' + (acikHayvan === x.h.id ? ' class="secili"' : '') + '><td class="ad"><b>' + esc(x.kupe) + '</b>' + (x.h.ad ? '<small>' + esc(x.h.ad) + '</small>' : '') + '</td>' +
          '<td>' + esc(x.bolme || '–') + '</td><td class="n">' + f0.format(x.kg) + '</td>' +
          '<td class="n' + (dusuk ? ' hk low' : '') + '">' + (x.artis !== null ? f2.format(x.artis) : '–') + '</td>' +
          '<td class="n' + (x.kalan === 0 ? ' hk good' : '') + '">' + (x.kalan === null ? '–' : x.kalan === 0 ? 'hazır' : x.kalan) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><th scope="row">' + satir.length + ' baş</th><th></th><th class="n">' + f0.format(topKg / Math.max(1, satir.length)) + '</th><th class="n" colspan="2">ortalama kg</th></tr></tfoot></table></div>' +
      '<p class="muted kisa">Başlığa dokunun: sıralar. Satıra dokunun: tartım, sağlık ve fotoğraf.</p>' +
      (sec ? '<div id="hvSecili" class="hvliste">' + hayvanSatir(sec) + '</div>' : '');
  }
  function irkAd(id) { var x = M.IRKLAR.filter(function (r) { return r.id === id; })[0]; return x ? x.ad.replace(/ \(.*\)/, '') : ''; }
  function hayvanSatir(h) {
    var st = A.durum(), s = sonTartim(h), a = artis(h), gun = gunFark(h.giris, h.cikis ? h.cikis.t : bugunIso());
    var dusuk = !h.cikis && a.donem !== null && st.adg && a.donem < st.adg * 0.7;
    var kalan = !h.cikis && a.genel > 0.1 && st.finalBw > s.kg ? Math.ceil((st.finalBw - s.kg) / a.genel) : null;
    var ac = acikHayvan === h.id;
    return '<article class="hvsatir' + (ac ? ' acik' : '') + '" data-hv="' + esc(h.id) + '">' +
      '<div class="hvust"><div class="sol"><span class="hvfoto" data-foto="' + esc(h.id) + '" aria-label="' + esc(h.kupe) + ' fotoğrafı">🐂</span><div><b>' + esc(h.kupe) + '</b>' + (h.ad ? ' <span class="muted">' + esc(h.ad) + '</span>' : '') +
      '<small>' + [irkAd(h.irk), CINS_AD[h.cinsiyet], h.bolme ? 'bölme ' + esc(h.bolme) : '', gun + ' gündür besi'].filter(Boolean).join(' · ') + '</small></div></div>' +
      '<div class="hvkg"><b>' + f0.format(s.kg) + ' kg</b><small>' + tarih(s.t) + '</small></div></div>' +
      '<div class="hvalt">' +
      '<span' + (dusuk ? ' class="uyar"' : '') + '>Son dönem: <b>' + (a.donem !== null ? f2.format(a.donem) + ' kg/gün' : '–') + '</b></span>' +
      '<span>Genel: <b>' + (a.genel !== null ? f2.format(a.genel) + ' kg/gün' : '–') + '</b></span>' +
      (h.cikis ? '<span>Çıkış: <b>' + tarih(h.cikis.t) + (h.cikis.kg ? ', ' + f0.format(h.cikis.kg) + ' kg' : '') + '</b></span>' :
        kalan !== null ? '<span>Kesime: <b>~' + kalan + ' gün</b></span>' : st.finalBw && s.kg >= st.finalBw ? '<span class="iyi">Kesim kilosunda</span>' : '') +
      '</div>' + (ac ? hayvanDetay(h) : '') + '</article>';
  }
  function cizgi(h) {
    var t = tartimlar(h);
    if (t.length < 2) return '';
    var x0 = new Date(t[0].t), x1 = new Date(t[t.length - 1].t), span = Math.max(1, x1 - x0);
    var ys = t.map(function (p) { return p.kg; }), mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys), dy = Math.max(1, mx - mn);
    var W = 300, H = 90, P = 8;
    var pts = t.map(function (p) { return [P + (new Date(p.t) - x0) / span * (W - 2 * P), H - P - (p.kg - mn) / dy * (H - 2 * P)]; });
    return '<svg class="cizgi" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ağırlık grafiği: ' + f0.format(mn) + ' kg\'dan ' + f0.format(mx) + ' kg\'a">' +
      '<polyline points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>' +
      pts.map(function (p) { return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3"/>'; }).join('') + '</svg>';
  }
  function hayvanDetay(h) {
    var t = tartimlar(h);
    var bilgi = [['Doğum tarihi', h.dogum ? tarih(h.dogum) + ' (' + Math.floor(gunFark(h.dogum, bugunIso()) / 30.4) + ' aylık)' : ''], ['Renk / eşkal', h.renk], ['Nereden alındı', h.kaynak],
      ['Bölme / padok', h.bolme], ['Giriş', tarih(h.giris) + ', ' + f0.format(h.girisKg) + ' kg' + (h.alis ? ', ' + f0.format(h.alis) + ' TL/kg' : '')], ['Not', h.not]].filter(function (x) { return x[1]; });
    var sag = (h.saglik || []).slice().sort(function (a, b) { return a.t < b.t ? 1 : -1; });
    return '<div class="hvdetay" data-detay>' +
      '<span class="hvbuyukfoto" data-foto="' + esc(h.id) + '" hidden></span>' +
      (bilgi.length ? '<table class="xl"><tbody>' + bilgi.map(function (x) { return '<tr><td class="muted">' + x[0] + '</td><td>' + esc(x[1]) + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
      cizgi(h) +
      '<table class="xl"><thead><tr><th>Tarih</th><th class="n">Ağırlık</th><th class="n">Günlük artış</th><th></th></tr></thead><tbody>' +
      t.map(function (p, i) {
        var once = t[i - 1], g = once ? gunFark(once.t, p.t) : 0;
        return '<tr><td>' + tarih(p.t) + (p.giris ? ' <small class="muted">giriş</small>' : '') + '</td><td class="n">' + f0.format(p.kg) + ' kg</td>' +
          '<td class="n">' + (once && g > 0 ? f2.format((p.kg - once.kg) / g) : '–') + '</td>' +
          '<td class="n">' + (p.giris ? '' : '<button class="link sil" data-tsil="' + esc(p.t) + '">Sil</button>') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      (h.cikis ? '' : '<div class="alanlar ince"><label class="field"><span>Tarih</span><input type="date" id="tdTarih" value="' + bugunIso() + '"></label>' +
        '<label class="field"><span>Ağırlık (kg)</span><input type="number" inputmode="decimal" id="tdKg" min="30" max="1500" step="1"></label>' +
        '<label class="field genis"><span>Satış fiyatı (TL/kg canlı; çıkışta)</span><input type="number" inputmode="decimal" id="tdFiyat" min="0" step="1"></label></div>' +
        '<div class="dugmeler"><button class="sec" data-islem="tartim">Tartımı ekle</button><button class="sec" data-islem="cikis">Besiden çıkar (satıldı / kesildi)</button></div>') +
      '<div class="saglik"><h4>💉 Sağlık ve aşı kayıtları</h4>' +
      (sag.length ? '<table class="xl"><tbody>' + sag.map(function (x, i) {
        return '<tr><td>' + tarih(x.t) + '</td><td><b>' + esc(x.tur) + '</b>' + (x.not ? '<small class="lim">' + esc(x.not) + '</small>' : '') +
          (x.tekrar ? '<small class="lim">Tekrar: ' + tarih(x.tekrar) + '</small>' : '') + '</td><td class="n">' + (x.tutar ? f0.format(x.tutar) + ' TL<br>' : '') + '<button class="link sil" data-ssil="' + esc(x.k) + '">Sil</button></td></tr>';
      }).join('') + '</tbody></table>' : '<p class="muted">Kayıt yok.</p>') +
      '<div class="alanlar ince"><label class="field"><span>Tarih</span><input type="date" id="sgTarih" value="' + bugunIso() + '"></label>' +
      '<label class="field"><span>İşlem</span><select id="sgTur">' + ISLEM_TUR.map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</select></label>' +
      '<label class="field genis"><span>Açıklama (ilaç adı, doz…)</span><input type="text" id="sgNot" maxlength="80"></label>' +
      '<label class="field"><span>Tekrar tarihi (varsa)</span><input type="date" id="sgTekrar"></label>' +
      '<label class="field"><span>Masraf (TL, varsa)</span><input type="number" inputmode="decimal" id="sgTutar" min="0" step="1"></label></div>' +
      '<div class="dugmeler"><button class="sec" data-islem="saglik">Kaydı ekle</button></div></div>' +
      karKutusu(h) +
      '<div class="dugmeler"><button class="sec" data-islem="duzenle">Bilgileri düzenle</button><button class="sec sil" data-islem="sil">Hayvanı sil</button></div>' +
      '<p class="muted" data-mesaj role="status"></p></div>';
  }
  function hayvanTik(e) {
    var art = e.currentTarget, id = art.getAttribute('data-hv');
    var detay = e.target.closest('[data-detay]');
    if (!detay) { acikHayvan = acikHayvan === id ? null : id; hayvanSayfa(); return; }
    var l = hayvanlar(), h = l.filter(function (x) { return x.id === id; })[0];
    if (!h) return;
    var mesaj = art.querySelector('[data-mesaj]');
    var ss = e.target.getAttribute('data-ssil');
    if (ss) { h.saglik = (h.saglik || []).filter(function (x) { return x.k !== ss; }); hayvanKaydet(l); hayvanSayfa(); return; }
    var ts = e.target.getAttribute('data-tsil');
    if (ts) { h.tartim = (h.tartim || []).filter(function (p) { return p.t !== ts; }); hayvanKaydet(l); hayvanSayfa(); return; }
    var islem = e.target.getAttribute('data-islem');
    if (islem === 'saglik') {
      var st2 = art.querySelector('#sgTarih').value;
      if (!st2) { mesaj.textContent = 'Tarihi seçin.'; return; }
      var tutar = num(art.querySelector('#sgTutar').value);
      h.saglik = (h.saglik || []).concat([{ k: 's' + Date.now().toString(36), t: st2, tur: art.querySelector('#sgTur').value, not: art.querySelector('#sgNot').value.trim(),
        tekrar: art.querySelector('#sgTekrar').value || null, tutar: tutar > 0 ? tutar : null }]);
      hayvanKaydet(l); hayvanSayfa(); return;
    }
    if (islem === 'tartim' || islem === 'cikis') {
      var t = art.querySelector('#tdTarih').value, kg = num(art.querySelector('#tdKg').value);
      if (!t) { mesaj.textContent = 'Tarihi seçin.'; return; }
      if (t < h.giris) { mesaj.textContent = 'Tarih, giriş tarihinden (' + tarih(h.giris) + ') önce olamaz.'; return; }
      if (islem === 'tartim') {
        if (!(kg >= 30 && kg <= 1500)) { mesaj.textContent = 'Ağırlığı 30–1500 kg arasında yazın.'; return; }
        h.tartim = (h.tartim || []).filter(function (p) { return p.t !== t; }).concat([{ t: t, kg: kg }]);
      } else {
        if (!e.target.classList.contains('onay')) { e.target.classList.add('onay'); e.target.textContent = 'Emin misiniz? Bir daha dokunun'; return; }
        var sf = num(art.querySelector('#tdFiyat').value);
        h.cikis = { t: t, kg: kg >= 30 ? kg : null, fiyat: sf > 0 ? sf : null };
        if (kg >= 30) h.tartim = (h.tartim || []).filter(function (p) { return p.t !== t; }).concat([{ t: t, kg: kg }]);
        acikHayvan = null;
      }
      hayvanKaydet(l); hayvanSayfa(); return;
    }
    if (islem === 'sil') {
      if (!e.target.classList.contains('onay')) { e.target.classList.add('onay'); e.target.textContent = 'Emin misiniz? Tüm tartımları silinir'; return; }
      hayvanKaydet(l.filter(function (x) { return x.id !== id; })); Foto.sil(id); acikHayvan = null; hayvanSayfa(); return;
    }
    if (islem === 'duzenle') { hayvanFormu(h); $('hvForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  function hayvanFormu(duz) {
    duz = duz && duz.id ? duz : null;
    var st = A.durum();
    var irk = M.IRKLAR.map(function (r) { return '<option value="' + r.id + '"' + ((duz ? duz.irk : st.irk) === r.id ? ' selected' : '') + '>' + esc(r.ad) + '</option>'; }).join('');
    var cins = Object.keys(CINS_AD).map(function (k) { return '<option value="' + k + '"' + ((duz ? duz.cinsiyet : st.cinsiyet || 'tosun') === k ? ' selected' : '') + '>' + CINS_AD[k] + '</option>'; }).join('');
    var foto = null, fotoDegisti = false;
    $('hvForm').innerHTML = '<div class="hvformkutu"><h3>' + (duz ? esc(duz.kupe) + ': bilgileri düzenle' : 'Yeni hayvan') + '</h3>' +
      '<div class="fotokutu"><span class="bos" id="hfOnizle">🐂</span><div><label class="fotobtn">📷 Fotoğraf çek / seç<input type="file" id="hfFoto" accept="image/*" capture="environment"></label>' +
      '<br><button class="link" id="hfFotoSil" hidden>Fotoğrafı kaldır</button><p class="muted" id="hfFotoDurum"></p></div></div>' +
      '<div class="alanlar">' +
      '<label class="field"><span>Küpe numarası</span><input type="text" id="hfKupe" maxlength="20" value="' + esc(duz ? duz.kupe : '') + '"></label>' +
      '<label class="field"><span>Ad / not (isteğe bağlı)</span><input type="text" id="hfAd" maxlength="40" value="' + esc(duz ? duz.ad : '') + '"></label>' +
      '<label class="field"><span>Irk</span><select id="hfIrk">' + irk + '</select></label>' +
      '<label class="field"><span>Cinsiyet</span><select id="hfCins">' + cins + '</select></label>' +
      '<label class="field"><span>Giriş tarihi</span><input type="date" id="hfGiris" value="' + (duz ? duz.giris : bugunIso()) + '"></label>' +
      '<label class="field"><span>Giriş ağırlığı (kg)</span><input type="number" inputmode="decimal" id="hfKg" min="30" max="1500" step="1" value="' + (duz ? duz.girisKg : '') + '"></label>' +
      '<label class="field"><span>Alış fiyatı (TL/kg, isteğe bağlı)</span><input type="number" inputmode="decimal" id="hfAlis" min="0" step="1" value="' + (duz && duz.alis ? duz.alis : '') + '"></label>' +
      '<label class="field"><span>Doğum tarihi (isteğe bağlı)</span><input type="date" id="hfDogum" value="' + esc(duz && duz.dogum || '') + '"></label>' +
      '<label class="field"><span>Renk / eşkal</span><input type="text" id="hfRenk" maxlength="40" value="' + esc(duz && duz.renk || '') + '"></label>' +
      '<label class="field"><span>Nereden alındı (pazar, satıcı)</span><input type="text" id="hfKaynak" maxlength="60" value="' + esc(duz && duz.kaynak || '') + '"></label>' +
      '<label class="field"><span>Bölme / padok</span><input type="text" id="hfBolme" maxlength="20" value="' + esc(duz && duz.bolme || '') + '"></label>' +
      '<label class="field genis"><span>Not</span><input type="text" id="hfNot" maxlength="120" value="' + esc(duz && duz.not || '') + '"></label>' +
      '</div><div class="dugmeler"><button class="main" id="hfKaydet">' + (duz ? 'Kaydet' : 'Hayvanı ekle') + '</button><button class="sec" id="hfIptal">Vazgeç</button></div>' +
      '<p class="muted" id="hfDurum" role="status"></p></div>';
    var onizle = function (v) {
      var yer = $('hfOnizle');
      if (v) { var img = document.createElement('img'); img.id = 'hfOnizle'; img.alt = 'Hayvan fotoğrafı'; img.src = v; yer.replaceWith(img); }
      else { var b = document.createElement('span'); b.className = 'bos'; b.id = 'hfOnizle'; b.textContent = '🐂'; yer.replaceWith(b); }
      $('hfFotoSil').hidden = !v;
    };
    if (duz) Foto.al(duz.id).then(function (v) { if (v && !fotoDegisti) { foto = v; onizle(v); } });
    $('hfFoto').addEventListener('change', function () {
      var d = this.files && this.files[0];
      if (!d) return;
      $('hfFotoDurum').textContent = 'Hazırlanıyor…';
      fotoKucult(d).then(function (v) { foto = v; fotoDegisti = true; onizle(v); $('hfFotoDurum').textContent = ''; },
        function () { $('hfFotoDurum').textContent = 'Fotoğraf okunamadı.'; });
    });
    $('hfFotoSil').addEventListener('click', function () { foto = null; fotoDegisti = true; onizle(null); });
    $('hfIptal').addEventListener('click', function () { $('hvForm').innerHTML = ''; });
    $('hfKaydet').addEventListener('click', function () {
      var kupe = $('hfKupe').value.trim(), kg = num($('hfKg').value), giris = $('hfGiris').value, d = $('hfDurum');
      var l = hayvanlar();
      if (!kupe) { d.textContent = 'Küpe numarasını yazın.'; return; }
      if (l.some(function (x) { return x.kupe.toLocaleLowerCase('tr-TR') === kupe.toLocaleLowerCase('tr-TR') && (!duz || x.id !== duz.id) && !x.cikis; })) { d.textContent = 'Bu küpe numarası zaten besideki bir hayvanda var.'; return; }
      if (!giris) { d.textContent = 'Giriş tarihini seçin.'; return; }
      if (!(kg >= 30 && kg <= 1500)) { d.textContent = 'Giriş ağırlığını 30–1500 kg arasında yazın.'; return; }
      var alis = num($('hfAlis').value);
      var kayit = { kupe: kupe, ad: $('hfAd').value.trim(), irk: $('hfIrk').value, cinsiyet: $('hfCins').value, giris: giris, girisKg: kg, alis: alis > 0 ? alis : null,
        dogum: $('hfDogum').value || null, renk: $('hfRenk').value.trim(), kaynak: $('hfKaynak').value.trim(), bolme: $('hfBolme').value.trim(), not: $('hfNot').value.trim() };
      if (duz) {
        l.forEach(function (x) { if (x.id === duz.id) Object.keys(kayit).forEach(function (k) { x[k] = kayit[k]; }); });
      } else {
        kayit.id = 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); kayit.tartim = [];
        l.push(kayit);
      }
      if (!hayvanKaydet(l)) { d.textContent = 'Kaydedilemedi: cihazda yer kalmamış olabilir.'; return; }
      var hid = duz ? duz.id : kayit.id;
      if (fotoDegisti) (foto ? Foto.koy(hid, foto) : Foto.sil(hid)).catch(function () { $('hvDurum').textContent = 'Fotoğraf kaydedilemedi.'; }).then(function () { fotolariYukle(); });
      hayvanSayfa();
      $('hvDurum').textContent = duz ? kupe + ' güncellendi.' : kupe + ' eklendi.';
    });
  }
  function topluTartim() {
    var akt = aktifler();
    $('hvForm').innerHTML = '<div class="hvformkutu"><h3>Toplu tartım</h3><p class="muted">Tartım günü bütün hayvanların kilosunu tek seferde yazın; boş bırakılanlar kaydedilmez. Enter alttaki hayvana geçer; Excel\'deki kilo sütununu yapıştırabilirsiniz.</p>' +
      '<label class="field"><span>Tartım tarihi</span><input type="date" id="ttTarih" value="' + bugunIso() + '"></label>' +
      '<table class="xl"><colgroup><col><col class="c-sayi"><col class="c-sayi2"></colgroup><thead><tr><th scope="col">Küpe</th><th class="n" scope="col">Son kg</th><th class="n" scope="col">Bugün kg</th></tr></thead><tbody>' + akt.map(function (h) {
        var s = sonTartim(h);
        return '<tr><td class="ad"><b>' + esc(h.kupe) + '</b><small>' + tarih(s.t) + (h.bolme ? ' · bölme ' + esc(h.bolme) : '') + '</small></td><td class="n">' + f0.format(s.kg) + '</td>' +
          '<td><input type="number" inputmode="decimal" enterkeyhint="next" min="30" max="1500" step="1" data-tt="' + esc(h.id) + '" aria-label="' + esc(h.kupe) + ' ağırlık"></td></tr>';
      }).join('') + '</tbody></table>' +
      '<div class="dugmeler"><button class="main" id="ttKaydet">Tartımları kaydet</button><button class="sec" id="ttIptal">Vazgeç</button></div><p class="muted" id="ttDurum" role="status"></p></div>';
    $('ttIptal').addEventListener('click', function () { $('hvForm').innerHTML = ''; });
    $('ttKaydet').addEventListener('click', function () {
      var t = $('ttTarih').value, l = hayvanlar(), n = 0, hata = [];
      if (!t) { $('ttDurum').textContent = 'Tarihi seçin.'; return; }
      document.querySelectorAll('[data-tt]').forEach(function (inp) {
        var kg = num(inp.value); if (!inp.value) return;
        var h = l.filter(function (x) { return x.id === inp.getAttribute('data-tt'); })[0];
        if (!(kg >= 30 && kg <= 1500) || t < h.giris) { hata.push(h.kupe); return; }
        h.tartim = (h.tartim || []).filter(function (p) { return p.t !== t; }).concat([{ t: t, kg: kg }]); n++;
      });
      if (hata.length) { $('ttDurum').textContent = 'Şunlar kaydedilmedi (kilo 30–1500 olmalı, tarih girişten önce olamaz): ' + hata.join(', '); return; }
      hayvanKaydet(l); hayvanSayfa();
      $('hvDurum').textContent = n + ' hayvanın tartımı kaydedildi.';
    });
  }

  // ---- Sorumluluk beyanı (okuma) ----
  function beyanSayfa() {
    var L = window.BesiLisans, b = L && L.beyanKaydi();
    $('sayfa-beyan').innerHTML = '<section class="card"><h2>Kullanım ve sorumluluk beyanı</h2>' +
      (b ? '<div class="msg info">' + esc(b.ad) + ' tarafından ' + L.zamanYaz(b.tarih) + ' tarihinde kabul edildi' + (b.gonderildi ? '; yöneticiye e-postayla iletildi.' : '; e-posta internet bağlantısı olunca gönderilecek.') + '</div>'
        : L && L.yonetici() ? '<div class="msg info">Yönetici olarak açık.</div>' : '') +
      '<div class="beyanmetin acik">' + (L ? L.beyanMetniHtml() : '') + '</div>' +
      '<button class="sec genis" data-git="ana">Ana sayfaya dön</button></section>';
  }


  // ---- Kâr defteri: hayvan başı gelir-gider ----
  // Yem masrafı tahminidir: hayvanın bölmesine atanmış rasyonun (yoksa son hesaplanan rasyonun)
  // baş/gün maliyeti × besideki gün.
  function rasyonMaliyeti(h) {
    var at = oku('besiRasyon.yemleme', {}), kay = A.kayitlar(), id = at[h.bolme || '_'] || at._;
    var k = kay.filter(function (x) { return x.id === id; })[0];
    if (k && k.out && k.out.sonuc) return { tl: k.out.sonuc.gunlukMaliyet, kaynak: k.ad };
    var son = oku('besiRasyon.sonHesap', null);
    return son ? { tl: son.maliyet, kaynak: 'son hesaplanan rasyon' } : { tl: 0, kaynak: null };
  }
  function karHesap(h) {
    var st = A.durum(), s = sonTartim(h), son = h.cikis ? h.cikis.t : bugunIso(), gun = Math.max(0, gunFark(h.giris, son));
    var rm = rasyonMaliyeti(h);
    var alis = h.alis ? h.alis * h.girisKg : 0, yem = rm.tl * gun;
    var saglik = (h.saglik || []).reduce(function (a, x) { return a + (x.tutar || 0); }, 0);
    var satisFiyat = h.cikis && h.cikis.fiyat ? h.cikis.fiyat : st.satis > 0 ? st.satis : 0;
    var kg = h.cikis && h.cikis.kg ? h.cikis.kg : s.kg;
    var gelir = satisFiyat * kg;
    return { gun: gun, alis: alis, yem: yem, saglik: saglik, gelir: gelir, kar: gelir - alis - yem - saglik, satildi: !!(h.cikis && h.cikis.fiyat), fiyat: satisFiyat, kg: kg, rm: rm };
  }
  function tl(x) { return (x < 0 ? '−' : '') + f0.format(Math.abs(x)) + ' TL'; }
  function karKutusu(h) {
    var k = karHesap(h);
    if (!k.fiyat) return '<div class="saglik"><h4>💰 Kâr</h4><p class="muted">Kârı görmek için Rasyon sayfasında satış fiyatını yazın ya da çıkışta satış fiyatını girin.</p></div>';
    return '<div class="saglik"><h4>💰 Kâr ' + (k.satildi ? '(satıldı)' : '(bugün satılsa, tahmini)') + '</h4><table class="xl"><tbody>' +
      '<tr><td>Satış: ' + f0.format(k.kg) + ' kg × ' + f0.format(k.fiyat) + ' TL</td><td class="n">' + tl(k.gelir) + '</td></tr>' +
      '<tr><td>Alış' + (h.alis ? '' : ' (alış fiyatı girilmedi)') + '</td><td class="n">−' + tl(k.alis) + '</td></tr>' +
      '<tr><td>Yem: ' + k.gun + ' gün × ' + f0.format(k.rm.tl) + ' TL' + (k.rm.kaynak ? '<small class="lim">' + esc(k.rm.kaynak) + '</small>' : '') + '</td><td class="n">−' + tl(k.yem) + '</td></tr>' +
      '<tr><td>Sağlık masrafları</td><td class="n">−' + tl(k.saglik) + '</td></tr>' +
      '<tr><th>' + (k.kar >= 0 ? 'Kâr' : 'Zarar') + '</th><th class="n">' + tl(k.kar) + '</th></tr></tbody></table></div>';
  }
  function karSayfa() {
    var l = hayvanlar(), st = A.durum();
    var satir = l.map(function (h) { return { h: h, k: karHesap(h) }; });
    // Fiyatı bilinmeyen (satış fiyatı girilmemiş) hayvanların kârı toplama katılmaz; yoksa geliri 0 sayılıp zarar görünür.
    var top = satir.reduce(function (a, x) { a.gelir += x.k.gelir; a.alis += x.k.alis; a.yem += x.k.yem; a.saglik += x.k.saglik; if (x.k.fiyat) a.kar += x.k.kar; else a.fiyatsiz++; return a; }, { gelir: 0, alis: 0, yem: 0, saglik: 0, kar: 0, fiyatsiz: 0 });
    var aylar = {};
    l.forEach(function (h) { (h.saglik || []).forEach(function (x) { if (x.tutar) { var m = x.t.slice(0, 7); aylar[m] = (aylar[m] || 0) + x.tutar; } }); });
    $('sayfa-kar').innerHTML = sayfaBas('💰', 'Kâr defteri', 'Hayvan başı satış, alış, yem ve sağlık masrafları.') +
      (!l.length ? '<section class="card"><p class="muted">Henüz hayvan yok. Hayvan ekleyip alış fiyatını, sağlık masraflarını ve çıkışta satış fiyatını girince kâr burada görünür.</p><button class="main" data-git="hayvan">Hayvan ekle</button></section>' :
      '<section class="kahraman"><span class="etiket">Sürü toplamı · ' + l.length + ' hayvan</span><b class="buyuk">' + tl(top.kar) + '</b><span class="alt">' + (top.kar >= 0 ? 'kâr' : 'zarar') + (st.satis > 0 ? ' · besideki hayvanlar ' + f0.format(st.satis) + ' TL/kg ile değerlendi' : '') + (top.fiyatsiz ? ' · satış fiyatı olmayan ' + top.fiyatsiz + ' hayvan kâra katılmadı (Rasyon › Ayarlar\'da satış fiyatını yazın)' : '') + '</span>' +
      '<div class="ikili"><div><b>' + f0.format(top.gelir / 1000) + ' bin</b><span>satış değeri</span></div><div><b>' + f0.format((top.alis + top.yem + top.saglik) / 1000) + ' bin</b><span>toplam gider</span></div><div><b>' + f0.format(top.yem / 1000) + ' bin</b><span>yem</span></div></div></section>' +
      '<section class="card"><h2>Hayvanlar</h2><div class="scroll"><table class="xl"><thead><tr><th>Küpe</th><th class="n">Gün</th><th class="n">Gider</th><th class="n">Kâr</th></tr></thead><tbody>' +
      satir.map(function (x) { return '<tr><td><b>' + esc(x.h.kupe) + '</b>' + (x.h.cikis ? '<small class="lim">' + (x.k.satildi ? 'satıldı' : 'çıktı') + '</small>' : '') + '</td><td class="n">' + x.k.gun + '</td><td class="n">' + tl(x.k.alis + x.k.yem + x.k.saglik) + '</td><td class="n" style="color:' + (x.k.kar >= 0 ? 'inherit' : 'var(--bad)') + '">' + (x.k.fiyat ? tl(x.k.kar) : '–') + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><th scope="row">Toplam</th><th></th><th class="n">' + tl(top.alis + top.yem + top.saglik) + '</th><th class="n">' + tl(top.kar) + '</th></tr></tfoot></table></div><p class="muted ipucu">Yem masrafı tahminidir: hayvanın bölmesine Yemleme sayfasında atanan rasyonun (yoksa son hesaplanan rasyonun) baş/gün maliyeti × besideki gün. Satılmayan hayvanlar Rasyon sayfasındaki satış fiyatıyla bugün satılmış gibi hesaplanır.</p></section>' +
      (Object.keys(aylar).length ? '<section class="card"><h2>Aylara göre sağlık masrafı</h2><table class="xl"><tbody>' + Object.keys(aylar).sort().reverse().map(function (m) { return '<tr><td>' + new Date(m + '-01T00:00:00').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) + '</td><td class="n">' + tl(aylar[m]) + '</td></tr>'; }).join('') + '</tbody></table></section>' : ''));
  }

  // ---- Bugünkü yemleme: bölmelere göre günlük yem ve karıştırma sırası ----
  // Karıştırma sırası: önce kuru kaba yem, sonra tahıl ve küspeler, mineraller ve katkılar, en son yaş yemler (silaj, posa).
  var SIRA = { kaba: 1, tahil: 2, kuspe: 3, yan: 3, hazir: 2, npn: 4, mineral: 4, katki: 4 };
  function yemlemePlani() {
    var at = oku('besiRasyon.yemleme', {}), kay = A.kayitlar(), akt = aktifler(), st = A.durum();
    var gruplar = {};
    akt.forEach(function (h) { var b = h.bolme || '_'; gruplar[b] = (gruplar[b] || 0) + 1; });
    if (!akt.length) gruplar._ = st.heads || 1;
    return Object.keys(gruplar).sort().map(function (b) {
      var k = kay.filter(function (x) { return x.id === (at[b] || at._); })[0];
      return { bolme: b, ad: b === '_' ? (akt.length ? 'Bölmesiz' : 'Sürü') : 'Bölme ' + b, n: gruplar[b], kayit: k };
    });
  }
  function yemlemeSayfa() {
    var plan = yemlemePlani(), kay = A.kayitlar(), toplam = {};
    var html = plan.map(function (g) {
      var sec = '<select data-bolme="' + esc(g.bolme) + '"><option value="">Rasyon seçin</option>' + kay.map(function (k) { return '<option value="' + esc(k.id) + '"' + (g.kayit && g.kayit.id === k.id ? ' selected' : '') + '>' + esc(k.ad) + ' (' + esc(k.tarih) + ')</option>'; }).join('') + '</select>';
      var tablo = '';
      if (g.kayit) {
        // Yaş yemler (kuru maddesi %55'in altında: silaj, posa) en sona.
        var sira = function (l) { return l.km && l.yas / l.km > 1.8 ? 5 : SIRA[l.grup] || 3; };
        var yemler = g.kayit.out.sonuc.satirlar.slice().sort(function (a, b) { return sira(a) - sira(b); });
        tablo = '<table class="xl"><thead><tr><th>Sıra · yem</th><th class="n">Baş</th><th class="n">Bölme (' + g.n + ')</th></tr></thead><tbody>' + yemler.map(function (l, i) {
          var tk = l.yas * g.n; toplam[l.ad] = (toplam[l.ad] || 0) + tk;
          return '<tr><td>' + (i + 1) + '. ' + esc(l.ad) + '</td><td class="n">' + miktar(l.yas, l.grup) + '</td><td class="n"><b>' + miktar(tk, l.grup) + '</b></td></tr>';
        }).join('') + '</tbody></table>';
      }
      return '<section class="card"><h2>🐂 ' + esc(g.ad) + ' · ' + g.n + ' baş</h2>' + sec + tablo + '</section>';
    }).join('');
    var tk = Object.keys(toplam);
    $('sayfa-yemleme').innerHTML = sayfaBas('🥣', 'Bugünkü yemleme', new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }) + ' · bölmelere göre verilecek yem.') +
      (!kay.length ? '<section class="card"><p class="muted">Önce bir rasyon hesaplayıp kaydedin; sonra burada her bölmeye bir rasyon atayın.</p><button class="main" data-git="rasyon">Rasyon hesapla</button></section>' :
      '<p class="muted ortala">Bölmeler hayvan kayıtlarındaki "Bölme / padok" alanından gelir. Yemler karıştırma sırasıyla yazılmıştır: önce kuru kaba yem, sonra kesif yem ve mineraller, en son silaj ve yaş yemler.</p>' + html +
      (tk.length ? '<section class="card"><h2>📦 Bugün toplam</h2><table class="xl"><tbody>' + tk.map(function (a) { return '<tr><td>' + esc(a) + '</td><td class="n"><b>' + (toplam[a] < 1 ? f0.format(toplam[a] * 1000) + ' g' : (toplam[a] >= 100 ? f0 : f1).format(toplam[a]) + ' kg') + '</b></td></tr>'; }).join('') + '</tbody></table>' +
        '<div class="dugmeler"><button class="main" id="ymYazdir">🖨️ Yazdır / PDF (ahıra asmak için)</button></div></section>' : ''));
    document.querySelectorAll('#sayfa-yemleme select[data-bolme]').forEach(function (s) {
      s.addEventListener('change', function () { var at = oku('besiRasyon.yemleme', {}); at[s.getAttribute('data-bolme')] = s.value; yaz('besiRasyon.yemleme', at); yemlemeSayfa(); });
    });
    if ($('ymYazdir')) $('ymYazdir').addEventListener('click', function () {
      var govde = [].slice.call(document.querySelectorAll('#sayfa-yemleme .card')).map(function (c) { var k = c.cloneNode(true); k.querySelectorAll('select,button,.dugmeler').forEach(function (x) { if (x.tagName === 'SELECT') { var p = document.createElement('p'); p.textContent = 'Rasyon: ' + (x.options[x.selectedIndex] || {}).text; x.replaceWith(p); } else x.remove(); }); return k.innerHTML; }).join('<hr>');
      yazdir('<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Yemleme</title><style>body{font:11pt Arial,sans-serif;margin:12mm}h2{font-size:13pt;margin:4mm 0 2mm}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:1.5mm 2mm;text-align:left}td.n,th.n{text-align:right}small{display:block;color:#555}</style></head><body><h1>Yemleme · ' + new Date().toLocaleDateString('tr-TR') + '</h1>' + govde + '</body></html>', 'Yemleme ' + bugunIso());
    });
  }
  function miktar(kg, grup) { return (grup === 'mineral' || grup === 'npn' || grup === 'katki') && kg < 1 ? f0.format(kg * 1000) + ' g' : (kg >= 100 ? f0 : f1).format(kg) + ' kg'; }
  function yazdir(html, baslik) {
    var B = window.BesiAndroid;
    if (B && B.print) { B.print(html, baslik); return; }
    var f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(function () { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(function () { f.remove(); }, 1000); }, 250);
  }

  // ---- Yem deposu: sayım + giriş; günlük tüketim yemleme planından düşer ----
  function gunlukTuketim() {
    var t = {};
    yemlemePlani().forEach(function (g) { if (g.kayit) g.kayit.out.sonuc.satirlar.forEach(function (l) { t[l.ad] = (t[l.ad] || 0) + l.yas * g.n; }); });
    return t;
  }
  function depoDurumu() {
    var d = oku('besiRasyon.depo', {}), t = gunlukTuketim();
    return Object.keys(d).map(function (ad) {
      var x = d[ad], g = t[ad] || 0, kalan = Math.max(0, x.kg - g * Math.max(0, gunFark(x.t, bugunIso())));
      return { ad: ad, kalan: kalan, gunluk: g, gun: g > 0 ? kalan / g : null };
    });
  }
  function depoSayfa() {
    var dd = depoDurumu(), t = gunlukTuketim(), adlar = A.yemler().map(function (f) { return f.ad; }).concat(['Tuz (veya yalama taşı)', 'Vitamin-mineral premiksi']);
    $('sayfa-depo').innerHTML = sayfaBas('📦', 'Yem deposu', 'Elinizdeki yem miktarı; günlük tüketim Yemleme planından kendiliğinden düşer.') +
      '<section class="card"><h2>Stok</h2>' + (dd.length ? '<div class="scroll"><table class="xl"><thead><tr><th>Yem</th><th class="n">Kalan</th><th class="n">Günlük</th><th class="n">Yeter</th></tr></thead><tbody>' +
        dd.map(function (x) { return '<tr><td>' + esc(x.ad) + '</td><td class="n">' + kgTon(x.kalan) + '</td><td class="n">' + (x.gunluk ? kgTon(x.gunluk) : '–') + '</td><td class="n"' + (x.gun !== null && x.gun < 10 ? ' style="color:var(--bad);font-weight:700"' : '') + '>' + (x.gun === null ? '–' : Math.floor(x.gun) + ' gün') + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="muted">Henüz stok girilmedi.</p>') +
      (Object.keys(t).length ? '' : '<p class="muted">Günlük tüketimin hesaplanması için Yemleme sayfasında bölmelere rasyon atayın.</p>') + '</section>' +
      '<section class="card"><h2>Giriş ya da sayım</h2><div class="alanlar">' +
      '<label class="field genis"><span>Yem</span><select id="dpYem">' + adlar.map(function (a) { return '<option>' + esc(a) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Miktar (kg)</span><input type="number" inputmode="decimal" id="dpKg" min="0" step="1"></label>' +
      '<label class="field"><span>Tarih</span><input type="date" id="dpTarih" value="' + bugunIso() + '"></label></div>' +
      '<div class="dugmeler"><button class="main" id="dpGiris">+ Depoya ekle (alım)</button><button class="sec" id="dpSayim">Sayım: kalan bu kadar</button></div>' +
      '<p class="muted" id="dpDurum" role="status"></p></section>';
    var islem = function (ekle) {
      var ad = $('dpYem').value, kg = num($('dpKg').value), tt = $('dpTarih').value || bugunIso();
      if (!(kg >= 0)) { $('dpDurum').textContent = 'Miktarı kg olarak yazın.'; return; }
      var d = oku('besiRasyon.depo', {}), mevcut = depoDurumu().filter(function (x) { return x.ad === ad; })[0];
      // Alımın tarihindeki kalan bulunur; böylece o tarihten bugüne tüketim iki kez düşülmez.
      var once = 0;
      if (ekle && mevcut && d[ad]) once = d[ad].t <= tt ? Math.max(0, d[ad].kg - mevcut.gunluk * Math.max(0, gunFark(d[ad].t, tt))) : d[ad].kg;
      d[ad] = { kg: once + kg, t: ekle && d[ad] && d[ad].t > tt ? d[ad].t : tt };
      yaz('besiRasyon.depo', d); depoSayfa(); zilGuncelle();
      $('dpDurum').textContent = ad + (ekle ? ': ' + kgTon(kg) + ' eklendi.' : ': sayım kaydedildi.');
    };
    $('dpGiris').addEventListener('click', function () { islem(true); });
    $('dpSayim').addEventListener('click', function () { islem(false); });
  }
  function kgTon(kg) { return kg >= 1000 ? f1.format(kg / 1000) + ' ton' : f0.format(kg) + ' kg'; }

  // ---- Hatırlatma takvimi ----
  // Kendi olaylarınız türüyle saklanır (besiRasyon.notlar): { k, t, saat, tur, metin, bolme, tutar, tekrar: yok|hafta|ay, bitti: [tarih] }.
  var TKTUR = [['alim', '🐂', 'Hayvan alımı'], ['yem', '🌾', 'Yem alımı'], ['vet', '🩺', 'Veteriner'], ['asi', '💉', 'Aşı / ilaç'],
    ['tartim', '⚖️', 'Tartım'], ['satis', '🏁', 'Satış / kesim'], ['odeme', '💳', 'Ödeme'], ['diger', '📌', 'Diğer']];
  var TKORNEK = { alim: 'ör. 10 baş Simental dana, Kalecik pazarı', yem: 'ör. 5 ton arpa, Toprak Mahsulleri', vet: 'ör. Dr. Yılmaz, genel kontrol', asi: 'ör. şap aşısı, bütün sürü',
    tartim: 'ör. bütün hayvanlar tartılacak', satis: 'ör. 4 baş kesime, mezbaha', odeme: 'ör. yem borcu taksiti', diger: 'ör. ahır temizliği' };
  function turBul(id) { return TKTUR.filter(function (x) { return x[0] === id; })[0] || TKTUR[TKTUR.length - 1]; }
  // Olaylar: hayvan kayıtlarından gelenler + kendi olaylarınız. son: bu tarihe kadar (tekrarlananlar için).
  function takvimOlaylari(son) {
    var st = A.durum(), ol = [], aralik = oku('besiRasyon.tartimAraligi', 30), bugun = bugunIso();
    son = son || gunEkleIso(bugun, 90);
    aktifler().forEach(function (h) {
      var s = sonTartim(h), a = artis(h).genel;
      ol.push({ t: gunEkleIso(s.t, aralik), metin: '<b>' + esc(h.kupe) + '</b> tartım günü', tur: '⚖️', turId: 'tartim', eylem: 'tartim' });
      (h.saglik || []).forEach(function (x) { if (x.tekrar) ol.push({ t: x.tekrar, metin: '<b>' + esc(h.kupe) + '</b> ' + esc(x.tur) + ' tekrarı' + (x.not ? ' (' + esc(x.not) + ')' : ''), tur: '💉', turId: 'asi' }); });
      if (a > 0.1 && st.finalBw > s.kg) ol.push({ t: gunEkleIso(s.t, Math.ceil((st.finalBw - s.kg) / a)), metin: '<b>' + esc(h.kupe) + '</b> tahmini kesim (' + f0.format(st.finalBw) + ' kg)', tur: '🏁', turId: 'satis' });
    });
    depoDurumu().forEach(function (d) { if (d.gun !== null) ol.push({ t: gunEkleIso(bugun, Math.floor(d.gun)), metin: '<b>' + esc(d.ad) + '</b> stoğu bitiyor', tur: '📦', turId: 'yem', eylem: 'yem' }); });
    [].concat(oku('besiRasyon.notlar', [])).forEach(function (n) {
      if (!n || !n.t) return;
      var tr = turBul(n.tur || 'diger'), tarihler = [n.t];
      if (n.tekrar === 'hafta' || n.tekrar === 'ay') {
        tarihler = [];
        for (var i = 0, t = n.t; t <= son && i < 400; i++) {
          tarihler.push(t);
          if (n.tekrar === 'hafta') t = gunEkleIso(n.t, 7 * (i + 1));
          else t = ayEkleIso(n.t, i + 1);
        }
      }
      tarihler.forEach(function (t) {
        ol.push({ t: t, saat: n.saat || '', metin: esc(n.metin) + (n.bolme ? ' <small>· ' + esc(n.bolme) + '</small>' : ''), duz: n.metin, tur: tr[1], turId: tr[0], turAd: tr[2],
          kendi: true, k: n.k, tekrar: n.tekrar, tutar: n.tutar, tamam: (n.bitti || []).indexOf(t) >= 0,
          eylem: tr[0] === 'tartim' ? 'tartim' : tr[0] === 'alim' ? 'alim' : tr[0] === 'yem' ? 'yem' : '' });
      });
    });
    return ol.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : (a.saat || '99') < (b.saat || '99') ? -1 : 1; });
  }
  function gunEkleIso(iso, gun) { var d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + gun); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  // Ay ekler; gün o ayda yoksa ayın son günü alınır (31 Ocak + 1 ay = 28/29 Şubat, 1 Mart değil).
  function ayEkleIso(iso, ay) {
    var p = iso.split('-').map(Number), y = p[0], m = p[1] - 1 + ay;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var g = Math.min(p[2], new Date(y, m + 1, 0).getDate());
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(g).padStart(2, '0');
  }
  function isoTarih(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var tv = { filtre: '', tur: 'vet', ay: null, secili: null };
  var EYLEM = { tartim: ['hayvan', 'hvTopluAc', 'Tartımı gir'], alim: ['hayvan', 'hvEkleAc', 'Hayvanı ekle'], yem: ['depo', '', 'Depoya işle'] };
  function olaySatir(o) {
    var e = EYLEM[o.eylem];
    return '<div class="olay' + (o.tamam ? ' tamam' : '') + '"><span class="oi" aria-hidden="true">' + o.tur + '</span><div class="om">' +
      (o.saat ? '<b class="saat">' + esc(o.saat) + '</b> ' : '') + o.metin +
      (o.tutar > 0 ? ' <span class="tutar">' + f0.format(o.tutar) + ' TL</span>' : '') + (o.tekrar === 'hafta' ? ' <small>↻ haftalık</small>' : o.tekrar === 'ay' ? ' <small>↻ aylık</small>' : '') + '</div>' +
      '<div class="od">' + (e && !o.tamam ? '<button class="link" data-git="' + e[0] + '"' + (e[1] ? ' data-hedef="' + e[1] + '"' : '') + '>' + e[2] + '</button>' : '') +
      (o.kendi ? '<button class="mini" data-ntamam="' + esc(o.k) + '" data-nt="' + o.t + '" aria-label="' + (o.tamam ? 'Geri al' : 'Yapıldı') + '">' + (o.tamam ? '↺' : '✓') + '</button>' +
        '<button class="mini sil" data-nsil="' + esc(o.k) + '" aria-label="Sil">✕</button>' : '') + '</div></div>';
  }
  function takvimSayfa() {
    var bugun = bugunIso(), gor = oku('besiRasyon.tvGorunum', 'liste') === 'ay' ? 'ay' : 'liste';
    if (!tv.ay) { var d0 = new Date(); tv.ay = new Date(d0.getFullYear(), d0.getMonth(), 1); }
    var ayBas = isoTarih(tv.ay), aySon = isoTarih(new Date(tv.ay.getFullYear(), tv.ay.getMonth() + 1, 0));
    var tum = takvimOlaylari(gor === 'ay' && aySon > gunEkleIso(bugun, 90) ? aySon : null);
    var ol = tum.filter(function (o) { return !tv.filtre || o.turId === tv.filtre; });
    var grupla = function (l) {
      var g = {}; l.forEach(function (o) { (g[o.t] = g[o.t] || []).push(o); });
      return Object.keys(g).map(function (t) {
        var d = new Date(t + 'T00:00:00'), fark = gunFark(bugun, t);
        return '<div class="gun"><div class="gunbas' + (fark === 0 ? ' bugun' : '') + '"><b>' + d.getDate() + '</b><span>' + d.toLocaleDateString('tr-TR', { month: 'short' }) + '</span></div><div class="gunis"><small>' +
          (fark === 0 ? 'Bugün' : fark === 1 ? 'Yarın' : fark < 0 ? -fark + ' gün geçti' : fark + ' gün sonra') + ' · ' + d.toLocaleDateString('tr-TR', { weekday: 'long' }) + '</small>' +
          g[t].map(olaySatir).join('') + '</div></div>';
      }).join('');
    };
    var govde;
    if (gor === 'liste') {
      // Geçmişte kalanlar: tamamlanmamış olanlar; tekrarlananlardan yalnızca en son kaçırılan.
      var sonGecmis = {};
      ol.forEach(function (o) { if (o.kendi && o.tekrar && o.tekrar !== 'yok' && o.t < bugun) sonGecmis[o.k] = o.t; });
      var gecmis = ol.filter(function (o) { return o.t < bugun && !o.tamam && (!o.kendi || !o.tekrar || o.tekrar === 'yok' || sonGecmis[o.k] === o.t); });
      // Tekrarlanan olaylardan listede yalnızca sıradaki görünür (hepsi ay görünümünde).
      var ilkGelecek = {};
      var gelecek = ol.filter(function (o) {
        if (o.t < bugun || gunFark(bugun, o.t) > 90) return false;
        if (o.kendi && o.tekrar && o.tekrar !== 'yok') { if (ilkGelecek[o.k] || o.tamam) return false; ilkGelecek[o.k] = 1; }
        return true;
      });
      govde = (gecmis.length ? '<section class="card"><h2>⏰ Geciken (' + gecmis.length + ')</h2>' + grupla(gecmis) + '</section>' : '') +
        '<section class="card"><h2>Önümüzdeki 90 gün</h2>' + (gelecek.length ? grupla(gelecek) : '<p class="muted">Yaklaşan iş yok. Aşağıdan olay ekleyin; hayvan, tartım ve sağlık kayıtlarından gelenler de burada görünür.</p>') + '</section>';
    } else {
      var gunler = {}; ol.forEach(function (o) { if (o.t >= ayBas && o.t <= aySon) (gunler[o.t] = gunler[o.t] || []).push(o); });
      var bos = (tv.ay.getDay() + 6) % 7, n = new Date(tv.ay.getFullYear(), tv.ay.getMonth() + 1, 0).getDate(), hucre = [];
      for (var i = 0; i < bos; i++) hucre.push('<td class="bos"></td>');
      for (var g = 1; g <= n; g++) {
        var iso = isoTarih(new Date(tv.ay.getFullYear(), tv.ay.getMonth(), g)), l = gunler[iso] || [];
        hucre.push('<td data-gun="' + iso + '" class="' + [iso === bugun ? 'bugun' : '', iso === tv.secili ? 'secili' : '', l.length ? 'dolu' : ''].join(' ') + '"><b>' + g + '</b>' +
          (l.length ? '<span>' + l.slice(0, 3).map(function (o) { return o.tur; }).join('') + (l.length > 3 ? '+' : '') + '</span>' : '') + '</td>');
      }
      while (hucre.length % 7) hucre.push('<td class="bos"></td>');
      var satirlar = []; for (var j = 0; j < hucre.length; j += 7) satirlar.push('<tr>' + hucre.slice(j, j + 7).join('') + '</tr>');
      var secL = tv.secili ? (gunler[tv.secili] || []) : [];
      govde = '<section class="card"><div class="tkayust"><button class="mini" data-tvay="-1" aria-label="Önceki ay">‹</button><b>' + tv.ay.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) + '</b><button class="mini" data-tvay="1" aria-label="Sonraki ay">›</button><button class="link" data-tvay="0">Bugün</button></div>' +
        '<table class="xl tkay"><thead><tr>' + ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>' + satirlar.join('') + '</tbody></table>' +
        (tv.secili ? '<h3>' + new Date(tv.secili + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }) + '</h3>' + (secL.length ? secL.map(olaySatir).join('') : '<p class="muted">Bu gün boş. Aşağıdan olay ekleyebilirsiniz.</p>') : '<p class="muted kisa">Bir güne dokunun: o günün işleri görünür ve yeni olay o güne eklenir.</p>') + '</section>';
    }
    // Bu ay planlanan gider (kendi olaylarınızdaki tutarlar)
    var ayTop = 0; tum.forEach(function (o) { if (o.kendi && o.tutar > 0 && !o.tamam && o.t.slice(0, 7) === bugun.slice(0, 7)) ayTop += o.tutar; });
    var tarihV = tv.secili || bugun;
    $('sayfa-takvim').innerHTML = sayfaBas('📅', 'Takvim', 'Hayvan alımı, veteriner, aşı, tartım, satış ve ödemeler; hayvan ve depo kayıtlarından gelen hatırlatmalar.') +
      '<div class="tkarac"><span class="secmeli kucuk" role="group" aria-label="Görünüm" id="tvGor"><button data-deger="liste" aria-pressed="' + (gor === 'liste') + '">☰ Liste</button><button data-deger="ay" aria-pressed="' + (gor === 'ay') + '">▦ Ay</button></span>' +
      (ayTop > 0 ? '<span class="muted">Bu ay planlanan: <b>' + f0.format(ayTop) + ' TL</b></span>' : '') + '</div>' +
      '<div class="cipler tkfiltre" id="tvFiltre"><button data-f=""' + (tv.filtre ? '' : ' class="on"') + '>Tümü</button>' +
      TKTUR.map(function (x) { return '<button data-f="' + x[0] + '"' + (tv.filtre === x[0] ? ' class="on"' : '') + '>' + x[1] + ' ' + x[2] + '</button>'; }).join('') + '</div>' +
      govde +
      '<section class="card" id="tvForm"><h2>+ Olay ekle</h2>' +
      '<div class="cipler tktur" id="tvTur">' + TKTUR.map(function (x) { return '<button data-tur="' + x[0] + '"' + (tv.tur === x[0] ? ' class="on"' : '') + '>' + x[1] + ' ' + x[2] + '</button>'; }).join('') + '</div>' +
      '<div class="alanlar">' +
      '<label class="field"><span>Tarih</span><input type="date" id="tvTarih" value="' + tarihV + '"></label>' +
      '<label class="field tksaat"><span>Saat (isteğe bağlı)</span><input type="time" id="tvSaat"></label>' +
      '<label class="field genis"><span>Açıklama</span><input type="text" id="tvNot" maxlength="100" placeholder="' + esc(TKORNEK[tv.tur]) + '"></label>' +
      '<label class="field genis"><span>Hayvan / bölme / kişi (isteğe bağlı)</span><input type="text" id="tvBolme" maxlength="60" placeholder="ör. A bölmesi, TR06 123"></label>' +
      '<label class="field"><span>Tutar (TL)</span><input type="number" inputmode="decimal" id="tvTutar" min="0" step="1" placeholder="–"></label>' +
      '<label class="field"><span>Tekrar</span><select id="tvTekrar"><option value="yok">Tekrar yok</option><option value="hafta">Her hafta</option><option value="ay">Her ay</option></select></label>' +
      '</div><div class="dugmeler"><button class="main" id="tvEkle">Takvime ekle</button></div><p class="muted" id="tvDurum" role="status"></p></section>' +
      '<details class="card"><summary>Takvim ayarı</summary><div class="alanlar"><label class="field"><span>Hayvan tartım aralığı (gün)</span><input type="number" id="tvAralik" min="7" max="120" step="1" value="' + oku('besiRasyon.tartimAraligi', 30) + '"></label></div>' +
      '<p class="muted">Her hayvanın son tartımından bu kadar gün sonra "tartım günü" hatırlatması çıkar.</p></details>';
    var k = $('sayfa-takvim');
    $('tvGor').onclick = function (e) { var b = e.target.closest('button[data-deger]'); if (!b) return; yaz('besiRasyon.tvGorunum', b.getAttribute('data-deger')); takvimSayfa(); };
    $('tvFiltre').onclick = function (e) { var b = e.target.closest('button[data-f]'); if (!b) return; tv.filtre = b.getAttribute('data-f'); takvimSayfa(); };
    $('tvTur').onclick = function (e) {
      var b = e.target.closest('button[data-tur]'); if (!b) return; tv.tur = b.getAttribute('data-tur');
      this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      $('tvNot').placeholder = TKORNEK[tv.tur];
    };
    $('tvEkle').addEventListener('click', function () {
      var tr = turBul(tv.tur), m = $('tvNot').value.trim() || tr[2], t = $('tvTarih').value;
      if (!t) { $('tvDurum').textContent = 'Tarihi seçin.'; return; }
      var tutar = num($('tvTutar').value);
      var l = oku('besiRasyon.notlar', []);
      l.push({ k: 'n' + Date.now().toString(36), t: t, saat: $('tvSaat').value || '', tur: tr[0], metin: m, bolme: $('tvBolme').value.trim(), tutar: tutar > 0 ? tutar : 0, tekrar: $('tvTekrar').value, bitti: [] });
      yaz('besiRasyon.notlar', l); tv.secili = t; takvimSayfa(); zilGuncelle();
      $('tvDurum').textContent = tr[1] + ' ' + tr[2] + ' eklendi: ' + tarih(t) + '.';
    });
    $('tvAralik').addEventListener('change', function () { var v = Math.round(num(this.value)); if (v >= 7 && v <= 120) { yaz('besiRasyon.tartimAraligi', v); takvimSayfa(); zilGuncelle(); } });
    k.onclick = function (e) {
      var el = e.target.closest('[data-nsil],[data-ntamam],[data-tvay],td[data-gun]'); if (!el) return;
      var l = oku('besiRasyon.notlar', []);
      if (el.hasAttribute('data-nsil')) {
        if (!el.classList.contains('onay')) { el.classList.add('onay'); el.textContent = 'Sil?'; return; }
        yaz('besiRasyon.notlar', l.filter(function (n) { return n.k !== el.getAttribute('data-nsil'); }));
      } else if (el.hasAttribute('data-ntamam')) {
        var n = l.filter(function (x) { return x.k === el.getAttribute('data-ntamam'); })[0], t = el.getAttribute('data-nt');
        if (n) { n.bitti = n.bitti || []; if (n.bitti.indexOf(t) >= 0) n.bitti = n.bitti.filter(function (x) { return x !== t; }); else n.bitti.push(t); yaz('besiRasyon.notlar', l); }
      } else if (el.hasAttribute('data-tvay')) {
        var y = +el.getAttribute('data-tvay'), d = new Date();
        tv.ay = y === 0 ? new Date(d.getFullYear(), d.getMonth(), 1) : new Date(tv.ay.getFullYear(), tv.ay.getMonth() + y, 1);
        if (y === 0) tv.secili = bugunIso();
      } else { tv.secili = el.getAttribute('data-gun'); }
      takvimSayfa(); zilGuncelle();
    };
  }
  function sayfaBas(ikon, baslik, alt) { return '<div class="adimbas"><h1><i aria-hidden="true">' + ikon + '</i>' + baslik + '</h1><p>' + alt + '</p></div>'; }

  // ---- Uygulama ayarları: görünüm ve yedekleme ----
  var RENKLER = [['toprak', 'Toprak', '#a5582f', '#3e2113'], ['lacivert', 'Lacivert', '#3d6bb0', '#0f2342'], ['bordo', 'Bordo', '#b4435f', '#40101c'], ['antrasit', 'Antrasit', '#56626f', '#15191e']];
  var MODLAR = [['acik', 'Açık'], ['koyu', 'Koyu'], ['sistem', 'Sistem']];
  var YAZILAR = [['kucuk', 'Küçük'], ['normal', 'Normal'], ['buyuk', 'Büyük'], ['cokbuyuk', 'Çok büyük']];
  var YOGUNLUK = [['rahat', 'Rahat'], ['sik', 'Sıkı (Excel)']];
  function gorunum() { return oku('besiRasyon.gorunum', {}) || {}; }
  function gorunumUygula(g) {
    var r = document.documentElement;
    if (g.renk && g.renk !== 'toprak') r.setAttribute('data-renk', g.renk); else r.removeAttribute('data-renk');
    if (g.mod === 'acik') r.setAttribute('data-theme', 'light'); else if (g.mod === 'koyu') r.setAttribute('data-theme', 'dark'); else r.removeAttribute('data-theme');
    if (g.yazi && g.yazi !== 'normal') r.setAttribute('data-yazi', g.yazi); else r.removeAttribute('data-yazi');
    if (g.yogun === 'sik') r.setAttribute('data-yogun', 'sik'); else r.removeAttribute('data-yogun');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', getComputedStyle(document.body).backgroundColor);
  }
  function yedekVerisi(fotoDahil) {
    var veri = { uygulama: 'Besi Rasyon', surum: 1, tarih: new Date().toISOString(), kayit: {} };
    // Lisans, cihaz kodu ve yönetici anahtarı cihaza özeldir; yedeğe girmez.
    var disla = ['besiRasyon.lisans', 'besiRasyon.cihaz', 'besiRasyon.yonetici', 'besiRasyon.beyanGonder'];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k.indexOf('besiRasyon.') === 0 && disla.indexOf(k) < 0) veri.kayit[k] = localStorage.getItem(k);
    }
    return (fotoDahil ? Foto.hepsi() : Promise.resolve(null)).then(function (f) { if (f) veri.foto = f; return JSON.stringify(veri); });
  }
  function yedekYukle(metin, durum) {
    var v;
    try { v = JSON.parse(metin); } catch (e) { durum.textContent = 'Bu dosya bir Besi Rasyon yedeği değil.'; return; }
    if (!v || v.uygulama !== 'Besi Rasyon' || !v.kayit) { durum.textContent = 'Bu dosya bir Besi Rasyon yedeği değil.'; return; }
    // Cihaza özel anahtarlar (lisans, cihaz kodu, yönetici) yedekten alınmaz; liste olması gereken kayıtlar denetlenir.
    var disla = ['besiRasyon.lisans', 'besiRasyon.cihaz', 'besiRasyon.yonetici', 'besiRasyon.beyanGonder'];
    var liste = ['besiRasyon.hayvanlar.v1', 'besiRasyon.notlar', 'besiRasyon.kayitlar.v1'];
    var al = Object.keys(v.kayit).filter(function (k) {
      if (k.indexOf('besiRasyon.') !== 0 || disla.indexOf(k) >= 0 || typeof v.kayit[k] !== 'string') return false;
      if (liste.indexOf(k) >= 0) { try { return Array.isArray(JSON.parse(v.kayit[k])); } catch (e) { return false; } }
      return true;
    });
    if (!al.length) { durum.textContent = 'Yedekte yüklenecek kayıt bulunamadı.'; return; }
    try { al.forEach(function (k) { localStorage.setItem(k, v.kayit[k]); }); }
    catch (e) { durum.textContent = 'Yedek yüklenemedi: cihazda yer kalmamış olabilir. Fotoğrafsız yedek deneyin.'; return; }
    var f = (v.foto && typeof v.foto === 'object') ? v.foto : {}, ids = Object.keys(f).filter(function (id) { return typeof f[id] === 'string' && f[id].indexOf('data:image/') === 0; });
    Promise.all(ids.map(function (id) { return Foto.koy(id, f[id]).catch(function () {}); })).then(function () {
      durum.textContent = 'Yedek yüklendi (' + al.length + ' kayıt' + (ids.length ? ', ' + ids.length + ' fotoğraf' : '') + '). Uygulama yeniden açılıyor…';
      setTimeout(function () { location.reload(); }, 1200);
    });
  }
  function ayarSayfa() {
    var g = gorunum(), L = window.BesiLisans, n = hayvanlar().length, kay = A.kayitlar().length;
    var secim = function (liste, deger, ad) {
      return '<div class="secmeli" role="group" data-ayar="' + ad + '">' + liste.map(function (x) {
        return '<button data-deger="' + x[0] + '" aria-pressed="' + (x[0] === deger) + '">' + x[1] + '</button>';
      }).join('') + '</div>';
    };
    var surum = (document.body.innerHTML.match(/Sürüm (\d+\.\d+)/) || [])[1] || '';
    $('sayfa-ayarlar').innerHTML =
      '<div class="adimbas"><h1><i aria-hidden="true">⚙️</i>Ayarlar</h1><p>Görünüm, yazı boyutu ve verilerinizin yedeği.</p></div>' +
      '<section class="card ayarbolum"><h2>🎨 Görünüm</h2>' +
      '<div class="ayarsatir"><b>Tema rengi</b><div class="renkler" data-ayar="renk">' + RENKLER.map(function (r) {
        return '<button data-deger="' + r[0] + '" aria-pressed="' + ((g.renk || 'toprak') === r[0]) + '"><i style="background:linear-gradient(140deg,' + r[2] + ',' + r[3] + ')"></i>' + r[1] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="ayarsatir"><b>Açık / koyu</b><small>"Sistem" telefonun ayarına uyar.</small>' + secim(MODLAR, g.mod || 'sistem', 'mod') + '</div>' +
      '<div class="ayarsatir"><b>Yazı boyutu</b><small>Bütün yazılar ve düğmeler birlikte büyür.</small>' + secim(YAZILAR, g.yazi || 'normal', 'yazi') + '</div>' +
      '<div class="ayarsatir"><b>Tablo yoğunluğu</b><small>"Sıkı" daha küçük hücrelerle bir ekrana daha çok satır sığdırır.</small>' + secim(YOGUNLUK, g.yogun || 'rahat', 'yogun') + '</div></section>' +
      '<section class="card ayarbolum"><h2>💾 Yedekleme</h2>' +
      '<p class="muted">Rasyon ayarlarınız, yem fiyatlarınız, kayıtlı rasyonlarınız ve ' + n + ' hayvanın kaydı bu cihazda duruyor. Telefon değişirse ya da uygulama silinirse kaybolmaması için yedek alın; yedeği Drive\'a ya da WhatsApp\'ta kendinize gönderin. Lisans yedeğe girmez.</p>' +
      '<label class="check"><input type="checkbox" id="ydFoto"> Hayvan fotoğraflarını da ekle (yedek büyür)</label>' +
      '<div class="yedekdugme"><button class="birincil" id="ydAl">📤 Yedek al</button>' +
      '<label>📥 Yedekten geri yükle<input type="file" id="ydDosya" accept=".json,.txt,application/json,text/plain"></label></div>' +
      '<details class="lsyon"><summary>Yedeği metin olarak yapıştır</summary><textarea id="ydMetin" rows="4" placeholder="Yedek metnini buraya yapıştırın"></textarea><button class="sec" id="ydMetinYukle">Geri yükle</button></details>' +
      '<p class="muted" id="ydDurum" role="status"></p></section>' +
      '<section class="card ayarbolum"><h2>🧮 Rasyon hesabı</h2><p class="muted">Kaba yem oranı, nişasta, lif ve yağ sınırları, toleranslar ve stok gün sayısı.</p>' +
      '<button class="sec genis" data-git="rasyon" data-adimgit="ayar">Hesap ayarlarını aç</button></section>' +
      '<section class="card ayarbolum"><h2>ℹ️ Uygulama</h2><table class="xl"><tbody>' +
      '<tr><td class="muted">Sürüm</td><td>' + esc(surum) + (L && L.rol === 'yonetici' ? ' · Yönetici' : '') + '</td></tr>' +
      '<tr><td class="muted">Hayvan / kayıtlı rasyon</td><td>' + n + ' / ' + kay + '</td></tr>' +
      '<tr><td class="muted">Lisans</td><td>' + ($('lisansBilgi') ? esc($('lisansBilgi').textContent.replace(/Yönetici çıkışı.*/, '').trim()) || '–' : '–') + '</td></tr></tbody></table>' +
      '<div class="dugmeler"><button class="sec" data-git="beyan">Sorumluluk beyanı</button><button class="sec sil" id="ydSil">Rasyon ve hayvan verilerini sil</button></div>' +
      '<p class="muted" id="ydSilDurum" role="status"></p></section>';
    document.querySelectorAll('#sayfa-ayarlar [data-ayar]').forEach(function (grup) {
      grup.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-deger]'); if (!b) return;
        var g2 = gorunum(); g2[grup.getAttribute('data-ayar')] = b.getAttribute('data-deger');
        yaz('besiRasyon.gorunum', g2); gorunumUygula(g2);
        grup.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
    });
    $('ydAl').addEventListener('click', function () {
      var d = $('ydDurum'); d.textContent = 'Hazırlanıyor…';
      yedekVerisi($('ydFoto').checked).then(function (metin) {
        var ad = 'BesiRasyon-yedek-' + bugunIso() + '.json', B = window.BesiAndroid;
        yaz('besiRasyon.sonYedek', bugunIso());
        if (B && B.shareFile) { B.shareFile(metin, ad, 'application/json'); d.textContent = 'Paylaşım menüsünden "Drive\'a kaydet" ya da WhatsApp\'ta kendinize gönderin (' + Math.round(metin.length / 1024) + ' KB).'; return; }
        if (B && B.share && !B.copy) { B.share(metin); d.textContent = 'Paylaşım menüsünden "Drive\'a kaydet" ya da WhatsApp\'ta kendinize gönderin.'; return; }
        try {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([metin], { type: 'application/json' })); a.download = ad;
          document.body.appendChild(a); a.click(); a.remove();
          d.textContent = ad + ' indirildi (' + Math.round(metin.length / 1024) + ' KB). Drive\'a yükleyebilirsiniz.';
        } catch (e) { kopyala(metin, d, 'Yedek metni kopyalandı; bir yere yapıştırıp saklayın.'); }
      });
    });
    $('ydDosya').addEventListener('change', function () {
      var f = this.files && this.files[0]; if (!f) return;
      var r = new FileReader(); r.onload = function () { yedekYukle(r.result, $('ydDurum')); }; r.readAsText(f);
    });
    $('ydMetinYukle').addEventListener('click', function () { yedekYukle($('ydMetin').value, $('ydDurum')); });
    $('ydSil').addEventListener('click', function () {
      var b = this;
      if (!b.classList.contains('onay')) { b.classList.add('onay'); b.textContent = 'Emin misiniz? Önce yedek alın. Bir daha dokunun'; return; }
      var koru = ['besiRasyon.lisans', 'besiRasyon.cihaz', 'besiRasyon.yonetici', 'besiRasyon.beyan', 'besiRasyon.beyanGonder', 'besiRasyon.gorunum', 'besiRasyon.talepAd', 'besiRasyon.talepTel'];
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf('besiRasyon.') === 0 && koru.indexOf(k) < 0) localStorage.removeItem(k); });
      try { indexedDB.deleteDatabase('besiRasyonFoto'); } catch (e) { /* yok */ }
      $('ydSilDurum').textContent = 'Veriler silindi. Uygulama yeniden açılıyor…';
      setTimeout(function () { location.reload(); }, 1000);
    });
  }

  // Lisans ya da yönetici girişiyle uygulama açılınca ana sayfa gösterilir.
  document.addEventListener('besi:acildi', function () {
    var h = location.hash.slice(1);
    git(SAYFALAR.indexOf(h) >= 0 ? h : 'ana');
  });
  window.BesiSayfa = { git: git, adim: adim };
})();
