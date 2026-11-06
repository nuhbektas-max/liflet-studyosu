import { useEffect, useMemo, useState } from 'react';
import type { DepoKaydi } from '../storage/db';
import { tumKayitlar } from '../depo/depo';

/** Editörde bir metin alanına depodaki PDF'lerden metin bloğu aktarır. */
export default function DepodanMetin({ aktar, kapat }: { aktar: (metin: string, mod: 'degistir' | 'ekle') => void; kapat: () => void }) {
  const [liste, setListe] = useState<DepoKaydi[]>([]);
  const [id, setId] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { tumKayitlar().then((l) => { setListe(l); setId(l[0]?.id ?? ''); }); }, []);
  const k = liste.find((x) => x.id === id);
  const bloklar = useMemo(() => {
    const t = q.trim().toLocaleLowerCase('tr');
    return (k?.metin.sayfalar ?? []).flatMap((s) => s.bloklar.map((b) => ({ ...b, sayfa: s.no }))).filter((b) => !t || b.metin.toLocaleLowerCase('tr').includes(t));
  }, [k, q]);
  const btn = 'rounded border px-2 py-0.5 text-xs hover:bg-stone-50';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-label="Depodan metin al">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Depodan metin al</h3><button className={btn} onClick={kapat}>Kapat</button></div>
        {liste.length === 0 ? <p className="text-sm">Depo boş.</p> : (<>
          <div className="mb-2 flex gap-2">
            <select aria-label="Depodaki liflet" className="w-1/2 rounded border p-1 text-sm" value={id} onChange={(e) => setId(e.target.value)}>{liste.map((x) => <option key={x.id} value={x.id}>{x.ad}{x.kaynak === 'ocr' ? ' (OCR)' : ''}</option>)}</select>
            <input aria-label="Metinde ara" className="w-1/2 rounded border p-1 text-sm" placeholder="Bu liflette ara…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {k?.kaynak === 'ocr' && <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-900">Bu liflet taranmış resimden okundu (OCR, ortalama güven %{k.ocrGuven}). Aktarmadan önce metni kontrol edin; harf hataları olabilir.</p>}
          <ul className="space-y-2 overflow-auto">
            {bloklar.length === 0 && <li className="text-sm text-stone-600">{k?.metin.metinVar ? 'Eşleşen metin yok.' : 'Bu PDF\'de metin katmanı yok.'}</li>}
            {bloklar.map((b, i) => (<li key={i} className="rounded border p-2 text-sm">
              <div className="mb-1 text-xs text-stone-500">Sayfa {b.sayfa} · {b.kolon === 0 ? 'Geniş metin' : `Sütun ${b.kolon}`}</div>
              <div className="line-clamp-4 whitespace-pre-wrap">{b.metin}</div>
              <div className="mt-1 flex gap-2"><button className={btn} onClick={() => { aktar(b.metin, 'degistir'); kapat(); }}>Alanın metni olarak al</button>
                <button className={btn} onClick={() => { aktar(b.metin, 'ekle'); kapat(); }}>Sonuna ekle</button></div></li>))}
          </ul></>)}
      </div>
    </div>
  );
}
