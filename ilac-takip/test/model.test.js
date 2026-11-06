// Hesap kuralları testleri: node ilac-takip/test/model.test.js
process.env.TZ = 'Europe/Istanbul';
const assert = require('assert');
const M = require('../www/model.js');

let n = 0;
const test = (ad, f) => { f(); n++; console.log('✓ ' + ad); };

const ilac = o => M.ilacDuzelt(Object.assign({ id: 'a', ad: 'Coraspin', doz: '100 mg', saatler: ['08:00', '20:00'], baslangic: '2026-11-02', stok: 10, kritik: 3 }, o));

test('her gün planı, başlangıç ve bitiş', () => {
  const m = ilac({ bitis: '2026-11-05' });
  assert.equal(M.gunDozVarMi(m, '2026-11-01'), false);
  assert.equal(M.gunDozVarMi(m, '2026-11-02'), true);
  assert.equal(M.gunDozVarMi(m, '2026-11-05'), true);
  assert.equal(M.gunDozVarMi(m, '2026-11-06'), false);
});

test('haftanın belirli günleri (2 Kasım 2026 Pazartesi)', () => {
  assert.equal(M.haftaGunu('2026-11-02'), 1);
  assert.equal(M.haftaGunu('2026-11-08'), 7);
  const m = ilac({ plan: { tur: 'gunler', gunler: [1, 4] } });
  assert.equal(M.gunDozVarMi(m, '2026-11-02'), true);
  assert.equal(M.gunDozVarMi(m, '2026-11-03'), false);
  assert.equal(M.gunDozVarMi(m, '2026-11-05'), true);
});

test('X günde bir (haftalık iğne), yaz saati geçişinden etkilenmez', () => {
  const m = ilac({ plan: { tur: 'aralik', aralik: 7 }, baslangic: '2026-03-20' });
  assert.equal(M.gunDozVarMi(m, '2026-03-27'), true);
  assert.equal(M.gunDozVarMi(m, '2026-04-03'), true);
  assert.equal(M.gunDozVarMi(m, '2026-04-04'), false);
  assert.equal(M.gunFarki('2026-10-20', '2026-11-03'), 14);
});

test('arşivdeki ve saati olmayan ilaçta doz yok', () => {
  assert.equal(M.gunDozVarMi(ilac({ arsiv: true }), '2026-11-03'), false);
  assert.equal(M.gunDozVarMi(ilac({ saatler: [] }), '2026-11-03'), false);
});

test('günün dozları, kaçırılan doz ve sıralama', () => {
  const s = M.bosDurum();
  s.ilaclar.push(ilac({}), ilac({ id: 'b', ad: 'Arveles', saatler: ['08:00'] }));
  const simdi = M.zamanMs('2026-11-02', '12:00');
  const d = M.gununDozlari(s, '2026-11-02', simdi);
  assert.deepEqual(d.map(x => x.ilac.ad + ' ' + x.saat), ['Arveles 08:00', 'Coraspin 08:00', 'Coraspin 20:00']);
  assert.equal(d[0].durum, 'kacirildi');
  assert.equal(d[2].durum, 'bekliyor');
});

test('doz alındı: stok düşer, geri alınınca stok döner', () => {
  const s = M.bosDurum();
  s.ilaclar.push(ilac({ birimDoz: 2 }));
  const k = M.anahtar('a', '2026-11-02', '08:00');
  M.dozIsle(s, k, 'alindi', 1);
  assert.equal(s.ilaclar[0].stok, 8);
  M.dozIsle(s, k, 'alindi', 2);
  assert.equal(s.ilaclar[0].stok, 8, 'iki kez basılınca iki kez düşmemeli');
  M.dozIsle(s, k, 'atlandi', 3);
  assert.equal(s.ilaclar[0].stok, 10);
  M.dozIsle(s, k, 'bekliyor', 4);
  assert.equal(s.kayit[k], undefined);
});

test('sonraki doz', () => {
  const s = M.bosDurum();
  s.ilaclar.push(ilac({}));
  const n1 = M.sonrakiDoz(s, M.zamanMs('2026-11-02', '08:45'));
  assert.equal(n1[0].saat, '08:00', 'bir saat içinde alınmayan doz hâlâ sırada');
  M.dozIsle(s, n1[0].k, 'alindi');
  const n2 = M.sonrakiDoz(s, M.zamanMs('2026-11-02', '09:30'));
  assert.equal(n2[0].saat, '20:00');
  const n3 = M.sonrakiDoz(s, M.zamanMs('2026-11-02', '21:30'));
  assert.equal(n3[0].tarih + ' ' + n3[0].saat, '2026-11-03 08:00');
});

test('uyum oranı', () => {
  const s = M.bosDurum();
  s.ilaclar.push(ilac({ baslangic: '2026-10-30' }));
  const simdi = M.zamanMs('2026-11-01', '21:00');
  ['2026-10-30|08:00', '2026-10-30|20:00', '2026-10-31|08:00', '2026-11-01|08:00'].forEach(x => {
    const [t, h] = x.split('|'); M.dozIsle(s, M.anahtar('a', t, h), 'alindi', simdi);
  });
  M.dozIsle(s, M.anahtar('a', '2026-10-31', '20:00'), 'atlandi', simdi);
  const u = M.uyum(s, 7, simdi);
  assert.equal(u.planlanan, 6);
  assert.equal(u.alinan, 4);
  assert.equal(u.atlanan, 1);
  assert.equal(u.kacirilan, 1);
  assert.equal(u.oran, 67);
});

test('stok kaç gün yeter', () => {
  const m = ilac({ baslangic: '2020-01-01', stok: 30 });
  assert.equal(M.stokGun(m), 15);
  const h = ilac({ baslangic: '2020-01-01', stok: 4, saatler: ['09:00'], plan: { tur: 'aralik', aralik: 7 } });
  assert.ok(M.stokGun(h) >= 24 && M.stokGun(h) <= 32);
});

test('eski uygulamanın yedeği okunur', () => {
  const eski = { version: 1, medications: [{ id: 3, name: 'Lantus', dose: '10 ünite', form: 'INJECTION', times: ['8:00', '22:00'], startDateMillis: M.zamanMs('2026-10-01', '00:00'), endDateMillis: null, currentStock: 5, criticalStockThreshold: 2, colorHex: '#E53935', instructions: 'Aç karnına', prescriptionNumber: 'R1', isArchived: false }] };
  const s = M.duzelt(eski);
  const m = s.ilaclar[0];
  assert.equal(m.ad, 'Lantus');
  assert.equal(m.form, 'igne');
  assert.deepEqual(m.saatler, ['08:00', '22:00']);
  assert.equal(m.baslangic, '2026-10-01');
  assert.equal(m.renk, '#E53935');
});

test('bozuk veri boş duruma döner, eksik ayar tamamlanır', () => {
  assert.equal(M.duzelt(null).ilaclar.length, 0);
  const s = M.duzelt({ ilaclar: [{ ad: 'X', saatler: ['25:00x', '07:30', '07:30'] }], ayar: { hasta: 'Ali' } });
  assert.deepEqual(s.ilaclar[0].saatler, ['07:30']);
  assert.equal(s.ayar.hasta, 'Ali');
  assert.equal(s.ayar.tekrarSayi, 3);
});

test('çoklu hasta: dozlar ve uyum hastaya göre ayrılır', () => {
  const s = M.duzelt({ hastalar: [{ id: 'h1', ad: 'Fatma' }, { id: 'h2', ad: 'Ali' }], ilaclar: [
    { id: 'a', ad: 'X', saatler: ['08:00'], baslangic: '2026-11-01', hasta: 'h1' },
    { id: 'b', ad: 'Y', saatler: ['08:00'], baslangic: '2026-11-01', hasta: 'h2' },
    { id: 'c', ad: 'Z', saatler: ['09:00'], baslangic: '2026-11-01', hasta: 'yok' }] });
  assert.equal(s.ilaclar[2].hasta, 'h1', 'bilinmeyen hasta ilk hastaya bağlanır');
  assert.notEqual(s.hastalar[0].renk, s.hastalar[1].renk, 'hastaların rengi farklı');
  const simdi = M.zamanMs('2026-11-02', '12:00');
  assert.equal(M.gununDozlari(s, '2026-11-02', simdi, 'h2').length, 1);
  assert.equal(M.gununDozlari(s, '2026-11-02', simdi, 'hepsi').length, 3);
  M.dozIsle(s, M.anahtar('b', '2026-11-02', '08:00'), 'alindi', simdi);
  assert.equal(M.uyum(s, 1, simdi, 'h2').oran, 100);
  assert.equal(M.uyum(s, 1, simdi, 'h1').oran, 0);
  assert.equal(M.hastaAdi(s, 'h2'), 'Ali');
});

test('tek hastalı eski veri: ad ve kan grubu ilk hastaya taşınır', () => {
  const s = M.duzelt({ ilaclar: [{ id: 'a', ad: 'X', saatler: ['08:00'] }], ayar: { hasta: 'Fatma Bektaş', kan: 'A Rh+' } });
  assert.equal(s.hastalar.length, 1);
  assert.equal(s.hastalar[0].ad, 'Fatma Bektaş');
  assert.equal(s.hastalar[0].kan, 'A Rh+');
  assert.equal(s.ilaclar[0].hasta, s.hastalar[0].id);
});

test('her saatin ayrı dozu: stok ve günlük kullanım', () => {
  const s = M.bosDurum();
  s.ilaclar.push(ilac({ saatler: ['08:00', '13:00'], dozlar: { '08:00': 1, '13:00': 0.5, '99:99': 3 }, stok: 10, baslangic: '2020-01-01' }));
  const m = s.ilaclar[0];
  assert.deepEqual(m.dozlar, { '08:00': 1, '13:00': 0.5 }, 'olmayan saatin dozu atılır');
  M.dozIsle(s, M.anahtar('a', '2026-11-02', '13:00'), 'alindi', 1);
  assert.equal(m.stok, 9.5);
  M.dozIsle(s, M.anahtar('a', '2026-11-02', '08:00'), 'alindi', 1);
  assert.equal(m.stok, 8.5);
  assert.equal(M.gunlukKullanim(m), 1.5);
  assert.equal(M.dozYazi(m, '13:00'), 'yarım adet');
  assert.equal(M.miktarYazi(1.5), '1 buçuk');
  assert.equal(M.miktarYazi(0.25), 'çeyrek');
});

test('telefon WhatsApp biçimine çevrilir, renk uçuklaşır', () => {
  assert.equal(M.telWhatsapp('0555 111 22 33'), '905551112233');
  assert.equal(M.telWhatsapp('5551112233'), '905551112233');
  assert.equal(M.telWhatsapp('+90 (555) 111-2233'), '905551112233');
  assert.equal(M.telWhatsapp('123'), '');
  assert.equal(M.uçukRenk('#000000', 0.9), '#e6e6e6');
});

test('hastanın telefonu ve ebeveyni korunur', () => {
  const s = M.duzelt({ hastalar: [{ id: 'h1', ad: 'Ali', tel: '0555', ebeveynAd: 'Annesi', ebeveynTel: '0532', haberVer: false }] });
  assert.equal(s.hastalar[0].ebeveynTel, '0532');
  assert.equal(s.hastalar[0].haberVer, false);
  assert.equal(M.duzelt({ hastalar: [{ id: 'h1' }] }).hastalar[0].haberVer, true);
});

test('eski "1 tablet" yazısı doz miktarına taşınır, "100 mg" kalır', () => {
  assert.equal(M.ilacDuzelt({ ad: 'A', doz: '1/2 tablet (yarım)', saatler: ['08:00'] }).birimDoz, 0.5);
  const b = M.ilacDuzelt({ ad: 'B', doz: '2 ölçek', saatler: ['08:00'] });
  assert.equal(b.birimDoz, 2); assert.equal(b.doz, '');
  assert.equal(M.ilacDuzelt({ ad: 'C', doz: '100 mg', saatler: ['08:00'] }).doz, '100 mg');
  assert.equal(M.ilacDuzelt({ ad: 'D', doz: '1 tablet', saatler: ['08:00'], dozlar: {}, birimDoz: 3 }).birimDoz, 3, 'yeni kayıtta dokunulmaz');
});

console.log(n + ' test geçti.');
