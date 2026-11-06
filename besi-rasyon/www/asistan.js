// Asistan sayfası: besi sığırcılığı sorularını internet üzerinden yapay zekâya sorar.
// Anahtar uygulamada yoktur; soru, lisansla birlikte asistan-sunucu/ klasöründeki sunucuya gider.
// Soru dışında hiçbir bilgi kendiliğinden gönderilmez; son rasyon özeti yalnızca kutu işaretliyse eklenir.
(function () {
  'use strict';
  // Sunucu Vercel'e kurulunca adresi buraya yazın (asistan-sunucu/README.md). Boşsa asistan "kurulmadı" der.
  var ADRES = '';
  var ADRES_KEY = 'besiRasyon.asistanAdres';  // yalnızca deneme için: yönetici sayfadan geçici adres girebilir
  var SOHBET_KEY = 'besiRasyon.asistanSohbet';
  var ONERILER = ['Tuz ve mineral ne kadar verilmeli?', 'Rasyon değişikliği nasıl yapılır?', 'Silaj kalitesi nasıl anlaşılır?', 'Hayvan yemden kesildi, ne yapmalıyım?'];

  var $ = function (id) { return document.getElementById(id); };
  function esc(x) { return String(x === undefined || x === null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function oku(k, v) { try { var x = JSON.parse(localStorage.getItem(k) || 'null'); return x === null ? v : x; } catch (e) { return v; } }
  function yaz(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* özel mod */ } }
  function adres() { return (BesiLis() && BesiLis().yonetici() && oku(ADRES_KEY, '')) || ADRES; }
  function BesiLis() { return window.BesiLisans; }

  // Yanıt metnini güvenli biçimde göster: kaçış + **kalın** + satır sonu.
  function bicim(t) { return esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'); }

  function baglam() {
    var s = oku('besiRasyon.sonHesap', null);
    if (!s) return '';
    return 'Son hesaplanan rasyon: ' + s.bw + ' kg canlı ağırlık, ' + s.adg + ' kg/gün hedef artış, ' + s.heads + ' baş. ' +
      'Rasyon: ' + (s.yemler || []).map(function (y) { return y[0] + ' ' + (Math.round(y[1] * 10) / 10) + ' kg'; }).join(', ') + '. ' +
      'Hayvan başı günlük yem maliyeti ' + (Math.round(s.maliyet * 100) / 100) + ' TL.';
  }

  var sohbet = oku(SOHBET_KEY, []);   // [{role, content}]
  var yolda = false;

  function mesajlariCiz() {
    var kap = $('asSohbet');
    if (!kap) return;
    kap.innerHTML = sohbet.map(function (m) {
      return '<div class="ms ' + (m.role === 'user' ? 'ben' : (m.hata ? 'asi hata' : 'asi')) + '">' + bicim(m.content) + '</div>';
    }).join('');
    kap.lastElementChild && kap.lastElementChild.scrollIntoView({ block: 'nearest' });
  }

  function hataMesaji(durum, govde) {
    if (durum === 401) return 'Asistan lisansınızı doğrulayamadı. Lisansınızın süresi dolmuş ya da başka cihaz için verilmiş olabilir.';
    if (durum === 429) return 'Saatlik soru sınırına ulaştınız. Biraz sonra tekrar deneyin.';
    return (govde && govde.hata) || 'Asistan şu an yanıt veremiyor (hata ' + durum + ').';
  }

  function sor(metin) {
    metin = String(metin || '').trim();
    if (!metin || yolda) return;
    var url = adres();
    if (!url) return;
    var bag = $('asBaglam') && $('asBaglam').checked ? baglam() : '';
    sohbet.push({ role: 'user', content: metin });
    var cevap = { role: 'assistant', content: '' };
    sohbet.push(cevap);
    yolda = true; mesajlariCiz(); durum('Yanıt hazırlanıyor…');
    $('asGonder').disabled = true;
    // Sunucuya yalnızca son mesajlar gider (boş ya da hatalı yanıtlar hariç).
    var gecmis = sohbet.slice(0, -1).filter(function (m) { return !m.hata && m.content; }).map(function (m) { return { role: m.role, content: m.content }; });
    var bitir = function () { yolda = false; if ($('asGonder')) $('asGonder').disabled = false; durum(''); yaz(SOHBET_KEY, sohbet.filter(function (m) { return !m.hata; }).slice(-20)); };
    var hatali = function (m) { cevap.hata = true; cevap.content = m; mesajlariCiz(); bitir(); };

    BesiLis().asistanBaslik().then(function (b) {
      if (!b) { hatali('Asistan için geçerli lisans gerekli.'); return; }
      var basliklar = { 'content-type': 'application/json' };
      Object.keys(b).forEach(function (k) { basliklar[k] = b[k]; });
      return fetch(url, { method: 'POST', headers: basliklar, body: JSON.stringify({ mesajlar: gecmis, baglam: bag }) }).then(function (r) {
        if (!r.ok) return r.json().catch(function () { return null; }).then(function (g) { hatali(hataMesaji(r.status, g)); });
        if (!r.body || !r.body.getReader) return r.text().then(function (t) { cevap.content = t; mesajlariCiz(); bitir(); });
        var okuyucu = r.body.getReader(), dec = new TextDecoder();
        var dongu = function () {
          return okuyucu.read().then(function (x) {
            if (x.done) { if (!cevap.content) cevap.content = '(Boş yanıt geldi.)'; mesajlariCiz(); bitir(); return; }
            cevap.content += dec.decode(x.value, { stream: true });
            mesajlariCiz();
            return dongu();
          });
        };
        return dongu();
      });
    }).catch(function () {
      if (cevap.content) { mesajlariCiz(); bitir(); }
      else hatali('Bağlantı kurulamadı. İnternetiniz açık mı?');
    });
  }

  function durum(t) { if ($('asDurum')) $('asDurum').textContent = t; }

  function ciz(kap, sayfaBas) {
    var bas = sayfaBas('💬', 'Asistan', 'Besi sığırcılığı sorularınızı yazın. Yanıtlar genel bilgidir; veteriner yerine geçmez.');
    if (!adres()) {
      kap.innerHTML = bas + '<section class="card"><h2>Asistan henüz kurulmadı</h2><p class="muted">Asistanın çalışması için sunucusu kurulmalı. ' +
        'Kurulum adımları asistan-sunucu/README.md dosyasında.</p>' +
        (BesiLis() && BesiLis().yonetici() ? '<label class="field"><span>Deneme için sunucu adresi</span><input type="url" id="asAdres" placeholder="https://.../api/asistan"></label><button class="sec" id="asAdresKaydet">Kaydet</button>' : '') + '</section>';
      if ($('asAdresKaydet')) $('asAdresKaydet').addEventListener('click', function () { yaz(ADRES_KEY, $('asAdres').value.trim()); ciz(kap, sayfaBas); });
      return;
    }
    var son = oku('besiRasyon.sonHesap', null);
    kap.innerHTML = bas + '<section class="card sohbetform">' +
      '<div class="sohbet" id="asSohbet" aria-live="polite"></div>' +
      (sohbet.length ? '' : '<div class="oneri">' + ONERILER.map(function (o, i) { return '<button class="sec" data-o="' + i + '">' + esc(o) + '</button>'; }).join('') + '</div>') +
      '<textarea id="asSoru" rows="3" maxlength="1000" placeholder="Sorunuzu yazın"></textarea>' +
      (son ? '<label class="onay"><input type="checkbox" id="asBaglam"> Son rasyon özetimi soruya ekle (internete gönderilir)</label>' : '') +
      '<div class="dugmeler"><button class="main" id="asGonder">Sor</button>' +
      (sohbet.length ? '<button class="sec" id="asTemizle">Sohbeti sil</button>' : '') + '</div>' +
      '<p class="muted" id="asDurum" role="status"></p>' +
      '<p class="muted">Sorunuz internet üzerinden yapay zekâ hizmetine gönderilir. Hastalık, ilaç ve doz konusunda mutlaka veteriner hekime danışın.</p></section>';
    mesajlariCiz();
    $('asGonder').addEventListener('click', function () { var m = $('asSoru').value; $('asSoru').value = ''; sor(m); });
    $('asSoru').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('asGonder').click(); } });
    kap.querySelectorAll('.oneri button').forEach(function (b) { b.addEventListener('click', function () { sor(ONERILER[+b.getAttribute('data-o')]); ciz(kap, sayfaBas); }); });
    if ($('asTemizle')) $('asTemizle').addEventListener('click', function () { if (!yolda && confirm('Sohbet silinsin mi?')) { sohbet = []; yaz(SOHBET_KEY, []); ciz(kap, sayfaBas); } });
  }

  window.BesiAsistan = { ciz: ciz };
})();
