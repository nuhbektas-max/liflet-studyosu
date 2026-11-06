export type Gecmis<T> = { gecmis: T[]; simdi: T; gelecek: T[]; anahtar?: string; zaman?: number };

export const baslat = <T,>(ilk: T): Gecmis<T> => ({ gecmis: [], simdi: ilk, gelecek: [] });

export function uygula<T>(g: Gecmis<T>, yeni: T, sinir = 100): Gecmis<T> {
  if (Object.is(yeni, g.simdi)) return g;
  return { gecmis: [...g.gecmis, g.simdi].slice(-sinir), simdi: yeni, gelecek: [] };
}

/**
 * Aynı anahtarla (ör. aynı alana yazma) kısa aralıkla yapılan değişiklikleri tek geri alma adımında toplar;
 * böylece yazarken her harf ayrı adım olmaz.
 */
export function uygulaBirlestir<T>(g: Gecmis<T>, yeni: T, anahtar: string, simdi: number, aralikMs = 1000, sinir = 100): Gecmis<T> {
  if (Object.is(yeni, g.simdi)) return g;
  if (g.anahtar === anahtar && g.zaman !== undefined && simdi - g.zaman < aralikMs && g.gecmis.length) {
    return { gecmis: g.gecmis, simdi: yeni, gelecek: [], anahtar, zaman: simdi };
  }
  return { gecmis: [...g.gecmis, g.simdi].slice(-sinir), simdi: yeni, gelecek: [], anahtar, zaman: simdi };
}

export function geriAl<T>(g: Gecmis<T>): Gecmis<T> {
  if (!g.gecmis.length) return g;
  return { gecmis: g.gecmis.slice(0, -1), simdi: g.gecmis[g.gecmis.length - 1]!, gelecek: [g.simdi, ...g.gelecek] };
}

export function yinele<T>(g: Gecmis<T>): Gecmis<T> {
  if (!g.gelecek.length) return g;
  return { gecmis: [...g.gecmis, g.simdi], simdi: g.gelecek[0]!, gelecek: g.gelecek.slice(1) };
}
