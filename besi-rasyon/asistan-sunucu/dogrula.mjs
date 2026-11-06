// Lisans ve yönetici imzası doğrulama. Uygulamadaki lisans.js ile aynı biçim:
// "BESI-" + base64url("BR1|kod|bitiş|ad") + "." + base64url(imza), ECDSA P-256 / SHA-256.
import { webcrypto } from 'node:crypto'
const subtle = webcrypto.subtle

// lisans.js içindeki ACIK_ANAHTAR ile aynı olmalı. Başka anahtarla denemek için ortam değişkeni.
export const ACIK_ANAHTAR = process.env.ACIK_ANAHTAR ||
  'BLwzyhsA3JUtUHumK_phk5k4t5d3sQw9Qi1J04jLIocEtxYJ9Z2ZcCAbkwO9x1SA2J0_UUOXEz5qWWuvLESRSOw'
const ALG = { name: 'ECDSA', hash: 'SHA-256' }
const unb64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'))
const utf8 = (s) => new TextEncoder().encode(s)

let anahtar
function acik() {
  anahtar ||= subtle.importKey('raw', unb64u(ACIK_ANAHTAR), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  return anahtar
}
async function imzaDogru(imzaB64u, yuk) {
  try { return await subtle.verify(ALG, await acik(), unb64u(imzaB64u), utf8(yuk)) } catch { return false }
}
function bugun() {
  const d = new Date()
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
}

// Dönen: { ok, kimlik } ya da { ok: false, neden }
export async function lisansDogrula(lisans, cihaz) {
  const m = String(lisans || '').match(/BESI-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/)
  if (!m) return { ok: false, neden: 'bicim' }
  let yuk
  try { yuk = Buffer.from(m[1], 'base64url').toString('utf8') } catch { return { ok: false, neden: 'bicim' } }
  const p = yuk.split('|')
  if (p.length < 4 || p[0] !== 'BR1') return { ok: false, neden: 'bicim' }
  if (!(await imzaDogru(m[2], yuk))) return { ok: false, neden: 'imza' }
  const bitis = parseInt(p[2], 10)
  if (!(bitis >= 99991231) && bitis < bugun() - 1) return { ok: false, neden: 'sure' }  // saat dilimi payı: 1 gün
  const kod = String(cihaz || '').replace(/-/g, '').slice(2)
  if (p[1] !== kod) return { ok: false, neden: 'cihaz' }
  return { ok: true, kimlik: 'L:' + p[1] }
}

// Yönetici uygulaması lisans taşımaz; özel anahtarla "ASISTAN|<ms>" metnini imzalar: "<ms>.<imza>".
export async function yoneticiDogrula(belge) {
  const [ts, imza] = String(belge || '').split('.')
  const t = Number(ts)
  if (!imza || !Number.isFinite(t) || Math.abs(Date.now() - t) > 10 * 60 * 1000) return { ok: false, neden: 'sure' }
  return (await imzaDogru(imza, 'ASISTAN|' + ts)) ? { ok: true, kimlik: 'Y' } : { ok: false, neden: 'imza' }
}
