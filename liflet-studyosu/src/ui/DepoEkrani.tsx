import { useCallback, useEffect, useMemo, useState } from 'react';
import { depoAdDegistir, depoDosyaOku, depoSil, type DepoKaydi } from '../storage/db';
import { depoAra, duzMetin, pdfIceAl, tumKayitlar } from '../depo/depo';
import { pdfjsYukle } from '../depo/pdfjs';

const dugme = 'rounded-lg px-4 py-2 font-medium bg-red-700 text-white hover:bg-red-800 disabled:opacity-40';
const ikincil = 'rounded-lg px-3 py-1.5 text-sm font-medium border border-stone-300 bg-white hover:bg-stone-50 disabled:opacity-40';

function indir(veri: BlobPart, ad: string, tip: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([veri], { type: tip })); a.download = ad; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const boyutMetni = (b: number) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB');

export default function DepoEkrani() {
  const [liste, setListe] = useState<DepoKaydi[]>([]);
  const [acik, setAcik] = useState<string | null>(null);
  const [sorgu, setSorgu] = useState('');
  const [mesajlar, setMesajlar] = useState<{ tur: 'ok' | 'uyari' | 'hata'; m: string }[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);

  const yenile = useCallback(() => { tumKayitlar().then(setListe); }, []);
  useEffect(yenile, [yenile]);

  async function yukle(dosyalar: FileList | File[] | null) {
    if (!dosyalar?.length) return;
    const dizi = Array.from(dosyalar); // FileList canlıdır; giriş temizlenince boşalır
    setYukleniyor(true); const m: typeof mesajlar = [];
    try {
      const lib = await pdfjsYukle();
      for (const f of dizi) {
        const r = await pdfIceAl(f, lib);
        m.push({ tur: r.durum === 'eklendi' ? (r.kayit?.metin.metinVar ? 'ok' : 'uyari') : r.durum === 'kopya' ? 'uyari' : 'hata', m: r.mesaj });
      }
    } catch (e) { m.push({ tur: 'hata', m: String(e) }); }
    setMesajlar(m); setYukleniyor(false); yenile();
  }

  const sonuclar = useMemo(() => depoAra(liste, sorgu), [liste, sorgu]);
  const secili = liste.find((k) => k.id === acik) ?? null;

  return (<>
    <h2 className="mb-1 text-2xl font-bold">Liflet Deposu</h2>
    <p className="mb-4 max-w-2xl text-sm text-stone-700">Hazırladığınız lifletlerin PDF'lerini adıyla buraya yükleyin. Dosyalar olduğu gibi (değiştirilmeden) bu bilgisayarda saklanır; metinleri okunup aranabilir ve liflet düzenlerken alanlara aktarılabilir.</p>
    <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); yukle(e.dataTransfer.files); }}
      className="mb-4 flex h-28 max-w-2xl cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-stone-400 bg-white text-stone-600 hover:border-red-700">
      {yukleniyor ? 'Yükleniyor ve metin okunuyor…' : <><span className="font-medium">PDF dosyalarını sürükleyin veya seçmek için tıklayın</span><span className="text-xs">Birden fazla dosya seçebilirsiniz</span></>}
      <input type="file" accept="application/pdf,.pdf" multiple hidden disabled={yukleniyor} onChange={(e) => { yukle(e.target.files); e.target.value = ''; }} />
    </label>
    {mesajlar.length > 0 && <ul className="mb-4 max-w-2xl space-y-1 text-sm">{mesajlar.map((x, i) => <li key={i} className={x.tur === 'ok' ? 'text-green-700' : x.tur === 'uyari' ? 'text-amber-700' : 'text-red-700'}>{x.m}</li>)}</ul>}

    <div className="mb-4 max-w-2xl"><input aria-label="Depoda ara" className="w-full rounded border p-2" placeholder="Depodaki tüm lifletlerin metninde ara…" value={sorgu} onChange={(e) => setSorgu(e.target.value)} />
      {sorgu.trim() && <div className="mt-2 rounded border bg-white p-2 text-sm">
        {sonuclar.length === 0 ? 'Sonuç yok.' : <ul className="space-y-2">{sonuclar.map((s, i) => (
          <li key={i}><div className="text-xs text-stone-500">{s.kayit.ad} · sayfa {s.sayfa}</div>
            <div className="line-clamp-3">{s.metin}</div>
            <button className="text-xs underline" onClick={() => navigator.clipboard?.writeText(s.metin)}>Kopyala</button></li>))}</ul>}
      </div>}</div>

    {liste.length === 0 ? <p className="text-stone-600">Depo boş.</p> : (
      <table className="mb-6 w-full max-w-4xl border bg-white text-sm">
        <thead className="bg-stone-100 text-left"><tr><th className="p-2">Ad</th><th>Sayfa</th><th>Ölçü</th><th>Boyut</th><th>Metin</th><th /></tr></thead>
        <tbody>{liste.map((k) => {
          const s0 = k.metin.sayfalar[0]; const blok = k.metin.sayfalar.reduce((a, s) => a + s.bloklar.length, 0);
          return (<tr key={k.id} className={`border-t ${acik === k.id ? 'bg-red-50' : ''}`}>
            <td className="p-2">{k.hazir ? <div className="p-1">{k.ad} <span className="ml-1 rounded bg-stone-200 px-1.5 py-0.5 text-xs">Hazır</span></div> : <input aria-label="Ad" className="w-full rounded border border-transparent p-1 hover:border-stone-300" defaultValue={k.ad}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== k.ad) depoAdDegistir(k.id, v).then(yenile); }} />}</td>
            <td>{k.sayfaSayisi}</td><td>{s0 ? `${Math.round(s0.genislikMm)}×${Math.round(s0.yukseklikMm)} mm` : '-'}</td><td>{boyutMetni(k.boyut)}</td>
            <td>{k.metin.metinVar ? <>{blok} blok{k.kaynak === 'ocr' && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900" title={`Resimden okundu (OCR), ortalama güven %${k.ocrGuven}`}>OCR</span>}</> : <span className="text-amber-700">metin yok</span>}</td>
            <td className="space-x-1 whitespace-nowrap p-1">
              <button className={ikincil} onClick={() => setAcik(acik === k.id ? null : k.id)}>{acik === k.id ? 'Kapat' : 'Metni gör'}</button>
              {!k.hazir && <button className={ikincil} onClick={async () => { const b = await depoDosyaOku(k.id); if (b) indir(b, k.dosyaAdi, 'application/pdf'); }}>İndir</button>}
              {!k.hazir && <button className={ikincil} onClick={() => confirm(`"${k.ad}" depodan silinsin mi?`) && depoSil(k.id).then(() => { if (acik === k.id) setAcik(null); yenile(); })}>Sil</button>}
            </td></tr>);
        })}</tbody>
      </table>)}

    {secili && (<div className="max-w-4xl rounded-lg border bg-white p-4">
      <div className="mb-3 flex items-center gap-2"><h3 className="font-semibold">{secili.ad}</h3>
        <button className={ikincil} onClick={() => navigator.clipboard?.writeText(duzMetin(secili))}>Tüm metni kopyala</button>
        <button className={ikincil} onClick={() => indir(duzMetin(secili), `${secili.ad}.txt`, 'text/plain;charset=utf-8')}>.txt olarak indir</button></div>
      {secili.kaynak === 'ocr' && <p className="mb-2 rounded bg-amber-50 p-2 text-sm text-amber-900">Bu liflet taranmış resimden okundu (OCR, ortalama güven %{secili.ocrGuven}). Harf hataları olabilir; kullanmadan önce kontrol edin.{secili.hazir && ' Asıl PDF, depodaki kutuphane/pdf klasöründedir.'}</p>}
      {!secili.metin.metinVar && <p className="text-amber-700">Bu PDF'de metin katmanı yok (taranmış olabilir). Metin çekmek için OCR gerekir; bu aşama henüz yok.</p>}
      {secili.metin.sayfalar.map((s) => (<div key={s.no} className="mb-4">
        <h4 className="mb-1 text-sm font-semibold text-stone-600">Sayfa {s.no}</h4>
        <ul className="space-y-2">{s.bloklar.map((b, i) => (
          <li key={i} className="rounded border p-2 text-sm"><div className="mb-1 text-xs text-stone-500">{b.kolon === 0 ? 'Geniş metin' : `Sütun ${b.kolon}`} · {b.punto} pt</div>
            <div className="whitespace-pre-wrap">{b.metin}</div>
            <button className="mt-1 text-xs underline" onClick={() => navigator.clipboard?.writeText(b.metin)}>Kopyala</button></li>))}</ul></div>))}
    </div>)}
  </>);
}
