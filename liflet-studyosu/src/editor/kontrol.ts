import { duzenle, type Olcer } from './duzen';
import { dpiDurumu } from './foto';
import { stilBul } from './stil';
import { etkinDpi, etkinTur, metinKutusu } from './gorunum';
import { geometriDegistiMi } from '../model/lock';
import type { Project } from '../model/types';

export type Bulgu = { duzey: 'hata' | 'uyari'; alanId?: string; mesaj: string };

/** Baskı öncesi kontrol (şablon geometrisi, metin sığması, çözünürlük, boş alan, okunabilirlik). */
export function baskiOncesiKontrol(p: Project, olc: Olcer): Bulgu[] {
  const b: Bulgu[] = []; const t = p.sablon;
  if (t.durum !== 'onayli') b.push({ duzey: 'hata', mesaj: 'Şablon onaylı değil.' });
  if (t.sayfa.genislik !== 300 || t.sayfa.yukseklik !== 210) b.push({ duzey: 'uyari', mesaj: `Sayfa ölçüsü ${t.sayfa.genislik}×${t.sayfa.yukseklik} mm (standart şablon 300×210).` });
  if (t.sayfa.yon !== 'yatay') b.push({ duzey: 'uyari', mesaj: 'Sayfa yönü yatay değil.' });
  if (geometriDegistiMi(p)) b.push({ duzey: 'hata', mesaj: 'Şablon koordinatları onaylanmış hâlinden değişmiş. Yönetici yeniden onaylamalı.' });
  for (const a of t.alanlar) {
    const c = p.icerik[a.id];
    if (etkinTur(a, c) !== 'metin') {
      if (!c?.foto) { b.push({ duzey: 'uyari', alanId: a.id, mesaj: `"${a.ad}" alanı boş.` }); continue; }
      const d = dpiDurumu(etkinDpi(a, c));
      if (d === 'yetersiz') b.push({ duzey: 'hata', alanId: a.id, mesaj: `"${a.ad}" çözünürlüğü baskı için yetersiz (${Math.round(etkinDpi(a, c)!)} dpi).` });
      else if (d === 'zayif') b.push({ duzey: 'uyari', alanId: a.id, mesaj: `"${a.ad}" çözünürlüğü sınırda (${Math.round(etkinDpi(a, c)!)} dpi).` });
    } else {
      if (!c?.metin?.trim()) { b.push({ duzey: 'uyari', alanId: a.id, mesaj: `"${a.ad}" alanı boş.` }); continue; }
      const st = stilBul(a, c);
      if (st.punto < 7) b.push({ duzey: 'uyari', alanId: a.id, mesaj: `"${a.ad}" yazısı çok küçük (${st.punto} pt).` });
      const d = duzenle(c.metin, st, metinKutusu(a.rect, c), olc);
      if (d.tasanKelime) b.push({ duzey: 'hata', alanId: a.id, mesaj: `"${a.ad}": "${d.tasanKelime}" kelimesi sütuna sığmıyor.` });
      else if (!d.sigiyor) b.push({ duzey: 'hata', alanId: a.id, mesaj: `"${a.ad}" metni alana sığmıyor.` });
    }
  }
  return b;
}
