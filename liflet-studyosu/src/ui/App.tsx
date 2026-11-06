import { useCallback, useEffect, useMemo, useState } from 'react';
import { depoListele, kimlikleriListele, projeKaydet, projeleriListele, projeSil, yedekCoz, yedekMetni } from '../storage/db';
import { BASLANGIC_SABLONLARI } from '../model/sablonlar';
import { KATEGORILER, type Project } from '../model/types';
import { kimligiUygula, type Kimlik } from '../model/kimlik';
import Editor from '../editor/Editor';
import { FONT_CSS } from '../editor/fonts';
import { olcerAl } from '../editor/olcerOnbellek';
import { pdfUret } from '../editor/pdfDisa';
import { SayfaOnizleme } from '../editor/SayfaCiz';
import type { Olcer } from '../editor/duzen';
import YoneticiGirisi from './YoneticiGirisi';
import KimlikEkrani from './KimlikEkrani';
import DepoEkrani from './DepoEkrani';

type Bolum = 'ana' | 'yeni' | 'kayitli' | 'depo' | 'kimlik' | 'sablon' | 'kilavuz';

const MENU: { baslik?: string; ogeler: { id: Bolum; ad: string; simge: string }[] }[] = [
  { ogeler: [{ id: 'ana', ad: 'Ana Ekran', simge: '⌂' }] },
  { baslik: 'Liflet hazırla', ogeler: [{ id: 'yeni', ad: 'Yeni Liflet', simge: '＋' }, { id: 'kayitli', ad: 'Kayıtlı Lifletler', simge: '▤' }] },
  { baslik: 'Kaynaklar', ogeler: [{ id: 'depo', ad: 'Liflet Deposu', simge: '⇪' }, { id: 'kimlik', ad: 'Kurumsal Kimlik', simge: '◈' }, { id: 'sablon', ad: 'Ana Şablon', simge: '▦' }] },
  { baslik: 'Yardım', ogeler: [{ id: 'kilavuz', ad: 'Kullanım Kılavuzu', simge: '?' }] },
];

export const dugme = 'rounded-lg px-4 py-2.5 font-medium bg-red-700 text-white hover:bg-red-800 active:bg-red-900 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700';
export const dugmeIkincil = 'rounded-lg px-4 py-2 font-medium border border-stone-300 bg-white hover:bg-stone-50 active:bg-stone-100 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600';

function indir(veri: BlobPart | Uint8Array, ad: string, tip: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([veri as BlobPart], { type: tip })); a.download = ad; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function App() {
  const [bolum, setBolum] = useState<Bolum>('ana');
  const [projeler, setProjeler] = useState<Project[]>([]);
  const [yonetici, setYonetici] = useState(false);
  const [hata, setHata] = useState('');
  const [acik, setAcik] = useState<Project | null>(null);
  const [olc, setOlc] = useState<Olcer | null>(null);
  const [sayilar, setSayilar] = useState({ kimlik: 0, depo: 0 });

  const yukle = useCallback(() => {
    projeleriListele().then(setProjeler).catch((e) => setHata(String(e)));
    Promise.all([kimlikleriListele(), depoListele()]).then(([k, d]) => setSayilar({ kimlik: k.length, depo: d.length })).catch(() => {});
  }, []);
  useEffect(yukle, [yukle, bolum]);
  useEffect(() => { olcerAl().then((o) => setOlc(() => o)).catch(() => {}); }, []);

  if (acik) return <Editor proje={acik} yonetici={yonetici} kapat={() => { setAcik(null); setBolum('kayitli'); yukle(); }} />;
  const git = (b: Bolum) => { setBolum(b); setHata(''); };

  return (
    <div className="flex min-h-screen flex-col bg-amber-50 text-stone-900 md:flex-row">
      <style>{FONT_CSS}</style>
      <nav aria-label="Ana menü" className="shrink-0 bg-stone-900 p-3 text-stone-100 md:w-60 md:p-4">
        <h1 className="mb-3 text-base font-bold leading-tight md:mb-6 md:text-lg">Liflet Tasarım Stüdyosu</h1>
        <div className="flex gap-3 overflow-x-auto md:block md:overflow-visible">
          {MENU.map((g, i) => (
            <div key={i} className="flex shrink-0 gap-1 md:mb-4 md:block">
              {g.baslik && <div className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400 md:block">{g.baslik}</div>}
              {g.ogeler.map((m) => (
                <button key={m.id} onClick={() => git(m.id)} aria-current={bolum === m.id ? 'page' : undefined}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white md:w-full ${bolum === m.id ? 'bg-red-700 font-semibold' : 'hover:bg-stone-800'}`}>
                  <span className="w-4 text-center opacity-80" aria-hidden>{m.simge}</span>{m.ad}</button>))}
            </div>))}
        </div>
        <p className="mt-2 hidden px-3 text-xs text-stone-400 md:mt-6 md:block">{yonetici ? '🔓 Yönetici kilidi açık' : '🔒 Şablon kilitli'}</p>
      </nav>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {hata && <p role="alert" className="mb-4 rounded bg-red-100 p-3 text-red-900">{hata}</p>}
        {bolum === 'ana' && <Ana projeler={projeler} git={git} ac={setAcik} olc={olc} sayilar={sayilar} />}
        {bolum === 'yeni' && <Yeni bitti={(p) => { yukle(); setAcik(p); }} git={git} />}
        {bolum === 'kayitli' && <Kayitli projeler={projeler} yenile={yukle} hata={setHata} ac={setAcik} olc={olc} git={git} />}
        {bolum === 'depo' && <DepoEkrani />}
        {bolum === 'kimlik' && <KimlikEkrani yonetici={yonetici} setYonetici={setYonetici} />}
        {bolum === 'sablon' && <Sablon yonetici={yonetici} setYonetici={setYonetici} />}
        {bolum === 'kilavuz' && <Kilavuz />}
      </main>
    </div>
  );
}

function Baslik({ children, alt }: { children: string; alt?: string }) {
  return (<div className="mb-5"><h2 className="text-2xl font-bold">{children}</h2>{alt && <p className="mt-1 max-w-2xl text-stone-700">{alt}</p>}</div>);
}

function Adim({ no, ad, aciklama, yapildi, git, dugmeAd }: { no: number; ad: string; aciklama: string; yapildi: boolean; git: () => void; dugmeAd: string }) {
  return (<li className="flex items-start gap-3 rounded-lg border bg-white p-3">
    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${yapildi ? 'bg-green-600 text-white' : 'bg-stone-200'}`} aria-label={yapildi ? 'Tamamlandı' : `Adım ${no}`}>{yapildi ? '✓' : no}</span>
    <div className="min-w-0 flex-1"><div className="font-medium">{ad}</div><div className="text-sm text-stone-700">{aciklama}</div></div>
    <button className={dugmeIkincil} onClick={git}>{dugmeAd}</button>
  </li>);
}

function Ana({ projeler, git, ac, olc, sayilar }: { projeler: Project[]; git: (b: Bolum) => void; ac: (p: Project) => void; olc: Olcer | null; sayilar: { kimlik: number; depo: number } }) {
  return (<>
    <Baslik alt="Bakanlık lifletlerini aynı tasarım standardında, farklı ürünler için hazırlayın.">Hoş geldiniz</Baslik>
    <button className={`${dugme} mb-6 text-lg`} onClick={() => git('yeni')}>＋ Yeni liflet hazırla</button>
    <h3 className="mb-2 font-semibold">Başlarken</h3>
    <ol className="mb-8 max-w-3xl space-y-2">
      <Adim no={1} ad="Kurumsal kimliği tanımlayın" aciklama="Logolar, müdürlük adı, adres ve telefon bir kez girilir; her lifletle otomatik gelir." yapildi={sayilar.kimlik > 0} git={() => git('kimlik')} dugmeAd={sayilar.kimlik ? 'Düzenle' : 'Tanımla'} />
      <Adim no={2} ad="Hazır lifletleri depoya yükleyin" aciklama="PDF'leri adıyla yükleyin; metinlerini aratıp yeni liflete aktarabilirsiniz." yapildi={sayilar.depo > 0} git={() => git('depo')} dugmeAd={sayilar.depo ? 'Depoyu aç' : 'PDF yükle'} />
      <Adim no={3} ad="Yeni liflet hazırlayın" aciklama="Ürün adını yazın, şablonu seçin; metin ve fotoğrafları alanlara tıklayarak girin." yapildi={projeler.length > 0} git={() => git('yeni')} dugmeAd="Başla" />
    </ol>
    <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Son çalışılan lifletler</h3>{projeler.length > 4 && <button className="text-sm underline" onClick={() => git('kayitli')}>Tümünü gör</button>}</div>
    {projeler.length === 0 ? <p className="text-stone-700">Henüz liflet yok. Yukarıdaki düğmeyle ilkini hazırlayın.</p> : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {projeler.slice(0, 4).map((p) => (
          <button key={p.id} onClick={() => ac(p)} className="rounded-lg border bg-white p-3 text-left hover:border-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
            <SayfaOnizleme p={p} olc={olc} />
            <div className="mt-2 font-medium">{p.ad}</div>
            <div className="text-xs text-stone-600">{p.kategori} · {new Date(p.guncelleme).toLocaleDateString('tr-TR')}</div></button>))}
      </div>)}
  </>);
}

function Yeni({ bitti, git }: { bitti: (p: Project) => void; git: (b: Bolum) => void }) {
  const kullanilabilir = BASLANGIC_SABLONLARI.filter((s) => s.durum === 'onayli');
  const [ad, setAd] = useState('');
  const [kat, setKat] = useState<string>(KATEGORILER[0]);
  const [sablonId, setSablonId] = useState(kullanilabilir[0]?.id ?? '');
  const [kimlikler, setKimlikler] = useState<Kimlik[]>([]);
  const [kimlikId, setKimlikId] = useState('');
  const [hata, setHata] = useState('');
  useEffect(() => { kimlikleriListele().then((l) => { setKimlikler(l); if (l.length === 1) setKimlikId(l[0]!.id); }); }, []);
  const sablon = BASLANGIC_SABLONLARI.find((s) => s.id === sablonId);

  async function olustur(e: React.FormEvent) {
    e.preventDefault();
    if (!ad.trim()) return setHata('Önce ürün adını yazın.');
    if (!sablon || sablon.durum !== 'onayli') return setHata('Seçilen şablon kullanılamıyor.');
    let p: Project = { id: crypto.randomUUID(), ad: ad.trim(), kategori: kat, sablon, icerik: {}, guncelleme: Date.now() };
    const k = kimlikler.find((x) => x.id === kimlikId); if (k) p = kimligiUygula(p, k);
    await projeKaydet(p); bitti(p);
  }
  const girdi = 'mt-1 w-full rounded-lg border border-stone-300 bg-white p-2.5 text-base';
  return (<>
    <Baslik alt="Üç bilgi yeterli. Sonra metin ve fotoğrafları alanlara tıklayarak girersiniz.">Yeni Liflet</Baslik>
    <form onSubmit={olustur} className="max-w-xl space-y-5">
      <label className="block font-medium">1. Ürün adı<input autoFocus className={girdi} value={ad} onChange={(e) => { setAd(e.target.value); setHata(''); }} placeholder="ör. Bodur Elma Yetiştiriciliği" /></label>
      <label className="block font-medium">2. Kategori<select className={girdi} value={kat} onChange={(e) => setKat(e.target.value)}>{KATEGORILER.map((k) => <option key={k}>{k}</option>)}</select></label>
      <label className="block font-medium">3. Şablon
        <select className={girdi} value={sablonId} onChange={(e) => setSablonId(e.target.value)}>
          {BASLANGIC_SABLONLARI.map((s) => <option key={s.id} value={s.id} disabled={s.durum !== 'onayli'}>{s.ad}{s.durum !== 'onayli' ? ' — kaynak PDF bekliyor' : ''}</option>)}</select></label>
      {sablon?.deneme && <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-950">Bu bir deneme şablonudur, Bakanlık tasarımı değildir. Gerçek şablon, Bodur Elma PDF'si analiz edilince eklenecek.</p>}
      <label className="block font-medium">Kurumsal kimlik <span className="font-normal text-stone-600">(isteğe bağlı)</span>
        <select className={girdi} value={kimlikId} onChange={(e) => setKimlikId(e.target.value)}>
          <option value="">Kullanma</option>{kimlikler.map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}</select></label>
      {kimlikler.length === 0 && <p className="text-sm text-stone-700">Logo ve iletişim bilgilerinin otomatik gelmesi için önce <button type="button" className="underline" onClick={() => git('kimlik')}>kurumsal kimlik tanımlayın</button>.</p>}
      {hata && <p role="alert" className="text-red-800">{hata}</p>}
      <button type="submit" className={`${dugme} text-lg`}>Lifleti oluştur ve düzenlemeye başla →</button>
    </form>
  </>);
}

function Sablon({ yonetici, setYonetici }: { yonetici: boolean; setYonetici: (v: boolean) => void }) {
  return (<>
    <Baslik alt="Şablonun ölçüleri, çerçeveleri ve kurumsal öğeleri kilitlidir; yalnızca yönetici değiştirebilir.">Ana Şablon</Baslik>
    <div className="mb-6 max-w-3xl overflow-x-auto"><table className="w-full border bg-white text-sm">
      <thead className="bg-stone-100 text-left"><tr><th className="p-2">Şablon</th><th>Ölçü</th><th>Sayfa</th><th>Sütun</th><th>Durum</th></tr></thead>
      <tbody>{BASLANGIC_SABLONLARI.map((s) => (
        <tr key={s.id} className="border-t"><td className="p-2">{s.ad}</td>
          <td>{s.sayfa.genislik}×{s.sayfa.yukseklik} mm, {s.sayfa.yon}</td><td>{s.sayfa.sayi}</td><td>{s.sutunSayisi}</td>
          <td>{s.durum === 'onayli' ? 'Onaylı (kilitli)' : 'Kaynak PDF bekliyor'}</td></tr>))}</tbody></table></div>
    <YoneticiGirisi yonetici={yonetici} setYonetici={setYonetici} />
  </>);
}

function Kayitli({ projeler, yenile, hata, ac, olc, git }: { projeler: Project[]; yenile: () => void; hata: (m: string) => void; ac: (p: Project) => void; olc: Olcer | null; git: (b: Bolum) => void }) {
  const [q, setQ] = useState('');
  const liste = useMemo(() => projeler.filter((p) => `${p.ad} ${p.kategori}`.toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr'))), [projeler, q]);
  async function iceAl(f: File | undefined) {
    if (!f) return;
    try { await projeKaydet(yedekCoz(await f.text())); yenile(); hata(''); } catch (e) { hata((e as Error).message); }
  }
  async function pdf(p: Project) {
    if (!olc) return hata('Yazı tipleri henüz yüklenmedi, birkaç saniye sonra deneyin.');
    try { indir(await pdfUret(p, olc, { tur: 'baski', tasmaMm: 3 }), `${p.ad}-baski.pdf`, 'application/pdf'); hata(''); } catch (e) { hata('PDF üretilemedi: ' + String(e)); }
  }
  return (<>
    <Baslik alt="Hazırladığınız lifletler bu bilgisayarda saklanır. Önemli olanları 'Yedekle' ile dosya olarak alın.">Kayıtlı Lifletler</Baslik>
    <div className="mb-4 flex flex-wrap gap-2">
      <input aria-label="Liflet ara" className="min-w-0 flex-1 rounded-lg border border-stone-300 p-2.5" placeholder="Liflet ara…" value={q} onChange={(e) => setQ(e.target.value)} />
      <button className={dugme} onClick={() => git('yeni')}>＋ Yeni liflet</button>
      <label className={`${dugmeIkincil} cursor-pointer`}>Proje dosyası yükle<input type="file" accept=".json" hidden onChange={(e) => { iceAl(e.target.files?.[0]); e.target.value = ''; }} /></label>
    </div>
    {projeler.length === 0 ? <p className="text-stone-700">Kayıtlı liflet yok.</p> : liste.length === 0 ? <p>"{q}" ile eşleşen liflet yok.</p> : (
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{liste.map((p) => (
        <li key={p.id} className="rounded-lg border bg-white p-3">
          <button className="block w-full text-left" onClick={() => ac(p)} aria-label={`${p.ad} lifletini aç`}><SayfaOnizleme p={p} olc={olc} />
            <div className="mt-2 font-medium">{p.ad}</div>
            <div className="text-xs text-stone-600">{p.kategori} · {p.sablon.ad.replace(/ \(.*\)/, '')} · {new Date(p.guncelleme).toLocaleString('tr-TR')}</div></button>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={dugme} onClick={() => ac(p)}>Aç</button>
            <button className={dugmeIkincil} onClick={() => pdf(p)}>PDF indir</button>
            <button className={dugmeIkincil} onClick={() => indir(yedekMetni(p), `${p.ad}.liflet.json`, 'application/json')}>Yedekle</button>
            <button className={dugmeIkincil} onClick={() => confirm(`"${p.ad}" silinsin mi? Bu işlem geri alınamaz.`) && projeSil(p.id).then(yenile)}>Sil</button>
          </div></li>))}</ul>)}
  </>);
}

function Kilavuz() {
  return (<><Baslik>Kullanım Kılavuzu</Baslik>
    <ol className="max-w-2xl list-decimal space-y-3 pl-5">
      <li><b>Kurumsal kimlik:</b> Bir kez logoları ve iletişim bilgilerini girin (yönetici şifresi gerekir).</li>
      <li><b>Yeni liflet:</b> Ürün adı, kategori ve şablonu seçin; düzenleyici açılır.</li>
      <li><b>Düzenleme:</b> Sayfadaki mavi çizgili alana tıklayın. Sağ panelde metni yazın ya da fotoğraf seçin. "Sıradaki boş alana git" sizi sırayla yönlendirir.</li>
      <li><b>Metin sığmazsa:</b> Program uyarır ve öneri verir; yazıyı kendiliğinden küçültmez, metni silmez.</li>
      <li><b>Kontrol:</b> Üstteki "Hata" düğmesi baskı öncesi kontrol listesini açar. Kırmızı olanlar düzeltilmelidir.</li>
      <li><b>PDF:</b> "PDF ve dışa aktar" menüsünden baskıya hazır (3 mm taşma payı) ya da ekran PDF'sini alın.</li>
      <li><b>Kaydetme:</b> Değişiklikler otomatik kaydedilir (bu bilgisayarda). Önemli çalışmaları "Yedekle" ile dosya olarak saklayın.</li>
      <li><b>Liflet deposu:</b> Hazır PDF'leri yükleyin; metinlerini arayıp düzenlerken "Depodan al" ile aktarın.</li>
    </ol></>);
}
