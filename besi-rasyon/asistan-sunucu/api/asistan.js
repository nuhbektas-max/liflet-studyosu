// Besi Rasyon asistanı: uygulamadan gelen soruyu Vercel AI Gateway üzerinden modele iletir, yanıtı akıtır.
// Anahtar yalnızca burada (AI_GATEWAY_API_KEY) durur; uygulamaya girmez. Yalnızca geçerli lisanslı
// uygulamalar (ya da yönetici) kullanabilir.
import { streamText } from 'ai'
import { lisansDogrula, yoneticiDogrula } from '../dogrula.mjs'

const MODEL = process.env.ASISTAN_MODEL || 'mistral/mistral-large-4'
const SAATLIK_SINIR = Number(process.env.SAATLIK_SINIR || 30)
const MAX_MESAJ = 12, MAX_UZUNLUK = 4000, MAX_BAGLAM = 6000

const SISTEM = `Sen Besi Rasyon uygulamasının asistanısın. Türkiye'de besi sığırı yetiştiren çiftçilere sade, kısa ve uygulanabilir Türkçe yanıt verirsin.
Kurallar:
- Konun besi sığırcılığı: rasyon, yem, bakım, besleme, kilo artışı, maliyet, depolama. Dışındaki sorulara nazikçe "bu konuda yardımcı olamam" de.
- Kullanıcının rasyon bilgisi verilmişse onu esas al; yeni bir rasyon uydurma, rakamları değiştirme. Hesabı uygulamanın Rasyon sayfası yapar.
- Emin olmadığında söyle. Hastalık, zehirlenme, doğum ve ilaç konularında teşhis koyma, ilaç dozu verme; veteriner hekime yönlendir.
- Üre, tuz, mineral ve premiks gibi katkılarda tartı ve karıştırma uyarısını unutma.
- Yanıtın sonuna uzun uyarı ekleme; gerekli yerde tek cümlelik uyarı yeter.`

const sayac = new Map()  // en iyi çaba: sunucu yeniden başlarsa sıfırlanır
function sinirli(kimlik) {
  const simdi = Date.now(), pencere = (sayac.get(kimlik) || []).filter((t) => simdi - t < 3600e3)
  if (pencere.length >= SAATLIK_SINIR) { sayac.set(kimlik, pencere); return true }
  pencere.push(simdi); sayac.set(kimlik, pencere)
  return false
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, x-lisans, x-cihaz, x-yonetici',
  'access-control-allow-methods': 'POST, OPTIONS'
}
const hata = (durum, mesaj) => new Response(JSON.stringify({ hata: mesaj }), { status: durum, headers: { ...CORS, 'content-type': 'application/json' } })

export async function isle(request, modelAdi = MODEL, akit = streamText) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return hata(405, 'Yalnızca POST.')

  const yon = request.headers.get('x-yonetici')
  const k = yon ? await yoneticiDogrula(yon) : await lisansDogrula(request.headers.get('x-lisans'), request.headers.get('x-cihaz'))
  if (!k.ok) return hata(401, 'Lisans doğrulanamadı (' + k.neden + ').')
  if (sinirli(k.kimlik)) return hata(429, 'Saatlik soru sınırına ulaştınız. Biraz sonra tekrar deneyin.')

  let govde
  try { govde = await request.json() } catch { return hata(400, 'Geçersiz istek.') }
  const mesajlar = (Array.isArray(govde.mesajlar) ? govde.mesajlar : []).slice(-MAX_MESAJ)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_UZUNLUK) }))
  if (!mesajlar.length || mesajlar[mesajlar.length - 1].role !== 'user') return hata(400, 'Soru yok.')
  const baglam = typeof govde.baglam === 'string' ? govde.baglam.slice(0, MAX_BAGLAM) : ''

  const sonuc = akit({
    model: modelAdi,
    system: SISTEM + (baglam ? '\n\nKullanıcının uygulamadaki bilgileri (kullanıcı kendi isteğiyle paylaştı):\n' + baglam : ''),
    messages: mesajlar,
    maxOutputTokens: 1200
  })
  return sonuc.toTextStreamResponse({ headers: CORS })
}

export default { fetch: (request) => isle(request) }
