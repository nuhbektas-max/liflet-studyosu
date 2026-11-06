# Kod Modu araçları

Çok adımlı, tekrar eden işleri Claude'a adım adım yaptırmak yerine tek script çalıştırılır.
Ara veri script'in içinde kalır, ekrana en çok ~10 satırlık özet gelir, ayrıntı `_cikti/` klasörüne yazılır
(`_cikti/` git'e girmez).

| Komut | Ne yapar |
|---|---|
| `node araclar/kod-modu/denetle.mjs` | İki uygulamada sürüm tutarlılığı ve testler, Yeşil Eller yer tutucu sayıları, Word sürümleri geride mi, git durumu |
| `node araclar/kod-modu/surum.mjs <besi\|sut> <x.y>` | Sürümü bütün dosyalarda (gradle, sw.js/app.js, index.html, package.json + lock, iş akışı) birlikte değiştirir, versionCode'u bir artırır. **Varsayılan deneme**; yazmak için `--onay` |
| `node araclar/kod-modu/paketle.mjs <besi\|sut>` | Testleri çalıştırır, tek dosyalık HTML'i ve (Besi'de) iPhone zip'ini `_cikti/<uygulama>-<sürüm>/` içine üretir; GitHub'dan alınacak APK/exe adlarını yazar. Dışarıya bir şey göndermez |
| `node araclar/kod-modu/iphone.mjs` | Besi Rasyon `www/` içeriğini herkese açık `nuhbektas-max/besi-rasyon` deposuna kopyalar, `main` ve `gh-pages`'e gönderir. Test geçmezse ya da sürüm tutarsızsa durur. **Varsayılan deneme** (ne değişeceğini gösterir, göndermez); göndermek için `--onay` |
| `node araclar/kod-modu/ekran.mjs [--dolu] [--resim]` | Besi Rasyon'un bütün sayfalarını 4 ekran genişliğinde tarayıcıda gezer; JS hatası, taşma, rasyon hesabı; `--dolu` örnek veriyle kayıt → yemleme → depo akışı ve HTML denemesi; `--resim` ekran görüntüleri `_cikti/ekran/`. Lisans için geçici sınama anahtarı üretir, gerçek anahtar gerekmez |

Ortak parçalar `lib/depo.mjs` içinde (sürüm geçen dosyaların listesi burada; yeni bir dosyada sürüm geçerse buraya eklenir).
Bu araçlar hiçbir anahtar ya da şifre kullanmaz.
