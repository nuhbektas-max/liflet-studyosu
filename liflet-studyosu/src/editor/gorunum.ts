import type { Golge, Rect, Slot, SlotContent } from '../model/types';
import { kapla } from './foto';

export type Tur = 'metin' | 'foto' | 'logo';

/** Alanın etkin içerik türü: kullanıcı seçimi, yoksa şablondaki tür. Geometri hiç değişmez. */
export function etkinTur(a: Slot, c?: SlotContent): Tur {
  if (c?.mod) return c.mod;
  return a.tur === 'foto' ? 'foto' : a.tur === 'logo' ? 'logo' : 'metin';
}
export const fotoMu = (a: Slot, c?: SlotContent) => etkinTur(a, c) !== 'metin';

/** Fotoğraf yerleşim modu. Logo varsayılan olarak oranı bozulmadan sığdırılır. */
export const fotoMod = (a: Slot, c?: SlotContent): 'kapla' | 'sigdir' => c?.sigdir ?? (etkinTur(a, c) === 'logo' ? 'sigdir' : 'kapla');

/** Metnin yerleşeceği alan: iç boşluk kadar küçültülmüş kutu. */
export function metinKutusu(r: Rect, c?: SlotContent): Rect {
  const b = Math.max(0, c?.bosluk ?? 0);
  return { x: r.x + b, y: r.y + b, w: Math.max(1, r.w - 2 * b), h: Math.max(1, r.h - 2 * b) };
}

/**
 * Yumuşak gölge, üst üste bindirilmiş şeffaf dikdörtgenlerle çizilir (önizleme ve PDF aynı katmanları kullanır;
 * PDF'de bulanıklık filtresi gerekmez, metinler ve vektörler seçilebilir kalır).
 */
export function golgeKatmanlari(r: Rect, g: Golge): { rect: Rect; opaklik: number }[] {
  const n = g.bulanik > 0 ? 6 : 1;
  const out: { rect: Rect; opaklik: number }[] = [];
  for (let i = 0; i < n; i++) {
    const genis = n === 1 ? 0 : (g.bulanik * (n - i)) / n;
    out.push({ rect: { x: r.x + g.dx - genis, y: r.y + g.dy - genis, w: r.w + 2 * genis, h: r.h + 2 * genis }, opaklik: Math.min(1, Math.max(0, g.opaklik)) / n });
  }
  return out;
}

export const VARSAYILAN_GOLGE: Golge = { renk: '#000000', dx: 1.2, dy: 1.2, bulanik: 2, opaklik: 0.35 };
export const VARSAYILAN_YAZI_GOLGE = { renk: '#000000', dx: 0.25, dy: 0.25, opaklik: 0.4 };

/**
 * Görselin sayfadaki yeri (mm, mutlak). 'Sığdır' modunda iç boşluk ve hizalama uygulanır; oran hiçbir zaman bozulmaz.
 * Önizleme, PDF ve çözünürlük hesabı aynı fonksiyonu kullanır.
 */
export function fotoYerlesim(a: Slot, c: SlotContent): Rect | null {
  if (!c.fotoBoyut) return null;
  const mod = fotoMod(a, c);
  const ir = mod === 'sigdir' ? metinKutusu(a.rect, c) : a.rect;
  const k = kapla(c.fotoBoyut, ir, c.olcek, c.konum, mod, mod === 'sigdir' ? { x: c.logo?.hx ?? 0.5, y: c.logo?.hy ?? 0.5 } : undefined);
  return { x: ir.x + k.x, y: ir.y + k.y, w: k.w, h: k.h };
}

/** Görüntünün alandaki etkin çözünürlüğü (dpi). */
export function etkinDpi(a: Slot, c: SlotContent): number | null {
  const y = fotoYerlesim(a, c);
  return y && c.foto && c.fotoBoyut ? c.fotoBoyut.w / (y.w / 25.4) : null;
}
