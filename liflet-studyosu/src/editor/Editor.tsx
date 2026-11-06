import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { baslat, geriAl, uygula, uygulaBirlestir, yinele, type Gecmis } from '../model/history';
import { alanKutusuDegistir, icerikDegistir, KilitHatasi, sablonOnayla } from '../model/lock';
import { kimlikleriListele, projeKaydet } from '../storage/db';
import { kimligiUygula, type Kimlik } from '../model/kimlik';
import type { Project, SlotContent } from '../model/types';
import type { Olcer } from './duzen';
import { FONT_CSS } from './fonts';
import { baskiOncesiKontrol } from './kontrol';
import { etkinTur } from './gorunum';
import { logoIsle } from './logoIsle';
import { olcerAl } from './olcerOnbellek';
import { pdfUret } from './pdfDisa';
import { alanDolu, AlanPaneli, Adimlar, btn, btnAna } from './Panel';
import { MM_PX, Sayfa } from './SayfaCiz';

function indir(veri: BlobPart | Uint8Array, ad: string, tip: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([veri as BlobPart], { type: tip }));
  a.download = ad; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Editor({ proje, yonetici, kapat }: { proje: Project; yonetici: boolean; kapat: () => void }) {
  const [g, setG] = useState<Gecmis<Project>>(() => baslat(proje));
  const p = g.simdi;
  const [secili, setSecili] = useState<string | null>(null);
  const [zoom, setZoomDeger] = useState(0.55);
  const [otoSigdir, setOtoSigdir] = useState(true);
  const [gorunum, setGorunum] = useState<'cift' | 0 | 1>(() => (typeof innerWidth !== 'undefined' && innerWidth < 700 ? 0 : 'cift'));
  const [olc, setOlc] = useState<Olcer | null>(null);
  const [bildirim, setBildirim] = useState<{ tur: 'hata' | 'ok'; m: string } | null>(null);
  const [kaydedildi, setKaydedildi] = useState(true);
  const [kimlikler, setKimlikler] = useState<Kimlik[]>([]);
  const [disariMenu, setDisariMenu] = useState(false);
  const alan = useRef<HTMLDivElement>(null);

  useEffect(() => { olcerAl().then((o) => setOlc(() => o)).catch((e) => setBildirim({ tur: 'hata', m: 'Yazı tipleri yüklenemedi: ' + e })); }, []);
  useEffect(() => { kimlikleriListele().then(setKimlikler); }, []);
  useEffect(() => { if (!bildirim) return; const t = setTimeout(() => setBildirim(null), 6000); return () => clearTimeout(t); }, [bildirim]);

  // Otomatik kaydetme (0,5 sn gecikmeli) ve çıkarken bekleyen değişikliği yazma
  const son = useRef(p); son.current = p;
  const kirli = useRef(false);
  const ilk = useRef(true);
  useEffect(() => {
    if (ilk.current) { ilk.current = false; return; }
    kirli.current = true; setKaydedildi(false);
    const t = setTimeout(() => projeKaydet(p).then(() => { kirli.current = false; setKaydedildi(true); }).catch((e) => setBildirim({ tur: 'hata', m: 'Kaydedilemedi: ' + e })), 500);
    return () => clearTimeout(t);
  }, [p]);
  useEffect(() => () => { if (kirli.current) void projeKaydet(son.current); }, []);

  const degistir = useCallback((f: (p: Project) => Project, anahtar?: string) => {
    try {
      setG((o) => { const y = f(o.simdi); return anahtar ? uygulaBirlestir(o, y, anahtar, Date.now()) : uygula(o, y); });
    } catch (e) { setBildirim({ tur: 'hata', m: e instanceof KilitHatasi ? e.message : String(e) }); }
  }, []);
  const icerik = (id: string, d: Partial<SlotContent>) => degistir((q) => icerikDegistir(q, id, d), `${id}:${Object.keys(d).join(',')}`);

  const bulgular = useMemo(() => (olc ? baskiOncesiKontrol(p, olc) : []), [p, olc]);
  const hataSayisi = bulgular.filter((b) => b.duzey === 'hata').length;
  const secAlan = p.sablon.alanlar.find((a) => a.id === secili) ?? null;
  const sayfalar = gorunum === 'cift' ? Array.from({ length: p.sablon.sayfa.sayi }, (_, i) => i) : [gorunum];

  // Sığdır: iki sayfa yan yana kullanılabilir genişliğe oturur
  const sigdir = useCallback(() => {
    const el = alan.current; if (!el) return;
    const W = p.sablon.sayfa.genislik * MM_PX; const n = sayfalar.length;
    const z = (el.clientWidth - 56 - 24 * (n - 1)) / (W * n);
    setZoomDeger(Math.min(2, Math.max(0.2, +z.toFixed(2))));
  }, [p.sablon.sayfa.genislik, sayfalar.length]);
  useEffect(() => {
    if (!otoSigdir) return;
    sigdir();
    const ro = new ResizeObserver(sigdir); if (alan.current) ro.observe(alan.current);
    return () => ro.disconnect();
  }, [otoSigdir, sigdir]);
  const setZoom = (f: (z: number) => number) => { setOtoSigdir(false); setZoomDeger((z) => Math.min(2, Math.max(0.2, +f(z).toFixed(2)))); };

  const siradakiBos = () => {
    const alanlar = p.sablon.alanlar;
    const bas = Math.max(0, alanlar.findIndex((a) => a.id === secili) + 1);
    const sirali = [...alanlar.slice(bas), ...alanlar.slice(0, bas)];
    const a = sirali.find((x) => !alanDolu(x, p.icerik[x.id]));
    if (a) { setSecili(a.id); if (gorunum !== 'cift') setGorunum(a.sayfa as 0 | 1); }
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement; const yaziyor = ['TEXTAREA', 'INPUT', 'SELECT'].includes(t.tagName);
      if (e.key === 'Escape' && !yaziyor) setSecili(null);
      if (!(e.ctrlKey || e.metaKey) || yaziyor) return;
      if (e.key === 'z') { e.preventDefault(); setG((o) => (e.shiftKey ? yinele(o) : geriAl(o))); }
      if (e.key === 'y') { e.preventDefault(); setG(yinele); }
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, []);

  async function pdfIndir(tur: 'baski' | 'ekran') {
    setDisariMenu(false);
    if (!olc) return;
    const hatalar = bulgular.filter((b) => b.duzey === 'hata');
    if (hatalar.length && !confirm(`${hatalar.length} hata var:\n- ${hatalar.slice(0, 5).map((h) => h.mesaj).join('\n- ')}\n\nYine de dışa aktarılsın mı?`)) return;
    try { indir(await pdfUret(p, olc, { tur, tasmaMm: 3 }), `${p.ad}${tur === 'baski' ? '-baski' : ''}.pdf`, 'application/pdf'); setBildirim({ tur: 'ok', m: 'PDF indirildi.' }); }
    catch (e) { setBildirim({ tur: 'hata', m: 'PDF üretilemedi: ' + String(e) }); }
  }
  async function logolariOtomatik() {
    const hedefler = p.sablon.alanlar.filter((a) => etkinTur(a, p.icerik[a.id]) === 'logo' && p.icerik[a.id]?.foto);
    try {
      const sonuc = await Promise.all(hedefler.map(async (a) => {
        const c = p.icerik[a.id]!; const sec = { kirp: true, beyazSaydam: c.logo?.beyazSaydam ?? false };
        const r = c.fotoHam ? await logoIsle(c.fotoHam, sec) : null;
        return { id: a.id, sec, r };
      }));
      degistir((q) => sonuc.reduce((acc, { id, sec, r }) => icerikDegistir(acc, id, { ...(r ? { foto: r.foto, fotoBoyut: r.boyut } : {}), sigdir: 'sigdir', olcek: 1, konum: { x: 0.5, y: 0.5 }, bosluk: 1, logo: { ...sec, hx: 0.5, hy: 0.5 } }), q));
      setBildirim({ tur: 'ok', m: `${sonuc.length} logo otomatik boyutlandırıldı.` });
    } catch (e) { setBildirim({ tur: 'hata', m: 'Logolar işlenemedi: ' + String(e) }); }
  }
  async function cik() { if (kirli.current) { await projeKaydet(son.current); kirli.current = false; } kapat(); }

  return (
    <div className="flex h-screen flex-col bg-stone-100 text-stone-900">
      <style>{FONT_CSS}{`.alan-grubu:hover .alan-kutu{stroke:#1565c0;stroke-opacity:1}`}</style>
      <header className="flex flex-wrap items-center gap-2 border-b bg-white px-3 py-2">
        <button className={btn} onClick={cik}>← Çık</button>
        <div className="min-w-0"><div className="truncate font-semibold">{p.ad}</div>
          <div className="text-xs text-stone-600">{kaydedildi ? '✓ Kaydedildi' : 'Kaydediliyor…'}{p.sablon.deneme && <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-amber-950">DENEME ŞABLONU</span>}</div></div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button className={btn} onClick={() => setSecili(null)} title="Kontrol listesini göster"
            aria-label={`Kontrol: ${hataSayisi} hata`}>{hataSayisi ? <span className="text-red-700">✖ {hataSayisi} hata</span> : <span className="text-green-700">✓ Hata yok</span>}</button>
          <button className={btn} disabled={!g.gecmis.length} onClick={() => setG(geriAl)} title="Geri al (Ctrl+Z)">↶ Geri al</button>
          <button className={btn} disabled={!g.gelecek.length} onClick={() => setG(yinele)} title="Yinele (Ctrl+Y)">↷ Yinele</button>
          <div className="relative">
            <button className={btnAna} disabled={!olc} aria-haspopup="menu" aria-expanded={disariMenu} onClick={() => setDisariMenu((a) => !a)}>{olc ? 'PDF ve dışa aktar ▾' : 'Yazı tipleri yükleniyor…'}</button>
            {disariMenu && (<div role="menu" className="absolute right-0 z-30 mt-1 w-72 rounded-lg border bg-white p-1 shadow-lg">
              <button role="menuitem" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-stone-100" onClick={() => pdfIndir('baski')}><b>Baskıya hazır PDF</b><br /><span className="text-xs text-stone-600">3 mm taşma payı, kesim işaretleri için kutu bilgisiyle</span></button>
              <button role="menuitem" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-stone-100" onClick={() => pdfIndir('ekran')}><b>Ekran için PDF</b><br /><span className="text-xs text-stone-600">Taşma payı yok, e-posta ve ekran için</span></button>
              <button role="menuitem" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-stone-100" onClick={() => { setDisariMenu(false); indir(JSON.stringify({ tur: 'liflet-projesi', surum: 1, proje: p }, null, 2), `${p.ad}.liflet.json`, 'application/json'); }}><b>Düzenlenebilir proje dosyası</b><br /><span className="text-xs text-stone-600">Yedek; sonra Kayıtlı Lifletler'den yüklenir</span></button>
            </div>)}
          </div>
        </div>
      </header>
      {bildirim && <div role="status" className={`px-4 py-2 text-sm ${bildirim.tur === 'hata' ? 'bg-red-100 text-red-900' : 'bg-green-100 text-green-900'}`}>{bildirim.m} <button className="ml-2 underline" onClick={() => setBildirim(null)}>Tamam</button></div>}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div ref={alan} className="min-h-0 min-w-0 flex-1 overflow-auto p-4" onPointerDown={(e) => { if (e.target === e.currentTarget) setSecili(null); }}>
          <div className="flex flex-wrap gap-6">
            {sayfalar.map((s) => (<Sayfa key={s} no={s} p={p} olc={olc} zoom={zoom} secili={secili} sec={setSecili} bulgular={bulgular}
              konumDegistir={(id, konum) => icerik(id, { konum })} />))}
          </div>
        </div>
        <aside aria-label="Özellikler" className="max-h-[45vh] w-full shrink-0 overflow-auto border-t bg-white p-4 text-sm lg:max-h-none lg:w-96 lg:border-l lg:border-t-0">
          {secAlan ? <AlanPaneli key={secAlan.id} alan={secAlan} p={p} olc={olc} icerik={icerik} yonetici={yonetici} kapat={() => setSecili(null)}
            kutu={(r) => degistir((q) => alanKutusuDegistir(q, secAlan.id, r, { yonetici }))} />
            : <Adimlar p={p} bulgular={bulgular} yonetici={yonetici} sec={setSecili} kimlikler={kimlikler} siradaki={siradakiBos} logolariOtomatik={logolariOtomatik}
              kimlikUygula={(k) => degistir((q) => kimligiUygula(q, k))} onayla={() => degistir((q) => ({ ...q, sablon: sablonOnayla(q.sablon, { yonetici }) }))} />}
        </aside>
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t bg-white px-3 py-2 text-sm">
        <button className={btn} onClick={() => setZoom((z) => z - 0.1)} aria-label="Uzaklaştır">−</button>
        <span className="w-12 text-center" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button className={btn} onClick={() => setZoom((z) => z + 0.1)} aria-label="Yakınlaştır">+</button>
        <button className={`${btn} ${otoSigdir ? '!bg-stone-200' : ''}`} onClick={() => setOtoSigdir(true)}>Sığdır</button>
        <span className="ml-3 text-stone-600">Sayfa:</span>
        {(['cift', ...Array.from({ length: p.sablon.sayfa.sayi }, (_, i) => i)] as const).map((v) => (
          <button key={String(v)} className={`${btn} ${gorunum === v ? '!bg-stone-200' : ''}`} onClick={() => setGorunum(v as 'cift' | 0 | 1)}>{v === 'cift' ? 'İkisi' : Number(v) + 1}</button>))}
        <span className="ml-auto hidden text-stone-600 md:inline">Alana tıklayın · Esc seçimi kapatır · Ctrl+Z geri al · Ctrl+Y yinele</span>
      </footer>
    </div>
  );
}
