const pptxgen = require("pptxgenjs");
const React = require("react");
const RDS = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa6");
const { applyTheme } = require("/root/.claude/skills/synced/3795bd00-08e7-4d42-828a-d3b39a9864d8_7c73f2d5-9fb5-4fe1-8e44-2ec49cc7322b/pptx/scripts/apply_theme.js");

const OUT = "/home/user/bektas/sunu/besi-bakim-besleme-sunusu.pptx";

const THEME = {
  name: "Besi Ciftligi",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "22302A", lt1: "FFFFFF", dk2: "1F3D2B", lt2: "EEF3EA",
    accent1: "2F6B3F", accent2: "D99A1E", accent3: "8A5A33",
    accent4: "6FA36B", accent5: "B5532F", accent6: "4F7A8C",
    hlink: "2F6B3F", folHlink: "8A5A33",
  },
};
const HEX = { dk: "1F3D2B", green: "2F6B3F", gold: "D99A1E", brown: "8A5A33", moss: "6FA36B", rust: "B5532F", light: "EEF3EA", text: "22302A", white: "FFFFFF", mute: "5A6B61" };

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "Besi Sığırcılığında Bakım ve Besleme";
pres.author = "Besi Rasyon";
const C = pres.SchemeColor;

pres.defineSlideMaster({
  title: "KAPAK", background: { color: C.background2 === undefined ? HEX.dk : HEX.dk },
  objects: [],
  slideNumber: undefined,
});
pres.defineSlideMaster({
  title: "ICERIK", background: { color: C.background1 },
  objects: [],
  slideNumber: { x: 9.1, y: 5.2, w: 0.5, h: 0.3, fontSize: 10, color: HEX.mute, align: "right" },
});
pres.defineSlideMaster({
  title: "KOYU", background: { color: HEX.dk },
  objects: [],
});

async function icon(name, color, size = 256) {
  const svg = RDS.renderToStaticMarkup(React.createElement(fa[name], { color: "#" + color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

function title(slide, text, color) {
  slide.addText(text, { x: 0.5, y: 0.35, w: 9, h: 0.8, fontSize: 32, bold: true, fontFace: "Cambria", color: color || HEX.dk, margin: 0, valign: "middle", isTextBox: true, objectName: "Baslik" });
}
function card(slide, x, y, w, h, fill) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: fill || HEX.light }, line: { color: fill || HEX.light, width: 0 }, objectName: "Kart" });
}
async function iconCircle(slide, name, x, y, d, bg, fg) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: bg }, line: { color: bg, width: 0 }, objectName: "Ikon zemini" });
  const s = d * 0.5;
  slide.addImage({ data: await icon(name, fg), x: x + (d - s) / 2, y: y + (d - s) / 2, w: s, h: s, altText: name });
}
function notes(slide, t) { slide.addNotes(t); }

(async () => {
  // 1 Kapak
  pres.addSection({ title: "Giriş" });
  let s = pres.addSlide({ masterName: "KAPAK", sectionTitle: "Giriş" });
  await iconCircle(s, "FaCow", 0.8, 1.2, 1.1, HEX.gold, HEX.dk);
  s.addText("Besi Sığırcılığında\nBakım ve Besleme", { x: 0.8, y: 2.5, w: 8.4, h: 1.5, fontSize: 44, bold: true, fontFace: "Cambria", color: HEX.white, margin: 0, valign: "top", isTextBox: true, objectName: "Baslik" });
  s.addText("Sağlıklı, hızlı ve kârlı besi için pratik rehber", { x: 0.8, y: 4.1, w: 8.4, h: 0.5, fontSize: 18, color: "CFE0C8", margin: 0, isTextBox: true, objectName: "Alt baslik" });
  notes(s, "Açılış. Amaç: besiciye, hayvan alımından satışa kadar temel bakım ve besleme adımlarını sade biçimde göstermek. Rakamlar genel aralıklardır; işletmeye ve ırka göre veteriner/ziraat mühendisi ile netleştirilmelidir.");

  // 2 Özet
  s = pres.addSlide({ masterName: "ICERIK", sectionTitle: "Giriş" });
  title(s, "Besi özeti: üç rakam");
  const stats = [
    ["%65–75", "Toplam giderin yem payı", "Maliyeti yönetmenin yolu yem yönetimidir"],
    ["1,0–1,5 kg", "Günlük canlı ağırlık artışı", "İyi yönetilen besi için hedef aralık"],
    ["≈ 212 gün", "Örnek besi süresi", "350 kg’dan 625 kg’a, günde 1,3 kg artışla"],
  ];
  stats.forEach((a, i) => {
    const x = 0.5 + i * 3.05;
    card(s, x, 1.5, 2.85, 3.2, HEX.light);
    s.addText(a[0], { x: x + 0.15, y: 1.75, w: 2.55, h: 0.9, fontSize: 30, bold: true, fontFace: "Cambria", color: HEX.green, align: "left", margin: 0, isTextBox: true, objectName: "Rakam" });
    s.addText(a[1], { x: x + 0.15, y: 2.7, w: 2.55, h: 0.6, fontSize: 18, bold: true, color: HEX.text, margin: 0, valign: "top", isTextBox: true });
    s.addText(a[2], { x: x + 0.15, y: 3.4, w: 2.55, h: 1.0, fontSize: 14, color: HEX.mute, margin: 0, valign: "top", isTextBox: true });
  });
  notes(s, "Bu üç rakam genel kabul gören yaklaşık değerlerdir; kendi işletmenizin kayıtlarıyla karşılaştırın.");

  // 3 Hayvan seçimi
  pres.addSection({ title: "Hazırlık" });
  s = pres.addSlide({ masterName: "ICERIK", sectionTitle: "Hazırlık" });
  title(s, "Hayvan seçimi ve alım");
  const rows = [
    ["FaMagnifyingGlass", "Sağlıklı görünüm", "Parlak tüy, canlı bakış, iştahlı yeme; topallık ve öksürük olmamalı"],
    ["FaScaleBalanced", "Uygun yaş ve ağırlık", "Benzer kilo ve yaşta, aynı gruba konacak hayvanlar seçilmeli"],
    ["FaCow", "Irk ve verim", "Besiye uygun ırk veya melezler; hızlı gelişen, geniş gövdeli hayvanlar"],
    ["FaClipboardList", "Evrak ve ayırma", "Küpe ve sağlık belgesi kontrolü; yeni hayvanlar ilk günlerde ayrı tutulmalı"],
  ];
  for (let i = 0; i < rows.length; i++) {
    const y = 1.4 + i * 0.95;
    await iconCircle(s, rows[i][0], 0.5, y, 0.7, HEX.green, HEX.white);
    s.addText(rows[i][1], { x: 1.45, y, w: 7.9, h: 0.35, fontSize: 18, bold: true, color: HEX.text, margin: 0, isTextBox: true });
    s.addText(rows[i][2], { x: 1.45, y: y + 0.35, w: 7.9, h: 0.45, fontSize: 14, color: HEX.mute, margin: 0, valign: "top", isTextBox: true });
  }

  // 4 Barınak
  s = pres.addSlide({ masterName: "ICERIK", sectionTitle: "Hazırlık" });
  title(s, "Barınak ve çevre");
  const bar = [
    ["FaWarehouse", "Alan", "Baş başına yaklaşık 3–4 m² kapalı, 6–10 m² açık alan"],
    ["FaTemperatureHigh", "Hava ve ısı", "Havadar, rüzgâr çekmeyen, sıcakta gölgeli ve iyi havalanan ahır"],
    ["FaDroplet", "Zemin ve kuruluk", "Kuru, kaygan olmayan zemin; altlık düzenli yenilenmeli"],
    ["FaBroom", "Yemlik ve suluk", "Baş başına yaklaşık 50–60 cm yemlik; temiz ve yeterli suluk"],
  ];
  for (let i = 0; i < 4; i++) {
    const x = 0.5 + (i % 2) * 4.6, y = 1.5 + Math.floor(i / 2) * 1.75;
    card(s, x, y, 4.4, 1.55, HEX.light);
    await iconCircle(s, bar[i][0], x + 0.2, y + 0.4, 0.75, HEX.moss, HEX.dk);
    s.addText(bar[i][1], { x: x + 1.2, y: y + 0.15, w: 3.05, h: 0.4, fontSize: 18, bold: true, color: HEX.text, margin: 0, isTextBox: true });
    s.addText(bar[i][2], { x: x + 1.2, y: y + 0.55, w: 3.05, h: 0.9, fontSize: 14, color: HEX.mute, margin: 0, valign: "top", isTextBox: true });
  }
  notes(s, "Alan ölçüleri genel öneridir; barınak tipine (ağıl, yarı açık, kapalı) göre değişir.");

  // 5 Besleme ilkeleri (dönem + grafik)
  pres.addSection({ title: "Besleme" });
  s = pres.addSlide({ masterName: "ICERIK", sectionTitle: "Besleme" });
  title(s, "Besleme ilkesi: kademeli geçiş");
  s.addText([
    { text: "Kaba yemden kesif yeme yavaş geçin", options: { bullet: true, breakLine: true } },
    { text: "Adaptasyonda 2–3 hafta boyunca kesifi artırın", options: { bullet: true, breakLine: true } },
    { text: "Günlük yem ihtiyacı yaklaşık canlı ağırlığın %2,5–3'ü (kuru madde)", options: { bullet: true, breakLine: true } },
    { text: "Yemi günde en az 2 öğünde, aynı saatlerde verin", options: { bullet: true } },
  ], { x: 0.5, y: 1.4, w: 3.8, h: 3.4, fontSize: 16, color: HEX.text, paraSpaceAfter: 10, valign: "top", margin: 0, isTextBox: true, objectName: "Madde listesi" });
  s.addChart(pres.charts.BAR, [
    { name: "Kaba yem", labels: ["Adaptasyon", "Büyütme", "Bitirme"], values: [70, 50, 25] },
    { name: "Kesif yem", labels: ["Adaptasyon", "Büyütme", "Bitirme"], values: [30, 50, 75] },
  ], {
    x: 4.6, y: 1.3, w: 4.9, h: 3.6, barDir: "col", barGrouping: "percentStacked", chartColors: [HEX.moss, HEX.gold],
    showTitle: true, title: "Dönemlere göre kaba/kesif oranı (%, örnek)", titleFontSize: 14, titleColor: HEX.text, titleFontFace: "Calibri",
    showValue: true, dataLabelPosition: "ctr", dataLabelColor: HEX.dk, dataLabelFontSize: 12, dataLabelFontFace: "Calibri",
    showLegend: true, legendPos: "b", legendFontSize: 12, legendColor: HEX.text, legendFontFace: "Calibri",
    catAxisLabelColor: HEX.text, catAxisLabelFontSize: 12, catAxisLabelFontFace: "Calibri",
    valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
  });
  notes(s, "Grafikteki oranlar örnek bir programdır. Gerçek oranlar yem hammaddelerine ve hayvan kilosuna göre rasyon hesabıyla belirlenir; Besi Rasyon uygulaması bunu en ucuz dengeli karışım olarak hesaplar.");

  // 6 Dönem tablosu
  s = pres.addSlide({ masterName: "ICERIK", sectionTitle: "Besleme" });
  title(s, "Besi dönemleri bir bakışta");
  const th = { bold: true, color: HEX.white, fill: { color: HEX.green }, fontSize: 14, fontFace: "Calibri", valign: "middle" };
  const td = (t, bold) => ({ text: t, options: { fontSize: 14, color: HEX.text, bold: !!bold, fontFace: "Calibri", valign: "middle" } });
  s.addTable([
    [{ text: "Dönem", options: th }, { text: "Süre", options: th }, { text: "Beslenme", options: th }, { text: "Hedef", options: th }],
    [td("Adaptasyon", true), td("2–3 hafta"), td("Kaliteli kaba yem ağırlıklı, kesif az"), td("Stresi atlatma, iştah")],
    [td("Büyütme", true), td("2–3 ay"), td("Kaba ve kesif dengeli"), td("Kemik ve kas gelişimi")],
    [td("Bitirme", true), td("1–2 ay"), td("Kesif ağırlıklı, kaba yem korunur"), td("Yağlanma ve randıman")],
  ], { x: 0.5, y: 1.5, w: 9, colW: [1.9, 1.5, 3.4, 2.2], rowH: 0.7, border: { type: "solid", color: "D7E0D2", pt: 1 }, fill: { color: HEX.white }, margin: [0, 0.12, 0, 0.12] });
  s.addText("Süreler yaklaşık değerdir; hayvanın başlangıç kilosuna ve hedef kesim ağırlığına göre değişir.", { x: 0.5, y: 4.6, w: 9, h: 0.4, fontSize: 12, italic: true, color: HEX.mute, margin: 0, isTextBox: true });

  // 6b Rasyon örneği (Besi Rasyon hesap motoru çıktısı)
  s = pres.addSlide({ masterName: "ICERIK", sectionTitle: "Besleme" });
  title(s, "Örnek rasyon: 350 kg, 1,3 kg/gün artış");
  const tr = (n, d) => n.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const rasyon = [["Arpa", 11, 3.92, 43.10], ["Mısır silajı", 3.5, 4.70, 16.46], ["Buğday kepeği", 9, 2.54, 22.85], ["Ayçiçeği küspesi", 13, 0.36, 4.65], ["Buğday samanı", 5, 0.01, 0.03], ["Mermer tozu", 3, 0.16, 0.47]];
  const thr = Object.assign({}, th, { align: "right" });
  const tdr = (t, b) => ({ text: t, options: { fontSize: 14, color: HEX.text, bold: !!b, align: "right", fontFace: "Calibri", valign: "middle" } });
  s.addTable([
    [{ text: "Yem", options: th }, { text: "Fiyat (TL/kg)", options: thr }, { text: "kg/gün", options: thr }, { text: "TL/gün", options: thr }],
    ...rasyon.map(r => [td(r[0]), tdr(tr(r[1], 1)), tdr(tr(r[2], 2)), tdr(tr(r[3], 2))]),
    [td("Toplam", true), tdr(""), tdr("11,68", true), tdr("87,55", true)],
  ], { x: 0.5, y: 1.4, w: 5.9, colW: [2.3, 1.4, 1.1, 1.1], rowH: 0.42, border: { type: "solid", color: "D7E0D2", pt: 1 }, fill: { color: HEX.white }, margin: [0, 0.1, 0, 0.1] });
  [["87,55 TL", "bir hayvanın günlük yem masrafı"], ["67,35 TL", "1 kg canlı ağırlık artışının yem masrafı"], ["≈ 212 gün", "350 kg'dan 625 kg'a"]].forEach((a, i) => {
    const y = 1.4 + i * 1.15;
    card(s, 6.7, y, 2.8, 1.0, HEX.light);
    s.addText(a[0], { x: 6.85, y: y + 0.08, w: 2.5, h: 0.45, fontSize: 22, bold: true, fontFace: "Cambria", color: HEX.green, margin: 0, isTextBox: true, objectName: "Rakam" });
    s.addText(a[1], { x: 6.85, y: y + 0.55, w: 2.5, h: 0.4, fontSize: 12, color: HEX.mute, margin: 0, valign: "top", isTextBox: true });
  });
  s.addText("Besi Rasyon uygulamasının hesabı; yem fiyatları uygulamadaki varsayılan fiyatlardır. Tuz ve premiks ayrıca eklenir. Kendi fiyatlarınızla yeniden hesaplayın.", { x: 0.5, y: 4.9, w: 9, h: 0.45, fontSize: 12, italic: true, color: HEX.mute, margin: 0, valign: "top", isTextBox: true });
  notes(s, "Rasyon, Besi Rasyon hesap motoruyla (NRC 2000 ihtiyaçları, en düşük maliyetli doğrusal programlama) 6 yem için hesaplandı: arpa, mısır silajı, buğday kepeği, ayçiçeği küspesi, buğday samanı, mermer tozu. Miktarlar yaş yem üzerindendir. Günlük kuru madde yaklaşık 7,78 kg.");

  // 6c Yem hazırlama ve yemleme düzeni
  s = pres.addSlide({ masterName: "ICERIK", sectionTitle: "Besleme" });
  title(s, "Yem hazırlama ve yemleme düzeni");
  const yd = [["FaScaleBalanced", "Tart", "Her yemi rasyondaki miktarda tartın; göz kararı kullanmayın"], ["FaWheatAwn", "Karıştır", "Kaba ve kesifi aynı karışımda verin; hayvan seçip yemeyi bırakmaz"], ["FaCow", "Öğünlere böl", "Günde en az 2 öğün, her gün aynı saatlerde"], ["FaMagnifyingGlass", "Kalanı izle", "Yemlik hiç boşalmıyor ama kalan da birikmiyorsa miktar doğrudur"]];
  for (let i = 0; i < 4; i++) {
    const x = 0.5 + i * 2.3;
    card(s, x, 1.5, 2.1, 3.1, HEX.light);
    await iconCircle(s, yd[i][0], x + 0.7, 1.75, 0.7, HEX.green, HEX.white);
    s.addText(yd[i][1], { x: x + 0.1, y: 2.6, w: 1.9, h: 0.4, fontSize: 18, bold: true, color: HEX.text, align: "center", margin: 0, isTextBox: true });
    s.addText(yd[i][2], { x: x + 0.15, y: 3.1, w: 1.8, h: 1.4, fontSize: 14, color: HEX.mute, align: "center", margin: 0, valign: "top", isTextBox: true });
  }
  s.addText("Yeni bir yeme geçerken karışımı 1–2 haftada kademeli değiştirin.", { x: 0.5, y: 4.8, w: 9, h: 0.4, fontSize: 12, italic: true, color: HEX.mute, margin: 0, isTextBox: true });

  // 7 Su ve mineral
  s = pres.addSlide({ masterName: "ICERIK", sectionTitle: "Besleme" });
  title(s, "Su, tuz ve mineral");
  card(s, 0.5, 1.5, 4.4, 2.7, HEX.light);
  await iconCircle(s, "FaDroplet", 0.75, 1.75, 0.8, HEX.accent6 || "4F7A8C", HEX.white);
  s.addText("Temiz su", { x: 1.75, y: 1.8, w: 3, h: 0.7, fontSize: 22, bold: true, color: HEX.text, margin: 0, valign: "middle", isTextBox: true });
  s.addText("Günde baş başına yaklaşık 40–60 litre, sıcakta daha fazla. Suluk her gün yıkanmalı; su kesintisiz erişilebilir olmalı.", { x: 0.75, y: 2.75, w: 3.9, h: 1.9, fontSize: 15, color: HEX.mute, margin: 0, valign: "top", isTextBox: true });
  card(s, 5.1, 1.5, 4.4, 2.7, HEX.light);
  await iconCircle(s, "FaWheatAwn", 5.35, 1.75, 0.8, HEX.gold, HEX.dk);
  s.addText("Tuz ve mineral", { x: 6.35, y: 1.8, w: 3, h: 0.7, fontSize: 22, bold: true, color: HEX.text, margin: 0, valign: "middle", isTextBox: true });
  s.addText("Tuz ve premiks, rasyona hesapla katılmalı. Kalsiyum–fosfor dengesi bozulmamalı; kesif ağırlıklı beslemede tamponlayıcı katkı (ör. kabartma tozu) düşünülebilir.", { x: 5.35, y: 2.75, w: 3.9, h: 1.9, fontSize: 15, color: HEX.mute, margin: 0, valign: "top", isTextBox: true });

  // 8 Sağlık
  pres.addSection({ title: "Sağlık ve bakım" });
  s = pres.addSlide({ masterName: "ICERIK", sectionTitle: "Sağlık ve bakım" });
  title(s, "Aşı ve parazit takvimi");
  const steps = [
    ["Giriş", "Karantina, iç ve dış parazit uygulaması"],
    ["1. hafta", "Şap ve diğer zorunlu aşılar, veteriner programına göre"],
    ["Besi boyunca", "Düzenli gözlem, hasta hayvanı ayırma"],
    ["Satıştan önce", "İlaç bekleme sürelerine uyma"],
  ];
  steps.forEach((a, i) => {
    const x = 0.5 + i * 2.3;
    s.addShape(pres.shapes.OVAL, { x, y: 1.6, w: 0.7, h: 0.7, fill: { color: HEX.green }, line: { color: HEX.green, width: 0 }, objectName: "Adim" });
    s.addText(String(i + 1), { x, y: 1.6, w: 0.7, h: 0.7, fontSize: 20, bold: true, color: HEX.white, align: "center", valign: "middle", margin: 0, isTextBox: true });
    s.addText(a[0], { x, y: 2.5, w: 2.1, h: 0.4, fontSize: 18, bold: true, color: HEX.text, margin: 0, isTextBox: true });
    s.addText(a[1], { x, y: 2.95, w: 2.1, h: 1.4, fontSize: 14, color: HEX.mute, margin: 0, valign: "top", isTextBox: true });
  });
  s.addText("Aşı çeşidi ve zamanı bölgeye göre değişir; mutlaka yerel veteriner hekimin programını izleyin.", { x: 0.5, y: 4.6, w: 9, h: 0.4, fontSize: 12, italic: true, color: HEX.mute, margin: 0, isTextBox: true });

  // 9 Sorunlar
  s = pres.addSlide({ masterName: "ICERIK", sectionTitle: "Sağlık ve bakım" });
  title(s, "Sık görülen sorunlar");
  const th2 = Object.assign({}, th, { fill: { color: HEX.brown } });
  s.addTable([
    [{ text: "Sorun", options: th2 }, { text: "Belirti", options: th2 }, { text: "Önlem", options: th2 }],
    [td("Asidoz", true), td("İştahsızlık, sulu dışkı"), td("Kesifte kademeli geçiş, kaba yemi koruma")],
    [td("Şişme", true), td("Sol karında şişkinlik"), td("Taze baklagil ve ıslak yemde dikkat; hemen veteriner")],
    [td("Solunum yolu", true), td("Öksürük, burun akıntısı"), td("Havalandırma, kuru zemin, erken tedavi")],
    [td("Topallık", true), td("Yürümede güçlük"), td("Zemin ve tırnak bakımı, asidozdan kaçınma")],
  ], { x: 0.5, y: 1.5, w: 9, colW: [1.9, 2.8, 4.3], rowH: 0.65, border: { type: "solid", color: "E3D8CE", pt: 1 }, fill: { color: HEX.white }, margin: [0, 0.12, 0, 0.12] });

  // 10 Günlük rutin
  s = pres.addSlide({ masterName: "ICERIK", sectionTitle: "Sağlık ve bakım" });
  title(s, "Günlük bakım rutini");
  const rut = [["FaEye", "Gözlem", "Her hayvanı sabah kontrol et"], ["FaWheatAwn", "Yemleme", "Kalan yemi ölç, yemi tazele"], ["FaDroplet", "Su", "Suluğu yıka, doldur"], ["FaClipboardList", "Kayıt", "Yem, hastalık ve tartı kaydı"]];
  for (let i = 0; i < 4; i++) {
    const x = 0.5 + i * 2.3;
    card(s, x, 1.6, 2.1, 2.9, HEX.light);
    await iconCircle(s, rut[i][0] === "FaEye" ? "FaMagnifyingGlass" : rut[i][0], x + 0.7, 1.85, 0.7, HEX.green, HEX.white);
    s.addText(rut[i][1], { x: x + 0.1, y: 2.75, w: 1.9, h: 0.4, fontSize: 18, bold: true, color: HEX.text, align: "center", margin: 0, isTextBox: true });
    s.addText(rut[i][2], { x: x + 0.15, y: 3.25, w: 1.8, h: 1.1, fontSize: 14, color: HEX.mute, align: "center", margin: 0, valign: "top", isTextBox: true });
  }

  // 11 Kârlılık
  pres.addSection({ title: "Kârlılık" });
  s = pres.addSlide({ masterName: "ICERIK", sectionTitle: "Kârlılık" });
  title(s, "Maliyet yönetimi");
  s.addChart(pres.charts.DOUGHNUT, [{ name: "Gider", labels: ["Yem", "İşçilik", "Veteriner", "Diğer"], values: [75, 10, 5, 10] }], {
    x: 0.5, y: 1.3, w: 4.6, h: 3.7, holeSize: 55, chartColors: [HEX.green, HEX.gold, HEX.brown, HEX.moss],
    showTitle: true, title: "Besi giderlerinin dağılımı (yaklaşık %, örnek)", titleFontSize: 14, titleColor: HEX.text, titleFontFace: "Calibri",
    showPercent: true, showValue: false, dataLabelColor: HEX.white, dataLabelFontSize: 12, dataLabelFontFace: "Calibri",
    showLegend: true, legendPos: "b", legendFontSize: 12, legendColor: HEX.text, legendFontFace: "Calibri",
  });
  s.addText([
    { text: "Yem maliyetini düşürmenin yolu: en ucuz dengeli rasyon", options: { bullet: true, breakLine: true } },
    { text: "1 kg canlı ağırlık artışının maliyetini takip edin", options: { bullet: true, breakLine: true } },
    { text: "Satış kilosunu piyasa fiyatına göre planlayın", options: { bullet: true, breakLine: true } },
    { text: "Besi Rasyon uygulaması ile yem fiyatlarına göre rasyonu yeniden hesaplayın", options: { bullet: true } },
  ], { x: 5.4, y: 1.5, w: 4.1, h: 3.3, fontSize: 16, color: HEX.text, paraSpaceAfter: 10, valign: "top", margin: 0, isTextBox: true });
  notes(s, "Pasta grafikteki dağılım örnektir; kendi işletmenizin gerçek giderleriyle değiştirin.");

  // 11a Artış hızı ve maliyet (Besi Rasyon hesap motoru)
  s = pres.addSlide({ masterName: "ICERIK", sectionTitle: "Kârlılık" });
  title(s, "Hızlı artış kg maliyetini düşürür");
  const adgL = ["0,6", "0,8", "1,0", "1,2", "1,3", "1,4", "1,5"], adgV = [99.5, 84.3, 75.37, 69.55, 67.35, 65.61, 64.02];
  s.addChart(pres.charts.BAR, [{ name: "TL/kg artış", labels: adgL, values: adgV }], {
    x: 0.5, y: 1.3, w: 5.6, h: 3.6, barDir: "col", chartColors: [HEX.green], barGapWidthPct: 40,
    showTitle: true, title: "1 kg artışın yem masrafı (TL), günlük artışa göre", titleFontSize: 14, titleColor: HEX.text, titleFontFace: "Calibri",
    showValue: true, dataLabelPosition: "outEnd", dataLabelColor: HEX.text, dataLabelFontSize: 12, dataLabelFontFace: "Calibri", dataLabelFormatCode: "0",
    showLegend: false, catAxisLabelColor: HEX.text, catAxisLabelFontSize: 12, catAxisLabelFontFace: "Calibri",
    showCatAxisTitle: true, catAxisTitle: "Günlük artış (kg/gün)", catAxisTitleColor: HEX.mute, catAxisTitleFontSize: 12,
    valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
  });
  s.addText([
    { text: "0,8 yerine 1,3 kg/gün: kg başına maliyet yaklaşık %20 düşer (84 → 67 TL)", options: { bullet: true, breakLine: true } },
    { text: "Besi süresi 344 günden 212 güne iner", options: { bullet: true, breakLine: true } },
    { text: "Güvenli üst sınır yaklaşık 1,5 kg/gün; daha hızlısı sindirim sağlığını zorlar", options: { bullet: true } },
  ], { x: 6.4, y: 1.5, w: 3.1, h: 3.3, fontSize: 14, color: HEX.text, paraSpaceAfter: 10, valign: "top", margin: 0, isTextBox: true, objectName: "Madde listesi" });
  s.addText("Besi Rasyon hesabı: 350 kg hayvan, aynı yemler ve varsayılan fiyatlar.", { x: 0.5, y: 4.95, w: 9, h: 0.3, fontSize: 12, italic: true, color: HEX.mute, margin: 0, isTextBox: true });
  notes(s, "Değerler Besi Rasyon uygulamasındaki 'artış hedefi' tablosundan alındı (350 kg, kesim 625 kg, aynı yemler ve fiyatlar). Yem dışı gider dahil değildir.");

  // 11b Kârlılık hesabı
  s = pres.addSlide({ masterName: "ICERIK", sectionTitle: "Kârlılık" });
  title(s, "Kârlılık hesabı: baş başına örnek");
  const gun = 275 / 1.3, yemT = gun * 87.5549, digerT = gun * 30, alisT = 350 * 200, satisT = 625 * 190;
  const toplamG = alisT + yemT + digerT, kar = satisT - toplamG, basabas = toplamG / 625;
  const r0 = n => tr(Math.round(n), 0);
  s.addTable([
    [{ text: "Kalem", options: th }, { text: "Hesap", options: th }, { text: "TL / baş", options: thr }],
    [td("Hayvan alışı"), td("350 kg × 200 TL/kg"), tdr(r0(alisT))],
    [td("Yem"), td("212 gün × 87,55 TL"), tdr(r0(yemT))],
    [td("Yem dışı gider"), td("212 gün × 30 TL"), tdr(r0(digerT))],
    [td("Toplam gider", true), td(""), tdr(r0(toplamG), true)],
    [td("Satış geliri", true), td("625 kg × 190 TL/kg"), tdr(r0(satisT), true)],
    [td("Kâr", true), td(""), tdr(r0(kar), true)],
  ], { x: 0.5, y: 1.4, w: 5.9, colW: [1.9, 2.5, 1.5], rowH: 0.45, border: { type: "solid", color: "D7E0D2", pt: 1 }, fill: { color: HEX.white }, margin: [0, 0.1, 0, 0.1] });
  [[r0(kar) + " TL", "baş başına kâr"], ["≈ " + r0(basabas) + " TL/kg", "başabaş satış fiyatı (canlı)"]].forEach((a, i) => {
    const y = 1.4 + i * 1.5;
    card(s, 6.7, y, 2.8, 1.35, HEX.light);
    s.addText(a[0], { x: 6.85, y: y + 0.2, w: 2.5, h: 0.55, fontSize: 24, bold: true, fontFace: "Cambria", color: HEX.green, margin: 0, isTextBox: true, objectName: "Rakam" });
    s.addText(a[1], { x: 6.85, y: y + 0.8, w: 2.5, h: 0.4, fontSize: 14, color: HEX.mute, margin: 0, valign: "top", isTextBox: true });
  });
  s.addText("Alış (200 TL/kg), satış (190 TL/kg) ve yem dışı gider (30 TL/gün) varsayımdır, gerçek fiyat değildir. Kendi rakamlarınızla değiştirin.", { x: 0.5, y: 4.9, w: 9, h: 0.45, fontSize: 12, italic: true, color: HEX.mute, margin: 0, valign: "top", isTextBox: true });
  notes(s, "Yem masrafı bir önceki slaytın hesabından gelir (87,55 TL/gün, 275 kg artış / 1,3 kg/gün ≈ 212 gün). Fiyatlar örnek varsayımdır: sunumdan önce güncel alış ve satış fiyatlarıyla değiştirin. Başabaş = toplam gider / satış kilosu.");

  // 11c Yem fiyatı duyarlılığı
  s = pres.addSlide({ masterName: "ICERIK", sectionTitle: "Kârlılık" });
  title(s, "Yem fiyatı değişirse kâr");
  const sens = [-0.2, -0.1, 0, 0.1, 0.2].map(m => {
    const y = yemT * (1 + m), tg = alisT + y + digerT;
    return [(m > 0 ? "+" : "") + Math.round(m * 100).toString().replace("-", "−") + " %", y, satisT - tg, tg / 625];
  });
  s.addTable([
    [{ text: "Yem fiyatı", options: th }, { text: "Yem gideri (TL/baş)", options: thr }, { text: "Kâr (TL/baş)", options: thr }, { text: "Başabaş (TL/kg)", options: thr }],
    ...sens.map((r, i) => [td(i === 2 ? "Bugünkü (0 %)" : r[0], i === 2), tdr(r0(r[1]), i === 2), tdr(r0(r[2]), i === 2), tdr(r0(r[3]), i === 2)]),
  ], { x: 0.5, y: 1.4, w: 9, colW: [2.4, 2.4, 2.1, 2.1], rowH: 0.5, border: { type: "solid", color: "D7E0D2", pt: 1 }, fill: { color: HEX.white }, margin: [0, 0.12, 0, 0.12] });
  s.addText("Yemde %10 artış, baş başına kârı yaklaşık " + r0(yemT * 0.1) + " TL azaltır.", { x: 0.5, y: 4.55, w: 9, h: 0.5, fontSize: 14, bold: true, color: HEX.text, margin: 0, valign: "top", isTextBox: true });
  s.addText("Tüm yem fiyatları aynı oranda değişir varsayıldı; alış, satış ve yem dışı gider önceki slayttaki varsayımlardır.", { x: 0.5, y: 5.0, w: 9, h: 0.3, fontSize: 12, italic: true, color: HEX.mute, margin: 0, isTextBox: true });
  notes(s, "Duyarlılık hesabı: yem gideri tüm fiyatlarda aynı oranda değiştirilerek yeniden hesaplandı. Gerçekte rasyon yeni fiyatlarla yeniden optimize edilirse etki biraz azalır.");

  // 12 Kapanış
  s = pres.addSlide({ masterName: "KOYU", sectionTitle: "Kârlılık" });
  s.addText("Kontrol listesi", { x: 0.5, y: 0.35, w: 9, h: 0.8, fontSize: 32, bold: true, fontFace: "Cambria", color: HEX.white, margin: 0, valign: "middle", isTextBox: true, objectName: "Baslik" });
  const chk = ["Sağlıklı, benzer boyda hayvan seçtim", "Barınak kuru, havadar ve yeterli genişlikte", "Kesife kademeli geçiyorum, kaba yemi koruyorum", "Su her zaman temiz ve yeterli", "Aşı ve parazit programı veterinerle yapıldı", "Yem ve artış kayıtlarını tutuyorum"];
  const ck = await icon("FaCheck", HEX.gold);
  chk.forEach((t, i) => {
    const x = 0.8 + (i % 2) * 4.4, y = 1.5 + Math.floor(i / 2) * 1.05;
    s.addImage({ data: ck, x, y: y + 0.1, w: 0.35, h: 0.35, altText: "Onay işareti" });
    s.addText(t, { x: x + 0.55, y, w: 3.6, h: 0.9, fontSize: 16, color: HEX.white, margin: 0, valign: "top", isTextBox: true });
  });

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("done");
})();
