// Lisans: uygulama, yöneticinin verdiği lisans anahtarı girilince açılır.
// Her kurulumun kendi cihaz kodu vardır. Kullanıcı bu kodla WhatsApp ya da e-postadan lisans ister;
// yönetici kodu "Lisans ver" bölümüne yazar, uygulama anahtarı üretir.
// Anahtar ECDSA P-256 imzasıdır: uygulamada yalnızca açık anahtar bulunur, imzalayan özel anahtar
// yöneticinin cihazındadır (bir kez "Yönetici girişi" ile yazılır). İnternet gerekmez.
(function () {
  'use strict';
  var ACIK_ANAHTAR = 'BLwzyhsA3JUtUHumK_phk5k4t5d3sQw9Qi1J04jLIocEtxYJ9Z2ZcCAbkwO9x1SA2J0_UUOXEz5qWWuvLESRSOw';
  var WA_NO = '905445245062', EPOSTA = 'nuhbektas@gmail.com';
  var K = { cihaz: 'besiRasyon.cihaz', lisans: 'besiRasyon.lisans', yonetici: 'besiRasyon.yonetici', verilen: 'besiRasyon.verilenLisanslar',
    beyan: 'besiRasyon.beyan', beyanKuyruk: 'besiRasyon.beyanGonder' };
  // Sorumluluk beyanı: metin değişirse sürüm artırılır, herkes yeniden onaylar.
  var BEYAN_SURUM = 1;
  // Kabul, internet varken FormSubmit (formsubmit.co) üzerinden yöneticinin e-postasına kendiliğinden gider;
  // internet yoksa telefonda bekler ve sonraki açılışta gönderilir. Lisans talebinde de yazılıdır.
  var BEYAN_ADRES = 'https://formsubmit.co/ajax/' + 'nuhbektas@gmail.com';
  var BEYAN_METNI = [
    ['Programın niteliği', 'Besi Rasyon, besi sığırları için NRC besi sığırı standartlarına ve ortalama yem değerlerine dayanarak tahmini rasyon hesaplayan bir karar destek programıdır. Veteriner hekimin, ziraat mühendisinin ya da zootekni uzmanının muayenesi, önerisi ve denetimi yerine geçmez.'],
    ['Girilen bilgiler', 'Hayvanların ağırlığı, hedef artış, yem fiyatları, yem analiz değerleri, kuru madde oranları ve diğer tüm bilgilerin doğru girilmesi kullanıcının sorumluluğundadır. Yanlış ya da eksik bilgiyle yapılan hesap yanlış sonuç verir.'],
    ['Yem değerleri', 'Programdaki yem besin değerleri ortalama tablo değerleridir. Elinizdeki yemin gerçek değeri hasada, depolamaya ve kaynağa göre farklı olabilir. Rasyonu uygulamadan önce yem analizi yaptırmanız ve bir uzmana kontrol ettirmeniz önerilir.'],
    ['Uygulama', 'Rasyon değişikliğinin 2–3 haftada kademeli yapılması, hayvanların temiz su ve tuza sürekli ulaşabilmesi, üre, mineral ve katkı maddelerinin doğru tartılıp iyice karıştırılması, hayvan sağlığının günlük izlenmesi ve hastalık belirtisinde veteriner hekime başvurulması kullanıcının sorumluluğundadır.'],
    ['Sorumluluk', 'Programın kullanılması ya da sonuçlarının uygulanması sonucunda oluşabilecek hayvan hastalığı, zehirlenme, ölüm, verim ve kilo kaybı, yem ya da para kaybı dahil her türlü doğrudan veya dolaylı zarardan programı geliştiren ve lisans veren kişi sorumlu tutulamaz. Kullanıcının kendi hatasından, yanlış veri girişinden ya da hatalı uygulamadan doğan tüm sorumluluk kullanıcıya aittir.'],
    ['Lisans', 'Program, yöneticinin verdiği lisansla, lisansın geçerli olduğu süre ve cihazda kullanılır. Lisans başkasına devredilemez.'],
    ['Kişisel bilgiler', 'Bu beyanın kabulü sırasında yazdığınız ad soyad, telefon, il/ilçe, cihaz kodu ve kabul tarihi, lisans ve kayıt amacıyla programın yöneticisine e-postayla (FormSubmit hizmeti aracılığıyla) gönderilir. Rasyonlarınız, hayvan kayıtlarınız ve fiyatlarınız yalnızca kendi cihazınızda saklanır, hiçbir yere gönderilmez.']
  ];
  var SURELER = [['7g', '7 gün (deneme)', 7], ['1a', '1 ay', 30], ['3a', '3 ay', 91], ['6a', '6 ay', 182], ['1y', '1 yıl', 365], ['2y', '2 yıl', 730], ['sz', 'Süresiz', 0]];
  var HARF = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';  // karışan harfler (0, O, 1, I) yok
  var $ = function (id) { return document.getElementById(id); };
  var subtle = window.crypto && window.crypto.subtle;
  // İki ayrı uygulama: standart kullanıcı uygulamasında yönetici girişi yoktur; "Besi Rasyon Yönetici"
  // uygulaması (rol.js'de 'yonetici') beyan ve lisans sormaz, yalnızca yönetici anahtarıyla açılır.
  var ROL = window.BESI_ROL === 'yonetici' ? 'yonetici' : 'kullanici';

  function oku(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function yaz(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* özel mod */ } }
  function esc(x) { return String(x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function b64u(bytes) {
    var s = ''; bytes = new Uint8Array(bytes);
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    var b = atob(s), out = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  }
  var utf8 = function (s) { return new TextEncoder().encode(s); };

  // Cihaz kodu: kuruluşta bir kez rastgele üretilir (BR-XXXXX-XXXXX).
  function cihazKodu() {
    var c = oku(K.cihaz);
    if (c && /^BR-[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/.test(c)) return c;
    var r = new Uint8Array(10); window.crypto.getRandomValues(r);
    var s = ''; for (var i = 0; i < 10; i++) s += HARF[r[i] % 32];
    c = 'BR-' + s.slice(0, 5) + '-' + s.slice(5);
    yaz(K.cihaz, c);
    return c;
  }
  function kodBul(metin) {
    var m = String(metin || '').toUpperCase().replace(/\s+/g, '').match(/BR-?([2-9A-HJ-NP-Z]{5})-?([2-9A-HJ-NP-Z]{5})/);
    return m ? 'BR-' + m[1] + '-' + m[2] : null;
  }

  function bugun() { var d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function tarihYaz(n) { return n >= 99991231 ? 'süresiz' : String(n % 100).padStart(2, '0') + '.' + String(Math.floor(n / 100) % 100).padStart(2, '0') + '.' + Math.floor(n / 10000); }
  function gunEkle(gun) {
    if (!gun) return 99991231;
    var d = new Date(); d.setDate(d.getDate() + gun);
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  function kalanGun(bitis) {
    if (bitis >= 99991231) return Infinity;
    var d = new Date(Math.floor(bitis / 10000), Math.floor(bitis / 100) % 100 - 1, bitis % 100);
    var b = new Date(); b.setHours(0, 0, 0, 0);
    return Math.round((d - b) / 864e5);
  }

  var acikAnahtar = null;
  function acik() {
    if (!acikAnahtar) acikAnahtar = subtle.importKey('raw', unb64u(ACIK_ANAHTAR), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return acikAnahtar;
  }
  var ALG = { name: 'ECDSA', hash: 'SHA-256' };

  // Lisans: "BESI-" + base64url("BR1|kod|bitiş|ad") + "." + base64url(imza).
  // Dönen: { ok, kod, bitis, ad, neden }.
  function lisansCoz(metin) {
    var m = String(metin || '').match(/BESI-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/);
    if (!m) return Promise.resolve({ ok: false, neden: 'bicim' });
    var yuk, parca;
    try { yuk = new TextDecoder().decode(unb64u(m[1])); parca = yuk.split('|'); } catch (e) { return Promise.resolve({ ok: false, neden: 'bicim' }); }
    if (parca.length < 4 || parca[0] !== 'BR1') return Promise.resolve({ ok: false, neden: 'bicim' });
    var l = { kod: parca[1], bitis: parseInt(parca[2], 10), ad: parca.slice(3).join('|'), anahtar: 'BESI-' + m[1] + '.' + m[2] };
    return acik().then(function (k) { return subtle.verify(ALG, k, unb64u(m[2]), utf8(yuk)); }).then(function (gecerli) {
      l.ok = gecerli; if (!gecerli) l.neden = 'imza';
      return l;
    }, function () { l.ok = false; l.neden = 'imza'; return l; });
  }

  function lisansUret(ozel, kod, bitis, ad) {
    var yuk = ['BR1', kod, bitis, String(ad || '').replace(/\|/g, '/').trim().slice(0, 60)].join('|');
    return subtle.sign(ALG, ozel, utf8(yuk)).then(function (imza) { return 'BESI-' + b64u(utf8(yuk)) + '.' + b64u(imza); });
  }

  // Yönetici şifresi: uygulamadaki şifreli anahtarı (BESI_KASA) açar. Dönen: anahtar metni ya da null.
  function kasaAc(sifre) {
    var k = window.BESI_KASA;
    if (!k || !sifre) return Promise.resolve(null);
    return subtle.importKey('raw', utf8(sifre), 'PBKDF2', false, ['deriveKey']).then(function (ham) {
      return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64u(k.s), iterations: k.i }, ham, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    }).then(function (a) { return subtle.decrypt({ name: 'AES-GCM', iv: unb64u(k.iv) }, a, unb64u(k.ct)); })
      .then(function (d) { return b64u(d); }, function () { return null; });
  }

  // Yönetici anahtarı: doğru mu diye bir deneme imzası açık anahtarla doğrulanır.
  function yoneticiAnahtari(metin) {
    var s = String(metin || '').replace(/[^A-Za-z0-9_-]/g, ''), ham, ozel;
    try { ham = unb64u(s); } catch (e) { return Promise.resolve(null); }
    return subtle.importKey('pkcs8', ham, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']).then(function (k) {
      ozel = k;
      return subtle.sign(ALG, k, utf8('deneme'));
    }).then(function (imza) { return acik().then(function (a) { return subtle.verify(ALG, a, imza, utf8('deneme')); }); })
      .then(function (ok) { return ok ? { anahtar: ozel, metin: s } : null; }, function () { return null; });
  }

  function talepMetni(kod, ad, tel, yenile) {
    var b = beyanKaydi();
    return 'Merhaba, Besi Rasyon ' + (yenile ? 'lisansımı yenilemek' : 'lisansı almak') + ' istiyorum.\n' +
      'Cihaz kodu: ' + kod + '\n' + (ad ? 'Ad Soyad: ' + ad + '\n' : '') + (tel ? 'Telefon: ' + tel + '\n' : '') +
      (b ? (b.yer ? 'İl/İlçe: ' + b.yer + '\n' : '') + 'Sorumluluk beyanını kabul ettim: ' + zamanYaz(b.tarih) + ' (beyan sürümü ' + b.surum + ')\n' : '');
  }

  // ---- Sorumluluk beyanı ----
  function beyanKaydi() {
    try { var b = JSON.parse(oku(K.beyan) || 'null'); return b && b.surum === BEYAN_SURUM ? b : null; } catch (e) { return null; }
  }
  function zamanYaz(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }
  function beyanMetniHtml() {
    return BEYAN_METNI.map(function (p, i) { return '<p><b>' + (i + 1) + '. ' + p[0] + '.</b> ' + p[1] + '</p>'; }).join('');
  }
  // Bekleyen kabul e-postasını gönderir (internet yoksa sonraki açılışa kalır).
  var beyanYolda = false;
  function beyanGonder() {
    var kuyruk = oku(K.beyanKuyruk);
    if (beyanYolda || !kuyruk || !window.fetch || navigator.onLine === false) return;
    beyanYolda = true;
    var b; try { b = JSON.parse(kuyruk); } catch (e) { yaz(K.beyanKuyruk, null); return; }
    fetch(BEYAN_ADRES, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _subject: 'Besi Rasyon sorumluluk beyanı kabulü: ' + b.ad, _template: 'table', _captcha: 'false',
        'Ad Soyad': b.ad, 'Telefon': b.tel, 'İl/İlçe': b.yer || '-', 'Cihaz kodu': b.cihaz,
        'Kabul tarihi': zamanYaz(b.tarih), 'Beyan sürümü': String(b.surum),
        'Beyan': BEYAN_METNI.map(function (p, i) { return (i + 1) + '. ' + p[0] + ': ' + p[1]; }).join('\n')
      })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && String(j.success) === 'true') {
        yaz(K.beyanKuyruk, null);
        var k = beyanKaydi(); if (k) { k.gonderildi = new Date().toISOString(); yaz(K.beyan, JSON.stringify(k)); }
      }
    }).catch(function () { /* sonraki açılışta yeniden denenir */ }).then(function () { beyanYolda = false; });
  }
  function yoneticiGirisHtml() {
    if (ROL !== 'yonetici') return '';
    return '<details class="lsyon"><summary>Yönetici girişi</summary>' +
      (window.BESI_KASA ? '<label class="field"><span>Yönetici şifresi</span><input type="password" id="lsYon" autocomplete="current-password" autocapitalize="off" spellcheck="false"></label>'
        : '<label class="field"><span>Yönetici anahtarı</span><textarea id="lsYon" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea></label>') +
      '<button class="sec" id="lsYonGir">Giriş yap</button><p class="muted" id="lsYonDurum" role="status"></p></details>';
  }
  function yoneticiGirisBagla() {
    if (!$('lsYonGir')) return;
    $('lsYonGir').addEventListener('click', function () {
      var d = $('lsYonDurum');
      if (!subtle) { d.textContent = 'Bu tarayıcı desteklemiyor.'; return; }
      var girilen = $('lsYon').value.trim();
      d.textContent = 'Denetleniyor…';
      // Kısa metin şifredir (şifreli anahtarı açar); uzun metin anahtarın kendisidir.
      var anahtar = window.BESI_KASA && girilen.length < 60 ? kasaAc(girilen) : Promise.resolve(girilen);
      anahtar.then(function (m) { return m ? yoneticiAnahtari(m) : null; }).then(function (y) {
        if (!y) { d.textContent = window.BESI_KASA ? 'Yönetici şifresi yanlış.' : 'Yönetici anahtarı doğru değil.'; return; }
        yaz(K.yonetici, y.metin); basla();
      });
    });
  }
  function beyanEkrani() {
    var e = $('lisansEkrani');
    var ad = oku('besiRasyon.talepAd') || '', tel = oku('besiRasyon.talepTel') || '';
    e.innerHTML = '<section class="card">' +
      '<h2>Kullanım ve sorumluluk beyanı</h2>' +
      '<p class="muted">Besi Rasyon\'u kullanmadan önce aşağıdaki metni okuyup onaylayın. Onaydan sonra lisans isteyebilirsiniz.</p>' +
      '<div class="beyanmetin" tabindex="0">' + beyanMetniHtml() + '</div>' +
      '<label class="field"><span>Adınız soyadınız</span><input type="text" id="byAd" maxlength="60" autocomplete="name" value="' + esc(ad) + '"></label>' +
      '<label class="field"><span>Telefonunuz</span><input type="text" id="byTel" inputmode="tel" maxlength="20" autocomplete="tel" value="' + esc(tel) + '"></label>' +
      '<label class="field"><span>İl / ilçe (isteğe bağlı)</span><input type="text" id="byYer" maxlength="40"></label>' +
      '<label class="check beyanonay"><input type="checkbox" id="byOnay"> Yukarıdaki beyanı okudum, anladım. Programın kullanımından ve kendi hatalarımdan doğan sorumluluğun bana ait olduğunu kabul ediyorum.</label>' +
      '<button class="main" id="byKabul" disabled>Kabul ediyorum, devam et</button>' +
      '<p class="muted" id="byDurum" role="status">Kabulünüz (ad, telefon, cihaz kodu, tarih) programın yöneticisine e-postayla gönderilir.</p>' +
      yoneticiGirisHtml() + '</section>';
    var denetle = function () {
      $('byKabul').disabled = !($('byOnay').checked && $('byAd').value.trim().length >= 3 && $('byTel').value.replace(/\D/g, '').length >= 10);
    };
    ['byAd', 'byTel', 'byOnay'].forEach(function (id) { $(id).addEventListener('input', denetle); $(id).addEventListener('change', denetle); });
    $('byKabul').addEventListener('click', function () {
      var k = { surum: BEYAN_SURUM, ad: $('byAd').value.trim(), tel: $('byTel').value.trim(), yer: $('byYer').value.trim(), tarih: new Date().toISOString(), cihaz: KOD };
      yaz(K.beyan, JSON.stringify(k));
      yaz(K.beyanKuyruk, JSON.stringify(k));
      yaz('besiRasyon.talepAd', k.ad); yaz('besiRasyon.talepTel', k.tel);
      beyanGonder();
      basla();
    });
    yoneticiGirisBagla();
    kilitle(false);
    window.scrollTo(0, 0);
  }
  function waLink(no, metin) { return 'https://wa.me/' + no + '?text=' + encodeURIComponent(metin); }
  function postaLink(metin) { return 'mailto:' + EPOSTA + '?subject=' + encodeURIComponent('Besi Rasyon lisans talebi') + '&body=' + encodeURIComponent(metin); }

  function kopyala(metin, durum, mesaj) {
    var A = window.BesiAndroid;
    var tamam = function () { if (durum) durum.textContent = mesaj || 'Kopyalandı.'; };
    if (A && A.copy) { A.copy(metin); tamam(); return; }
    var yedek = function () {
      var t = document.createElement('textarea'); t.value = metin; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); tamam(); } catch (e) { if (durum) durum.textContent = 'Kopyalanamadı; metni seçip kopyalayın.'; }
      t.remove();
    };
    try { navigator.clipboard.writeText(metin).then(tamam, yedek); } catch (e) { yedek(); }
  }

  // ---- Ekran ----
  var KOD = null, yonetici = null;

  function kilitle(acikMi) {
    document.body.classList.toggle('kilitli', !acikMi);
    $('lisansEkrani').hidden = acikMi;
    if (acikMi) document.dispatchEvent(new CustomEvent('besi:acildi'));
  }

  function lisansEkrani(neden) {
    var e = $('lisansEkrani');
    var ad = oku('besiRasyon.talepAd') || '', tel = oku('besiRasyon.talepTel') || '';
    var uyar = { sure: 'Lisansınızın süresi doldu. Yenilemek için aşağıdan talep gönderin.', cihaz: 'Bu lisans başka bir cihaz için verilmiş.', imza: 'Lisans anahtarı geçersiz. Size gönderilen metni eksiksiz yapıştırın.', bicim: 'Lisans anahtarı tanınmadı. "BESI-" ile başlayan metnin tamamını yapıştırın.', destek: 'Bu tarayıcı lisans doğrulamayı desteklemiyor. Uygulamayı güncel bir tarayıcıda ya da telefona kurulu sürümde açın.' }[neden];
    e.innerHTML = '<section class="card">' +
      '<h2>Besi Rasyon lisansı</h2>' +
      '<p class="muted">Uygulamayı kullanmak için lisans gerekir. Aşağıdaki cihaz kodunuzla lisans isteyin; size gönderilen lisans anahtarını en alttaki kutuya yapıştırın.</p>' +
      (uyar ? '<div class="msg bad">' + uyar + '</div>' : '') +
      '<div class="cihazkod"><span>Cihaz kodunuz</span><b id="lsKod">' + KOD + '</b><button class="link" id="lsKodKopyala">Kopyala</button></div>' +
      '<label class="field"><span>Adınız soyadınız (isteğe bağlı)</span><input type="text" id="lsAd" maxlength="60" value="' + esc(ad) + '"></label>' +
      '<label class="field"><span>Telefonunuz (isteğe bağlı)</span><input type="text" id="lsTel" inputmode="tel" maxlength="20" value="' + esc(tel) + '"></label>' +
      '<div class="lsdugme">' +
      '<a class="main wa" id="lsWa" target="_blank" rel="noopener">WhatsApp ile lisans iste</a>' +
      '<a class="sec" id="lsPosta" target="_blank" rel="noopener">E-posta ile iste</a>' +
      '</div>' +
      '<p class="muted">Talep, +90 544 524 50 62 numarasına WhatsApp mesajı ya da ' + EPOSTA + ' adresine e-posta olarak gider.</p>' +
      '<label class="field"><span>Lisans anahtarı</span><textarea id="lsAnahtar" rows="3" placeholder="BESI-..." autocomplete="off" autocapitalize="off" spellcheck="false"></textarea></label>' +
      '<button class="main" id="lsEtkin">Lisansı etkinleştir</button>' +
      '<p class="muted" id="lsDurum" role="status"></p>' +
      yoneticiGirisHtml() + '</section>';
    var guncelle = function () {
      var a = $('lsAd').value.trim(), t = $('lsTel').value.trim();
      yaz('besiRasyon.talepAd', a || null); yaz('besiRasyon.talepTel', t || null);
      var m = talepMetni(KOD, a, t, neden === 'sure');
      $('lsWa').href = waLink(WA_NO, m); $('lsPosta').href = postaLink(m);
    };
    guncelle();
    $('lsAd').addEventListener('input', guncelle); $('lsTel').addEventListener('input', guncelle);
    $('lsKodKopyala').addEventListener('click', function () { kopyala(KOD, $('lsDurum'), 'Cihaz kodu kopyalandı.'); });
    $('lsEtkin').addEventListener('click', function () {
      var d = $('lsDurum');
      if (!subtle) { d.textContent = 'Bu tarayıcı lisans doğrulamayı desteklemiyor.'; return; }
      d.textContent = 'Denetleniyor…';
      lisansCoz($('lsAnahtar').value).then(function (l) {
        var n = !l.ok ? l.neden : l.kod !== KOD.replace(/-/g, '').slice(2) ? 'cihaz' : kalanGun(l.bitis) < 0 ? 'sure' : null;
        if (n) { d.textContent = { sure: 'Bu lisansın süresi dolmuş.', cihaz: 'Bu lisans başka bir cihaz kodu için verilmiş (BR-' + String(l.kod).slice(0, 5) + '-' + String(l.kod).slice(5) + ').', imza: 'Lisans anahtarı geçersiz.', bicim: 'Lisans anahtarı tanınmadı; "BESI-" ile başlayan metnin tamamını yapıştırın.' }[n]; return; }
        yaz(K.lisans, l.anahtar);
        basla();
      });
    });
    yoneticiGirisBagla();
    kilitle(false);
  }

  // Lisanslıysa alttaki bilgi satırı; süre 15 günden azsa yenileme uyarısı.
  function lisansBilgi(l) {
    var b = $('lisansBilgi');
    if (!b) return;
    if (yonetici) { b.innerHTML = 'Yönetici olarak açık. <button class="link" id="lsYonCik">Yönetici çıkışı</button>'; }
    else {
      var kalan = kalanGun(l.bitis);
      b.innerHTML = 'Lisans: ' + esc(l.ad || KOD) + ' · ' + (l.bitis >= 99991231 ? 'süresiz' : tarihYaz(l.bitis) + ' tarihine kadar') + ' · Cihaz kodu ' + KOD;
      if (kalan <= 15) {
        var m = talepMetni(KOD, oku('besiRasyon.talepAd') || l.ad, oku('besiRasyon.talepTel') || '', true);
        var u = $('lisansUyari');
        u.hidden = false;
        u.innerHTML = 'Lisansınızın bitmesine <b>' + kalan + ' gün</b> kaldı. <a target="_blank" rel="noopener" href="' + esc(waLink(WA_NO, m)) + '">WhatsApp ile yenileme isteyin</a>.';
      }
    }
    var c = $('lsYonCik');
    if (c) c.addEventListener('click', function () {
      if (!c.classList.contains('onay')) { c.classList.add('onay'); c.textContent = 'Emin misiniz? Anahtarı yeniden yazmanız gerekir'; return; }
      yaz(K.yonetici, null); location.reload();
    });
  }

  // ---- Yönetici: lisans ver ----
  function verilenler() { try { return JSON.parse(oku(K.verilen) || '[]'); } catch (e) { return []; } }
  function yoneticiPaneli() {
    var p = $('yoneticiKart');
    p.hidden = false;
    document.querySelectorAll('[data-lisans-menu]').forEach(function (d) { d.hidden = false; });
    p.innerHTML = '<summary>Yönetici: lisans ver</summary>' +
      '<p class="muted">Kullanıcının gönderdiği mesajı ya da cihaz kodunu aşağıya yapıştırın. Kod mesajın içinden kendiliğinden bulunur.</p>' +
      '<label class="field"><span>Cihaz kodu ya da talep mesajı</span><textarea id="yvKod" rows="3" autocomplete="off" autocapitalize="characters" spellcheck="false"></textarea></label>' +
      '<p class="muted" id="yvBulunan"></p>' +
      '<div class="alanlar">' +
      '<label class="field"><span>Kullanıcı adı</span><input type="text" id="yvAd" maxlength="60"></label>' +
      '<label class="field"><span>Telefonu (WhatsApp için)</span><input type="text" id="yvTel" inputmode="tel" maxlength="20" placeholder="05xx xxx xx xx"></label>' +
      '<label class="field"><span>Süre</span><select id="yvSure">' + SURELER.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === '1y' ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></label>' +
      '</div>' +
      '<button class="main" id="yvUret">Lisans oluştur</button>' +
      '<div id="yvSonuc"></div>' +
      '<h3>Verilen lisanslar</h3><div id="yvListe"></div>';
    var bul = function () {
      var t = $('yvKod').value, k = kodBul(t);
      $('yvBulunan').textContent = k ? 'Cihaz kodu: ' + k : t.trim() ? 'Metinde cihaz kodu bulunamadı (BR-XXXXX-XXXXX).' : '';
      var ad = t.match(/Ad Soyad:\s*(.+)/i), tel = t.match(/Telefon:\s*([+\d][\d\s]+)/i);
      if (ad && !$('yvAd').value) $('yvAd').value = ad[1].trim();
      if (tel && !$('yvTel').value) $('yvTel').value = tel[1].trim();
    };
    $('yvKod').addEventListener('input', bul);
    $('yvUret').addEventListener('click', function () {
      var k = kodBul($('yvKod').value), out = $('yvSonuc');
      if (!k) { out.innerHTML = '<div class="msg bad">Önce geçerli bir cihaz kodu yazın (BR-XXXXX-XXXXX).</div>'; return; }
      var sure = SURELER.filter(function (s) { return s[0] === $('yvSure').value; })[0];
      var bitis = gunEkle(sure[2]), ad = $('yvAd').value.trim(), tel = $('yvTel').value.replace(/\D/g, '');
      if (tel.charAt(0) === '0') tel = '9' + tel; else if (tel.length === 10) tel = '90' + tel;
      lisansUret(yonetici, k.replace(/-/g, '').slice(2), bitis, ad).then(function (anahtar) {
        var mesaj = 'Besi Rasyon lisansınız (' + (bitis >= 99991231 ? 'süresiz' : tarihYaz(bitis) + ' tarihine kadar') + '):\n\n' + anahtar +
          '\n\nUygulamada "Lisans anahtarı" kutusuna yapıştırıp "Lisansı etkinleştir"e basın.';
        out.innerHTML = '<div class="msg info">Lisans hazır: <b>' + esc(ad || k) + '</b>, ' + (bitis >= 99991231 ? 'süresiz' : tarihYaz(bitis) + ' tarihine kadar') + '.</div>' +
          '<textarea class="copybox" id="yvAnahtar" readonly rows="4"></textarea>' +
          '<div class="lsdugme"><a class="main wa" target="_blank" rel="noopener" href="' + esc(tel.length >= 11 ? waLink(tel, mesaj) : 'https://wa.me/?text=' + encodeURIComponent(mesaj)) + '">WhatsApp ile gönder</a>' +
          '<button class="sec" id="yvKopyala">Mesajı kopyala</button></div><p class="muted" id="yvDurum" role="status"></p>';
        $('yvAnahtar').value = mesaj;
        $('yvKopyala').addEventListener('click', function () { kopyala(mesaj, $('yvDurum'), 'Lisans mesajı kopyalandı.'); });
        var liste = verilenler();
        liste.unshift({ t: bugun(), kod: k, ad: ad, tel: tel, bitis: bitis, anahtar: anahtar });
        yaz(K.verilen, JSON.stringify(liste.slice(0, 500)));
        listele();
      });
    });
    listele();
  }
  function listele() {
    var l = verilenler(), box = $('yvListe');
    if (!l.length) { box.innerHTML = '<p class="muted">Henüz lisans verilmedi.</p>'; return; }
    box.innerHTML = '<div class="scroll"><table><thead><tr><th>Tarih</th><th>Kullanıcı</th><th>Cihaz kodu</th><th class="n">Bitiş</th></tr></thead><tbody>' +
      l.map(function (x) { return '<tr><td>' + tarihYaz(x.t) + '</td><td>' + esc(x.ad || '–') + (x.tel ? '<small class="lim">+' + esc(x.tel) + '</small>' : '') + '</td><td>' + esc(x.kod) + '</td><td class="n">' + tarihYaz(x.bitis) + '</td></tr>'; }).join('') +
      '</tbody></table></div><button class="link" id="yvCsv">Listeyi kopyala (Excel için)</button><p class="muted" id="yvCsvDurum" role="status"></p>';
    $('yvCsv').addEventListener('click', function () {
      var csv = 'Tarih\tKullanıcı\tTelefon\tCihaz kodu\tBitiş\tLisans\n' + l.map(function (x) { return [tarihYaz(x.t), x.ad, x.tel, x.kod, tarihYaz(x.bitis), x.anahtar].join('\t'); }).join('\n');
      kopyala(csv, $('yvCsvDurum'), 'Liste kopyalandı; Excel\'e yapıştırabilirsiniz.');
    });
  }

  // Yönetici uygulamasının ilk açılışı: yalnızca yönetici anahtarı istenir.
  function yoneticiEkrani() {
    $('lisansEkrani').innerHTML = '<section class="card"><h2>Besi Rasyon Yönetici</h2>' +
      '<p class="muted">' + (window.BESI_KASA ? 'Yönetici şifrenizi bir kez yazın; bu cihazda bir daha sorulmaz.' : 'Size verilen yönetici anahtarını (BesiRasyon-YONETICI-ANAHTARI.txt dosyasındaki uzun satır) bir kez yapıştırın; bu cihazda bir daha sorulmaz.') + '</p>' +
      yoneticiGirisHtml().replace('<details class="lsyon">', '<details class="lsyon" open>') + '</section>';
    yoneticiGirisBagla();
    kilitle(false);
  }

  function basla() {
    KOD = cihazKodu();
    if (!subtle) { lisansEkrani('destek'); return; }
    var y = ROL === 'yonetici' ? oku(K.yonetici) : null;
    var yonDene = y ? yoneticiAnahtari(y) : Promise.resolve(null);
    yonDene.then(function (yk) {
      if (y && !yk) yaz(K.yonetici, null);  // bozuk ya da eski anahtar
      if (yk) {
        yonetici = yk.anahtar;
        yoneticiPaneli(); lisansBilgi({}); kilitle(true);
        return;
      }
      if (ROL === 'yonetici') { yoneticiEkrani(); return; }
      // Önce sorumluluk beyanı onaylanır, sonra lisans denetlenir.
      if (!beyanKaydi()) { beyanEkrani(); return; }
      beyanGonder();
      var kayit = oku(K.lisans);
      if (!kayit) { lisansEkrani(); return; }
      lisansCoz(kayit).then(function (l) {
        if (!l.ok) { yaz(K.lisans, null); lisansEkrani(l.neden); return; }
        if (l.kod !== KOD.replace(/-/g, '').slice(2)) { lisansEkrani('cihaz'); return; }
        if (kalanGun(l.bitis) < 0) { lisansEkrani('sure'); return; }
        lisansBilgi(l); kilitle(true);
      });
    });
  }

  window.BesiLisans = {
    cihazKodu: cihazKodu, lisansCoz: lisansCoz, kodBul: kodBul,
    beyanMetniHtml: beyanMetniHtml, beyanKaydi: beyanKaydi, zamanYaz: zamanYaz,
    yonetici: function () { return !!yonetici; },
    rol: ROL
  };
  document.body.classList.add('kilitli');
  basla();
})();
