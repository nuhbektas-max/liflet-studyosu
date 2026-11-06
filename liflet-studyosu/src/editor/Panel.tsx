import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, Slot, SlotContent, YaziStili } from '../model/types';
import { duzenle, metinOnerileri, SIGMAMA_UYARISI, type Olcer } from './duzen';
import { dpiDurumu, dosyaOku } from './foto';
import { etkinDpi, etkinTur, fotoMod, metinKutusu, VARSAYILAN_GOLGE, VARSAYILAN_YAZI_GOLGE } from './gorunum';
import { logoHamOlustur, logoIsle, VARSAYILAN_LOGO } from './logoIsle';
import type { Bulgu } from './kontrol';
import { stilBul } from './stil';
import { TUR_SIMGE } from './SayfaCiz';
import DepodanMetin from '../ui/DepodanMetin';
import type { Kimlik } from '../model/kimlik';

export const btn = 'rounded-lg px-3 py-2 text-sm font-medium border border-stone-300 bg-white hover:bg-stone-50 active:bg-stone-100 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600';
export const btnAna = 'rounded-lg px-3 py-2 text-sm font-medium bg-red-700 text-white hover:bg-red-800 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700';
const girdi = 'w-full rounded border border-stone-300 p-1.5 text-sm';

type IcerikFn = (id: string, d: Partial<SlotContent>) => void;

function Bolum({ baslik, acik = false, children }: { baslik: string; acik?: boolean; children: React.ReactNode }) {
  return (<details open={acik} className="group rounded-lg border border-stone-200">
    <summary className="cursor-pointer select-none rounded-lg px-3 py-2 text-sm font-semibold hover:bg-stone-50">{baslik}</summary>
    <div className="space-y-2 border-t border-stone-200 p-3">{children}</div>
  </details>);
}

export const alanDolu = (a: Slot, c?: SlotContent) => (etkinTur(a, c) !== 'metin' ? !!c?.foto : !!c?.metin?.trim());

/** Sağ panel: seçili alan yoksa adım adım ilerleme ve kontrol listesi. */
export function Adimlar({ p, bulgular, yonetici, sec, onayla, kimlikler, kimlikUygula, siradaki, logolariOtomatik }: {
  p: Project; bulgular: Bulgu[]; yonetici: boolean; sec: (id: string) => void; onayla: () => void;
  kimlikler: Kimlik[]; kimlikUygula: (k: Kimlik) => void; siradaki: () => void; logolariOtomatik: () => void;
}) {
  const logoSayisi = p.sablon.alanlar.filter((a) => etkinTur(a, p.icerik[a.id]) === 'logo' && p.icerik[a.id]?.foto).length;
  const alanlar = p.sablon.alanlar;
  const dolu = alanlar.filter((a) => alanDolu(a, p.icerik[a.id])).length;
  const hatalar = bulgular.filter((b) => b.duzey === 'hata');
  const bos = alanlar.filter((a) => !alanDolu(a, p.icerik[a.id]));
  const [secKimlik, setSecKimlik] = useState(p.kimlikId ?? '');
  const geometri = bulgular.some((b) => b.mesaj.startsWith('Şablon koordinatları'));
  const yuzde = alanlar.length ? Math.round((dolu / alanlar.length) * 100) : 0;
  return (<div className="space-y-4">
    <div>
      <div className="mb-1 flex items-baseline justify-between"><h3 className="font-semibold">İlerleme</h3><span className="text-sm text-stone-600">{dolu}/{alanlar.length} alan dolu</span></div>
      <div className="h-2 overflow-hidden rounded bg-stone-200" role="progressbar" aria-valuenow={yuzde} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-green-600 transition-all" style={{ width: `${yuzde}%` }} /></div>
      <button className={`${btnAna} mt-3 w-full`} disabled={!bos.length} onClick={siradaki}>{bos.length ? 'Sıradaki boş alana git →' : 'Tüm alanlar dolu ✓'}</button>
    </div>
    {hatalar.length > 0 && (<div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3">
      <h3 className="mb-1 text-sm font-semibold text-red-800">Düzeltilmesi gerekenler ({hatalar.length})</h3>
      <ul className="space-y-1 text-sm">{hatalar.map((b, i) => (<li key={i}><button className={`text-left text-red-800 ${b.alanId ? 'underline' : ''}`} onClick={() => b.alanId && sec(b.alanId)}>✖ {b.mesaj}</button></li>))}</ul>
      {geometri && yonetici && <button className={`${btn} mt-2`} onClick={onayla}>Yeni geometriyi onayla (yönetici)</button>}
    </div>)}
    {bulgular.some((b) => b.duzey === 'uyari' && b.alanId && !bos.some((a) => a.id === b.alanId)) && (<div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
      <h3 className="mb-1 text-sm font-semibold text-amber-900">Dikkat</h3>
      <ul className="space-y-1 text-sm">{bulgular.filter((b) => b.duzey === 'uyari' && b.alanId && !bos.some((a) => a.id === b.alanId)).map((b, i) => (
        <li key={i}><button className="text-left text-amber-900 underline" onClick={() => sec(b.alanId!)}>⚠ {b.mesaj}</button></li>))}</ul></div>)}
    {bulgular.filter((b) => !b.alanId && b.duzey === 'uyari').map((b, i) => <p key={i} className="text-sm text-amber-800">⚠ {b.mesaj}</p>)}
    {bos.length > 0 && (<details className="rounded-lg border border-stone-200">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold">Boş alanlar ({bos.length})</summary>
      <ul className="space-y-1 border-t p-3 text-sm">{bos.map((a) => (<li key={a.id}><button className="flex w-full items-center gap-2 text-left hover:underline" onClick={() => sec(a.id)}>
        <span className="w-4 text-center text-blue-700">{TUR_SIMGE[a.tur] ?? '+'}</span>{a.ad}<span className="ml-auto text-xs text-stone-500">sayfa {a.sayfa + 1}</span></button></li>))}</ul></details>)}
    {logoSayisi > 0 && <button className={`${btn} w-full`} onClick={logolariOtomatik}>Tüm logoları otomatik boyutlandır ({logoSayisi})</button>}
    <Bolum baslik="Kurumsal kimlik">
      <select aria-label="Kimlik profili" className={girdi} value={secKimlik} onChange={(e) => setSecKimlik(e.target.value)}>
        <option value="">Profil seçin</option>{kimlikler.map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}</select>
      <button className={btn} disabled={!secKimlik} onClick={() => { const k = kimlikler.find((x) => x.id === secKimlik); if (k && confirm('Logolar, müdürlük adı ve iletişim alanları profile göre doldurulacak; bu alanlardaki mevcut içerik değişir. Devam edilsin mi?')) kimlikUygula(k); }}>Kimliği uygula</button>
      <p className="text-xs text-stone-600">{kimlikler.length ? 'Profiller "Kurumsal Kimlik" ekranında tanımlanır.' : 'Henüz profil yok. Ana ekrandan "Kurumsal Kimlik"i açın.'}</p>
    </Bolum>
    <p className="text-xs text-stone-500">Şablon: {p.sablon.ad}. Sabit öğeler ve alan ölçüleri kilitlidir.</p>
  </div>);
}

export function AlanPaneli({ alan, p, olc, icerik, yonetici, kutu, kapat }: {
  alan: Slot; p: Project; olc: Olcer | null; icerik: IcerikFn; yonetici: boolean; kutu: (r: Slot['rect']) => void; kapat: () => void;
}) {
  const c = p.icerik[alan.id] ?? {}; const tur = etkinTur(alan, c); const foto = tur !== 'metin';
  const st = stilBul(alan, c);
  const stilYaz = (d: Partial<YaziStili>) => icerik(alan.id, { yazi: { ...c.yazi, ...d } });
  const dpi = etkinDpi(alan, c); const dd = dpiDurumu(dpi);
  const d = !foto && olc && c.metin ? duzenle(c.metin, st, metinKutusu(alan.rect, c), olc) : null;
  const oneriler = useMemo(() => (d && !d.sigiyor && c.metin ? metinOnerileri(c.metin) : []), [d, c.metin]);
  const [hata, setHata] = useState('');
  const [depoAcik, setDepoAcik] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!foto) ta.current?.focus({ preventScroll: true }); }, [foto]);
  const gy = (x: Partial<NonNullable<SlotContent['golge']>>) => icerik(alan.id, { golge: { ...c.golge!, ...x } });
  const renkler = [...(p.kimlikRenkleri ?? []), ...p.sablon.renkler.filter((r) => !(p.kimlikRenkleri ?? []).includes(r))];

  return (<div className="space-y-3">
    <div className="flex items-start justify-between gap-2"><div><div className="text-xs text-stone-500">Sayfa {alan.sayfa + 1}</div><h3 className="text-base font-semibold">{TUR_SIMGE[alan.tur] ?? ''} {alan.ad}</h3></div>
      <button className={btn} onClick={kapat} aria-label="Seçimi kapat">Kapat ✕</button></div>

    <div role="radiogroup" aria-label="İçerik türü" className="grid grid-cols-3 gap-1 rounded-lg bg-stone-100 p-1">
      {([['metin', 'Metin'], ['foto', 'Fotoğraf'], ['logo', 'Logo']] as const).map(([k, ad]) => (
        <button key={k} role="radio" aria-checked={tur === k} onClick={() => icerik(alan.id, { mod: k })}
          className={`rounded-md px-2 py-1.5 text-sm ${tur === k ? 'bg-white font-semibold shadow' : 'text-stone-600 hover:bg-stone-200'}`}>{ad}</button>))}
    </div>

    {tur === 'logo' ? <LogoBolumu alan={alan} c={c} icerik={icerik} dpi={dpi} dd={dd} /> : foto ? (<>
      <label className="block rounded-lg border-2 border-dashed border-stone-300 p-3 text-center text-sm hover:border-blue-500">
        <span className="font-medium">{c.foto ? 'Görseli değiştir' : 'Fotoğraf seç'}</span>
        <input type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          try { icerik(alan.id, { ...(await dosyaOku(f)), olcek: 1, konum: { x: 0.5, y: 0.5 } }); setHata(''); } catch (x) { setHata((x as Error).message); }
        }} /></label>
      {hata && <p className="text-sm text-red-700">{hata}</p>}
      {c.foto && (<>
        <label className="block text-sm">Yerleşim<select className={girdi} value={fotoMod(alan, c)} onChange={(e) => icerik(alan.id, { sigdir: e.target.value as 'kapla' | 'sigdir' })}><option value="kapla">Alanı doldur (kırp)</option><option value="sigdir">Tamamını göster (oranı koru)</option></select></label>
        {fotoMod(alan, c) === 'kapla' && <>
          <label className="block text-sm">Büyütme: {(c.olcek ?? 1).toFixed(2)}×<input type="range" min={1} max={4} step={0.05} className="w-full" value={c.olcek ?? 1} onChange={(e) => icerik(alan.id, { olcek: +e.target.value })} /></label>
          <p className="text-xs text-stone-600">Konumu ayarlamak için fotoğrafı sayfada sürükleyin. Oran bozulmaz.</p>
          <button className={btn} onClick={() => icerik(alan.id, { olcek: 1, konum: { x: 0.5, y: 0.5 } })}>Konumu sıfırla</button></>}
        <button className={`${btn} ml-2`} onClick={() => icerik(alan.id, { foto: undefined, fotoBoyut: undefined })}>Görseli kaldır</button>
        {c.fotoBoyut && <p className="text-xs">Görsel {c.fotoBoyut.w}×{c.fotoBoyut.h} px{dpi != null && ` · alanda ${Math.round(dpi)} dpi`}</p>}
        {dd === 'yetersiz' && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">Çözünürlük baskı için yetersiz. Daha büyük bir görsel seçin.</p>}
        {dd === 'zayif' && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">Çözünürlük sınırda; baskıda hafif bulanık olabilir.</p>}
      </>)}
    </>) : (<>
      <div className="flex items-center justify-between"><label htmlFor="metin-kutusu" className="text-sm font-medium">Metin</label>
        <button className={btn} onClick={() => setDepoAcik(true)}>Depodan al</button></div>
      {depoAcik && <DepodanMetin kapat={() => setDepoAcik(false)} aktar={(m, mod) => icerik(alan.id, { metin: mod === 'ekle' && c.metin ? c.metin.trimEnd() + '\n' + m : m })} />}
      <textarea id="metin-kutusu" ref={ta} className="h-44 w-full rounded border border-stone-300 p-2 text-sm" value={c.metin ?? ''} onChange={(e) => icerik(alan.id, { metin: e.target.value })} placeholder="Metni buraya yazın…" />
      {d && !d.sigiyor && (<div role="alert" className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">
        <p className="text-sm font-medium">{d.tasanKelime ? `"${d.tasanKelime}" kelimesi sütuna sığmıyor. ` : ''}{SIGMAMA_UYARISI}</p>
        <p className="text-xs">Gereken yükseklik {d.gerekenYukseklik.toFixed(0)} mm, alan {alan.rect.h.toFixed(0)} mm. Yazı küçültülmedi, metin silinmedi.</p>
        {oneriler.length > 0 && <ul className="list-disc pl-4 text-xs">{oneriler.map((o, i) => <li key={i}>{o}</li>)}</ul>}
      </div>)}
      {d?.sigiyor && <p className="text-xs text-green-800">✓ Metin alana sığıyor ({d.satirSayisi} satır).</p>}
      <Bolum baslik="Yazı biçimi" acik>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label>Karakter<select className={girdi} value={st.aile} onChange={(e) => stilYaz({ aile: e.target.value as YaziStili['aile'] })}><option value="Sans">Sans</option><option value="Serif">Serif</option></select></label>
          <label>Punto<input type="number" min={6} max={72} step={0.5} className={girdi} value={st.punto} onChange={(e) => stilYaz({ punto: +e.target.value })} /></label>
          <label>Satır aralığı<input type="number" min={0.9} max={2.5} step={0.05} className={girdi} value={st.satirAraligi} onChange={(e) => stilYaz({ satirAraligi: +e.target.value })} /></label>
          <label>Hizalama<select className={girdi} value={st.hiza} onChange={(e) => stilYaz({ hiza: e.target.value as YaziStili['hiza'] })}><option value="sol">Sola</option><option value="orta">Ortaya</option><option value="sag">Sağa</option><option value="iki">İki yana</option></select></label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!st.kalin} onChange={(e) => stilYaz({ kalin: e.target.checked })} />Kalın</label>
        <label className="flex items-center justify-between text-sm">Yazı rengi<input type="color" value={c.yaziRenk ?? '#1a1a1a'} onChange={(e) => icerik(alan.id, { yaziRenk: e.target.value })} /></label>
        <label className="block text-sm">İç boşluk: {(c.bosluk ?? 0).toFixed(1)} mm<input type="range" min={0} max={10} step={0.5} className="w-full" value={c.bosluk ?? 0} onChange={(e) => icerik(alan.id, { bosluk: +e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.yaziGolge} onChange={(e) => icerik(alan.id, { yaziGolge: e.target.checked ? VARSAYILAN_YAZI_GOLGE : undefined })} />Yazı gölgesi</label>
        {c.yaziGolge && <div className="grid grid-cols-2 gap-2 text-xs">
          <label>Renk<input type="color" className="w-full" value={c.yaziGolge.renk} onChange={(e) => icerik(alan.id, { yaziGolge: { ...c.yaziGolge!, renk: e.target.value } })} /></label>
          <label>Saydamlık<input type="range" min={0.1} max={1} step={0.05} className="w-full" value={c.yaziGolge.opaklik} onChange={(e) => icerik(alan.id, { yaziGolge: { ...c.yaziGolge!, opaklik: +e.target.value } })} /></label>
          <label>Yatay (mm)<input type="number" step={0.1} className={girdi} value={c.yaziGolge.dx} onChange={(e) => icerik(alan.id, { yaziGolge: { ...c.yaziGolge!, dx: +e.target.value } })} /></label>
          <label>Dikey (mm)<input type="number" step={0.1} className={girdi} value={c.yaziGolge.dy} onChange={(e) => icerik(alan.id, { yaziGolge: { ...c.yaziGolge!, dy: +e.target.value } })} /></label></div>}
      </Bolum>
    </>)}

    <Bolum baslik="Kutu görünümü (zemin, çerçeve, gölge)">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.zemin} onChange={(e) => icerik(alan.id, { zemin: e.target.checked ? { renk: renkler[0] ?? '#ffffff', opaklik: 1 } : undefined })} />Zemin rengi</label>
      {c.zemin && <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2"><input type="color" aria-label="Zemin rengi" value={c.zemin.renk} onChange={(e) => icerik(alan.id, { zemin: { ...c.zemin!, renk: e.target.value } })} />
          {renkler.map((r) => <button key={r} title={r} aria-label={`Renk ${r}`} className="h-6 w-6 rounded border" style={{ background: r }} onClick={() => icerik(alan.id, { zemin: { ...c.zemin!, renk: r } })} />)}</div>
        <label className="block text-xs">Saydamlık: {Math.round(c.zemin.opaklik * 100)}%<input type="range" min={0.05} max={1} step={0.05} className="w-full" value={c.zemin.opaklik} onChange={(e) => icerik(alan.id, { zemin: { ...c.zemin!, opaklik: +e.target.value } })} /></label></div>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.kenar} onChange={(e) => icerik(alan.id, { kenar: e.target.checked ? { renk: '#b3261e', kalinlik: 0.4 } : undefined })} />Çerçeve</label>
      {c.kenar && <div className="grid grid-cols-2 gap-2 text-xs">
        <label>Renk<input type="color" className="w-full" value={c.kenar.renk} onChange={(e) => icerik(alan.id, { kenar: { ...c.kenar!, renk: e.target.value } })} /></label>
        <label>Kalınlık (mm)<input type="number" min={0.1} max={5} step={0.1} className={girdi} value={c.kenar.kalinlik} onChange={(e) => icerik(alan.id, { kenar: { ...c.kenar!, kalinlik: +e.target.value } })} /></label></div>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.golge} onChange={(e) => icerik(alan.id, { golge: e.target.checked ? VARSAYILAN_GOLGE : undefined })} />Gölgelendirme</label>
      {c.golge && <div className="grid grid-cols-2 gap-2 text-xs">
        <label>Renk<input type="color" className="w-full" value={c.golge.renk} onChange={(e) => gy({ renk: e.target.value })} /></label>
        <label>Saydamlık<input type="range" min={0.05} max={1} step={0.05} className="w-full" value={c.golge.opaklik} onChange={(e) => gy({ opaklik: +e.target.value })} /></label>
        <label>Yatay (mm)<input type="number" step={0.2} className={girdi} value={c.golge.dx} onChange={(e) => gy({ dx: +e.target.value })} /></label>
        <label>Dikey (mm)<input type="number" step={0.2} className={girdi} value={c.golge.dy} onChange={(e) => gy({ dy: +e.target.value })} /></label>
        <label className="col-span-2">Yumuşaklık: {c.golge.bulanik} mm<input type="range" min={0} max={8} step={0.5} className="w-full" value={c.golge.bulanik} onChange={(e) => gy({ bulanik: +e.target.value })} /></label></div>}
      <button className="text-xs underline" onClick={() => icerik(alan.id, { zemin: undefined, kenar: undefined, golge: undefined, yaziGolge: undefined, yaziRenk: undefined, bosluk: undefined })}>Görünümü sıfırla</button>
    </Bolum>

    {yonetici && <Bolum baslik="Yönetici: alan ölçüsü (mm)">
      <div className="grid grid-cols-4 gap-1">{(['x', 'y', 'w', 'h'] as const).map((k) => (
        <label key={k} className="text-xs">{k}<input type="number" step={0.5} className={girdi} value={+alan.rect[k].toFixed(2)} onChange={(e) => kutu({ ...alan.rect, [k]: +e.target.value })} /></label>))}</div>
      <p className="text-xs text-stone-600">Değişirse şablon mührü bozulur; yeniden onaylanana kadar baskı kontrolü hata verir.</p></Bolum>}
  </div>);
}

const HIZALAR: [number, number, string][] = [[0, 0, '↖'], [0.5, 0, '↑'], [1, 0, '↗'], [0, 0.5, '←'], [0.5, 0.5, '•'], [1, 0.5, '→'], [0, 1, '↙'], [0.5, 1, '↓'], [1, 1, '↘']];

/** Logo alanı: otomatik kırp/boyutlandır, beyaz zemini saydam yap, iç boşluk ve hizalama. Oran her zaman korunur. */
function LogoBolumu({ alan, c, icerik, dpi, dd }: { alan: Slot; c: SlotContent; icerik: IcerikFn; dpi: number | null; dd: ReturnType<typeof dpiDurumu> }) {
  const lg = { ...VARSAYILAN_LOGO, hx: 0.5, hy: 0.5, ...c.logo };
  const [hata, setHata] = useState('');
  const [mesgul, setMesgul] = useState(false);

  async function yukle(f: File) {
    setMesgul(true); setHata('');
    try {
      const ham = await logoHamOlustur(f);
      const r = await logoIsle(ham, { kirp: true, beyazSaydam: false });
      icerik(alan.id, { mod: 'logo', foto: r.foto, fotoBoyut: r.boyut, fotoHam: ham, sigdir: 'sigdir', olcek: 1, konum: { x: 0.5, y: 0.5 }, bosluk: c.bosluk ?? 1, logo: { kirp: true, beyazSaydam: false, hx: 0.5, hy: 0.5 } });
    } catch (e) { setHata((e as Error).message); }
    setMesgul(false);
  }
  async function ayarla(d: Partial<typeof lg>) {
    const yeni = { ...lg, ...d };
    if (c.fotoHam && ('kirp' in d || 'beyazSaydam' in d)) {
      setMesgul(true);
      try { const r = await logoIsle(c.fotoHam, { kirp: yeni.kirp, beyazSaydam: yeni.beyazSaydam }); icerik(alan.id, { foto: r.foto, fotoBoyut: r.boyut, logo: yeni }); }
      catch (e) { setHata((e as Error).message); }
      setMesgul(false);
    } else icerik(alan.id, { logo: yeni });
  }
  async function otomatik() {
    setMesgul(true); setHata('');
    try {
      const sec = { kirp: true, beyazSaydam: lg.beyazSaydam };
      const r = c.fotoHam ? await logoIsle(c.fotoHam, sec) : null;
      icerik(alan.id, { ...(r ? { foto: r.foto, fotoBoyut: r.boyut } : {}), sigdir: 'sigdir', olcek: 1, konum: { x: 0.5, y: 0.5 }, bosluk: 1, logo: { ...sec, hx: 0.5, hy: 0.5 } });
    } catch (e) { setHata((e as Error).message); }
    setMesgul(false);
  }

  return (<div className="space-y-3">
    <label className="block rounded-lg border-2 border-dashed border-stone-300 p-3 text-center text-sm hover:border-blue-500">
      <span className="font-medium">{c.foto ? 'Logoyu değiştir' : 'Logo seç'}</span><span className="block text-xs text-stone-600">PNG, JPEG, WebP veya SVG</span>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="mt-1 block w-full text-xs" disabled={mesgul}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void yukle(f); e.target.value = ''; }} /></label>
    {mesgul && <p className="text-xs text-stone-600" role="status">İşleniyor…</p>}
    {hata && <p className="text-sm text-red-700" role="alert">{hata}</p>}
    {c.foto && (<>
      <div className="flex items-center justify-center rounded border p-2" style={{ background: 'repeating-conic-gradient(#e7e5e4 0% 25%, #fff 0% 50%) 50% / 12px 12px', height: 72 }}>
        <img src={c.foto} alt="Logo önizleme" className="max-h-full max-w-full object-contain" /></div>
      <button className={`${btnAna} w-full`} disabled={mesgul} onClick={otomatik}>Otomatik boyutlandır</button>
      <p className="text-xs text-stone-600">Boş kenarları kırpar, alana oranı bozmadan sığdırır, ortalar.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lg.kirp} disabled={mesgul || !c.fotoHam} onChange={(e) => void ayarla({ kirp: e.target.checked })} />Boş kenarları kırp</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lg.beyazSaydam} disabled={mesgul || !c.fotoHam} onChange={(e) => void ayarla({ beyazSaydam: e.target.checked })} />Beyaz zemini saydam yap</label>
      <label className="block text-sm">Alan boşluğu: {(c.bosluk ?? 0).toFixed(1)} mm<input type="range" min={0} max={8} step={0.5} className="w-full" value={c.bosluk ?? 0} onChange={(e) => icerik(alan.id, { bosluk: +e.target.value })} /></label>
      <div className="text-sm">Hizalama
        <div role="group" aria-label="Logo hizalama" className="mt-1 grid w-28 grid-cols-3 gap-1">{HIZALAR.map(([x, y, simge]) => (
          <button key={`${x}${y}`} aria-label={`Hizala ${simge}`} aria-pressed={lg.hx === x && lg.hy === y} onClick={() => void ayarla({ hx: x, hy: y })}
            className={`h-8 rounded border text-sm ${lg.hx === x && lg.hy === y ? 'border-blue-600 bg-blue-50 font-bold' : 'bg-white hover:bg-stone-50'}`}>{simge}</button>))}</div></div>
      <label className="block text-sm">Yerleşim<select className={girdi} value={fotoMod(alan, c)} onChange={(e) => icerik(alan.id, { sigdir: e.target.value as 'kapla' | 'sigdir' })}><option value="sigdir">Tamamını göster (oranı koru)</option><option value="kapla">Alanı doldur (kırp)</option></select></label>
      <button className={btn} onClick={() => icerik(alan.id, { foto: undefined, fotoBoyut: undefined, fotoHam: undefined, logo: undefined })}>Logoyu kaldır</button>
      {c.fotoBoyut && <p className="text-xs">Logo {c.fotoBoyut.w}×{c.fotoBoyut.h} px (oran {(c.fotoBoyut.w / c.fotoBoyut.h).toFixed(2)}:1){dpi != null && ` · alanda ${Math.round(dpi)} dpi`}</p>}
      {dd === 'yetersiz' && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">Logo çözünürlüğü baskı için yetersiz. Daha büyük bir dosya yükleyin.</p>}
      {dd === 'zayif' && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">Logo çözünürlüğü sınırda.</p>}
    </>)}
  </div>);
}
