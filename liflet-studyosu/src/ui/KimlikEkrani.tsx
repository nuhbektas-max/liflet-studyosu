import { useCallback, useEffect, useState } from 'react';
import { HEX, iletisimMetni, kimlikHatalari, yeniKimlik, type Kimlik, type Logo } from '../model/kimlik';
import { kimlikKaydet, kimlikleriListele, kimlikSil } from '../storage/db';
import { logoHamOlustur, logoIsle } from '../editor/logoIsle';
import YoneticiGirisi from './YoneticiGirisi';

const dugme = 'rounded-lg px-4 py-2 font-medium bg-red-700 text-white hover:bg-red-800 disabled:opacity-40';
const ikincil = 'rounded-lg px-3 py-1.5 text-sm font-medium border border-stone-300 bg-white hover:bg-stone-50 disabled:opacity-40';
const girdi = 'mt-1 w-full rounded border p-2 disabled:bg-stone-100';
const IZINLI = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export default function KimlikEkrani({ yonetici, setYonetici }: { yonetici: boolean; setYonetici: (v: boolean) => void }) {
  const [liste, setListe] = useState<Kimlik[]>([]);
  const [k, setK] = useState<Kimlik | null>(null);
  const [mesaj, setMesaj] = useState<{ tur: 'ok' | 'hata'; m: string } | null>(null);

  const yukle = useCallback(() => { kimlikleriListele().then(setListe); }, []);
  useEffect(yukle, [yukle]);

  const alan = (ad: keyof Kimlik, deger: string) => setK((o) => (o ? { ...o, [ad]: deger } : o));

  async function logoYukle(anahtar: 'bakanlikLogo' | 'valilikLogo' | 'mudurlukLogo', f?: File) {
    if (!f) return;
    if (!IZINLI.includes(f.type) && !/\.svg$/i.test(f.name)) return setMesaj({ tur: 'hata', m: 'Logo PNG, JPEG, WebP veya SVG olmalı.' });
    try {
      const ham = await logoHamOlustur(f);
      const r = await logoIsle(ham, { kirp: true, beyazSaydam: false });
      const logo: Logo = { foto: r.foto, boyut: r.boyut, dosyaAdi: f.name, ham, kirp: true, beyazSaydam: false };
      setK((o) => (o ? { ...o, [anahtar]: logo } : o));
      setMesaj(r.boyut.w < 300 ? { tur: 'hata', m: `Logo küçük (${r.boyut.w}×${r.boyut.h} px); baskıda bulanık çıkabilir.` } : null);
    } catch (e) { setMesaj({ tur: 'hata', m: (e as Error).message }); }
  }
  async function logoSecenek(anahtar: 'bakanlikLogo' | 'valilikLogo' | 'mudurlukLogo', d: { kirp?: boolean; beyazSaydam?: boolean }) {
    const l = k?.[anahtar]; if (!l?.ham) return;
    const yeni = { kirp: l.kirp ?? true, beyazSaydam: l.beyazSaydam ?? false, ...d };
    try {
      const r = await logoIsle(l.ham, yeni);
      setK((o) => (o ? { ...o, [anahtar]: { ...l, ...yeni, foto: r.foto, boyut: r.boyut } } : o));
    } catch (e) { setMesaj({ tur: 'hata', m: (e as Error).message }); }
  }

  async function kaydet() {
    if (!k) return;
    const h = kimlikHatalari(k);
    if (h.length) return setMesaj({ tur: 'hata', m: h.join(' ') });
    await kimlikKaydet({ ...k, guncelleme: Date.now() });
    yukle(); setMesaj({ tur: 'ok', m: 'Profil kaydedildi. Yeni lifletlerde seçebilirsiniz.' });
  }
  async function sil() {
    if (!k || !confirm(`"${k.ad}" profili silinsin mi? Bu profille hazırlanmış lifletler etkilenmez.`)) return;
    await kimlikSil(k.id); setK(null); yukle();
  }
  function disaAktar() {
    if (!k) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ tur: 'liflet-kimlik', surum: 1, kimlik: k }, null, 2)], { type: 'application/json' }));
    a.download = `${k.ad || 'kimlik'}.kimlik.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function iceAktar(f?: File) {
    if (!f) return;
    try {
      const o = JSON.parse(await f.text());
      if (o?.tur !== 'liflet-kimlik' || !o.kimlik?.ad) throw new Error('Geçerli bir kimlik dosyası değil.');
      const yeni: Kimlik = { ...o.kimlik, id: crypto.randomUUID() };
      await kimlikKaydet(yeni); yukle(); setK(yeni); setMesaj({ tur: 'ok', m: 'Profil içe aktarıldı.' });
    } catch (e) { setMesaj({ tur: 'hata', m: (e as Error).message }); }
  }

  const duzenleyebilir = yonetici && !!k;
  const LOGOLAR = [['bakanlikLogo', 'Bakanlık logosu'], ['valilikLogo', 'Valilik logosu'], ['mudurlukLogo', 'İl Müdürlüğü logosu']] as const;

  return (<>
    <h2 className="mb-4 text-2xl font-bold">Kurumsal Kimlik Yönetimi</h2>
    {!yonetici && <div className="mb-4"><p className="mb-2 text-sm text-stone-700">Kurumsal bilgileri yalnızca yönetici değiştirebilir. Profilleri görebilir, yeni lifletlerde seçebilirsiniz.</p><YoneticiGirisi yonetici={yonetici} setYonetici={setYonetici} /></div>}
    <div className="flex flex-wrap gap-6">
      <div className="w-64 shrink-0">
        <h3 className="mb-2 font-semibold">İl profilleri</h3>
        <ul className="mb-3 space-y-1">{liste.map((x) => (
          <li key={x.id}><button className={`w-full rounded border px-3 py-2 text-left ${k?.id === x.id ? 'border-red-700 bg-red-50' : 'bg-white'}`} onClick={() => { setK(x); setMesaj(null); }}>{x.ad}</button></li>))}
          {liste.length === 0 && <li className="text-sm text-stone-600">Henüz profil yok.</li>}</ul>
        <button className={ikincil} disabled={!yonetici} onClick={() => { setK(yeniKimlik()); setMesaj(null); }}>+ Yeni profil</button>
        <label className={`${ikincil} ml-2 inline-block ${yonetici ? 'cursor-pointer' : 'opacity-40'}`}>İçe aktar
          <input type="file" accept=".json" hidden disabled={!yonetici} onChange={(e) => iceAktar(e.target.files?.[0])} /></label>
      </div>
      {k ? (
        <div className="min-w-[320px] max-w-2xl flex-1 space-y-4 rounded-lg border bg-white p-4">
          <label className="block">Profil adı (il)<input className={girdi} disabled={!duzenleyebilir} value={k.ad} onChange={(e) => alan('ad', e.target.value)} placeholder="ör. Ankara" /></label>
          <label className="block">İl Müdürlüğü adı<input className={girdi} disabled={!duzenleyebilir} value={k.mudurlukAdi} onChange={(e) => alan('mudurlukAdi', e.target.value)} placeholder="ör. Ankara İl Tarım ve Orman Müdürlüğü" /></label>
          <label className="block">Adres<textarea className={girdi} rows={2} disabled={!duzenleyebilir} value={k.adres} onChange={(e) => alan('adres', e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label>Telefon<input className={girdi} disabled={!duzenleyebilir} value={k.telefon} onChange={(e) => alan('telefon', e.target.value)} /></label>
            <label>E-posta<input className={girdi} disabled={!duzenleyebilir} value={k.eposta} onChange={(e) => alan('eposta', e.target.value)} /></label>
            <label className="col-span-2">İnternet sitesi<input className={girdi} disabled={!duzenleyebilir} value={k.web} onChange={(e) => alan('web', e.target.value)} /></label>
          </div>
          <div className="grid grid-cols-3 gap-3">{LOGOLAR.map(([a, ad]) => (
            <div key={a} className="text-sm">
              <div className="mb-1">{ad}</div>
              <div className="flex h-20 items-center justify-center rounded border" style={{ background: 'repeating-conic-gradient(#e7e5e4 0% 25%, #fff 0% 50%) 50% / 12px 12px' }}>
                {k[a] ? <img src={k[a]!.foto} alt={ad} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-stone-400">Yok</span>}</div>
              {k[a] && <div className="mt-1 text-xs text-stone-500">{k[a]!.boyut.w}×{k[a]!.boyut.h} px · oran korunur</div>}
              {k[a]?.ham && duzenleyebilir && <div className="mt-1 space-y-0.5 text-xs">
                <label className="flex items-center gap-1"><input type="checkbox" checked={k[a]!.kirp ?? true} onChange={(e) => void logoSecenek(a, { kirp: e.target.checked })} />Boş kenarları kırp</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={k[a]!.beyazSaydam ?? false} onChange={(e) => void logoSecenek(a, { beyazSaydam: e.target.checked })} />Beyaz zemini saydam yap</label></div>}
              {duzenleyebilir && <div className="mt-1 space-y-1">
                <input type="file" aria-label={`${ad} yükle`} accept={IZINLI.join(',')} className="block w-full text-xs" onChange={(e) => logoYukle(a, e.target.files?.[0])} />
                {k[a] && <button className="text-xs underline" onClick={() => setK((o) => (o ? { ...o, [a]: undefined } : o))}>Kaldır</button>}</div>}
            </div>))}</div>
          <div>
            <div className="mb-1 text-sm">Kurumsal renkler</div>
            <div className="flex flex-wrap items-center gap-2">
              {k.renkler.map((r, i) => (
                <span key={i} className="flex items-center gap-1 rounded border p-1">
                  <input type="color" aria-label={`Renk ${i + 1}`} disabled={!duzenleyebilir} value={HEX.test(r) ? r : '#000000'} onChange={(e) => setK({ ...k, renkler: k.renkler.map((x, j) => (j === i ? e.target.value : x)) })} />
                  <span className="text-xs">{r}</span>
                  {duzenleyebilir && <button className="text-xs" aria-label="Rengi sil" onClick={() => setK({ ...k, renkler: k.renkler.filter((_, j) => j !== i) })}>✕</button>}
                </span>))}
              {duzenleyebilir && k.renkler.length < 8 && <button className={ikincil} onClick={() => setK({ ...k, renkler: [...k.renkler, '#b3261e'] })}>+ Renk</button>}
            </div>
          </div>
          <div className="rounded bg-stone-50 p-2 text-xs"><div className="mb-1 font-medium">Liflete aktarılacak iletişim metni</div><pre className="whitespace-pre-wrap font-sans">{iletisimMetni(k) || '(boş)'}</pre></div>
          {mesaj && <p className={mesaj.tur === 'ok' ? 'text-green-700' : 'text-red-700'}>{mesaj.m}</p>}
          <div className="flex flex-wrap gap-2">
            <button className={dugme} disabled={!duzenleyebilir} onClick={kaydet}>Kaydet</button>
            <button className={ikincil} onClick={disaAktar}>Dışa aktar</button>
            <button className={ikincil} disabled={!duzenleyebilir} onClick={sil}>Profili sil</button>
          </div>
        </div>) : <p className="text-stone-600">Soldan bir profil seçin{yonetici ? ' veya yeni profil oluşturun' : ''}.</p>}
    </div>
  </>);
}
