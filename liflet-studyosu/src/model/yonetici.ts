/** Yönetici şifresi: yerelde PBKDF2 ile türetilmiş özet olarak saklanır; düz şifre hiçbir yerde tutulmaz. */
const ANAHTAR = 'liflet.yonetici.v1';

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b as ArrayBuffer)].map((x) => x.toString(16).padStart(2, '0')).join('');
const bayt = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));

async function turet(sifre: string, tuz: Uint8Array): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(sifre), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: tuz as BufferSource, iterations: 200_000, hash: 'SHA-256' }, k, 256);
  return hex(bits);
}

export const sifreVarMi = () => !!localStorage.getItem(ANAHTAR);

export async function sifreBelirle(sifre: string): Promise<void> {
  if (sifre.length < 6) throw new Error('Şifre en az 6 karakter olmalı.');
  if (sifreVarMi()) throw new Error('Şifre zaten belirlenmiş.');
  const tuz = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(ANAHTAR, JSON.stringify({ tuz: hex(tuz), ozet: await turet(sifre, tuz) }));
}

export async function sifreDogruMu(sifre: string): Promise<boolean> {
  const k = localStorage.getItem(ANAHTAR);
  if (!k) return false;
  const { tuz, ozet } = JSON.parse(k) as { tuz: string; ozet: string };
  return (await turet(sifre, bayt(tuz))) === ozet;
}
