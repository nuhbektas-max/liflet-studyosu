import { useState } from 'react';
import { sifreBelirle, sifreDogruMu, sifreVarMi } from '../model/yonetici';

const dugme = 'rounded-lg px-4 py-2 font-medium bg-red-700 text-white hover:bg-red-800 disabled:opacity-40';
const dugmeIkincil = 'rounded-lg px-4 py-2 font-medium border border-stone-300 bg-white hover:bg-stone-50';

export default function YoneticiGirisi({ yonetici, setYonetici }: { yonetici: boolean; setYonetici: (v: boolean) => void }) {
  const [sifre, setSifre] = useState('');
  const [mesaj, setMesaj] = useState('');
  async function giris() {
    try {
      if (!sifreVarMi()) { await sifreBelirle(sifre); setYonetici(true); setMesaj('Yönetici şifresi belirlendi. Unutmayın; sıfırlanamaz.'); }
      else if (await sifreDogruMu(sifre)) { setYonetici(true); setMesaj(''); }
      else setMesaj('Şifre yanlış.');
    } catch (e) { setMesaj((e as Error).message); }
    setSifre('');
  }
  return (
    <div className="max-w-sm space-y-2 rounded-lg border bg-white p-4">
      <h3 className="font-semibold">Yönetici yetkisi</h3>
      {yonetici ? <><p>Kilit açma yetkisi etkin.</p><button className={dugmeIkincil} onClick={() => setYonetici(false)}>Kilitle</button></> : <>
        <p className="text-sm text-stone-600">{sifreVarMi() ? 'Yönetici şifresini girin.' : 'İlk kullanım: yeni bir yönetici şifresi belirleyin (en az 6 karakter).'}</p>
        <input type="password" aria-label="Yönetici şifresi" className="w-full rounded border p-2" value={sifre} onChange={(e) => setSifre(e.target.value)} />
        <button className={dugme} onClick={giris}>{sifreVarMi() ? 'Kilidi aç' : 'Şifre belirle'}</button></>}
      {mesaj && <p className="text-sm text-red-700">{mesaj}</p>}
    </div>
  );
}
