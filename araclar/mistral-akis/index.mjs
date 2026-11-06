// Kullanım:
//   export AI_GATEWAY_API_KEY=...        (Vercel AI Gateway anahtarı)
//   npm install
//   node index.mjs "Gökyüzü neden mavi?"
//   node index.mjs --modeller            (Gateway'deki Mistral modellerini listeler)
//   MODEL=mistral/model-adi node index.mjs "soru"
//   MAX_TOKENS=8000 node index.mjs "uzun soru"
//   CIKTI=cevap.txt node index.mjs "soru"  (yanıtı dosyaya da yazar)
import { streamText } from 'ai'
import { createWriteStream } from 'node:fs'

const args = process.argv.slice(2)

if (args[0] === '--modeller') {
  const r = await fetch('https://ai-gateway.vercel.sh/v1/models')
  if (!r.ok) {
    console.error(`Model listesi alınamadı (HTTP ${r.status}).`)
    process.exit(1)
  }
  const { data } = await r.json()
  const liste = data.map((m) => m.id).filter((id) => id.startsWith('mistral/')).sort()
  console.log(liste.length ? liste.join('\n') : 'Mistral modeli bulunamadı.')
  process.exit(0)
}

const model = process.env.MODEL || 'mistral/mistral-large-4'
const soru = args.join(' ').trim() || 'Gökyüzü neden mavi?'
const maxTokens = process.env.MAX_TOKENS ? Number(process.env.MAX_TOKENS) : undefined

if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
  console.error('AI_GATEWAY_API_KEY tanımlı değil. Anahtarı ortam değişkeni olarak verin.')
  process.exit(1)
}

const dosya = process.env.CIKTI ? createWriteStream(process.env.CIKTI) : null

try {
  const result = streamText({
    model,
    prompt: soru,
    ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
    onError: ({ error }) => { throw error }
  })

  for await (const parca of result.textStream) {
    process.stdout.write(parca)
    dosya?.write(parca)
  }
  process.stdout.write('\n')
  dosya?.end('\n')

  const bitis = await result.finishReason
  if (bitis === 'length') {
    console.error('\n[Yanıt çıktı sınırında kesildi. MAX_TOKENS değerini artırın.]')
  }
} catch (hata) {
  console.error(`\nHata (${model}): ${hata.message}`)
  console.error('Model adı yanlış olabilir: node index.mjs --modeller')
  process.exit(1)
}
