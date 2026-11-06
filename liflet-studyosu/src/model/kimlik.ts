import { icerikDegistir } from './lock';
import type { KimlikRolu, Project } from './types';

export type Logo = {
  /** İşlenmiş (kırpılmış) logo. */
  foto: string; boyut: { w: number; h: number }; dosyaAdi?: string;
  /** Yüklenen asıl görüntü; seçenekler bundan yeniden uygulanır. */
  ham?: string; kirp?: boolean; beyazSaydam?: boolean;
};

/** İl bazlı kurumsal profil. */
export type Kimlik = {
  id: string;
  /** Profil adı (ör. "Ankara"). */
  ad: string;
  bakanlikLogo?: Logo;
  valilikLogo?: Logo;
  mudurlukLogo?: Logo;
  mudurlukAdi: string;
  adres: string;
  telefon: string;
  eposta: string;
  web: string;
  renkler: string[];
  guncelleme: number;
};

export const yeniKimlik = (ad = ''): Kimlik => ({
  id: crypto.randomUUID(), ad, mudurlukAdi: '', adres: '', telefon: '', eposta: '', web: '', renkler: [], guncelleme: Date.now(),
});

export function iletisimMetni(k: Kimlik): string {
  const sat2 = [k.telefon && `Tel: ${k.telefon}`, k.eposta, k.web].filter(Boolean).join('  ·  ');
  return [k.mudurlukAdi, k.adres, sat2].filter(Boolean).join('\n');
}

export const HEX = /^#[0-9a-f]{6}$/i;

export function kimlikHatalari(k: Kimlik): string[] {
  const h: string[] = [];
  if (!k.ad.trim()) h.push('Profil adı boş olamaz.');
  if (k.eposta && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k.eposta)) h.push('E-posta adresi geçerli değil.');
  if (k.renkler.some((r) => !HEX.test(r))) h.push('Renkler #rrggbb biçiminde olmalı.');
  for (const [ad, l] of [['Bakanlık', k.bakanlikLogo], ['Valilik', k.valilikLogo], ['İl Müdürlüğü', k.mudurlukLogo]] as const)
    if (l && (!l.boyut.w || !l.boyut.h)) h.push(`${ad} logosunun ölçüsü okunamadı.`);
  return h;
}

/**
 * Kimliği projeye aktarır: logolar (oranı korunarak sığdırılır), müdürlük adı ve iletişim metni.
 * Yalnızca içerik değişir; şablon geometrisi ve mührü değişmez. `bosOlanlar`: dolu alanlara dokunma.
 */
export function kimligiUygula(p: Project, k: Kimlik, bosOlanlar = false): Project {
  let q = p;
  const logo = (rol: KimlikRolu): Logo | undefined => rol === 'logo-bakanlik' ? k.bakanlikLogo : rol === 'logo-valilik' ? k.valilikLogo : rol === 'logo-mudurluk' ? k.mudurlukLogo : undefined;
  for (const a of p.sablon.alanlar) {
    if (!a.kimlikRolu) continue;
    const mevcut = q.icerik[a.id];
    if (bosOlanlar && (mevcut?.foto || mevcut?.metin)) continue;
    if (a.kimlikRolu.startsWith('logo-')) {
      const l = logo(a.kimlikRolu);
      if (l) q = icerikDegistir(q, a.id, { mod: 'logo', foto: l.foto, fotoBoyut: l.boyut, fotoHam: l.ham, sigdir: 'sigdir', olcek: 1, konum: { x: 0.5, y: 0.5 }, bosluk: 1, logo: { kirp: l.kirp ?? true, beyazSaydam: l.beyazSaydam ?? false, hx: 0.5, hy: 0.5 } });
    } else {
      const m = a.kimlikRolu === 'mudurluk-adi' ? k.mudurlukAdi : iletisimMetni(k);
      if (m) q = icerikDegistir(q, a.id, { mod: 'metin', metin: m });
    }
  }
  return { ...q, kimlikId: k.id, kimlikRenkleri: k.renkler.filter((r) => HEX.test(r)), guncelleme: Date.now() };
}
