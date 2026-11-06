// İlaç Takip — ekran kodu. Veri ve kurallar model.js'te; alarmlar Android tarafında (IlacAndroid köprüsü).
(function () {
  'use strict';
  const M = window.IlacModel;
  const ik = window.Ikon.ikon, CIZIM = window.Ikon.CIZIM;
  const formIk = (f, sinif) => ik(f, 'form ' + (sinif || ''));
  const A = window.IlacAndroid || null;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sayi = v => (Math.round(v * 10) / 10).toLocaleString('tr-TR');
  const saatStr = ms => { const d = new Date(ms); return M.pad(d.getHours()) + ':' + M.pad(d.getMinutes()); };

  let S = M.bosDurum();
  let okundu = 0;
  let sekme = 'bugun';
  let takvimAy = M.bugun().slice(0, 7);
  let seciliGun = M.bugun();
  let raporGun = 7;
  let doktorSekme = 'yaklasan';
  let arsivAcik = false;
  let gelismisAcik = false;
  let izin = null;
  const yigin = []; // açık tam sayfalar: {ciz, kapat?}
  let panelKapat = null;

  // ---------- Kayıt ----------
  function yukle() {
    let ham = null;
    try { ham = A ? JSON.parse(A.durumOku()) : JSON.parse(localStorage.getItem('ilacTakip') || 'null'); } catch (e) { ham = null; }
    S = M.duzelt(ham);
    okundu = Date.now();
    temaUygula();
  }
  function kaydet() {
    const veri = Object.assign({}, S, { _okundu: okundu });
    if (A) { A.durumYaz(JSON.stringify(veri)); okundu = Date.now(); }
    else { try { localStorage.setItem('ilacTakip', JSON.stringify(S)); } catch (e) { /* yer yok */ } }
  }
  const RENKLER_TEMA = [
    ['kirmizi', 'Türk kırmızısı', '#E30A17', '#A50D14'],
    ['yesil', 'Yeşil', '#285F57', '#1B4741'],
    ['lacivert', 'Lacivert', '#2C4F7C', '#1C3557'],
    ['mavi', 'Deniz mavisi', '#2A7D9C', '#185A73'],
    ['mor', 'Lavanta', '#6A51A6', '#45317A'],
    ['bordo', 'Bordo', '#8C3344', '#5E1D2A'],
    ['toprak', 'Toprak', '#A85A28', '#7A3A13'],
  ];
  let kaydetZaman = 0;
  function kaydetGec() { clearTimeout(kaydetZaman); kaydetZaman = setTimeout(kaydet, 600); }
  function temaUygula() {
    const r = document.documentElement;
    r.dataset.yazi = S.ayar.yazi || 'normal';
    r.dataset.renk = S.ayar.renk || 'kirmizi';
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = getComputedStyle(r).getPropertyValue('--zemin').trim() || '#F6F1E7';
    let tema = S.ayar.tema;
    if (tema === 'aksam') { const s = new Date().getHours(); tema = s >= 21 || s < 7 ? 'koyu' : 'acik'; }
    if (tema === 'acik' || tema === 'koyu') r.dataset.tema = tema; else delete r.dataset.tema;
    const koyu = tema === 'koyu' || (tema === 'sistem' && matchMedia('(prefers-color-scheme: dark)').matches);
    // Bir hasta seçiliyken bütün ekran o hastanın çok uçuk rengine bürünür (koyu temada değil)
    const hid = S.hastalar && S.hastalar.length ? (S.hastalar.length > 1 ? (S.ayar.aktifHasta || 'hepsi') : S.hastalar[0].id) : 'hepsi';
    const st = r.style;
    ['--zemin', '--kart', '--kum', '--cizgi', '--cizgi-koyu', '--vurgu', '--vurgu-acik', '--koyu1', '--koyu2'].forEach(v => st.removeProperty(v));
    delete r.dataset.hastaTema;
    if (koyu) r.dataset.koyu = '1'; else delete r.dataset.koyu;
    if (hid !== 'hepsi' && !koyu && S.hastalar.length > 1) {
      const c = M.hastaBul(S, hid).renk;
      st.setProperty('--zemin', M.uçukRenk(c, 0.85));
      st.setProperty('--kart', M.uçukRenk(c, 0.96));
      st.setProperty('--kum', M.uçukRenk(c, 0.8));
      st.setProperty('--cizgi', M.uçukRenk(c, 0.7));
      st.setProperty('--cizgi-koyu', M.uçukRenk(c, 0.55));
      st.setProperty('--vurgu', koyuRenk(c, 0.18));
      st.setProperty('--vurgu-acik', M.uçukRenk(c, 0.8));
      st.setProperty('--koyu1', c);
      st.setProperty('--koyu2', koyuRenk(c, 0.3));
      r.dataset.hastaTema = hid;
    }
    if (m) m.content = getComputedStyle(r).getPropertyValue('--zemin').trim() || '#F6F1E7';
    if (A && A.temaRengi) A.temaRengi(koyu, r.dataset.hastaTema ? getComputedStyle(r).getPropertyValue('--zemin').trim() : '');
  }
  function koyuRenk(hex, oran) {
    const n = parseInt(hex.slice(1), 16);
    const k = x => Math.round(x * (1 - oran)).toString(16).padStart(2, '0');
    return '#' + k(n >> 16) + k((n >> 8) & 255) + k(n & 255);
  }

  let isleniyor = false;
  function dozIsaretle(k, durum, dk, sessiz) {
    // Aldım'a basınca kart yeşile döner, kısa bir hareketle kapanır; bu sırada ikinci basış yok sayılır
    if (durum === 'alindi' && !sessiz && !isleniyor) {
      const kart = document.querySelector('[data-k="' + CSS.escape(k) + '"][data-d="alindi"]');
      const el = kart && kart.closest('.doz, .siradaki');
      if (el) {
        isleniyor = true;
        el.classList.add('onay');
        setTimeout(() => { isleniyor = false; dozIsaretle(k, durum, dk, 'animasyonsuz'); }, 420);
        return;
      }
    }
    if (sessiz === 'animasyonsuz') sessiz = false;
    const once = S.kayit[k] ? S.kayit[k].d : 'bekliyor';
    if (A) { A.dozIsle(k, durum, dk || 0); yukle(); }
    else { M.dozIsle(S, k, durum, Date.now(), dk); kaydet(); }
    ciz();
    if (sessiz) return;
    const m = S.ilaclar.find(x => x.id === k.split('|')[0]);
    const ad = m ? m.ad : 'Doz';
    const msj = { alindi: ad + ' alındı', atlandi: ad + ' atlandı', ertelendi: ad + ' ' + dk + ' dakika ertelendi', bekliyor: 'İşaret kaldırıldı' }[durum];
    if (durum === 'alindi') setTimeout(() => ebeveyneHaber([k]), 450);
    bildiri(msj, durum === 'bekliyor' ? null : { ad: 'Geri al', f: () => dozIsaretle(k, once === 'kacirildi' ? 'bekliyor' : once, 0, true) });
    if (durum === 'alindi' && m && M.stokAz(m)) setTimeout(() => bildiri(m.ad + ' azaldı: ' + sayi(m.stok) + ' ' + M.FORMLAR[m.form].birim + ' kaldı'), 2600);
  }

  // ---------- Ebeveyne WhatsApp ----------
  // Aynı hastanın aynı anda alınan ilaçları tek mesajda; WhatsApp hazır mesajla açılır
  function haberMesajlari(anahtarlar) {
    const grup = {};
    anahtarlar.forEach(k => {
      const [id, , saat] = k.split('|');
      const m = S.ilaclar.find(x => x.id === id);
      if (!m) return;
      const h = M.hastaBul(S, m.hasta);
      if (!h.haberVer || !M.telWhatsapp(h.ebeveynTel)) return;
      (grup[h.id] = grup[h.id] || { h, satir: [] }).satir.push(saat + ' · ' + m.ad + ' · ' + M.dozYazi(m, saat));
    });
    return Object.values(grup).map(g => ({
      ad: hastaAd(g.h.id), no: M.telWhatsapp(g.h.ebeveynTel),
      metin: '✅ ' + hastaAd(g.h.id) + ' ilacını aldı.\n' + g.satir.join('\n') + '\nSaat: ' + saatStr(Date.now()) + '\n— İlaç Takip',
    }));
  }
  function whatsappAc(x) {
    if (A && A.whatsapp) A.whatsapp(x.no, x.metin);
    else window.open('https://wa.me/' + x.no + '?text=' + encodeURIComponent(x.metin), '_blank');
  }
  function ebeveyneHaber(anahtarlar) {
    const l = haberMesajlari(anahtarlar);
    if (!l.length) return;
    if (A && A.whatsappListe) {
      // Otomatik gönderme açıksa telefon mesajları sırayla kendisi gönderir
      A.whatsappListe(JSON.stringify(l.map(x => [x.no, x.metin, x.ad])));
      // İzin hiç sorulmadıysa bir kez sor
      if (A.otoGonderAcik && !A.otoGonderAcik() && !S.ayar.waSoruldu) {
        S.ayar.waSoruldu = true; kaydet();
        setTimeout(otoGonderSor, 1500);
      }
      return;
    }
    whatsappAc(l[0]);
    l.slice(1).forEach((x, i) => setTimeout(() => bildiri(x.ad + ' için de haber verilsin mi?', { ad: 'WhatsApp', f: () => whatsappAc(x) }), 600 + i * 7500));
  }
  // Bir kez onay: Erişilebilirlik ayarında "İlaç Takip – WhatsApp otomatik gönderme" açılır
  function otoGonderSor() {
    panelAc('<h3>WhatsApp mesajı bundan sonra kendiliğinden gitsin mi?</h3>' +
      '<p style="margin-top:8px">“Aldım”a basınca ebeveyne mesaj, siz Gönder’e basmadan gider. Bunun için bir kez izin vermeniz gerekir:</p>' +
      '<ol style="margin:8px 0 0;padding-left:20px"><li>Açılan ekranda <b>İndirilen uygulamalar</b> (ya da Yüklü hizmetler) bölümüne girin.</li>' +
      '<li><b>İlaç Takip – WhatsApp otomatik gönderme</b>’yi açın ve onaylayın.</li></ol>' +
      '<p class="soluk kucuk" style="margin-top:8px">Bu izin yalnızca WhatsApp’ta, İlaç Takip’in hazırladığı mesajda Gönder’e basmak için kullanılır; başka hiçbir ekranı okumaz. Android 13 ve sonrasında “kısıtlanmış ayar” uyarısı çıkarsa: Ayarlar &gt; Uygulamalar &gt; İlaç Takip &gt; sağ üstteki ⋮ &gt; <b>Kısıtlanmış ayarlara izin ver</b>, sonra tekrar deneyin.</p>' +
      '<button class="dugme ana buyuk" data-act="otoGonderAc">Evet, izin ekranını aç</button>' +
      '<button class="dugme" data-act="izinAc" data-tur="uygulama">Kısıtlanmış ayar için uygulama bilgisini aç</button>' +
      '<button class="dugme" data-act="panelKapat">Hayır, Gönder’e ben basarım</button>');
  }

  // ---------- Kısa bildirim ----------
  let bildiriZaman = 0;
  function bildiri(metin, eylem) {
    const k = $('#bildiri');
    k.innerHTML = '<div><span>' + esc(metin) + '</span>' + (eylem ? '<button type="button">' + esc(eylem.ad) + '</button>' : '') + '</div>';
    if (eylem) k.querySelector('button').onclick = () => { k.innerHTML = ''; eylem.f(); };
    clearTimeout(bildiriZaman);
    bildiriZaman = setTimeout(() => { k.innerHTML = ''; }, eylem ? 7000 : 4500);
  }

  // ---------- Hastalar ----------
  const cok = () => S.hastalar.length > 1;
  const aktif = () => (cok() ? (S.ayar.aktifHasta || 'hepsi') : 'hepsi');
  const hastaRenk = id => M.hastaBul(S, id).renk;
  const hastaAd = id => M.hastaAdi(S, id);
  const kisaAd = id => hastaAd(id).split(' ')[0];
  // Hasta fotoğrafı ya da baş harfi, hasta renginde halka içinde
  function hastaFoto(id, boy) {
    const h = M.hastaBul(S, id);
    const harf = (hastaAd(id).trim()[0] || '?').toLocaleUpperCase('tr');
    return '<span class="hasta-foto" style="--h:' + esc(h.renk) + ';--b:' + (boy || 36) + 'px">' + (h.foto ? '<img src="' + esc(h.foto) + '" alt="">' : '<b>' + esc(harf) + '</b>') + '</span>';
  }
  function hastaCip(id) {
    return cok() ? '<span class="hasta-cip" style="--h:' + esc(hastaRenk(id)) + '"><i></i>' + esc(hastaAd(id)) + '</span>' : '';
  }
  // Ekranın üstündeki hasta seçici: Hepsi · Fatma · Ali
  function hastaSecici() {
    if (!cok()) return '';
    const a = aktif();
    return '<div class="hasta-sec" role="tablist">' +
      '<button data-act="hastaSec" data-id="hepsi" aria-pressed="' + (a === 'hepsi') + '">Hepsi</button>' +
      S.hastalar.map(h => '<button data-act="hastaSec" data-id="' + esc(h.id) + '" aria-pressed="' + (a === h.id) + '" style="--h:' + esc(h.renk) + ';--hz:' + M.uçukRenk(h.renk, 0.85) + '"><i></i>' + esc(hastaAd(h.id)) + '</button>').join('') +
      '</div>';
  }
  const hastaninMi = m => aktif() === 'hepsi' || m.hasta === aktif();

  // ---------- Ortak parçalar ----------
  const durumAd = { alindi: 'Alındı', atlandi: 'Atlandı', kacirildi: 'Alınmadı', ertelendi: 'Sonraya bırakıldı', bekliyor: 'Bekliyor' };
  function rozet(x) {
    let t = durumAd[x.durum];
    if (x.durum === 'alindi' && x.kayit) t = '✓ Alındı · ' + saatStr(x.kayit.z);
    if (x.durum === 'ertelendi' && x.kayit && x.kayit.e) t = 'Tekrar hatırlatma ' + saatStr(x.kayit.e);
    if (x.durum === 'bekliyor' && x.ms > Date.now()) t = 'Bekliyor';
    if (x.durum === 'bekliyor' && x.ms <= Date.now()) t = 'Saati geldi';
    return '<span class="rozet ' + x.durum + '">' + esc(t) + '</span>';
  }

  // Açık kartlar: sıradaki doz(lar) + kullanıcının dokunup açtıkları
  let siradakiler = new Set();
  const acikDoz = {};
  // Kapalı satır: saat, renkli nokta, ilacın adı, durum; dokununca açılır
  function dozKapali(x, grupta) {
    const m = x.ilac;
    return '<button class="doz-kapali' + (x.durum === 'alindi' || x.durum === 'atlandi' ? ' bitti' : '') + '" style="--r:' + esc(m.renk) + '" data-act="dozAc" data-k="' + esc(x.k) + '">' +
      '<span class="saat">' + esc(x.saat) + '</span><i class="nokta"></i><span class="ad">' + esc(m.ad) + (cok() && !grupta ? ' <small>· ' + esc(kisaAd(m.hasta)) + '</small>' : '') + '</span>' +
      rozet(x) + '<i class="ok">▼</i></button>';
  }
  function dozSatiri(x, gelecek, grupta, liste) {
    if (liste && !siradakiler.has(x.k) && !acikDoz[x.k]) return dozKapali(x, grupta);
    const m = x.ilac;
    const bitti = x.durum === 'alindi' || x.durum === 'atlandi';
    let d = '';
    if (!gelecek) {
      if (bitti) d = '<div class="dugmeler sol"><button class="dugme duz" data-act="doz" data-k="' + esc(x.k) + '" data-d="bekliyor">Geri al</button></div>';
      else d = '<div class="dugmeler doz-dugme">' +
        '<button class="dugme yesil buyuk"' + (cok() ? ' style="background:' + esc(hastaRenk(m.hasta)) + ';border-color:' + esc(hastaRenk(m.hasta)) + '"' : '') + ' data-act="doz" data-k="' + esc(x.k) + '" data-d="alindi">' + (cok() ? '✓ ' + esc(kisaAd(m.hasta)) + ' aldı' : '✓ Aldım') + '</button>' +
        '<button class="dugme buyuk" data-act="ertelePanel" data-k="' + esc(x.k) + '">Sonra</button></div>';
    }
    return '<article class="kart doz' + (bitti ? ' bitti' : '') + (liste && !siradakiler.has(x.k) ? ' acilan' : '') + '" style="--r:' + esc(m.renk) + ';--rz:' + M.uçukRenk(m.renk, 0.9) + '">' +
      (liste && !siradakiler.has(x.k) ? '<button class="doz-kapat" data-act="dozKapat" data-k="' + esc(x.k) + '" aria-label="Kapat">▲</button>' : '') +
      '<div class="renk"></div><div>' + (m.foto ? '<img class="doz-foto" src="' + esc(m.foto) + '" alt="">' : '') + (cok() && !grupta ? '<div style="margin-bottom:6px">' + hastaCip(m.hasta) + '</div>' : '') +
      '<div class="ust-satir"><span class="saat">' + esc(x.saat) + '</span><span class="ad"><span class="ilac-renk">' + formIk(m.form, 'satir-ik') + '</span>' + esc(m.ad) + '</span></div>' +
      '<div class="doz-miktar">' + esc(M.dozYazi(m, x.saat)) + '</div>' +
      '<div class="ayrinti">' + esc([m.doz, M.FORMLAR[m.form].ad].filter(Boolean).join(' · ')) + '</div>' +
      (m.talimat ? '<span class="talimat">' + esc(m.talimat) + '</span>' : '') +
      '<div style="margin-top:8px">' + (gelecek ? '<span class="rozet bekliyor">Planlı</span>' : rozet(x)) + '</div>' +
      d + '</div></article>';
  }

  function neZaman(ms) {
    const fark = Math.round((ms - Date.now()) / 60000);
    if (fark <= 0) return fark > -2 ? 'Saati geldi' : (-fark < 60 ? -fark + ' dakika geçti' : 'Saati geçti');
    if (fark < 60) return fark + ' dakika sonra';
    const sa = Math.floor(fark / 60), dk = fark % 60;
    return sa + ' saat' + (dk ? ' ' + dk + ' dakika' : '') + ' sonra';
  }

  // ---------- Alarm sağlığı ----------
  function izinOku() {
    if (!A) { izin = null; return; }
    try { izin = JSON.parse(A.izinler()); } catch (e) { izin = null; }
  }
  const IZINLER = [
    { k: 'bildirim', ad: 'Bildirim izni', acik: 'Alarm ve hatırlatmaların görünmesi için gerekli.' },
    { k: 'kesinAlarm', ad: 'Tam zamanında alarm', acik: 'Alarmın dakikası dakikasına çalması için gerekli.' },
    { k: 'tamEkran', ad: 'Kilit ekranında alarm', acik: 'Telefon kilitliyken alarm ekranının açılması için gerekli.' },
    { k: 'pil', ad: 'Pil kısıtlaması kapalı', acik: 'Telefon uzun süre dokunulmadan durduğunda da alarmın çalması için önerilir.' },
  ];
  function eksikIzinler() {
    if (!izin) return [];
    return IZINLER.filter(i => izin[i.k] === false);
  }

  // ---------- Ekranlar ----------
  const BASLIK = { bugun: () => { const id = cok() ? aktif() : S.hastalar[0].id; if (id === 'hepsi') return 'Bugün'; const a = M.hastaBul(S, id).ad; return a ? 'Merhaba ' + a.split(' ')[0] : 'Bugün'; }, takvim: 'Takvim', ilaclar: 'İlaçlarım', doktor: 'Doktor', rapor: 'Rapor' };

  function ciz() {
    $('#baslik').textContent = typeof BASLIK[sekme] === 'function' ? BASLIK[sekme]() : BASLIK[sekme];
    $('#altbaslik').textContent = M.tarihYazi(M.bugun(), true);
    $('#zil').classList.toggle('uyari', eksikIzinler().length > 0);
    document.querySelectorAll('#altmenu button').forEach(b => { if (b.dataset.sekme === sekme) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    const fab = $('#ekle');
    fab.hidden = sekme === 'takvim' || sekme === 'bugun';
    fab.dataset.act = sekme === 'doktor' ? 'randevuEkle' : 'ilacEkle';
    fab.querySelector('span').textContent = sekme === 'doktor' ? 'Randevu ekle' : 'İlaç ekle';
    fab.setAttribute('aria-label', sekme === 'doktor' ? 'Randevu ekle' : 'İlaç veya iğne ekle');
    const f = { bugun: bugunCiz, takvim: takvimCiz, ilaclar: ilaclarCiz, doktor: doktorCiz, rapor: raporCiz }[sekme];
    $('#ekran').innerHTML = f();
    if (yigin.length) sayfaYenile();
  }

  function bugunCiz() {
    const t = M.bugun();
    const dozlar = M.gununDozlari(S, t, null, aktif());
    const aktifIlac = S.ilaclar.filter(m => !m.arsiv && hastaninMi(m));
    let h = hastaSecici();

    const eksik = eksikIzinler();
    if (eksik.length) {
      h += '<div class="serit kirmizi"><div class="simge">' + ik('uyari') + '</div><div class="icerik"><b>Alarmlar tam çalışmayabilir</b>' +
        '<div class="kucuk">' + esc(eksik.map(i => i.ad).join(', ')) + ' eksik.</div>' +
        '<div class="dugmeler sol"><button class="dugme ana" data-act="alarmKontrol">Düzelt</button></div></div></div>';
    }

    if (!aktifIlac.length) {
      return h + '<div class="kart bos-durum" style="margin-top:12px">' + CIZIM.ilac + '<h3>Henüz ilaç eklenmedi</h3>' +
        '<p class="soluk">İlacınızı ya da iğnenizi ekleyin; saati gelince telefon alarm gibi çalsın.</p>' +
        '<div class="dugmeler"><button class="dugme ana buyuk" data-act="ilacEkle">İlk ilacı ekle</button></div>' +
        '<div class="dugmeler"><button class="dugme duz" data-act="yedekYukle">Yedekten geri yükle</button></div></div>' + acilCiz();
    }

    // Sıradaki doz: geri sayımlı koyu kart
    const sira = M.sonrakiDoz(S, null, aktif());
    siradakiler = new Set(sira.filter(x => x.tarih === t).map(x => x.k));
    if (sira.length) {
      const ilk = sira[0];
      const gun = ilk.tarih === t ? '' : (ilk.tarih === M.gunEkle(t, 1) ? 'Yarın ' : M.tarihYazi(ilk.tarih) + ' ');
      const k = sira.map(x => x.k).join(',');
      h += '<section class="siradaki">' +
        '<div class="etiket" data-geri-etiket="' + ilk.ms + '">' + (ilk.ms <= Date.now() ? 'İlaç saati geldi' : 'Sıradaki ilaca kalan') + '</div>' +
        '<div class="sayac" data-geri="' + ilk.ms + '">' + geriSayim(ilk.ms) + '</div>' +
        '<div class="ilaclar">' + sira.map(x => '<div class="ilac"' + (cok() ? ' style="border-left:4px solid ' + esc(hastaRenk(x.ilac.hasta)) + '"' : '') + '><span class="ilac-ik">' + (x.ilac.foto ? '<img src="' + esc(x.ilac.foto) + '" alt="">' : formIk(x.ilac.form)) + '</span><span class="ilac-saat">' + esc(gun + x.saat) + '</span><span>' + (cok() ? '<span class="hasta-ad">' + esc(hastaAd(x.ilac.hasta)) + '</span>' : '') + '<b>' + esc(x.ilac.ad) + '</b>' +
          '<small><b class="hero-doz">' + esc(M.dozYazi(x.ilac, x.saat)) + '</b>' + esc([x.ilac.doz, x.ilac.talimat].filter(Boolean).map(v => ' · ' + v).join('')) + '</small></span></div>').join('') + '</div>' +
        '<div class="dugmeler">' + aldiDugmeleri(sira) +
        '<button class="dugme saydam" data-act="ertelePanel" data-k="' + esc(k) + '">Sonra hatırlat</button></div></section>';
    } else {
      h += '<section class="kart"><b>Planlı ilaç kalmadı</b>' +
        '<div class="soluk kucuk">Bitiş tarihi geçmiş ya da saat girilmemiş ilaçlarınızı “İlaçlarım” bölümünden düzenleyebilirsiniz.</div></section>';
    }

    // Günün saatleri (kutucuklar)
    if (dozlar.length) {
      const saatler = [];
      dozlar.forEach(x => { let s = saatler.find(y => y.saat === x.saat); if (!s) saatler.push(s = { saat: x.saat, l: [] }); s.l.push(x); });
      const siradakiSaat = sira.length && sira[0].tarih === t ? sira[0].saat : '';
      const alinan = dozlar.filter(x => x.durum === 'alindi').length;
      h += '<section class="kart saat-kart"><div class="kart-bas"><b>Bugünün saatleri</b><span class="soluk kucuk">' + alinan + ' / ' + dozlar.length + ' alındı</span></div>' +
        '<div class="saat-izgara">' + saatler.map(s => {
          const tamam = s.l.every(x => x.durum === 'alindi' || x.durum === 'atlandi');
          const kacti = s.l.some(x => x.durum === 'kacirildi');
          const durum = tamam ? '✓ Alındı' : kacti ? 'Alınmadı' : s.l.length > 1 ? s.l.length + ' ilaç' : (cok() ? kisaAd(s.l[0].ilac.hasta) : s.l[0].ilac.ad.split(' ')[0]);
          const tekHasta = cok() && s.l.every(x => x.ilac.hasta === s.l[0].ilac.hasta);
          return '<div class="saat-kutu' + (s.saat === siradakiSaat ? ' aktif' : '') + (tamam ? ' tamam' : '') + (kacti && !tamam ? ' kacti' : '') + '"' + (tekHasta ? ' style="border-top:3px solid ' + esc(hastaRenk(s.l[0].ilac.hasta)) + '"' : '') + '><small>' + esc(durum) + '</small><b>' + esc(s.saat) + '</b></div>';
        }).join('') + '</div></section>';
    }

    // Kısayollar
    const a = S.ayar;
    const kisa = [
      ['ilacEkle', 'ekle', 'İlaç ekle', 'y'], ['sekme', 'ilaclar', 'İlaçlarım', 'y', 'ilaclar'], ['sekme', 'takvim', 'Takvim', 'a', 'takvim'], ['raporAc', 'rapor', 'Rapor', 'a'],
      ['ara', 'acil', '112', 'k', '112'], ['ara', 'telefon', a.acilAd ? a.acilAd.split(' ').slice(-1)[0] : 'Yakınım', 'y', a.acilTel], ['ara', 'doktor', 'Doktor', 'a', a.doktorTel], ['ayarlar', 'ayarlar', 'Ayarlar', 'a'],
    ];
    h += '<section class="kart kisayol">' + kisa.map(x =>
      '<button data-act="' + x[0] + '"' + (x[0] === 'sekme' ? ' data-s="' + x[4] + '"' : x[0] === 'ara' ? ' data-tel="' + esc(x[4] || '') + '" data-ne="' + esc(x[2]) + '"' : '') + '>' +
      '<span class="daire ' + x[3] + '">' + ik(x[1]) + '</span><span>' + esc(x[2]) + '</span></button>').join('') + '</section>';

    // Uyarılar
    const az = aktifIlac.filter(M.stokAz);
    az.forEach(m => {
      const g = M.stokGun(m);
      h += '<div class="serit"><div class="simge">' + ik('kutu') + '</div><div class="icerik">' + hastaCip(m.hasta) + '<b style="display:block">' + esc(m.ad) + ' azaldı</b>' +
        '<div class="kucuk">' + sayi(m.stok) + ' ' + esc(M.FORMLAR[m.form].birim) + ' kaldı' + (g != null ? ', yaklaşık ' + g + ' gün yeter' : '') + '. Reçeteyi yeniletin.</div>' +
        '<div class="dugmeler sol"><button class="dugme" data-act="stokPanel" data-id="' + esc(m.id) + '">Yeni kutu ekle</button></div></div></div>';
    });
    const yakin = S.randevular.filter(r => hastaninMi(r) && !r.tamam && r.zaman > Date.now() && r.zaman - Date.now() < 3 * 86400000).sort((x, y) => x.zaman - y.zaman);
    yakin.forEach(r => {
      h += '<div class="serit mavi"><div class="simge">' + ik('randevu') + '</div><div class="icerik">' + hastaCip(r.hasta) + '<b style="display:block">Randevu: ' + esc(randevuZaman(r)) + '</b>' +
        '<div class="kucuk">' + esc([r.doktor, r.brans, r.hastane].filter(Boolean).join(' · ')) + '</div></div></div>';
    });

    // Günün ilaçları
    h += '<section class="bolum"><h2>Bugün içilecek ilaçlar</h2>';
    if (!dozlar.length) h += '<div class="kart soluk">Bugün planlı ilaç yok.</div>';
    else if (cok() && aktif() === 'hepsi') {
      // Hepsi seçiliyken her hasta kendi bölümünde
      S.hastalar.forEach(x => {
        const l = dozlar.filter(d => d.ilac.hasta === x.id);
        if (!l.length) return;
        const al = l.filter(d => d.durum === 'alindi').length;
        h += '<div class="hasta-bolum" style="--h:' + esc(x.renk) + ';--hz:' + M.uçukRenk(x.renk, 0.88) + ';--hk:' + M.uçukRenk(x.renk, 0.95) + '"><div class="hasta-bolum-bas">' + hastaFoto(x.id, 40) + '<span><b>' + esc(hastaAd(x.id)) + '</b><small>' + al + ' / ' + l.length + ' alındı</small></span></div>' + dilimler(l, x.id) + '</div>';
      });
    } else h += dilimler(dozlar, 'tek');
    h += '</section>';
    return h;
  }

  // Sabah / Öğle / Akşam / Gece; bitmiş dilimler kapalı gelir, dokununca açılır
  const DILIM = [['sabah', 'Sabah', 'gunes', 5, 11], ['ogle', 'Öğle', 'ogle', 11, 15], ['aksam', 'Akşam', 'aksam', 15, 21], ['gece', 'Gece', 'gece', 21, 29]];
  const acikDilim = {};
  function dilimler(l, grup) {
    return DILIM.map(dl => {
      const x = l.filter(d => { let s = +d.saat.slice(0, 2); if (s < 5) s += 24; return s >= dl[3] && s < dl[4]; });
      if (!x.length) return '';
      const bitti = x.every(d => d.durum === 'alindi' || d.durum === 'atlandi');
      const anahtar = grup + '-' + dl[0];
      // Yalnızca sıradaki ilacın bulunduğu dilim kendiliğinden açık
      const acik = acikDilim[anahtar] != null ? acikDilim[anahtar] : x.some(d => siradakiler.has(d.k));
      return '<div class="dilim' + (bitti ? ' bitti' : '') + '"><button class="dilim-bas" data-act="dilim" data-k="' + anahtar + '" aria-expanded="' + acik + '">' + ik(dl[2]) + '<b>' + dl[1] + '</b>' +
        '<small>' + (bitti ? ik('tamam', 'tamam-ik') + 'Hepsi tamam' : x.filter(d => d.durum === 'alindi').length + ' / ' + x.length) + '</small><i class="ok">' + (acik ? '▲' : '▼') + '</i></button>' +
        (acik ? '<div class="liste">' + x.map(d => dozSatiri(d, false, grup !== 'tek', true)).join('') + '</div>' : '') + '</div>';
    }).join('');
  }

  function aldiDugmeleri(sira) {
    const gruplar = [];
    sira.forEach(x => { let g = gruplar.find(y => y.h === x.ilac.hasta); if (!g) gruplar.push(g = { h: x.ilac.hasta, k: [] }); g.k.push(x.k); });
    if (gruplar.length === 1 && !cok()) return '<button class="dugme beyaz" data-act="dozHepsi" data-k="' + esc(gruplar[0].k.join(',')) + '" data-d="alindi">' + (sira.length > 1 ? '✓ Hepsini aldım' : '✓ Aldım') + '</button>';
    return gruplar.map(g => '<button class="dugme beyaz" style="box-shadow:inset 4px 0 0 ' + esc(hastaRenk(g.h)) + '" data-act="dozHepsi" data-k="' + esc(g.k.join(',')) + '" data-d="alindi">✓ ' + esc(kisaAd(g.h)) + ' aldı</button>').join('');
  }

  function geriSayim(ms) {
    let f = Math.round((ms - Date.now()) / 1000);
    if (f <= 0) return 'Şimdi';
    const s = Math.floor(f / 3600); f -= s * 3600;
    const d = Math.floor(f / 60);
    return M.pad(s) + ':' + M.pad(d) + ':' + M.pad(f - d * 60);
  }
  setInterval(() => {
    document.querySelectorAll('[data-geri]').forEach(e => { e.textContent = geriSayim(+e.dataset.geri); });
    document.querySelectorAll('[data-geri-etiket]').forEach(e => { if (+e.dataset.geriEtiket <= Date.now()) e.textContent = 'İlaç saati geldi'; });
  }, 1000);

  function acilCiz() {
    const a = S.ayar;
    return '<section class="bolum"><h2>Acil durum</h2><div class="acil">' +
      '<button class="dugme k112" data-act="ara" data-tel="112"><b>112</b>Acil çağrı</button>' +
      '<button class="dugme" data-act="ara" data-tel="' + esc(a.doktorTel) + '" data-ne="Doktor"><b>Doktor</b>' + esc(a.doktorTel ? 'Ara' : 'Ekle') + '</button>' +
      '<button class="dugme" data-act="ara" data-tel="' + esc(a.acilTel) + '" data-ne="Yakın"><b>' + esc(a.acilAd || 'Yakınım') + '</b>' + esc(a.acilTel ? 'Ara' : 'Ekle') + '</button>' +
      '</div>' + S.hastalar.filter(x => x.kan).map(x => '<p class="soluk kucuk" style="margin-top:8px">' + (cok() ? esc(hastaAd(x.id)) + ' – ' : '') + 'Kan grubu: <b>' + esc(x.kan) + '</b></p>').join('') + '</section>';
  }

  // Takvim
  function gunDurumu(t) {
    const d = M.gununDozlari(S, t, null, aktif());
    if (!d.length) return '';
    const simdi = Date.now();
    const gecmis = d.filter(x => x.ms <= simdi);
    if (!gecmis.length) return 'plan';
    const al = gecmis.filter(x => x.durum === 'alindi').length;
    if (al === gecmis.length) return 'tam';
    return al ? 'kismi' : (gecmis.some(x => x.durum === 'bekliyor' || x.durum === 'ertelendi') ? 'kismi' : 'yok');
  }
  function takvimCiz() {
    const [y, a] = takvimAy.split('-').map(Number);
    const ilk = new Date(y, a - 1, 1);
    const bos = (ilk.getDay() + 6) % 7;
    const gunSay = new Date(y, a, 0).getDate();
    const bugun = M.bugun();
    let h = hastaSecici() + '<div class="kart"><div class="ay-bas"><button class="ikon-dugme" data-act="ay" data-y="-1" aria-label="Önceki ay">‹</button>' +
      '<h2>' + M.AYLAR[a - 1] + ' ' + y + '</h2><button class="ikon-dugme" data-act="ay" data-y="1" aria-label="Sonraki ay">›</button></div><div class="ay">' +
      M.GUNLER.map(g => '<div class="gun-adi">' + g + '</div>').join('');
    for (let i = 0; i < bos; i++) h += '<button class="bos" tabindex="-1" aria-hidden="true"></button>';
    for (let g = 1; g <= gunSay; g++) {
      const t = y + '-' + M.pad(a) + '-' + M.pad(g);
      const dr = gunDurumu(t);
      h += '<button data-act="gun" data-t="' + t + '" class="' + (t === bugun ? 'bugun ' : '') + (t === seciliGun ? 'secili' : '') + '">' + g +
        '<span class="nok ' + dr + '"></span></button>';
    }
    h += '</div><div class="aciklama"><span><i style="background:var(--yesil)"></i>Hepsi alındı</span><span><i style="background:var(--turuncu)"></i>Eksik</span>' +
      '<span><i style="background:var(--kirmizi)"></i>Alınmadı</span><span><i style="background:var(--cizgi)"></i>Planlı</span></div></div>';
    const d = M.gununDozlari(S, seciliGun, null, aktif());
    const gelecek = seciliGun > bugun;
    h += '<section class="bolum"><h2>' + esc(M.tarihYazi(seciliGun, true)) + '</h2>';
    h += d.length ? '<div class="liste">' + d.map(x => dozSatiri(x, gelecek)).join('') + '</div>' : '<div class="kart soluk">Bu gün için planlı doz yok.</div>';
    const r = S.randevular.filter(x => hastaninMi(x) && M.tarihStr(new Date(x.zaman)) === seciliGun);
    r.forEach(x => { h += '<div class="serit mavi" style="margin-top:10px"><div class="simge">' + ik('randevu') + '</div><div class="icerik"><b>' + esc(saatStr(x.zaman) + ' · ' + (x.doktor || 'Randevu')) + '</b><div class="kucuk">' + esc([x.brans, x.hastane].filter(Boolean).join(' · ')) + '</div></div></div>'; });
    return h + '</section>';
  }

  // İlaçlar
  function ilacKarti(m) {
    const f = M.FORMLAR[m.form];
    const g = M.stokGun(m);
    const ust = Math.max(m.kritik * 3, m.stok, 1);
    const sinif = m.stok <= m.kritik ? 'kritik' : (g != null && g <= 7 ? 'uyari' : '');
    return '<button class="kart ilac-kart" data-act="ilacDetay" data-id="' + esc(m.id) + '" style="--r:' + esc(m.renk) + '">' +
      '<span class="simge">' + (m.foto ? '<img src="' + esc(m.foto) + '" alt="">' : formIk(m.form)) + '</span><span>' + (cok() && aktif() === 'hepsi' ? '<span style="display:block;margin-bottom:4px">' + hastaCip(m.hasta) + '</span>' : '') +
      '<span class="ad">' + esc(m.ad) + '</span>' +
      '<span class="ayrinti soluk" style="display:block">' + esc([m.doz, f.ad].filter(Boolean).join(' · ')) + '</span>' +
      '<span class="cipler">' + (m.arsiv ? '<span class="cip gri">Arşivde</span>' : '<span class="cip gri">' + esc(M.planYazi(m)) + '</span>' + m.saatler.map(s => '<span class="cip">' + esc(s + ' · ' + M.miktarYazi(M.saatDozu(m, s))) + '</span>').join('')) + '</span>' +
      (m.arsiv ? '' : '<span class="stok-satir" style="display:block"><span class="metin"><span>Kalan: <b>' + sayi(m.stok) + ' ' + esc(f.birim) + '</b></span>' +
        '<span class="' + (sinif ? 'kalin' : 'soluk') + '" style="color:' + (sinif === 'kritik' ? 'var(--kirmizi)' : sinif ? 'var(--turuncu)' : '') + '">' +
        (g == null ? '' : g === 0 ? 'Bugün bitiyor' : '≈ ' + g + ' gün yeter') + '</span></span>' +
        '<span class="cubuk ' + sinif + '" style="display:block"><i style="width:' + Math.min(100, Math.round(m.stok / ust * 100)) + '%"></i></span></span>') +
      '</span></button>';
  }
  function ilaclarCiz() {
    const sira = (a, b) => (cok() ? S.hastalar.findIndex(h => h.id === a.hasta) - S.hastalar.findIndex(h => h.id === b.hasta) : 0) || a.ad.localeCompare(b.ad, 'tr');
    const aktif = S.ilaclar.filter(m => !m.arsiv && hastaninMi(m)).sort(sira);
    const arsiv = S.ilaclar.filter(m => m.arsiv && hastaninMi(m));
    let h = hastaSecici();
    if (!aktif.length) h += '<div class="kart bos-durum">' + CIZIM.ilac + '<h3>Kayıtlı ilaç yok</h3><p class="soluk">Sağ alttaki “İlaç ekle” düğmesiyle başlayın.</p></div>';
    else h += '<div class="liste">' + aktif.map(ilacKarti).join('') + '</div>';
    if (arsiv.length) {
      h += '<section class="bolum"><div class="bolum-baslik"><span>Arşiv (' + arsiv.length + ')</span><button class="dugme duz" data-act="arsivAc">' + (arsivAcik ? 'Gizle' : 'Göster') + '</button></div>';
      if (arsivAcik) h += '<div class="liste">' + arsiv.map(ilacKarti).join('') + '</div>';
      h += '</section>';
    }
    return h;
  }

  // Doktor
  function randevuZaman(r) {
    const t = M.tarihStr(new Date(r.zaman));
    const b = M.bugun();
    const g = t === b ? 'Bugün' : t === M.gunEkle(b, 1) ? 'Yarın' : M.tarihYazi(t, true);
    return g + ', ' + saatStr(r.zaman);
  }
  function doktorCiz() {
    const simdi = Date.now() - 2 * 3600000;
    const yak = S.randevular.filter(r => hastaninMi(r) && !r.tamam && r.zaman >= simdi).sort((a, b) => a.zaman - b.zaman);
    const gec = S.randevular.filter(r => hastaninMi(r) && (r.tamam || r.zaman < simdi)).sort((a, b) => b.zaman - a.zaman);
    const l = doktorSekme === 'yaklasan' ? yak : gec;
    let h = hastaSecici() + '<div class="sekmeler"><button data-act="doktorSekme" data-s="yaklasan" aria-pressed="' + (doktorSekme === 'yaklasan') + '">Yaklaşan (' + yak.length + ')</button>' +
      '<button data-act="doktorSekme" data-s="gecmis" aria-pressed="' + (doktorSekme === 'gecmis') + '">Geçmiş (' + gec.length + ')</button></div>';
    if (!l.length) {
      h += '<div class="kart bos-durum" style="margin-top:12px">' + CIZIM.randevu + '<h3>' + (doktorSekme === 'yaklasan' ? 'Yaklaşan randevu yok' : 'Geçmiş randevu yok') + '</h3>' +
        '<p class="soluk">' + (doktorSekme === 'yaklasan' ? 'Randevu ekleyin; doktora soracaklarınızı da not alın.' : 'Tamamlanan randevular burada listelenir.') + '</p></div>';
      return h + raporKarti();
    }
    h += '<div class="liste" style="margin-top:12px">' + l.map(r => '<article class="kart"' + (cok() ? ' style="border-left:4px solid ' + esc(hastaRenk(r.hasta)) + '"' : '') + '>' + (cok() ? '<div style="margin-bottom:6px">' + hastaCip(r.hasta) + '</div>' : '') +
      '<div class="kalin" style="font-size:1.0625rem">' + esc(randevuZaman(r)) + '</div>' +
      '<div>' + esc([r.doktor, r.brans].filter(Boolean).join(' · ') || 'Doktor randevusu') + '</div>' +
      (r.hastane ? '<div class="soluk">' + esc(r.hastane) + '</div>' : '') +
      (r.sorular ? '<div style="margin-top:8px"><div class="kucuk kalin soluk">Sorulacaklar</div><div style="white-space:pre-wrap">' + esc(r.sorular) + '</div></div>' : '') +
      (r.tavsiye ? '<div style="margin-top:8px"><div class="kucuk kalin soluk">Doktorun söyledikleri</div><div style="white-space:pre-wrap">' + esc(r.tavsiye) + '</div></div>' : '') +
      '<div class="dugmeler">' + (r.tamam ? '<span class="rozet alindi">✓ Görüşme tamamlandı</span>' : '<button class="dugme yesil" data-act="randevuTamam" data-id="' + esc(r.id) + '">Görüşme tamamlandı</button>') +
      '<button class="dugme" data-act="randevuDuzenle" data-id="' + esc(r.id) + '">Düzenle</button></div></article>').join('') + '</div>';
    return h + raporKarti();
  }

  function saglikKarti() {
    return '<section class="bolum"><h2>Sağlık hizmetleri</h2><div class="saglik">' +
      '<button data-act="ara" data-tel="182" data-ne="MHRS">' + ik('telefon') + '<span><b>MHRS randevu: Alo 182</b><small>Hastane ve aile hekimi randevusu</small></span></button>' +
      '<a href="https://www.mhrs.gov.tr">' + ik('randevu') + '<span><b>MHRS internet sitesi</b><small>mhrs.gov.tr</small></span></a>' +
      '<a href="https://enabiz.gov.tr">' + ik('rapor') + '<span><b>e-Nabız</b><small>Reçeteler, tahliller, raporlar</small></span></a>' +
      '<a href="https://www.turkiye.gov.tr/saglik-titck-nobetci-eczane-sorgulama">' + ik('kutu') + '<span><b>Nöbetçi eczane</b><small>e-Devlet üzerinden sorgulama</small></span></a>' +
      '</div><p class="soluk kucuk" style="margin-top:6px">Bu bağlantılar internet ister; uygulamanın geri kalanı internetsiz çalışır.</p></section>';
  }
  function raporKarti() {
    return saglikKarti() + '<section class="bolum"><h2>Doktora gösterilecek rapor</h2><div class="kart"><p>İlaçlarınızı ve son günlerde hangilerini içtiğinizi gösterir. Muayenede doktora gösterebilir ya da yazdırabilirsiniz.</p>' +
      '<div class="dugmeler"><button class="dugme ana buyuk" data-act="raporAc">Raporu aç</button></div></div></section>';
  }

  // Rapor (her hasta ayrı)
  let raporHasta = null;
  const rHasta = () => { if (!cok()) return S.hastalar[0].id; if (!raporHasta || !S.hastalar.some(h => h.id === raporHasta)) raporHasta = aktif() !== 'hepsi' ? aktif() : S.hastalar[0].id; return raporHasta; };
  function raporCiz() {
    const u = M.uyum(S, raporGun, null, rHasta());
    let h = (cok() ? '<div class="hasta-sec">' + S.hastalar.map(x => '<button data-act="raporHasta" data-id="' + esc(x.id) + '" aria-pressed="' + (rHasta() === x.id) + '" style="--h:' + esc(x.renk) + '"><i></i>' + esc(hastaAd(x.id)) + '</button>').join('') + '</div>' : '') +
      '<div class="sekmeler"><button data-act="raporGun" data-g="7" aria-pressed="' + (raporGun === 7) + '">Son 7 gün</button>' +
      '<button data-act="raporGun" data-g="30" aria-pressed="' + (raporGun === 30) + '">Son 30 gün</button></div>';
    if (!u.planlanan) return h + '<div class="kart bos-durum" style="margin-top:12px">' + CIZIM.rapor + '<h3>Henüz veri yok</h3><p class="soluk">İlaçlarınızı “Aldım” diye işaretledikçe burada görünür.</p></div>';
    h += '<div class="kart oran" style="margin-top:12px"><div class="halka" style="--p:' + u.oran + '"><div>%' + u.oran + '</div></div><div class="sayilar">' +
      '<div><span>İçilmesi gereken</span><b>' + u.planlanan + '</b></div><div><span style="color:var(--yesil)">İçildi</span><b>' + u.alinan + '</b></div>' +
      '<div><span style="color:var(--turuncu)">Atlandı</span><b>' + u.atlanan + '</b></div><div><span style="color:var(--kirmizi)">Unutuldu</span><b>' + u.kacirilan + '</b></div></div></div>';
    h += '<section class="bolum"><h2>Günlere göre</h2><div class="kart"><div class="grafik">' + u.gunluk.map(g => {
      const p = g.planlanan ? Math.round(g.alinan / g.planlanan * 100) : 0;
      return '<div title="' + esc(g.tarih) + '"><i class="' + (!g.planlanan ? 'bos' : p < 80 ? 'dusuk' : '') + '" style="height:' + (g.planlanan ? Math.max(p, 3) : 3) + '%"></i></div>';
    }).join('') + '</div><div class="grafik-alt"><span>' + esc(M.tarihYazi(u.gunluk[0].tarih).split(',')[0]) + '</span><span>Bugün</span></div></div></section>';
    h += '<section class="bolum"><h2>İlaçlara göre</h2><div class="kart">' + Object.keys(u.ilac).map(id => {
      const x = u.ilac[id];
      const p = x.planlanan ? Math.round(x.alinan / x.planlanan * 100) : 0;
      return '<div style="margin:6px 0 12px"><div class="stok-satir" style="margin:0"><div class="metin"><b>' + esc(x.ad) + '</b><span>%' + p + ' · ' + x.alinan + '/' + x.planlanan + '</span></div>' +
        '<div class="cubuk ' + (p < 80 ? 'uyari' : '') + '"><i style="width:' + p + '%"></i></div></div></div>';
    }).join('') + '</div></section>';
    h += '<div class="dugmeler"><button class="dugme ana buyuk" data-act="pdf">PDF rapor</button><button class="dugme buyuk" data-act="raporPaylas">Paylaş</button></div>' +
      '<p class="soluk kucuk" style="margin-top:8px">PDF rapor, doktor muayenesine götürmek için ilaç listesini ve son dozları içerir.</p>';
    return h;
  }

  // ---------- Tam sayfalar ----------
  function sayfaAc(ciz, kapat) {
    yigin.push({ ciz, kapat });
    sayfaYenile(true);
  }
  function sayfaYenile(basa) {
    const s = $('#sayfa');
    if (!yigin.length) { s.hidden = true; s.innerHTML = ''; document.body.style.overflow = ''; return; }
    const top = s.scrollTop;
    s.innerHTML = yigin[yigin.length - 1].ciz();
    s.hidden = false;
    document.body.style.overflow = 'hidden';
    s.scrollTop = basa ? 0 : top;
    s.querySelectorAll('textarea.oto').forEach(otoBoy);
  }
  function otoBoy(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; }
  function sayfaKapat() {
    const y = yigin.pop();
    if (y && y.kapat) y.kapat();
    sayfaYenile(true);
    ciz();
  }
  function sayfaBas(baslik) {
    return '<div class="sayfa-bas"><button class="ikon-dugme" data-act="geri" aria-label="Geri"><svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2Z"/></svg></button><h2>' + esc(baslik) + '</h2></div>';
  }

  // İlaç ekle / düzenle
  let taslak = null, taslakHata = {};
  const DOZ_ONERI = {
    tablet: ['1 tablet', '1/2 tablet', '2 tablet'], kapsul: ['1 kapsül', '2 kapsül'], igne: ['1 iğne', '1 ampul', '1 ml'],
    insulin: ['4 ünite', '8 ünite', '10 ünite'], surup: ['1 ölçek', '5 ml', '10 ml'], damla: ['1 damla', '2 damla', '5 damla'],
    krem: ['İnce tabaka'], sprey: ['1 puf', '2 puf'], bant: ['1 bant'], diger: ['1 doz'],
  };
  const TALIMATLAR = ['Tok karnına', 'Aç karnına', 'Yemekle birlikte', 'Yatmadan önce', 'Bol suyla'];
  const ILAC_ONERI = ['Coraspin 100 mg', 'Beloc ZOK 50 mg', 'Glifor 1000 mg', 'Euthyrox 50 mcg', 'Crestor 10 mg', 'Lantus insülin', 'Arveles 25 mg', 'Concor 5 mg', 'Delix 5 mg', 'Lansor 30 mg'];

  function bosRenk(hasta) {
    const kullanilan = S.ilaclar.filter(x => !x.arsiv && x.hasta === hasta).map(x => x.renk);
    return M.RENKLER.find(r => !kullanilan.includes(r)) || M.RENKLER[S.ilaclar.length % M.RENKLER.length];
  }
  function ilacFormu(id) {
    const m = id ? S.ilaclar.find(x => x.id === id) : null;
    taslak = m ? JSON.parse(JSON.stringify(m)) : M.ilacDuzelt({ id: M.yeniId(), hasta: aktif() !== 'hepsi' ? aktif() : S.hastalar[0].id, saatler: ['08:00'], renk: bosRenk(aktif() !== 'hepsi' ? aktif() : S.hastalar[0].id), stok: 0, kritik: 5 });
    if (!m) { taslak.stok = ''; taslak.ad = ''; }
    taslakHata = {};
    sayfaAc(ilacFormuCiz, () => { taslak = null; });
  }
  function ilacFormuCiz() {
    const t = taslak, f = M.FORMLAR[t.form];
    const yeni = !S.ilaclar.some(x => x.id === t.id);
    let h = sayfaBas(yeni ? 'Yeni ilaç veya iğne' : 'İlacı düzenle') + '<div class="sayfa-ic">';
    if (cok()) h += '<div class="alan" style="margin-top:4px"><span class="alan-baslik">Kimin ilacı?</span>' + kimSecici('hasta', t.hasta) + '</div>';
    h += '<label class="alan"><span>İlaç adı</span><textarea class="oto" rows="1" data-alan="ad" placeholder="Örn. Coraspin 100 mg" autocomplete="off" enterkeyhint="next">' + esc(t.ad) + '</textarea>' +
      (t.ad ? '' : '<div class="secenekler" style="margin-top:8px">' + ILAC_ONERI.slice(0, 6).map(o => '<button class="secenek" data-act="tSec" data-alan="ad" data-v="' + esc(o) + '">' + esc(o) + '</button>').join('') + '</div>') +
      (taslakHata.ad ? '<div class="hata-yazi">' + esc(taslakHata.ad) + '</div>' : '') + '</label>';
    h += '<div class="alan"><span class="alan-baslik">Kutunun fotoğrafı</span>' + (t.foto
      ? '<div class="kutu-onizle"><img src="' + esc(t.foto) + '" alt="İlaç kutusu"><div class="dugmeler sol"><button class="dugme" data-act="kutuFoto">' + ik('kamera') + 'Değiştir</button><button class="dugme duz" data-act="kutuFotoSil">Kaldır</button></div></div>'
      : '<button class="dugme tam kutu-ekle" data-act="kutuFoto">' + ik('kamera') + 'Fotoğraf çek ya da seç</button>') +
      '<small class="ipucu">Alarm çalınca kutunun resmi büyük görünür; adı okumadan tanırsınız.</small></div>';
    h += '<div class="alan"><span class="alan-baslik">Ne tür ilaç?</span><div class="secenekler izgara">' + Object.keys(M.FORMLAR).map(k =>
      '<button class="secenek" data-act="tSec" data-alan="form" data-v="' + k + '" aria-pressed="' + (t.form === k) + '">' + formIk(k) + esc(M.FORMLAR[k].ad) + '</button>').join('') + '</div></div>';
    h += '<div class="alan"><span class="alan-baslik">İlacın rengi</span><div class="renkler">' + M.RENKLER.map(r =>
      '<button style="--r:' + r + '" data-act="tSec" data-alan="renk" data-v="' + r + '" aria-pressed="' + (t.renk === r) + '" aria-label="' + esc(M.RENK_ADI[r] || 'Renk') + '"></button>').join('') + '</div>' +
      '<small class="ipucu">Listede, takvimde ve alarm ekranında bu renkle görünür.</small></div>';
    h += '<label class="alan"><span>İlacın gücü (isteğe bağlı)</span><textarea class="oto" rows="1" data-alan="doz" placeholder="Örn. 100 mg, 5 mg/ml">' + esc(t.doz) + '</textarea>' +
      '<small>Kaç tane alınacağını aşağıda her saat için ayrı seçersiniz.</small></label>';

    // Saatler
    h += '<div class="alan"><span class="alan-baslik">Günde kaç kez?</span><div class="secenekler izgara" style="margin-bottom:10px">' +
      [['Günde 1 kez', ['09:00']], ['Günde 2 kez', ['08:00', '20:00']], ['Günde 3 kez', ['08:00', '14:00', '20:00']], ['Günde 4 kez', ['08:00', '12:00', '16:00', '20:00']]].map(p =>
        '<button class="secenek" data-act="saatHazir" data-v="' + p[1].join(',') + '" aria-pressed="' + (t.saatler.join(',') === p[1].join(',')) + '">' + p[0] + '</button>').join('') + '</div>' +
      '<span class="alan-baslik">Alarm saatleri</span><small class="ipucu" style="margin:-4px 0 8px">Saate dokunup değiştirebilirsiniz.</small>' +
      '<div class="saatler">' + t.saatler.map((s, i) => {
        const v = (t.dozlar && t.dozlar[s]) || Number(t.birimDoz) || 1;
        const secimler = [0.25, 0.5, 1, 1.5, 2, 3];
        return '<div class="saat-kart"><div class="saat-satir"><input type="time" data-alan="saat" data-i="' + i + '" value="' + esc(s) + '" aria-label="' + (i + 1) + '. saat">' +
          '<button class="dugme" data-act="saatSil" data-i="' + i + '" aria-label="Bu saati sil">✕</button></div>' +
          '<div class="doz-sec"><span>Bu saatte kaç ' + esc(f.birim) + '?</span><div class="secenekler">' + secimler.map(n =>
            '<button class="secenek" data-act="saatDoz" data-i="' + i + '" data-v="' + n + '" aria-pressed="' + (v === n) + '">' + esc(M.miktarYazi(n)) + '</button>').join('') +
          (secimler.includes(v) ? '' : '<button class="secenek" aria-pressed="true">' + esc(M.miktarYazi(v)) + '</button>') +
          '<button class="secenek" data-act="saatDozOzel" data-i="' + i + '">Başka…</button></div></div></div>';
      }).join('') + '</div>' +
      '<div class="dugmeler sol"><button class="dugme" data-act="saatEkle">+ Bir saat daha</button></div>' +
      (taslakHata.saat ? '<div class="hata-yazi">' + esc(taslakHata.saat) + '</div>' : '') + '</div>';

    h += '<label class="alan"><span>Elinizde kaç ' + esc(f.birim) + ' var?</span><input type="number" inputmode="decimal" min="0" step="any" data-alan="stok" value="' + esc(t.stok) + '" placeholder="Örn. 30">' +
      '<small>Bitmeye yakın sizi uyarırız. Bilmiyorsanız boş bırakın.</small></label>';

    h += '<div class="alan"><span class="alan-baslik">Nasıl içilecek?</span><div class="secenekler">' +
      TALIMATLAR.map(o => '<button class="secenek" data-act="tSec" data-alan="talimat" data-v="' + esc(o) + '" aria-pressed="' + (t.talimat === o) + '">' + esc(o) + '</button>').join('') + '</div>' +
      '<textarea class="oto" rows="1" data-alan="talimat" style="margin-top:8px" placeholder="ya da kendiniz yazın">' + esc(TALIMATLAR.includes(t.talimat) ? '' : t.talimat) + '</textarea></div>';

    // Az kullanılanlar
    h += '<div class="dugmeler"><button class="dugme tam" data-act="fazla" aria-expanded="' + !!t._fazla + '">' + (t._fazla ? 'Diğer seçenekleri gizle ▲' : 'Daha fazla seçenek ▼') + '</button></div>';
    if (!t._fazla) {
      if (t.plan.tur !== 'hergun' || t.bitis) h += '<p class="soluk kucuk" style="margin-top:6px">' + esc(M.planYazi(t)) + (t.bitis ? ', ' + esc(M.tarihYazi(t.bitis, true)) + ' bitiyor' : '') + '</p>';
    } else {
      h += '<div class="alan"><span class="alan-baslik">Hangi günler?</span><div class="secenekler izgara">' +
        [['hergun', 'Her gün'], ['gunler', 'Belli günler'], ['aralik', 'Birkaç günde bir']].map(p =>
          '<button class="secenek" data-act="tSec" data-alan="plan.tur" data-v="' + p[0] + '" aria-pressed="' + (t.plan.tur === p[0]) + '">' + p[1] + '</button>').join('') + '</div>';
      if (t.plan.tur === 'gunler') h += '<div class="secenekler gunler" style="margin-top:10px">' + M.GUNLER.map((g, i) =>
        '<button class="secenek" data-act="gunSec" data-v="' + (i + 1) + '" aria-pressed="' + t.plan.gunler.includes(i + 1) + '">' + g + '</button>').join('') + '</div>' +
        (taslakHata.gun ? '<div class="hata-yazi">' + esc(taslakHata.gun) + '</div>' : '');
      if (t.plan.tur === 'aralik') h += '<div class="secenekler izgara" style="margin-top:10px">' + [[2, '2 günde bir'], [3, '3 günde bir'], [7, 'Haftada bir'], [14, '2 haftada bir'], [28, 'Ayda bir (28 gün)']].map(p =>
        '<button class="secenek" data-act="tSec" data-alan="plan.aralik" data-v="' + p[0] + '" aria-pressed="' + (t.plan.aralik === p[0]) + '">' + p[1] + '</button>').join('') + '</div>' +
        '<small class="ipucu">İlk doz başlangıç günündedir, sonra her ' + esc(t.plan.aralik) + ' günde bir.</small>';
      h += '</div>';
      h += '<label class="alan"><span>Başlangıç günü</span><input type="date" data-alan="baslangic" value="' + esc(t.baslangic) + '"></label>' +
        '<label class="alan"><span>Bitiş günü</span><input type="date" data-alan="bitis" value="' + esc(t.bitis) + '"><small>Sürekli kullanılan ilaçta boş bırakın.</small></label>' +
        (taslakHata.bitis ? '<div class="hata-yazi">' + esc(taslakHata.bitis) + '</div>' : '');
      h += '<label class="alan"><span>Her içişte kaç ' + esc(f.birim) + ' azalsın?</span><input type="number" inputmode="decimal" min="0" step="any" data-alan="birimDoz" value="' + esc(t.birimDoz) + '"></label>' +
        '<label class="alan"><span>Kaç ' + esc(f.birim) + ' kalınca uyarayım?</span><input type="number" inputmode="decimal" min="0" step="any" data-alan="kritik" value="' + esc(t.kritik) + '"></label>';
      h += '<label class="alan"><span>Reçete numarası</span><textarea class="oto" rows="1" data-alan="recete">' + esc(t.recete) + '</textarea></label>';
    }
    h += '</div><div class="sayfa-alt"><div><button class="dugme buyuk" data-act="geri">Vazgeç</button><button class="dugme ana buyuk" data-act="ilacKaydet">Kaydet</button></div></div>';
    return h;
  }
  function kimSecici(alan, secili) {
    return '<div class="secenekler">' + S.hastalar.map(x => '<button class="secenek hasta-secenek" style="--h:' + esc(x.renk) + '" data-act="' + (alan === 'rhasta' ? 'rKim' : 'tSec') + '" data-alan="hasta" data-v="' + esc(x.id) + '" aria-pressed="' + (secili === x.id) + '"><i></i>' + esc(hastaAd(x.id)) + '</button>').join('') + '</div>';
  }
  function taslakAyarla(alan, v) {
    if (!taslak) return;
    if (alan === 'plan.tur') taslak.plan.tur = v;
    else if (alan === 'plan.aralik') taslak.plan.aralik = Math.max(1, Math.min(365, parseInt(v, 10) || 1));
    else if (['stok', 'kritik', 'birimDoz'].includes(alan)) taslak[alan] = v;
    else taslak[alan] = v;
  }
  function ilacKaydet() {
    const t = taslak;
    taslakHata = {};
    t.ad = String(t.ad || '').trim();
    if (!t.ad) taslakHata.ad = 'İlacın adını yazın.';
    const saatler = t.saatler.filter(s => /^\d{2}:\d{2}$/.test(s));
    if (!saatler.length) taslakHata.saat = 'En az bir alarm saati ekleyin.';
    if (t.plan.tur === 'gunler' && !t.plan.gunler.length) taslakHata.gun = 'En az bir gün seçin.';
    if (t.bitis && t.bitis < t.baslangic) taslakHata.bitis = 'Bitiş tarihi başlangıçtan önce olamaz.';
    if (taslakHata.gun || taslakHata.bitis) t._fazla = true;
    if (Object.keys(taslakHata).length) { sayfaYenile(); const e = $('#sayfa .hata-yazi'); if (e) e.scrollIntoView({ block: 'center' }); return; }
    const m = M.ilacDuzelt(Object.assign({}, t, { saatler, stok: t.stok === '' ? 0 : t.stok }));
    const i = S.ilaclar.findIndex(x => x.id === m.id);
    if (i >= 0) S.ilaclar[i] = m; else S.ilaclar.push(m);
    kaydet();
    yigin.pop(); taslak = null;
    sayfaYenile(true);
    ciz();
    bildiri(m.ad + ' kaydedildi. Alarm saatleri: ' + m.saatler.join(', '));
  }

  // İlaç ayrıntısı
  function ilacDetay(id) { sayfaAc(() => ilacDetayCiz(id)); }
  function ilacDetayCiz(id) {
    const m = S.ilaclar.find(x => x.id === id);
    if (!m) return sayfaBas('İlaç') + '<div class="sayfa-ic"><div class="kart">İlaç bulunamadı.</div></div>';
    const f = M.FORMLAR[m.form];
    const g = M.stokGun(m);
    let h = sayfaBas(m.ad) + '<div class="sayfa-ic">';
    h += '<div class="kart" style="border-left:4px solid ' + esc(m.renk) + '">' + (m.foto ? '<img class="detay-foto" src="' + esc(m.foto) + '" alt="İlaç kutusu">' : '') + '<div class="detay-bas">' + formIk(m.form) + '<b>' + esc(m.ad) + '</b></div>' +
      '<div class="soluk">' + esc([m.doz, f.ad].filter(Boolean).join(' · ')) + '</div>' +
      (m.talimat ? '<span class="talimat" style="display:inline-block;margin-top:6px;font-size:.8125rem;font-weight:600;color:var(--turuncu);background:var(--turuncu-acik);padding:2px 8px;border-radius:8px">' + esc(m.talimat) + '</span>' : '') +
      '<div class="cipler" style="margin-top:10px"><span class="cip gri">' + esc(M.planYazi(m)) + '</span>' + m.saatler.map(s => '<span class="cip">' + esc(s + ' · ' + M.dozYazi(m, s)) + '</span>').join('') + '</div>' +
      '<p class="soluk kucuk" style="margin-top:8px">' + esc(M.tarihYazi(m.baslangic, true)) + ' başladı' + (m.bitis ? ', ' + esc(M.tarihYazi(m.bitis, true)) + ' bitecek' : ', sürekli') + '.' + (m.recete ? ' Reçete no: ' + esc(m.recete) : '') + '</p>' +
      (m.arsiv ? '<p class="kalin" style="margin-top:6px;color:var(--turuncu)">Arşivde: alarm çalmaz.</p>' : '') + '</div>';
    h += '<section class="bolum"><h2>Kalan ilaç</h2><div class="kart"><div class="stok-satir" style="margin:0"><div class="metin"><span><b style="font-size:1.25rem">' + sayi(m.stok) + '</b> ' + esc(f.birim) + '</span>' +
      '<span class="soluk">' + (g == null ? '' : '≈ ' + g + ' gün yeter') + '</span></div></div>' +
      '<p class="soluk kucuk">Her dozda ' + sayi(m.birimDoz) + ' azalır. ' + sayi(m.kritik) + ' ' + esc(f.birim) + ' kalınca uyarır.</p>' +
      '<div class="dugmeler"><button class="dugme ana" data-act="stokPanel" data-id="' + esc(m.id) + '">Yeni kutu ekle</button></div></div></section>';
    // Son 14 gün
    let gecmis = '';
    for (let i = 0, t = M.bugun(); i < 14; i++, t = M.gunEkle(t, -1)) {
      M.gununDozlari(S, t).filter(x => x.ilac.id === m.id && x.ms <= Date.now()).reverse().forEach(x => {
        gecmis += '<div class="ayar" style="min-height:48px"><div class="metin"><b>' + esc(M.tarihYazi(t)) + '</b><small>' + esc(x.saat) + '</small></div>' + rozet(x) + '</div>';
      });
    }
    h += '<section class="bolum"><h2>Son 14 gün</h2>' + (gecmis ? '<div class="ayar-grup">' + gecmis + '</div>' : '<div class="kart soluk">Henüz kayıt yok.</div>') + '</section>';
    h += '<div class="dugmeler"><button class="dugme" data-act="ilacDuzenle" data-id="' + esc(m.id) + '">Düzenle</button>' +
      '<button class="dugme" data-act="ilacArsiv" data-id="' + esc(m.id) + '">' + (m.arsiv ? 'Yeniden kullan' : 'Kullanımı bitir') + '</button></div>' +
      '<div class="dugmeler"><button class="dugme tehlike" data-act="ilacSil" data-id="' + esc(m.id) + '">İlacı ve kayıtlarını sil</button></div>';
    return h + '</div>';
  }

  // Randevu formu
  let rTaslak = null;
  function randevuFormu(id) {
    const r = id ? S.randevular.find(x => x.id === id) : null;
    const yarin = M.gunEkle(M.bugun(), 1);
    rTaslak = r ? Object.assign({}, r, { tarih: M.tarihStr(new Date(r.zaman)), saat: saatStr(r.zaman) }) : { id: M.yeniId(), hasta: aktif() !== 'hepsi' ? aktif() : S.hastalar[0].id, doktor: '', brans: '', hastane: '', tarih: yarin, saat: '10:00', sorular: '', tavsiye: '', tamam: false };
    sayfaAc(randevuFormuCiz, () => { rTaslak = null; });
  }
  const BRANSLAR = ['Aile hekimi', 'Dahiliye', 'Kardiyoloji', 'Endokrinoloji', 'Nöroloji', 'Ortopedi', 'Göz', 'Kulak burun boğaz', 'Göğüs hastalıkları', 'Üroloji', 'Kadın doğum', 'Fizik tedavi'];
  function randevuFormuCiz() {
    const r = rTaslak;
    const yeni = !S.randevular.some(x => x.id === r.id);
    return sayfaBas(yeni ? 'Yeni randevu' : 'Randevuyu düzenle') + '<div class="sayfa-ic">' +
      (cok() ? '<div class="alan" style="margin-top:4px"><span class="alan-baslik">Kimin randevusu?</span>' + kimSecici('rhasta', r.hasta) + '</div>' : '') +
      '<label class="alan"><span>Doktor</span><textarea class="oto" rows="1" data-ralan="doktor"  placeholder="Örn. Dr. Ayşe Yılmaz">' + esc(r.doktor) + '</textarea></label>' +
      '<label class="alan"><span>Bölüm</span><textarea class="oto" rows="1" data-ralan="brans">' + esc(r.brans) + '</textarea></label>' + (r.brans ? '' : '<div class="secenekler" style="margin-top:8px">' + BRANSLAR.map(b => '<button class="secenek" data-act="bransSec" data-v="' + esc(b) + '">' + esc(b) + '</button>').join('') + '</div>') +
      '<label class="alan"><span>Hastane / poliklinik</span><textarea class="oto" rows="1" data-ralan="hastane">' + esc(r.hastane) + '</textarea></label>' +
      '<div class="iki"><label class="alan"><span>Tarih</span><input type="date" data-ralan="tarih" value="' + esc(r.tarih) + '"></label>' +
      '<label class="alan"><span>Saat</span><input type="time" data-ralan="saat" value="' + esc(r.saat) + '"></label></div>' +
      (S.ayar.randevuHatirlat ? '<p class="soluk kucuk" style="margin-top:10px">' + ik('randevu') + ' Randevudan 1 gün ve 2 saat önce hatırlatılır.</p>' : '') +
      '<label class="alan"><span>Doktora soracaklarım</span><textarea data-ralan="sorular" placeholder="Örn. Tansiyon ilacının dozu değişecek mi?">' + esc(r.sorular) + '</textarea></label>' +
      '<label class="alan"><span>Doktorun söyledikleri</span><textarea data-ralan="tavsiye" placeholder="Görüşmeden sonra not alın">' + esc(r.tavsiye) + '</textarea></label>' +
      (yeni ? '' : '<div class="dugmeler"><button class="dugme tehlike" data-act="randevuSil" data-id="' + esc(r.id) + '">Randevuyu sil</button></div>') +
      '</div><div class="sayfa-alt"><div><button class="dugme" data-act="geri">Vazgeç</button><button class="dugme ana" data-act="randevuKaydet">Kaydet</button></div></div>';
  }
  function randevuKaydet() {
    const r = rTaslak;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.tarih) || !/^\d{2}:\d{2}$/.test(r.saat)) { bildiri('Tarih ve saati seçin'); return; }
    const kayit = { id: r.id, hasta: r.hasta || S.hastalar[0].id, doktor: r.doktor.trim(), brans: r.brans.trim(), hastane: r.hastane.trim(), zaman: M.zamanMs(r.tarih, r.saat), sorular: r.sorular, tavsiye: r.tavsiye, tamam: !!r.tamam };
    const i = S.randevular.findIndex(x => x.id === r.id);
    if (i >= 0) S.randevular[i] = kayit; else S.randevular.push(kayit);
    kaydet();
    yigin.pop(); rTaslak = null; sayfaYenile(true);
    doktorSekme = kayit.tamam || kayit.zaman < Date.now() ? 'gecmis' : 'yaklasan';
    ciz();
    bildiri('Randevu kaydedildi');
  }

  // ---------- Ayarlar ----------
  function ayarlar() { izinOku(); sayfaAc(ayarlarCiz); }
  function anahtarHtml(alan, acik) {
    return '<label class="anahtar"><input type="checkbox" data-ayar="' + alan + '"' + (acik ? ' checked' : '') + '><span></span></label>';
  }
  function secHtml(alan, deger, secenekler) {
    return '<select data-ayar="' + alan + '">' + secenekler.map(s => '<option value="' + esc(s[0]) + '"' + (String(s[0]) === String(deger) ? ' selected' : '') + '>' + esc(s[1]) + '</option>').join('') + '</select>';
  }
  function ayarlarCiz() {
    const a = S.ayar;
    let h = sayfaBas('Ayarlar') + '<div class="sayfa-ic">';

    // Yazı boyutu: en çok aranan ayar, en üstte
    h += '<section class="bolum" style="margin-top:4px"><h2>Yazı boyutu</h2><div class="secenekler izgara yazi-sec">' +
      [['normal', 'Normal', '1rem'], ['buyuk', 'Büyük', '1.15rem'], ['cokbuyuk', 'Çok büyük', '1.3rem']].map(y =>
        '<button class="secenek" data-act="yaziSec" data-v="' + y[0] + '" aria-pressed="' + (a.yazi === y[0]) + '" style="font-size:' + y[2] + '">' + y[1] + '</button>').join('') + '</div></section>';

    h += '<section class="bolum"><h2>Renk</h2><div class="renk-sec">' + RENKLER_TEMA.map(r =>
      '<button data-act="renkSec" data-v="' + r[0] + '" aria-pressed="' + ((a.renk || 'kirmizi') === r[0]) + '"><i style="--a:' + r[2] + ';--b:' + r[3] + '"></i>' + esc(r[1]) + '</button>').join('') + '</div></section>';

    // Alarm
    h += '<section class="bolum"><h2>Alarm</h2>';
    if (A) {
      const eksik = eksikIzinler();
      const s = A.sonrakiAlarm();
      h += '<div class="ayar-grup"><button class="ayar" data-act="alarmKontrol"><span class="metin"><b>Alarm çalışıyor mu?</b><small>Telefonun alarmı engelleyen ayarlarına bakar</small></span>' +
        '<span class="durum-isaret ' + (eksik.length ? 'eksik' : 'tamam') + '">' + (eksik.length ? 'Düzeltilmeli' : 'Hazır') + '</span></button>' +
        '<div class="ayar"><span class="metin"><b>Sıradaki alarm</b><small>' + (s > 0 ? esc(M.tarihYazi(M.tarihStr(new Date(s))) + ', saat ' + saatStr(s)) : 'Kurulu alarm yok') + '</small></span></div>' +
        '<button class="ayar" data-act="sesSec"><span class="metin"><b>Alarm sesi</b><small>' + esc(a.sesAd || 'Varsayılan alarm sesi') + '</small></span><span class="deger">Değiştir</span></button></div>' +
        '<div class="ayar-grup" style="margin-top:10px"><div class="ayar"><span class="metin"><b>Sesli okuma</b><small>Alarm çalarken ilacın adını, dozunu ve kimin ilacı olduğunu Türkçe söyler</small></span>' + anahtarHtml('sesliOku', a.sesliOku) + '</div>' +
        '<div class="ayar"><span class="metin"><b>Randevu hatırlatması</b><small>Doktor randevusundan 1 gün ve 2 saat önce bildirim</small></span>' + anahtarHtml('randevuHatirlat', a.randevuHatirlat) + '</div></div>' +
        '<div class="dugmeler"><button class="dugme ana buyuk" data-act="alarmDene">Alarmı şimdi dene</button>' + (a.sesliOku ? '<button class="dugme buyuk" data-act="sesliDene">Sesi dinle</button>' : '') + '</div>';
    } else {
      h += '<p class="soluk">Alarmlar telefona kurulan uygulamada çalar; bu web sürümü yalnızca takip içindir.</p>';
    }
    h += '<div class="dugmeler"><button class="dugme tam" data-act="gelismis" aria-expanded="' + gelismisAcik + '">' + (gelismisAcik ? 'Diğer alarm ayarlarını gizle ▲' : 'Diğer alarm ayarları ▼') + '</button></div>';
    if (gelismisAcik) {
      h += '<div class="ayar-grup" style="margin-top:10px">' +
        '<div class="ayar"><span class="metin"><b>Sesi yavaş yükselt</b><small>Alarm kısık başlar, birkaç saniyede tam sese çıkar</small></span>' + anahtarHtml('artanSes', a.artanSes) + '</div>' +
        '<div class="ayar"><span class="metin"><b>Titreşim</b></span>' + anahtarHtml('titresim', a.titresim) + '</div>' +
        '<div class="ayar"><span class="metin"><b>Alarm ne kadar çalsın?</b></span>' + secHtml('calmaDk', a.calmaDk, [[1, '1 dakika'], [2, '2 dakika'], [3, '3 dakika'], [5, '5 dakika']]) + '</div>' +
        '<div class="ayar"><span class="metin"><b>“Aldım” denmezse yeniden çalsın</b></span>' + secHtml('tekrarSayi', a.tekrarSayi, [[0, 'Çalmasın'], [1, '1 kez'], [2, '2 kez'], [3, '3 kez'], [5, '5 kez']]) + '</div>' +
        (a.tekrarSayi > 0 ? '<div class="ayar"><span class="metin"><b>Kaç dakika sonra?</b></span>' + secHtml('tekrarDk', a.tekrarDk, [[3, '3 dakika'], [5, '5 dakika'], [10, '10 dakika'], [15, '15 dakika']]) + '</div>' : '') +
        '<div class="ayar"><span class="metin"><b>Önceden haber ver</b><small>İlaç saatinden önce bir kez bildirim</small></span>' + anahtarHtml('onAlarm', a.onAlarm) + '</div>' +
        (a.onAlarm ? '<div class="ayar"><span class="metin"><b>Ne kadar önce?</b></span>' + secHtml('onDk', a.onDk, [[5, '5 dakika'], [10, '10 dakika'], [15, '15 dakika'], [30, '30 dakika'], [60, '1 saat']]) + '</div>' : '') +
        '<div class="ayar"><span class="metin"><b>Gece sessiz</b><small>Bu saatlerde alarm ses çıkarmaz, yalnızca titrer</small></span>' + anahtarHtml('sessiz', a.sessiz) + '</div>' +
        (a.sessiz ? '<div class="ayar"><span class="metin"><b>Başlangıç</b></span><input type="time" data-ayar="sessizBas" value="' + esc(a.sessizBas) + '"></div>' +
          '<div class="ayar"><span class="metin"><b>Bitiş</b></span><input type="time" data-ayar="sessizBit" value="' + esc(a.sessizBit) + '"></div>' : '') +
        '<div class="ayar"><span class="metin"><b>Renkler</b></span>' + secHtml('tema', a.tema, [['aksam', 'Akşam koyu (21–07)'], ['sistem', 'Telefona göre'], ['acik', 'Hep açık'], ['koyu', 'Hep koyu']]) + '</div>' +
        '</div>';
    }
    h += '</section>';

    // Hasta
    h += '<section class="bolum"><h2>Hastalar</h2><div class="liste">' + S.hastalar.map((x, n) =>
      '<div class="kart hasta-kart" style="--h:' + esc(x.renk) + '"><div class="kart-bas"><span class="hasta-kart-bas">' + hastaFoto(x.id, 56) + '<span><b>' + (n + 1) + '. hasta</b>' +
      '<span class="dugmeler sol" style="margin-top:4px"><button class="dugme duz" data-act="fotoSec" data-id="' + esc(x.id) + '">' + ik('kamera') + (x.foto ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle') + '</button>' +
      (x.foto ? '<button class="dugme duz" data-act="fotoSil" data-id="' + esc(x.id) + '">Kaldır</button>' : '') + '</span></span></span>' +
      (S.hastalar.length > 1 ? '<button class="dugme duz" data-act="hastaSil" data-id="' + esc(x.id) + '">Sil</button>' : '') + '</div>' +
      '<label class="alan" style="margin-top:0"><span>Adı</span><textarea class="oto" rows="1" data-hasta="ad" data-id="' + esc(x.id) + '" placeholder="Örn. Fatma Bektaş">' + esc(x.ad) + '</textarea></label>' +
      '<label class="alan"><span>Kan grubu</span><select data-hasta="kan" data-id="' + esc(x.id) + '">' + [['', 'Seçilmedi'], ['0 Rh+', '0 Rh+'], ['0 Rh-', '0 Rh-'], ['A Rh+', 'A Rh+'], ['A Rh-', 'A Rh-'], ['B Rh+', 'B Rh+'], ['B Rh-', 'B Rh-'], ['AB Rh+', 'AB Rh+'], ['AB Rh-', 'AB Rh-']].map(k => '<option value="' + k[0] + '"' + (k[0] === x.kan ? ' selected' : '') + '>' + k[1] + '</option>').join('') + '</select></label>' +
      '<label class="alan"><span>Hastanın telefonu</span><input type="tel" data-hasta="tel" data-id="' + esc(x.id) + '" value="' + esc(x.tel) + '" placeholder="05xx xxx xx xx"></label>' +
      '<label class="alan"><span>Ebeveyni / yakını</span><textarea class="oto" rows="1" data-hasta="ebeveynAd" data-id="' + esc(x.id) + '" placeholder="Örn. Oğlu Mehmet">' + esc(x.ebeveynAd) + '</textarea></label>' +
      '<label class="alan"><span>Ebeveyninin telefonu (WhatsApp)</span><input type="tel" data-hasta="ebeveynTel" data-id="' + esc(x.id) + '" value="' + esc(x.ebeveynTel) + '" placeholder="05xx xxx xx xx">' +
      (x.ebeveynTel && !M.telWhatsapp(x.ebeveynTel) ? '<span class="hata-yazi">Numara eksik görünüyor; 0 ile başlayan 11 haneyi yazın.</span>' : '') + '</label>' +
      '<div class="ayar-grup" style="margin-top:12px"><div class="ayar"><span class="metin"><b>İlacını alınca ebeveynine WhatsApp ile haber ver</b><small>“Aldı”ya basınca WhatsApp hazır mesajla açılır, Gönder’e basmanız yeter</small></span>' +
      '<label class="anahtar"><input type="checkbox" data-hasta="haberVer" data-id="' + esc(x.id) + '"' + (x.haberVer ? ' checked' : '') + '><span></span></label></div></div>' +
      '<div class="alan"><span class="alan-baslik">Ekran rengi</span><div class="hasta-renkler">' + M.HASTA_RENKLERI.map(r => '<button style="--r:' + r + ';--rz:' + M.uçukRenk(r, 0.85) + '" data-act="hastaRenk" data-id="' + esc(x.id) + '" data-v="' + r + '" aria-pressed="' + (x.renk === r) + '"><i></i>' + esc(M.HASTA_RENK_ADI[r] || '') + '</button>').join('') + '</div></div></div>').join('') + '</div>' +
      '<div class="dugmeler"><button class="dugme tam" data-act="hastaEkle">+ Hasta ekle</button></div>' +
      (A && A.otoGonderAcik ? '<div class="ayar-grup" style="margin-top:12px"><button class="ayar" data-act="otoGonderSor"><span class="metin"><b>WhatsApp mesajı onaysız gitsin</b><small>' +
        (A.otoGonderAcik() ? 'Açık: “Aldım”a basınca ebeveyne mesaj kendiliğinden gider' : 'Kapalı: mesaj hazır açılır, Gönder’e siz basarsınız') + '</small></span>' +
        '<span class="durum-isaret ' + (A.otoGonderAcik() ? 'tamam' : 'eksik') + '">' + (A.otoGonderAcik() ? 'Açık' : 'Kapalı') + '</span></button></div>' : '') +
      '<p class="soluk kucuk" style="margin-top:6px">Her hastanın ilaçları, alarmları ve raporu ayrı tutulur. Bir hasta seçilince bütün ekran onun rengine bürünür; alarm çalarken hastanın adı ve rengi görünür.</p></section>';

    h += '<section class="bolum"><h2>Acil durum telefonları</h2><div class="kart">' +
      '<label class="alan" style="margin-top:0"><span>Yakınınızın adı</span><textarea class="oto" rows="1" data-ayar="acilAd" placeholder="Örn. Oğlum Mehmet">' + esc(a.acilAd) + '</textarea></label>' +
      '<label class="alan"><span>Yakınınızın telefonu</span><input type="tel" data-ayar="acilTel" value="' + esc(a.acilTel) + '"></label>' +
      '<label class="alan"><span>Doktorunuzun telefonu</span><input type="tel" data-ayar="doktorTel" value="' + esc(a.doktorTel) + '"></label>' +
      '<label class="alan"><span>Hastane telefonu</span><input type="tel" data-ayar="hastaneTel" value="' + esc(a.hastaneTel) + '"></label></div></section>';

    // Güvenlik
    h += '<section class="bolum"><h2>Şifre</h2><div class="ayar-grup">' +
      '<button class="ayar" data-act="pinAyar"><span class="metin"><b>Şifreyle aç</b><small>Uygulama açılırken şifre sorar</small></span><span class="deger">' + (a.pin ? 'Açık' : 'Kapalı') + '</span></button>' +
      (a.pin && A && A.parmakVar() ? '<div class="ayar"><span class="metin"><b>Parmak izi ile aç</b></span>' + anahtarHtml('parmak', a.parmak) + '</div>' : '') + '</div></section>';

    // Yedek
    if (A) {
      const son = A.sonYedek();
      h += '<section class="bolum"><h2>Otomatik yedek</h2><div class="kart"><p>Verileriniz her gün kendiliğinden yedeklenir:</p>' +
        '<ul style="margin:8px 0 0;padding-left:20px"><li><b>Google hesabınıza (Drive)</b>: telefon şarjdayken ve Wi-Fi\'a bağlıyken. Uygulamayı yeniden kurunca ya da yeni telefona geçince ilaçlarınız geri gelir.</li>' +
        '<li style="margin-top:6px"><b>Telefonda</b>: İndirilenler &gt; İlaç Takip klasöründe <i>ilac-takip-yedek.json</i> dosyası.</li></ul>' +
        '<p class="soluk kucuk" style="margin-top:8px">Son telefon yedeği: ' + esc(son ? M.tarihYazi(son, true) : 'henüz yok') + '</p>' +
        '<div class="dugmeler"><button class="dugme ana" data-act="yedekSimdi">Şimdi yedekle</button><button class="dugme" data-act="izinAc" data-tur="yedek">Google yedeğini kontrol et</button></div>' +
        '<p class="soluk kucuk" style="margin-top:8px">Google yedeği için telefonun Ayarlar &gt; Google &gt; Yedekleme bölümünde yedeklemenin açık olması gerekir.</p></div></section>';
    }
    h += '<section class="bolum"><h2>Yedek</h2><div class="ayar-grup">' +
      '<button class="ayar" data-act="yedekKaydet"><span class="metin"><b>Yedeği başka yere kaydet</b><small>Telefon değişince ya da sıfırlanınca verileriniz kaybolmasın</small></span></button>' +
      '<button class="ayar" data-act="yedekYukle"><span class="metin"><b>Yedekten geri yükle</b><small>Bu uygulamanın ya da eski “İlaç ve İğne Takip” uygulamasının yedeği</small></span></button>' +
      '<button class="ayar" data-act="yedekYapistir"><span class="metin"><b>Yedek metnini yapıştır</b><small>Eski uygulamada “panoya kopyala” ile alınan yedek için</small></span></button>' +
      '</div></section>';
    h += '<p class="soluk kucuk" style="margin:20px 2px 0">İlaç Takip ' + esc(A ? A.surum() : 'web') + '. Bu uygulama hatırlatma içindir; ilaç dozunu doktorunuz belirler.</p>';
    return h + '</div>';
  }

  function alarmKontrol() { izinOku(); sayfaAc(alarmKontrolCiz); }
  function alarmKontrolCiz() {
    izinOku();
    let h = sayfaBas('Alarm kontrolü') + '<div class="sayfa-ic"><p class="soluk">Telefonlar pil tasarrufu için uygulamaları uyutabilir. Aşağıdakilerin hepsi “Tamam” olursa alarm ekran kapalıyken de çalar.</p>';
    if (!izin) return h + '<div class="kart" style="margin-top:12px">Bu kontrol yalnızca Android uygulamasında çalışır.</div></div>';
    h += '<div class="ayar-grup" style="margin-top:12px">' + IZINLER.map(i => {
      const ok = izin[i.k] !== false;
      return '<div class="ayar"><span class="metin"><b>' + esc(i.ad) + '</b><small>' + esc(i.acik) + '</small></span>' +
        (ok ? '<span class="durum-isaret tamam">Tamam</span>' : '<button class="dugme ana" data-act="izinAc" data-tur="' + i.k + '">Düzelt</button>') + '</div>';
    }).join('') + '</div>';
    const u = String(izin.uretici || '').toLowerCase();
    const ozel = /xiaomi|redmi|poco|huawei|honor|oppo|realme|vivo|oneplus|samsung|tecno|infinix/.test(u);
    h += '<section class="bolum"><h2>Telefonunuza özel</h2><div class="kart">' +
      (ozel ? '<p><b>' + esc(izin.uretici) + '</b> telefonlarda ayrıca şunları yapın:</p>' : '<p>Bazı telefonlarda ayrıca şunlar gerekir:</p>') +
      '<ol style="margin:8px 0 0;padding-left:20px"><li>Uygulama ayarlarında <b>Otomatik başlatma</b> açık olsun.</li><li><b>Pil</b> bölümünde “Kısıtlama yok” seçilsin.</li><li>Son uygulamalar ekranında İlaç Takip kilitlensin (asma kilit simgesi).</li></ol>' +
      '<div class="dugmeler"><button class="dugme" data-act="izinAc" data-tur="uygulama">Uygulama ayarlarını aç</button>' +
      '<button class="dugme" data-act="izinAc" data-tur="kanal">Alarm bildirimi ayarı</button></div></div></section>';
    h += '<div class="dugmeler"><button class="dugme ana buyuk" data-act="alarmDene">Alarmı şimdi dene</button></div>' +
      '<p class="soluk kucuk" style="margin-top:8px">Denemeden sonra ekranı kapatıp bir dozun saatini 2 dakika sonraya kurarak da sınayabilirsiniz.</p></div>';
    return h;
  }

  // ---------- Alt panel ----------
  function panelAc(html, kapat) {
    const k = $('#alt-panel');
    k.innerHTML = '<div class="alt-panel" role="dialog" aria-modal="true"><div class="tutamak"></div>' + html + '</div>';
    k.hidden = false;
    panelKapat = kapat || null;
    k.onclick = e => { if (e.target === k) panelGizle(); };
  }
  function panelGizle() {
    const k = $('#alt-panel');
    k.hidden = true; k.innerHTML = '';
    if (panelKapat) { const f = panelKapat; panelKapat = null; f(); }
  }
  function onay(baslik, metin, evet, f, tehlike) {
    panelAc('<h3>' + esc(baslik) + '</h3>' + (metin ? '<p class="soluk" style="margin-top:6px">' + esc(metin) + '</p>' : '') +
      '<button class="dugme ' + (tehlike ? 'tehlike' : 'ana') + ' buyuk" id="onay-evet">' + esc(evet) + '</button><button class="dugme buyuk" data-act="panelKapat">Vazgeç</button>');
    $('#onay-evet').onclick = () => { panelGizle(); f(); };
  }
  function ertelePanel(k) {
    panelAc('<h3>Ne kadar ertelensin?</h3><div class="secenekler izgara" style="margin-top:12px">' +
      [5, 10, 15, 30, 60].map(d => '<button class="secenek" data-act="ertele" data-k="' + esc(k) + '" data-dk="' + d + '">' + (d === 60 ? '1 saat' : d + ' dakika') + '</button>').join('') +
      '</div><button class="dugme" data-act="dozHepsi" data-k="' + esc(k) + '" data-d="atlandi">Bu dozu atla</button><button class="dugme" data-act="panelKapat">Vazgeç</button>');
  }
  function stokPanel(id) {
    const m = S.ilaclar.find(x => x.id === id);
    if (!m) return;
    const b = M.FORMLAR[m.form].birim;
    panelAc('<h3>' + esc(m.ad) + '</h3><p class="soluk">Elinizde ' + sayi(m.stok) + ' ' + esc(b) + ' var. Ne kadar eklensin?</p>' +
      '<div class="secenekler izgara" style="margin-top:12px">' + [10, 20, 28, 30, 50, 100].map(n => '<button class="secenek" data-act="stokEkle" data-id="' + esc(id) + '" data-n="' + n + '">+' + n + ' ' + esc(b) + '</button>').join('') + '</div>' +
      '<label class="alan"><span>Başka miktar ya da yeni toplam</span><input type="number" inputmode="decimal" min="0" step="any" id="stok-miktar" placeholder="Eklenecek miktar"></label>' +
      '<div class="dugmeler"><button class="dugme ana" data-act="stokEkle" data-id="' + esc(id) + '" data-n="ozel">Ekle</button><button class="dugme" data-act="stokEkle" data-id="' + esc(id) + '" data-n="toplam">Toplamı bu yap</button></div>' +
      '<button class="dugme" data-act="panelKapat">Vazgeç</button>');
  }
  function pinPanel() {
    if (S.ayar.pin) {
      onay('PIN kilidi kaldırılsın mı?', 'Uygulama açılırken şifre sorulmaz.', 'Kilidi kaldır', () => { S.ayar.pin = ''; S.ayar.parmak = false; kaydet(); sayfaYenile(); bildiri('PIN kilidi kaldırıldı'); }, true);
      return;
    }
    panelAc('<h3>PIN belirle</h3><p class="soluk">4–6 rakam. Unutursanız uygulamanın verilerini silmeniz gerekir; yedek alın.</p>' +
      '<label class="alan"><span>PIN</span><input type="password" inputmode="numeric" maxlength="6" id="pin1" autocomplete="off"></label>' +
      '<label class="alan"><span>PIN tekrar</span><input type="password" inputmode="numeric" maxlength="6" id="pin2" autocomplete="off"></label>' +
      '<div class="hata-yazi" id="pin-hata"></div><button class="dugme ana buyuk" data-act="pinKaydet">Kaydet</button><button class="dugme" data-act="panelKapat">Vazgeç</button>');
  }

  // ---------- PIN kilidi ----------
  let girilen = '';
  function kilitGoster() {
    girilen = '';
    kilitCiz();
    $('#kilit').hidden = false;
    if (S.ayar.parmak && A && A.parmakVar()) setTimeout(() => A.parmakIzi(), 300);
  }
  function kilitCiz(hata) {
    $('#kilit').innerHTML = '<div style="font-size:2rem">🔒</div><h2>' + (hata ? 'PIN yanlış, tekrar deneyin' : 'PIN girin') + '</h2>' +
      '<div class="pin-noktalar">' + [0, 1, 2, 3, 4, 5].slice(0, Math.max(4, S.ayar.pin.length)).map(i => '<i class="' + (i < girilen.length ? 'dolu' : '') + '"></i>').join('') + '</div>' +
      '<div class="tuslar">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', (S.ayar.parmak && A ? 'parmak' : ''), '0', 'sil'].map(t =>
        t === '' ? '<button class="bos" tabindex="-1"></button>' :
          '<button data-act="pinTus" data-t="' + t + '" aria-label="' + (t === 'sil' ? 'Sil' : t === 'parmak' ? 'Parmak izi' : t) + '">' + (t === 'sil' ? '⌫' : t === 'parmak' ? '👆' : t) + '</button>').join('') + '</div>';
  }
  function pinTus(t) {
    if (t === 'parmak') { A.parmakIzi(); return; }
    if (t === 'sil') girilen = girilen.slice(0, -1);
    else if (girilen.length < 6) girilen += t;
    if (girilen.length === S.ayar.pin.length) {
      if (girilen === S.ayar.pin) { $('#kilit').hidden = true; girilen = ''; return; }
      girilen = ''; kilitCiz(true); return;
    }
    kilitCiz();
  }

  // ---------- Hasta fotoğrafı ----------
  let fotoHasta = null, fotoIlac = false;
  function fotoSec(id, ilac) {
    fotoHasta = id; fotoIlac = !!ilac;
    if (A && A.fotoSec) { A.fotoSec(); return; }
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*';
    i.onchange = () => { const f = i.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => fotoKirp(r.result); r.readAsDataURL(f); };
    i.click();
  }
  function fotoKirp(veri) {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(img.width, img.height), c = document.createElement('canvas');
      c.width = c.height = 320;
      c.getContext('2d').drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, 320, 320);
      fotoKoy(c.toDataURL('image/jpeg', 0.8));
    };
    img.src = veri;
  }
  function fotoKoy(veri) {
    if (fotoIlac) {
      if (!taslak || !veri) return;
      taslak.foto = veri; sayfaYenile(); bildiri('Kutunun fotoğrafı eklendi');
      return;
    }
    const x = S.hastalar.find(y => y.id === fotoHasta);
    if (!x || !veri) return;
    x.foto = veri; kaydet(); sayfaYenile(); ciz(); bildiri('Fotoğraf eklendi');
  }

  // ---------- Yedek ve rapor ----------
  function yedekMetni() { return JSON.stringify(Object.assign({ uygulama: 'İlaç Takip', tarih: new Date().toISOString() }, S), null, 1); }
  function yedekKaydet() {
    const ad = 'ilac-takip-yedek-' + M.bugun() + '.json';
    if (A) { A.yedekKaydet(yedekMetni(), ad); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([yedekMetni()], { type: 'application/json' }));
    a.download = ad; a.click();
  }
  function yedekUygula(metin) {
    let v;
    try { v = JSON.parse(metin); } catch (e) { bildiri('Bu dosya okunamadı. Doğru yedek dosyasını seçin.'); return; }
    if (!v || (!Array.isArray(v.ilaclar) && !Array.isArray(v.medications))) { bildiri('Bu dosyada ilaç yedeği bulunamadı.'); return; }
    const yeni = M.duzelt(v);
    onay('Yedek geri yüklensin mi?', yeni.ilaclar.length + ' ilaç bulundu. Şu anki kayıtların yerine geçecek.', 'Geri yükle', () => {
      const pin = S.ayar.pin;
      S = yeni;
      if (!Array.isArray(v.ilaclar)) S.ayar.pin = pin; // eski uygulamanın yedeğinde ayar yok
      okundu = 0;
      kaydet(); yukle();
      while (yigin.length) yigin.pop();
      sayfaYenile(true); sekme = 'bugun'; ciz();
      bildiri('Yedek yüklendi: ' + S.ilaclar.length + ' ilaç');
    });
  }
  function yedekYukle() {
    if (A) { A.yedekAc(); return; }
    const i = document.createElement('input');
    i.type = 'file'; i.accept = '.json,application/json,text/plain';
    i.onchange = () => { const f = i.files[0]; if (!f) return; f.text().then(yedekUygula); };
    i.click();
  }
  function yedekYapistir() {
    panelAc('<h3>Yedek metnini yapıştırın</h3><textarea id="yedek-metin" style="margin-top:12px;min-height:160px" placeholder="{ ... }"></textarea>' +
      '<button class="dugme ana buyuk" data-act="yapistirUygula">Geri yükle</button><button class="dugme" data-act="panelKapat">Vazgeç</button>');
  }

  function raporMetni() {
    const hid = rHasta(), hs = M.hastaBul(S, hid);
    const u = M.uyum(S, raporGun, null, hid);
    const satir = [];
    satir.push('İlaç uyum raporu' + (hs.ad ? ' – ' + hs.ad : ''));
    satir.push('Son ' + raporGun + ' gün: %' + (u.oran == null ? '-' : u.oran) + ' (' + u.alinan + '/' + u.planlanan + ' doz alındı, ' + u.atlanan + ' atlandı, ' + u.kacirilan + ' kaçırıldı)');
    satir.push('');
    S.ilaclar.filter(m => !m.arsiv && m.hasta === hid).forEach(m => satir.push('• ' + m.ad + (m.doz ? ' – ' + m.doz : '') + ' – ' + M.planYazi(m) + ' ' + m.saatler.join(', ') + (m.talimat ? ' (' + m.talimat + ')' : '')));
    return satir.join('\n');
  }
  function raporHtml() {
    const hid = rHasta(), hs = M.hastaBul(S, hid);
    const u = M.uyum(S, raporGun, null, hid);
    const a = { hasta: hs.ad, kan: hs.kan };
    const e = esc;
    let olay = '';
    for (let i = 0, t = M.bugun(); i < raporGun; i++, t = M.gunEkle(t, -1)) {
      M.gununDozlari(S, t, null, hid).filter(x => x.ms <= Date.now()).reverse().forEach(x => {
        olay += '<tr><td>' + e(M.tarihYazi(t, true)) + '</td><td>' + e(x.saat) + '</td><td>' + e(x.ilac.ad) + '</td><td>' + e(durumAd[x.durum]) + (x.durum === 'alindi' && x.kayit ? ' (' + saatStr(x.kayit.z) + ')' : '') + '</td></tr>';
      });
    }
    return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>İlaç uyum raporu</title><style>' +
      'body{font-family:system-ui,Roboto,sans-serif;color:#111;margin:24px;font-size:12px;line-height:1.4;overflow-wrap:anywhere}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #999;padding-bottom:3px}' +
      'table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef5f4}.k{display:flex;gap:24px;flex-wrap:wrap}.k div{min-width:120px}.b{font-size:22px;font-weight:700}' +
      '</style></head><body><h1>Hasta ilaç ve tedavi uyum raporu</h1>' +
      '<div>' + (a.hasta ? 'Hasta: <b>' + e(a.hasta) + '</b> · ' : '') + (a.kan ? 'Kan grubu: ' + e(a.kan) + ' · ' : '') + 'Rapor tarihi: ' + e(M.tarihYazi(M.bugun(), true)) + ' · Dönem: son ' + raporGun + ' gün</div>' +
      '<h2>Uyum özeti</h2><div class="k"><div>Uyum oranı<div class="b">%' + (u.oran == null ? '-' : u.oran) + '</div></div><div>Planlanan<div class="b">' + u.planlanan + '</div></div><div>Alınan<div class="b">' + u.alinan + '</div></div><div>Atlanan<div class="b">' + u.atlanan + '</div></div><div>Kaçırılan<div class="b">' + u.kacirilan + '</div></div></div>' +
      '<h2>Kullanılan ilaç ve iğneler</h2><table><tr><th style="width:28%">İlaç / iğne</th><th style="width:18%">Doz</th><th style="width:28%">Plan ve saatler</th><th>Not</th></tr>' +
      S.ilaclar.filter(m => !m.arsiv && m.hasta === hid).map(m => '<tr><td>' + e(m.ad) + '<br><small>' + e(M.FORMLAR[m.form].ad) + '</small></td><td>' + e(m.doz) + '</td><td>' + e(M.planYazi(m)) + ': ' + e(m.saatler.join(', ')) + '</td><td>' + e(m.talimat) + (m.recete ? '<br>Reçete: ' + e(m.recete) : '') + '</td></tr>').join('') + '</table>' +
      '<h2>Doz kayıtları</h2><table><tr><th style="width:34%">Tarih</th><th style="width:12%">Saat</th><th style="width:30%">İlaç</th><th>Durum</th></tr>' + (olay || '<tr><td colspan="4">Kayıt yok</td></tr>') + '</table>' +
      '<p style="margin-top:16px;color:#555">Bu rapor İlaç Takip uygulamasıyla, hastanın işaretlediği dozlara göre oluşturulmuştur.</p></body></html>';
  }

  // ---------- Olaylar ----------
  const EYLEM = {
    ayarlar, alarmKontrol,
    sekme: d => { sekme = d.s; ciz(); window.scrollTo(0, 0); },
    dozAc: d => { acikDoz[d.k] = true; ciz(); },
    otoGonderSor: () => otoGonderSor(),
    otoGonderAc: () => { panelGizle(); if (A) A.izinAc('erisilebilirlik'); },
    dozKapat: d => { delete acikDoz[d.k]; ciz(); },
    dilim: d => { const e = document.querySelector('[data-k="' + d.k + '"][data-act="dilim"]'); acikDilim[d.k] = !(e && e.getAttribute('aria-expanded') === 'true'); ciz(); },
    fotoSec: d => fotoSec(d.id),
    kutuFoto: () => fotoSec(null, true),
    kutuFotoSil: () => { delete taslak.foto; sayfaYenile(); },
    fotoSil: d => { const x = S.hastalar.find(y => y.id === d.id); if (x) { delete x.foto; kaydet(); sayfaYenile(); ciz(); } },
    raporAc: () => sayfaAc(() => sayfaBas('Doktor için rapor') + '<div class="sayfa-ic">' + raporCiz() + '</div>'),
    fazla: () => { taslak._fazla = !taslak._fazla; sayfaYenile(); },
    renkSec: d => { S.ayar.renk = d.v; S.ayar.renkSecildi = true; kaydet(); temaUygula(); sayfaYenile(); bildiri('Renk değişti'); },
    yaziSec: d => { S.ayar.yazi = d.v; kaydet(); temaUygula(); sayfaYenile(); },
    gelismis: () => { gelismisAcik = !gelismisAcik; sayfaYenile(); },
    geri: () => sayfaKapat(),
    panelKapat: () => panelGizle(),
    ilacEkle: () => ilacFormu(null),
    ilacDuzenle: d => ilacFormu(d.id),
    ilacDetay: d => ilacDetay(d.id),
    randevuEkle: () => randevuFormu(null),
    randevuDuzenle: d => randevuFormu(d.id),
    doz: d => dozIsaretle(d.k, d.d),
    dozHepsi: d => {
      panelGizle();
      const l = d.k.split(',');
      if (l.length === 1) return dozIsaretle(l[0], d.d);
      if (d.d === 'alindi' && !isleniyor) {
        const b = document.querySelector('[data-act="dozHepsi"][data-k="' + CSS.escape(d.k) + '"]');
        const el = b && b.closest('.siradaki');
        if (el) { isleniyor = true; el.classList.add('onay'); setTimeout(() => { isleniyor = false; l.forEach(k => dozIsaretle(k, d.d, 0, true)); bildiri(l.length + ' doz alındı'); ebeveyneHaber(l); }, 420); return; }
      }
      l.forEach(k => dozIsaretle(k, d.d, 0, true));
      bildiri(l.length + ' doz ' + (d.d === 'alindi' ? 'alındı' : 'atlandı'));
      if (d.d === 'alindi') ebeveyneHaber(l);
    },
    ertelePanel: d => ertelePanel(d.k),
    ertele: d => { panelGizle(); const dk = +d.dk; d.k.split(',').forEach((k, i, l) => dozIsaretle(k, 'ertelendi', dk, l.length > 1)); if (d.k.includes(',')) bildiri('Dozlar ' + dk + ' dakika ertelendi'); },
    stokPanel: d => stokPanel(d.id),
    stokEkle: d => {
      const m = S.ilaclar.find(x => x.id === d.id);
      if (!m) return;
      if (d.n === 'ozel' || d.n === 'toplam') {
        const v = parseFloat(($('#stok-miktar').value || '').replace(',', '.'));
        if (!(v >= 0)) { bildiri('Bir miktar yazın'); return; }
        m.stok = d.n === 'toplam' ? v : +(m.stok + v).toFixed(2);
      } else m.stok = +(m.stok + Number(d.n)).toFixed(2);
      kaydet(); panelGizle(); ciz();
      bildiri(m.ad + ': elinizde ' + sayi(m.stok) + ' ' + M.FORMLAR[m.form].birim + ' var');
    },
    ilacArsiv: d => {
      const m = S.ilaclar.find(x => x.id === d.id);
      if (!m) return;
      if (m.arsiv) { m.arsiv = false; kaydet(); ciz(); bildiri(m.ad + ' yeniden kullanımda, alarmlar açıldı'); return; }
      onay(m.ad + ' bitti mi?', 'İlaç arşive taşınır, alarmı çalmaz. Geçmiş kayıtlar raporlarda kalır.', 'Kullanımı bitir', () => { m.arsiv = true; kaydet(); ciz(); bildiri(m.ad + ' arşive taşındı'); });
    },
    ilacSil: d => {
      const m = S.ilaclar.find(x => x.id === d.id);
      if (!m) return;
      onay(m.ad + ' silinsin mi?', 'İlaç ve tüm doz kayıtları kalıcı olarak silinir. Yalnızca kullanımı bittiyse “Kullanımı bitir”i seçin.', 'Sil', () => {
        S.ilaclar = S.ilaclar.filter(x => x.id !== m.id);
        Object.keys(S.kayit).forEach(k => { if (k.split('|')[0] === m.id) delete S.kayit[k]; });
        kaydet(); yigin.pop(); sayfaYenile(true); ciz(); bildiri(m.ad + ' silindi');
      }, true);
    },
    ilacKaydet,
    tSec: d => { if (d.alan === 'talimat' && taslak.talimat === d.v) d = { alan: 'talimat', v: '' }; taslakAyarla(d.alan, d.v); if (d.alan === 'form' && !taslak.doz) taslak.doz = ''; sayfaYenile(); },
    gunSec: d => { const g = +d.v, l = taslak.plan.gunler; const i = l.indexOf(g); if (i >= 0) l.splice(i, 1); else l.push(g); l.sort(); sayfaYenile(); },
    saatHazir: d => { taslak.saatler = d.v.split(','); sayfaYenile(); },
    saatDoz: d => { const s = taslak.saatler[+d.i]; if (!s) return; taslak.dozlar = Object.assign({}, taslak.dozlar, { [s]: +d.v }); sayfaYenile(); },
    saatDozOzel: d => {
      const s = taslak.saatler[+d.i]; if (!s) return;
      panelAc('<h3>' + esc(s) + ' için doz</h3><label class="alan"><span>Kaç ' + esc(M.FORMLAR[taslak.form].birim) + '? (ör. 2,5)</span><input type="number" inputmode="decimal" min="0" step="any" id="ozel-doz"></label>' +
        '<button class="dugme ana buyuk" id="ozel-tamam">Tamam</button><button class="dugme" data-act="panelKapat">Vazgeç</button>');
      document.getElementById('ozel-tamam').onclick = () => {
        const v = parseFloat((document.getElementById('ozel-doz').value || '').replace(',', '.'));
        if (!(v > 0)) { bildiri('Bir miktar yazın'); return; }
        taslak.dozlar = Object.assign({}, taslak.dozlar, { [s]: v }); panelGizle(); sayfaYenile();
      };
    },
    saatEkle: () => {
      const son = taslak.saatler[taslak.saatler.length - 1];
      let y = '20:00';
      if (son) { const [s, dk] = son.split(':').map(Number); y = M.pad(Math.min(23, s + 4)) + ':' + M.pad(dk); }
      taslak.saatler.push(y); sayfaYenile();
    },
    saatSil: d => { taslak.saatler.splice(+d.i, 1); sayfaYenile(); },
    randevuKaydet,
    bransSec: d => { rTaslak.brans = d.v; sayfaYenile(); },
    randevuTamam: d => { const r = S.randevular.find(x => x.id === d.id); if (!r) return; r.tamam = true; kaydet(); ciz(); bildiri('Görüşme tamamlandı olarak işaretlendi'); randevuFormu(r.id); },
    randevuSil: d => onay('Randevu silinsin mi?', '', 'Sil', () => { S.randevular = S.randevular.filter(x => x.id !== d.id); kaydet(); yigin.pop(); rTaslak = null; sayfaYenile(true); ciz(); }, true),
    doktorSekme: d => { doktorSekme = d.s; ciz(); },
    raporGun: d => { raporGun = +d.g; ciz(); if (yigin.length) sayfaYenile(); },
    raporHasta: d => { raporHasta = d.id; if (yigin.length) sayfaYenile(); },
    hastaSec: d => { S.ayar.aktifHasta = d.id; kaydet(); temaUygula(); ciz(); },
    rKim: d => { rTaslak.hasta = d.v; sayfaYenile(); },
    hastaRenk: d => { const x = S.hastalar.find(y => y.id === d.id); if (!x) return; x.renk = d.v; kaydet(); temaUygula(); sayfaYenile(); },
    hastaEkle: () => {
      let n = S.hastalar.length + 1; while (S.hastalar.some(x => x.id === 'h' + n)) n++;
      const kullanilan = S.hastalar.map(x => x.renk);
      const renk = M.HASTA_RENKLERI.find(r => !kullanilan.includes(r)) || M.HASTA_RENKLERI[n % M.HASTA_RENKLERI.length];
      S.hastalar.push({ id: 'h' + n, ad: '', renk, kan: '' });
      kaydet(); sayfaYenile();
      const t = document.querySelectorAll('#sayfa textarea[data-hasta="ad"]'); const son = t[t.length - 1];
      if (son) { son.scrollIntoView({ block: 'center' }); son.focus(); }
    },
    hastaSil: d => {
      const x = S.hastalar.find(y => y.id === d.id); if (!x) return;
      const ilac = S.ilaclar.filter(m => m.hasta === x.id);
      onay(hastaAd(x.id) + ' silinsin mi?', ilac.length ? ilac.length + ' ilacı, alarmları ve kayıtları da silinir.' : 'Bu hastanın kayıtlı ilacı yok.', 'Sil', () => {
        const idler = new Set(ilac.map(m => m.id));
        S.ilaclar = S.ilaclar.filter(m => !idler.has(m.id));
        Object.keys(S.kayit).forEach(k => { if (idler.has(k.split('|')[0])) delete S.kayit[k]; });
        S.randevular = S.randevular.filter(r => r.hasta !== x.id);
        S.hastalar = S.hastalar.filter(y => y.id !== x.id);
        if (S.ayar.aktifHasta === x.id) S.ayar.aktifHasta = 'hepsi';
        kaydet(); sayfaYenile(); ciz(); bildiri('Hasta silindi');
      }, true);
    },
    ay: d => {
      const [y, a] = takvimAy.split('-').map(Number);
      const n = new Date(y, a - 1 + Number(d.y), 1);
      takvimAy = n.getFullYear() + '-' + M.pad(n.getMonth() + 1);
      ciz();
    },
    gun: d => { seciliGun = d.t; ciz(); },
    arsivAc: () => { arsivAcik = !arsivAcik; ciz(); },
    ara: d => {
      if (!d.tel) { bildiri((d.ne || '') + ' telefonu kayıtlı değil. Ayarlardan ekleyin.', { ad: 'Ayarlar', f: ayarlar }); return; }
      if (d.tel === '112') { onay('112 aranacak', 'Acil ambulans, sağlık ya da güvenlik yardımı için. Numara tuşlanır, aramayı siz başlatırsınız.', '112\'yi tuşla', () => telAc('112'), true); return; }
      telAc(d.tel);
    },
    sesSec: () => A && A.sesSec(S.ayar.sesUri || ''),
    alarmDene: () => { if (A) { A.alarmDene(); bildiri('Deneme alarmı çalıyor'); } },
    izinAc: d => A && A.izinAc(d.tur),
    pinAyar: pinPanel,
    pinKaydet: () => {
      const a = $('#pin1').value, b = $('#pin2').value;
      if (!/^\d{4,6}$/.test(a)) { $('#pin-hata').textContent = 'PIN 4 ile 6 rakam arasında olmalı.'; return; }
      if (a !== b) { $('#pin-hata').textContent = 'İki PIN aynı değil.'; return; }
      S.ayar.pin = a; kaydet(); panelGizle(); sayfaYenile(); bildiri('PIN kaydedildi');
    },
    pinTus: d => pinTus(d.t),
    yedekKaydet, yedekYukle, yedekYapistir,
    sesliDene: () => {
      const m = S.ilaclar.find(x => !x.arsiv);
      const kim = m && cok() ? hastaAd(m.hasta) + ', ' : (m ? 'İlaç saati. ' : '');
      const t = m ? kim + m.ad + ' ilacının saati geldi. ' + (m.doz ? m.doz + '. ' : '') + (m.talimat ? m.talimat + '.' : '') : 'İlaç saati geldi. Bir tablet. Tok karnına.';
      if (A && A.sesliDene) A.sesliDene(t);
      else if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(t); u.lang = 'tr-TR'; speechSynthesis.speak(u); }
      bildiri('Ses gelmiyorsa telefonun Ayarlar > Erişilebilirlik > Metin okuma bölümünden Türkçe sesi indirin.');
    },
    yedekSimdi: () => { const ok = A && A.yedekSimdi(); bildiri(ok ? 'Yedek İndirilenler > İlaç Takip klasörüne kaydedildi' : 'Yedek dosyası yazılamadı (Android 10 ve üstü gerekir)'); sayfaYenile(); },
    yapistirUygula: () => { const v = $('#yedek-metin').value; panelGizle(); yedekUygula(v); },
    pdf: () => { const h = raporHtml(); if (A) A.yazdir(h, 'Ilac-raporu-' + (M.hastaBul(S, rHasta()).ad || 'hasta').replace(/\s+/g, '-') + '-' + M.bugun()); else { const w = window.open('', '_blank'); if (w) { w.document.write(h); w.document.close(); w.print(); } } },
    raporPaylas: () => { const t = raporMetni(); if (A) A.paylas(t); else if (navigator.share) navigator.share({ text: t }).catch(() => {}); else navigator.clipboard && navigator.clipboard.writeText(t).then(() => bildiri('Panoya kopyalandı')); },
  };
  function telAc(tel) { if (A) A.ara(tel); else location.href = 'tel:' + tel.replace(/[^0-9+]/g, ''); }

  document.addEventListener('click', e => {
    const s = e.target.closest('[data-sekme]');
    if (s) { sekme = s.dataset.sekme; if (sekme === 'takvim') { seciliGun = M.bugun(); takvimAy = seciliGun.slice(0, 7); } ciz(); window.scrollTo(0, 0); return; }
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const f = EYLEM[b.dataset.act];
    if (f) { e.preventDefault(); f(b.dataset); }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.classList.contains('oto')) otoBoy(t);
    if (t.dataset.alan && taslak) {
      if (t.dataset.alan === 'saat') {
        // Saat değişince o saatin dozu da yeni saate taşınır
        const eski = taslak.saatler[+t.dataset.i];
        taslak.saatler[+t.dataset.i] = t.value;
        if (taslak.dozlar && eski in taslak.dozlar && t.value) { taslak.dozlar[t.value] = taslak.dozlar[eski]; if (!taslak.saatler.includes(eski)) delete taslak.dozlar[eski]; }
      }
      else taslakAyarla(t.dataset.alan, t.value);
    } else if (t.dataset.ralan && rTaslak) rTaslak[t.dataset.ralan] = t.value;
    else if (t.dataset.hasta && t.tagName === 'TEXTAREA') { const x = S.hastalar.find(y => y.id === t.dataset.id); if (x) { x.ad = t.value; kaydetGec(); } }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('oto')) { e.preventDefault(); e.target.blur(); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.alan === 'plan.aralik' && taslak) { sayfaYenile(); return; }
    if (t.dataset.hasta) {
      const x = S.hastalar.find(y => y.id === t.dataset.id);
      if (x) {
        const alan = t.dataset.hasta;
        x[alan] = t.type === 'checkbox' ? t.checked : (alan === 'ad' || alan === 'ebeveynAd' ? t.value.trim() : t.value);
        kaydet(); ciz();
        if (alan === 'ebeveynTel' || alan === 'haberVer') sayfaYenile();
      }
      return;
    }
    if (!t.dataset.ayar) return;
    const k = t.dataset.ayar;
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (['calmaDk', 'tekrarDk', 'tekrarSayi', 'onDk'].includes(k)) v = +v;
    S.ayar[k] = v;
    kaydet();
    if (k === 'yazi' || k === 'tema') temaUygula();
    if (t.tagName === 'SELECT' || t.type === 'checkbox') sayfaYenile();
    if (k === 'hasta') ciz();
  });

  // Android'den gelen olaylar
  window.yerelOlay = (tur, veri) => {
    if (tur === 'degisti') {
      yukle();
      if (!taslak && !rTaslak) ciz(); else $('#ekran').innerHTML = { bugun: bugunCiz, takvim: takvimCiz, ilaclar: ilaclarCiz, doktor: doktorCiz, rapor: raporCiz }[sekme]();
    } else if (tur === 'izinDegisti') {
      izinOku();
      if (!taslak && !rTaslak) ciz();
    } else if (tur === 'ses' && veri) {
      S.ayar.sesUri = veri.uri; S.ayar.sesAd = veri.ad; kaydet(); sayfaYenile(); bildiri('Alarm sesi: ' + veri.ad);
    } else if (tur === 'yedekKaydedildi') {
      bildiri(veri ? 'Yedek kaydedildi' : 'Yedek kaydedilemedi');
    } else if (tur === 'yedekAcildi') {
      if (veri == null) bildiri('Dosya okunamadı'); else yedekUygula(veri);
    } else if (tur === 'foto') {
      if (veri) fotoKoy(veri); else bildiri('Fotoğraf alınamadı');
    } else if (tur === 'parmak') {
      if (veri) $('#kilit').hidden = true;
    }
  };
  window.geriTusu = () => {
    if (!$('#alt-panel').hidden) { panelGizle(); return true; }
    if (!$('#kilit').hidden) return false;
    if (yigin.length) { sayfaKapat(); return true; }
    if (sekme !== 'bugun') { sekme = 'bugun'; ciz(); return true; }
    return false;
  };

  setInterval(temaUygula, 60000);
  // Web sürümünde (alarm yok) sekme açıkken dakikada bir yenile
  setInterval(() => { if (!yigin.length && $('#alt-panel').hidden && (sekme === 'bugun' || sekme === 'takvim')) $('#ekran').innerHTML = (sekme === 'bugun' ? bugunCiz : takvimCiz)(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !A) { yukle(); if (!taslak && !rTaslak) ciz(); } });

  yukle();
  izinOku();
  ciz();
  if (S.ayar.pin) kilitGoster();
  window.__ilac = { S: () => S, ciz, M };
})();
