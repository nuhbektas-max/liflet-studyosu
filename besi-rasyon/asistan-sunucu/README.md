# Besi Rasyon asistan sunucusu

Uygulamadaki **Asistan** sayfası soruları bu küçük sunucuya gönderir; sunucu Vercel AI Gateway üzerinden modele iletir.
Gateway anahtarı yalnızca burada durur, uygulamaya girmez. Yalnızca geçerli lisansı olan uygulamalar (ve yönetici) soru sorabilir.

## Kurulum (bir kez)

1. vercel.com'da hesap açın; bu depoyu içe aktarın ve **Root Directory** olarak `besi-rasyon/asistan-sunucu` seçin.
2. Projenin Environment Variables bölümüne `AI_GATEWAY_API_KEY` ekleyin (Vercel > AI Gateway sayfasından alınır).
3. İsteğe bağlı: `ASISTAN_MODEL` (varsayılan `mistral/mistral-large-4`; geçerli adı `node ../../araclar/mistral-akis/index.mjs --modeller` ile görün), `SAATLIK_SINIR` (lisans başına saatlik soru, varsayılan 30).
4. Yayınlanınca adres `https://<proje>.vercel.app/api/asistan` olur. Bu adresi `www/asistan.js` içindeki `ADRES` değişkenine yazıp yeni sürüm çıkarın.
   Önce denemek için Yönetici uygulamasında Asistan sayfasına adresi geçici olarak girebilirsiniz.

## Gizlilik ve maliyet

- Sunucu soruyu saklamaz; yalnızca modele iletir.
- Her soru Gateway hesabınızdan para harcar. Saatlik sınır kötüye kullanımı azaltır; sunucu yeniden başlayınca sayaç sıfırlanır.
- `lisans.js` içindeki `ACIK_ANAHTAR` ile `dogrula.mjs` içindeki aynı olmalıdır (şu an aynı).

## Test

`npm install && npm test` — lisans doğrulama, süre, cihaz, bozuk imza ve istek kurallarını sınar (model çağrılmaz).
