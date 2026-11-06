// İlaç ve İğne Takip: veri ve hesap kuralları (ekran kodundan bağımsız, testi var).
// Doz günü kuralı Android tarafındaki Takvim.java ile birebir aynıdır; birini değiştirirsen ötekini de değiştir.
(function (root) {
  'use strict';

  const FORMLAR = {
    tablet: { ad: 'Tablet', birim: 'adet', simge: '💊' },
    kapsul: { ad: 'Kapsül', birim: 'adet', simge: '💊' },
    igne: { ad: 'İğne / enjeksiyon', birim: 'doz', simge: '💉' },
    insulin: { ad: 'İnsülin kalemi', birim: 'ünite', simge: '💉' },
    surup: { ad: 'Şurup', birim: 'ölçek', simge: '🥄' },
    damla: { ad: 'Damla', birim: 'damla', simge: '💧' },
    krem: { ad: 'Krem / merhem', birim: 'uygulama', simge: '🧴' },
    sprey: { ad: 'Sprey', birim: 'puf', simge: '🌬️' },
    bant: { ad: 'Bant / flaster', birim: 'adet', simge: '🩹' },
    diger: { ad: 'Diğer', birim: 'doz', simge: '➕' },
  };

  // Eski uygulamadaki biçim adları → yeni anahtarlar
  const ESKI_FORM = { TABLET: 'tablet', CAPSULE: 'kapsul', INJECTION: 'igne', SYRUP: 'surup', DROPS: 'damla', CREAM: 'krem', SPRAY: 'sprey', PATCH: 'bant', OTHER: 'diger' };

  // Hasta renkleri: her hasta ayrı renkle ayrılır
  // Hasta renkleri (sarı, yeşil, mor, mavi, pembe, turuncu…): ekranın zemini bunun çok uçuk tonudur
  const HASTA_RENKLERI = ['#B8860B', '#2E8B57', '#7B4FB5', '#2F7FC1', '#C2457A', '#D2691E', '#00897B', '#8D6E63'];
  const HASTA_RENK_ADI = { '#B8860B': 'Sarı', '#2E8B57': 'Yeşil', '#7B4FB5': 'Mor', '#2F7FC1': 'Mavi', '#C2457A': 'Pembe', '#D2691E': 'Turuncu', '#00897B': 'Turkuaz', '#8D6E63': 'Kahve' };
  // Rengi beyazla karıştırır: oran 0,9 → çok uçuk zemin
  function uçukRenk(hex, oran) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const k = x => Math.round(x + (255 - x) * oran).toString(16).padStart(2, '0');
    return '#' + k(r) + k(g) + k(b);
  }
  // Türkiye telefon numarası → WhatsApp biçimi (905xxxxxxxxx); geçersizse ''
  function telWhatsapp(t) {
    let d = String(t || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '90' + d.slice(1);
    else if (d.length === 10 && d.startsWith('5')) d = '90' + d;
    return d.length >= 11 ? d : '';
  }
  // İlaç renkleri: her ilacın kendi rengi (12 belirgin renk)
  const RENKLER = ['#2563EB', '#DC2626', '#059669', '#D97706', '#7C3AED', '#DB2777', '#0891B2', '#65A30D', '#EA580C', '#4F46E5', '#BE185D', '#4B5563'];
  const RENK_ADI = { '#2563EB': 'Mavi', '#DC2626': 'Kırmızı', '#059669': 'Yeşil', '#D97706': 'Sarı', '#7C3AED': 'Mor', '#DB2777': 'Pembe', '#0891B2': 'Turkuaz', '#65A30D': 'Fıstık yeşili', '#EA580C': 'Turuncu', '#4F46E5': 'Lacivert', '#BE185D': 'Bordo', '#4B5563': 'Gri' };
  const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const GUNLER_UZUN = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
  const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  const pad = n => (n < 10 ? '0' : '') + n;
  const tarihStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const tarihOku = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const bugun = () => tarihStr(new Date());
  const gunEkle = (s, n) => { const d = tarihOku(s); d.setDate(d.getDate() + n); return tarihStr(d); };
  // Takvim günü farkı (saat değişikliğinden etkilenmez)
  const gunFarki = (a, b) => {
    const x = tarihOku(a), y = tarihOku(b);
    return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 86400000);
  };
  const haftaGunu = s => (tarihOku(s).getDay() + 6) % 7 + 1; // 1 = Pazartesi … 7 = Pazar
  const zamanMs = (tarih, saat) => { const d = tarihOku(tarih); const p = saat.split(':').map(Number); d.setHours(p[0], p[1], 0, 0); return d.getTime(); };
  const anahtar = (id, tarih, saat) => id + '|' + tarih + '|' + saat;

  function bosDurum() {
    return {
      v: 1,
      ilaclar: [],
      kayit: {},
      randevular: [],
      hastalar: [{ id: 'h1', ad: '', renk: HASTA_RENKLERI[0], kan: '' }],
      ayar: {
        hasta: '', kan: '', acilAd: '', acilTel: '', doktorTel: '', hastaneTel: '',
        onAlarm: true, onDk: 15,
        calmaDk: 2, tekrarDk: 5, tekrarSayi: 3,
        artanSes: true, titresim: true, sesliOku: true, randevuHatirlat: true, sesUri: '', sesAd: 'Varsayılan alarm sesi',
        sessiz: false, sessizBas: '23:00', sessizBit: '07:00',
        yazi: 'normal', tema: 'aksam', renk: 'kirmizi', pin: '', parmak: false,
      },
    };
  }

  // Eksik alanları tamamlar; eski uygulamanın yedeğini de tanır.
  function duzelt(d) {
    const b = bosDurum();
    if (!d || typeof d !== 'object') return b;
    if (Array.isArray(d.medications)) return eskiYedekCevir(d);
    const s = { v: 1, ilaclar: [], kayit: d.kayit && typeof d.kayit === 'object' ? d.kayit : {}, randevular: Array.isArray(d.randevular) ? d.randevular : [], hastalar: [], ayar: Object.assign({}, b.ayar, d.ayar || {}) };
    // Hastalar (eski tek hastalı veride ayar.hasta ve ayar.kan ilk hastaya taşınır)
    (Array.isArray(d.hastalar) ? d.hastalar : []).forEach((h, i) => {
      if (!h || s.hastalar.some(x => x.id === String(h.id))) return;
      s.hastalar.push({
        id: String(h.id || 'h' + (i + 1)), ad: String(h.ad || '').trim(),
        renk: /^#[0-9a-fA-F]{6}$/.test(h.renk) ? h.renk : HASTA_RENKLERI[i % HASTA_RENKLERI.length],
        kan: String(h.kan || ''), tel: String(h.tel || ''),
        ebeveynAd: String(h.ebeveynAd || ''), ebeveynTel: String(h.ebeveynTel || ''), haberVer: h.haberVer !== false,
        ...(typeof h.foto === 'string' && h.foto.startsWith('data:image/') ? { foto: h.foto } : {}),
      });
    });
    if (!s.hastalar.length) s.hastalar.push({ id: 'h1', ad: String(s.ayar.hasta || '').trim(), renk: HASTA_RENKLERI[0], kan: String(s.ayar.kan || '') });
    // Önceki sürümlerin koyu hasta renkleri yeni, belirgin renklere çevrilir
    const ESKI = ['#22574F', '#24426B', '#A8661A', '#5B4391', '#1F6E8C', '#2F7A4B', '#6B4F3A', '#8C3344', '#B23B32'];
    s.hastalar.forEach((h, i) => { if (ESKI.includes(h.renk)) h.renk = HASTA_RENKLERI[i % HASTA_RENKLERI.length]; });
    const ilk = s.hastalar[0].id, var_ = id => s.hastalar.some(h => h.id === id);
    (Array.isArray(d.ilaclar) ? d.ilaclar : []).forEach(m => { const x = ilacDuzelt(m); if (!var_(x.hasta)) x.hasta = ilk; s.ilaclar.push(x); });
    s.randevular.forEach(r => { if (!var_(r.hasta)) r.hasta = ilk; });
    // Kullanıcı rengi kendisi seçmediyse varsayılan Türk kırmızısı
    if (!s.ayar.renkSecildi) s.ayar.renk = 'kirmizi';
    if (s.ayar.aktifHasta !== 'hepsi' && !var_(s.ayar.aktifHasta)) s.ayar.aktifHasta = 'hepsi';
    return s;
  }

  // Eski sürümlerde "Bir seferde ne kadar?" alanına yazılan miktarı (1 tablet, yarım, 2 ölçek) her dozda alınan miktara çevirir
  function eskiDozMiktari(m) {
    if (m.dozlar !== undefined || typeof m.doz !== 'string') return null;
    const t = m.doz.toLocaleLowerCase('tr').trim();
    if (!t || /\d\s*(mg|mcg|µg|gr|g|iu|mg\/ml)\b/.test(t)) return null;
    if (/^(1\/2|yarım)/.test(t)) return 0.5;
    if (/^(1\/4|çeyrek)/.test(t)) return 0.25;
    const x = t.match(/^(\d+(?:[.,]\d+)?)\s*(tablet|kapsül|adet|ölçek|damla|puf|ünite|iğne|doz|ampul|ml|bant|uygulama)?\b/);
    return x ? parseFloat(x[1].replace(',', '.')) : null;
  }

  function ilacDuzelt(m) {
    const eski = eskiDozMiktari(m);
    if (eski) m = Object.assign({}, m, { birimDoz: eski, doz: '' });
    const plan = m.plan && typeof m.plan === 'object' ? m.plan : {};
    const tur = ['hergun', 'gunler', 'aralik'].includes(plan.tur) ? plan.tur : 'hergun';
    const saatler = (Array.isArray(m.saatler) ? m.saatler : []).filter(t => /^\d{2}:\d{2}$/.test(t));
    return {
      id: String(m.id || yeniId()),
      hasta: String(m.hasta || ''),
      ad: String(m.ad || '').trim(),
      doz: String(m.doz || '').trim(),
      form: FORMLAR[m.form] ? m.form : 'tablet',
      saatler: Array.from(new Set(saatler)).sort(),
      plan: {
        tur,
        gunler: (Array.isArray(plan.gunler) ? plan.gunler : []).map(Number).filter(g => g >= 1 && g <= 7),
        aralik: Math.max(1, Math.round(Number(plan.aralik) || 1)),
      },
      baslangic: /^\d{4}-\d{2}-\d{2}$/.test(m.baslangic) ? m.baslangic : bugun(),
      bitis: /^\d{4}-\d{2}-\d{2}$/.test(m.bitis) ? m.bitis : '',
      stok: Math.max(0, Number(m.stok) || 0),
      kritik: Math.max(0, Number(m.kritik) || 0),
      birimDoz: Math.max(0, Number(m.birimDoz) || 0) || 1,
      dozlar: (() => {
        const o = {};
        const kaynak = m.dozlar && typeof m.dozlar === 'object' ? m.dozlar : {};
        Array.from(new Set(saatler)).forEach(t => { const v = Number(kaynak[t]); if (v > 0) o[t] = Math.round(v * 100) / 100; });
        return o;
      })(),
      renk: /^#[0-9a-fA-F]{6}$/.test(m.renk) ? m.renk : RENKLER[0],
      talimat: String(m.talimat || ''),
      recete: String(m.recete || ''),
      arsiv: !!m.arsiv,
      ...(typeof m.foto === 'string' && m.foto.startsWith('data:image/') ? { foto: m.foto } : {}),
    };
  }

  let sayac = 0;
  function yeniId() { return Date.now().toString(36) + (sayac++).toString(36) + Math.floor(Math.random() * 1296).toString(36); }

  function eskiYedekCevir(eski) {
    const s = bosDurum();
    s.ilaclar = [];
    eski.medications.forEach(m => {
      let times = m.times;
      if (typeof times === 'string') { try { times = JSON.parse(times); } catch (e) { times = times.split(','); } }
      const t = (Array.isArray(times) ? times : []).map(x => String(x).trim()).map(x => (/^\d:\d{2}$/.test(x) ? '0' + x : x));
      s.ilaclar.push(ilacDuzelt({
        id: 'e' + (m.id || yeniId()),
        ad: m.name, doz: m.dose, form: ESKI_FORM[m.form] || 'diger', saatler: t,
        plan: { tur: 'hergun' },
        baslangic: m.startDateMillis ? tarihStr(new Date(Number(m.startDateMillis))) : bugun(),
        bitis: m.endDateMillis ? tarihStr(new Date(Number(m.endDateMillis))) : '',
        stok: m.currentStock, kritik: m.criticalStockThreshold, renk: m.colorHex,
        talimat: m.instructions, recete: m.prescriptionNumber, arsiv: m.isArchived, hasta: 'h1',
      }));
    });
    return s;
  }

  // O gün bu ilacın dozu var mı? (Takvim.java → gunDozVarMi ile aynı kural)
  function gunDozVarMi(m, tarih) {
    if (m.arsiv || !m.saatler.length) return false;
    if (tarih < m.baslangic) return false;
    if (m.bitis && tarih > m.bitis) return false;
    if (m.plan.tur === 'gunler') return m.plan.gunler.includes(haftaGunu(tarih));
    if (m.plan.tur === 'aralik') return gunFarki(m.baslangic, tarih) % m.plan.aralik === 0;
    return true;
  }

  // Bir günün dozları, saate göre sıralı.
  // hasta: hasta kimliği; boş ya da 'hepsi' ise tüm hastalar
  function gununDozlari(s, tarih, simdi, hasta) {
    simdi = simdi == null ? Date.now() : simdi;
    const out = [];
    s.ilaclar.forEach(m => {
      if (hasta && hasta !== 'hepsi' && m.hasta !== hasta) return;
      if (!gunDozVarMi(m, tarih)) return;
      m.saatler.forEach(saat => {
        const k = anahtar(m.id, tarih, saat);
        const kay = s.kayit[k];
        const ms = zamanMs(tarih, saat);
        let durum = kay ? kay.d : 'bekliyor';
        if (durum === 'bekliyor' && simdi > ms + 60 * 60000) durum = 'kacirildi';
        out.push({ k, ilac: m, tarih, saat, ms, durum, kayit: kay || null });
      });
    });
    return out.sort((a, b) => a.ms - b.ms || a.ilac.ad.localeCompare(b.ilac.ad, 'tr'));
  }

  // Şu andan sonraki ilk bekleyen doz (bugün ve sonraki 60 gün içinde)
  function sonrakiDoz(s, simdi, hasta) {
    simdi = simdi == null ? Date.now() : simdi;
    let t = tarihStr(new Date(simdi));
    for (let i = 0; i < 60; i++, t = gunEkle(t, 1)) {
      const d = gununDozlari(s, t, simdi, hasta).filter(x => (x.durum === 'bekliyor' || x.durum === 'ertelendi') && x.ms > simdi - 60 * 60000);
      if (d.length) {
        const ilk = d[0].ms;
        return d.filter(x => x.ms === ilk);
      }
    }
    return [];
  }

  // Doz işaretleme. Stok, "alındı"ya geçerken düşer, "alındı"dan çıkarken geri eklenir.
  // O saatteki doz miktarı (ayrı girilmemişse her dozda azalan miktar)
  function saatDozu(m, saat) {
    const v = m.dozlar && Number(m.dozlar[saat]);
    return v > 0 ? v : m.birimDoz;
  }
  // 0,5 → "yarım", 1,5 → "1 buçuk", 0,25 → "çeyrek"
  function miktarYazi(v) {
    const t = Math.floor(v), k = Math.round((v - t) * 100) / 100;
    if (k === 0) return String(t);
    if (k === 0.5) return t ? t + ' buçuk' : 'yarım';
    if (k === 0.25) return t ? t + ' çeyrek' : 'çeyrek';
    if (k === 0.75) return t ? t + ' tam 3/4' : '3/4';
    return String(v).replace('.', ',');
  }
  function dozYazi(m, saat) {
    return miktarYazi(saatDozu(m, saat)) + ' ' + FORMLAR[m.form].birim;
  }

  function dozIsle(s, k, durum, simdi, erteleDk) {
    simdi = simdi == null ? Date.now() : simdi;
    const id = k.split('|')[0];
    const m = s.ilaclar.find(x => x.id === id);
    const once = s.kayit[k] ? s.kayit[k].d : 'bekliyor';
    const miktar = m ? saatDozu(m, k.split('|')[2]) : 0;
    if (m && once !== 'alindi' && durum === 'alindi') m.stok = Math.max(0, +(m.stok - miktar).toFixed(2));
    if (m && once === 'alindi' && durum !== 'alindi') m.stok = +(m.stok + miktar).toFixed(2);
    if (durum === 'bekliyor') delete s.kayit[k];
    else {
      const kay = { d: durum, z: simdi };
      if (durum === 'ertelendi') kay.e = simdi + (erteleDk || 10) * 60000;
      s.kayit[k] = kay;
    }
    return m || null;
  }

  // Son N günün uyum özeti (bugün dahil, yalnızca saati geçmiş dozlar sayılır)
  function uyum(s, gun, simdi, hasta) {
    simdi = simdi == null ? Date.now() : simdi;
    const r = { planlanan: 0, alinan: 0, atlanan: 0, kacirilan: 0, oran: null, gunluk: [], ilac: {} };
    let t = gunEkle(tarihStr(new Date(simdi)), -(gun - 1));
    for (let i = 0; i < gun; i++, t = gunEkle(t, 1)) {
      const g = { tarih: t, planlanan: 0, alinan: 0 };
      gununDozlari(s, t, simdi, hasta).forEach(x => {
        if (x.ms > simdi) return;
        const im = r.ilac[x.ilac.id] || (r.ilac[x.ilac.id] = { ad: x.ilac.ad, planlanan: 0, alinan: 0 });
        r.planlanan++; g.planlanan++; im.planlanan++;
        if (x.durum === 'alindi') { r.alinan++; g.alinan++; im.alinan++; }
        else if (x.durum === 'atlandi') r.atlanan++;
        else r.kacirilan++;
      });
      r.gunluk.push(g);
    }
    r.oran = r.planlanan ? Math.round((r.alinan / r.planlanan) * 100) : null;
    return r;
  }

  // Günlük ortalama kullanım (son 14 güne göre plan) ve stokun kaç gün yeteceği
  function gunlukKullanim(m) {
    if (m.arsiv || !m.saatler.length) return 0;
    let t = bugun(), n = 0;
    const gunluk = m.saatler.reduce((a, x) => a + saatDozu(m, x), 0);
    for (let i = 0; i < 28; i++, t = gunEkle(t, 1)) if (gunDozVarMi(m, t)) n++;
    return (n / 28) * gunluk;
  }
  function stokGun(m) {
    const k = gunlukKullanim(m);
    if (!k) return null;
    return Math.floor(m.stok / k);
  }
  const stokAz = m => !m.arsiv && m.stok <= m.kritik;

  function planYazi(m) {
    if (m.plan.tur === 'gunler') {
      const g = m.plan.gunler.slice().sort();
      if (g.length === 7) return 'Her gün';
      return g.length ? g.map(x => GUNLER[x - 1]).join(', ') : 'Gün seçilmedi';
    }
    if (m.plan.tur === 'aralik') {
      const a = m.plan.aralik;
      if (a === 1) return 'Her gün';
      if (a === 7) return 'Haftada bir';
      if (a === 14) return 'İki haftada bir';
      return a + ' günde bir';
    }
    return 'Her gün';
  }

  function tarihYazi(s, uzun) {
    const d = tarihOku(s);
    const g = GUNLER_UZUN[(d.getDay() + 6) % 7];
    return d.getDate() + ' ' + AYLAR[d.getMonth()] + (uzun ? ' ' + d.getFullYear() : '') + ', ' + g;
  }

  const hastaBul = (s, id) => s.hastalar.find(h => h.id === id) || s.hastalar[0];
  const hastaAdi = (s, id) => { const h = hastaBul(s, id); return (h && h.ad) || ('Hasta ' + (s.hastalar.indexOf(h) + 1)); };

  const api = {
    FORMLAR, RENKLER, RENK_ADI, HASTA_RENKLERI, HASTA_RENK_ADI, hastaBul, hastaAdi, uçukRenk, telWhatsapp, saatDozu, miktarYazi, dozYazi, GUNLER, GUNLER_UZUN, AYLAR,
    pad, tarihStr, tarihOku, bugun, gunEkle, gunFarki, haftaGunu, zamanMs, anahtar,
    bosDurum, duzelt, ilacDuzelt, yeniId, eskiYedekCevir,
    gunDozVarMi, gununDozlari, sonrakiDoz, dozIsle, uyum, gunlukKullanim, stokGun, stokAz, planYazi, tarihYazi,
  };
  root.IlacModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
