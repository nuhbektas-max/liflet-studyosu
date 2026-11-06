import type { Project, Rect, SlotContent, Template } from './types';

/** Kararlı (anahtar sırasından bağımsız) JSON. */
function kararli(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(kararli).join(',') + ']';
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + kararli(o[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

/** FNV-1a 64 bit benzeri iki geçişli özet; senkron ve bağımlılıksız. */
export function ozet(metin: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < metin.length; i++) {
    const c = metin.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** Şablonun değişmez kısmının parmak izi: sayfa, sütun, boşluk, renk, sabit öğeler, alan kutuları. */
export function sablonMuhru(t: Template): string {
  return ozet(kararli({
    sayfa: t.sayfa, sutunSayisi: t.sutunSayisi, kenarBosluk: t.kenarBosluk ?? null,
    renkler: t.renkler, sabit: t.sabit,
    alanlar: t.alanlar.map((a) => ({ id: a.id, sayfa: a.sayfa, tur: a.tur, rect: a.rect })),
  }));
}

export const muhurDogruMu = (t: Template) => !t.muhur || t.muhur === sablonMuhru(t);

export type Yetki = { yonetici: boolean };

export class KilitHatasi extends Error {
  constructor(public kod: 'sabit-alan' | 'bilinmeyen-alan' | 'onayli-sablon', mesaj: string) {
    super(mesaj);
  }
}

/** Kullanıcının içerik değişikliği: yalnızca alan içeriğine dokunabilir. */
export function icerikDegistir(p: Project, alanId: string, degisiklik: Partial<SlotContent>): Project {
  if (!p.sablon.alanlar.some((a) => a.id === alanId)) {
    throw new KilitHatasi(
      p.sablon.sabit.some((s) => s.id === alanId) ? 'sabit-alan' : 'bilinmeyen-alan',
      p.sablon.sabit.some((s) => s.id === alanId)
        ? 'Bu öğe şablonun sabit parçasıdır ve değiştirilemez.'
        : 'Böyle bir içerik alanı yok.',
    );
  }
  return { ...p, icerik: { ...p.icerik, [alanId]: { ...p.icerik[alanId], ...degisiklik } }, guncelleme: Date.now() };
}

/** Alan kutusunun taşınması/boyutlanması: yalnızca kilit açıkken ve yönetici yetkisiyle. */
export function alanKutusuDegistir(p: Project, alanId: string, rect: Rect, yetki: Yetki): Project {
  if (!yetki.yonetici) {
    throw new KilitHatasi('sabit-alan', 'Alan ölçülerini yalnızca yönetici değiştirebilir.');
  }
  const i = p.sablon.alanlar.findIndex((a) => a.id === alanId);
  if (i < 0) throw new KilitHatasi('bilinmeyen-alan', 'Böyle bir içerik alanı yok.');
  const alanlar = p.sablon.alanlar.slice();
  alanlar[i] = { ...alanlar[i]!, rect };
  // Muhür, yönetici onayı olmadan değişmiş sayılır; baskı öncesi kontrol bunu yakalar.
  return { ...p, sablon: { ...p.sablon, alanlar }, guncelleme: Date.now() };
}

/** Baskı öncesi kontrol için: şablon geometrisi onaylı hâlinden saptı mı? */
export function geometriDegistiMi(p: Project): boolean {
  return p.sablon.durum === 'onayli' && !muhurDogruMu(p.sablon);
}

/** Yönetici şablonu onaylar: mühür basılır. */
export function sablonOnayla(t: Template, yetki: Yetki): Template {
  if (!yetki.yonetici) throw new KilitHatasi('onayli-sablon', 'Şablonu yalnızca yönetici onaylayabilir.');
  const s = { ...t, durum: 'onayli' as const };
  return { ...s, muhur: sablonMuhru(s) };
}
