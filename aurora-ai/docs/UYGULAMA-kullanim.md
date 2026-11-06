# AURORA AI – Android uygulaması (sürüm 1.2)

Tarih: 2026-11-02

Kullanıcı isteği: "çalışır ver, bu yüz istiyorum" (görsel: mavi-mor zeminde parlayan kontur çizgilerinden oluşan yüz).

Unity/VHToolkit yolu bu ortamda derlenemiyor (Unity yok, her adım kullanıcının bilgisayarında denenmeli). Bu nedenle çalışan sürüm Three.js + Android WebView ile yapıldı: yüz, konuşma ve telefon kontrolü bugün telefonda çalışır. Unity yolu (FAZ 1–2 dosyaları) silinmedi; robot modeli ve Unity kurulu bilgisayar olursa oradan sürdürülebilir.

## Kurulum

1. GitHub > Releases > en yeni "AURORA AI 1.0" > `AuroraAI-1.0.apk` (ya da sohbette gönderilen dosya).
2. Telefonda açın; "bilinmeyen kaynaklardan yükleme" izni isterse verin.
3. Uygulama açılınca sağ üstteki ⚙ > **Sağlayıcı**: Google Gemini (varsayılan) ya da Anthropic Claude. **API anahtarı**: Gemini için aistudio.google.com > Get API key (`AIza…`), Claude için console.anthropic.com (`sk-ant-…`). **Bağlantıyı dene**. Anahtar Android Keystore ile şifrelenip yalnızca o telefonda saklanır; APK'nın içinde anahtar yoktur. Console'da aylık harcama sınırı koyun.
4. Mikrofona dokunun, konuşun. İlk seferde mikrofon izni sorulur.

Ses tanıma ve konuşma telefonun Google motorlarıyla yapılır. Robot sessizse: Ayarlar > Sistem > Diller ve giriş > Metin okuma çıkışı > tercih edilen motor Google, dil Türkçe (gerekirse ses verisini indirin).

## Ne yapar

| Özellik | Nasıl |
|---|---|
| Yüz | Parlayan, kesikli kontur çizgilerinden 3D baş, boyun, kulak sarmalı, iç içe halkalı gözler. Burun, dudak, kaş, çene hatları yüzeyde |
| 5 durum | Bekliyor mavi, Dinliyor yeşil, Düşünüyor mor (nabız), Konuşuyor turkuaz, Hata turuncu-kırmızı (yanıp söner). Yüzün rengi ve üstteki gösterge birlikte değişir |
| Canlılık | Nefes, rastgele göz kırpma, göz sakkadları, beklerken hafif baş salınımı; dinlerken başını size çevirip eğer; düşünürken yukarı bakar |
| Dudak senkronu | Türkçe harf→ağız şekli (15 viseme grubu: sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, I, O, U); ses motoru her kelimenin başladığı anı bildirir |
| 9 duygu | neutral, happy, curious, thoughtful, surprised, sad, alert, witty, empathetic: gülümseme, kaş, parıltı. Jestler: nod, shake, tilt, lean |
| Gemini (1.1, 1.2) | Gemini API `generateContent`, varsayılan `gemini-3.5-flash-lite` (kullanıcının anahtarıyla gerçek istekle denendi: cevap ~1 sn, hatırlama/fener/ses araçlarını çağırıyor). Ücretsiz katmanda 3.8 Flash günde yalnızca ~20 istek; bir modelin günlük kotası dolunca uygulama sıradaki modele geçer. gemini-2.5 modelleri yeni kullanıcılara kapandı; kapanan bir model seçiliyse uygulama Google'ın önerdiği modele kendisi geçer). Ücretsiz katman dakikada 5 istekle sınırlı: kota dolunca uygulama kısa bekleyip yeniden dener, olmazsa "bir dakika bekleyin" der. Aynı araçlar functionDeclarations olarak, aynı hafıza ve geçmiş, Türkçe hata mesajları, 429/5xx'te iki kez yeniden deneme |
| Claude | Resmî Anthropic SDK; her yanıt JSON: text, emotion, gesture, intensity, gaze. Varsayılan model `claude-opus-5-5` (ayarlardan Sonnet 5.5 / Haiku 5.5 / Fable 5.1 ya da herhangi bir model kimliği; "Hesabımdaki modelleri getir") |
| Araçlar (gerçekten yürütülür) | Fener aç/kapat (gerçek durum doğrulanır), medya/zil/alarm sesi (gerçek yüzde okunur), Wi-Fi paneli ve Bluetooth ayarı (dönünce gerçek durum), sistem ayarları, cihaz bilgisi, pil, internet durumu, hatırla/unut |
| Güvenlik | Alarm/zil sesini kapatmak onay ister; mikrofon yalnızca düğmeyle açılır, arka planda dinleme yok; uygulama arka plana geçince dinleme kesilir |
| Hafıza | Kısa süreli: son 16 tur. Uzun süreli: yalnızca "hatırla" dediğiniz bilgiler; ayarlardan düzeltilir/silinir |
| Söz kesme | Robot konuşurken ya da düşünürken mikrofona dokunursanız susar ve sizi dinler |
| Hata | İnternet yok, anahtar yanlış, model bulunamadı, sunucu yoğun: Türkçe sesli açıklama + kırmızı ışık, 3 sn sonra bekleme |
| Ayarlar | API anahtarı, proxy adresi, model, düşünme derinliği, konuşma hızı ve tonu, sürekli konuşma, hareket yoğunluğu, pil tasarrufu, hafıza, izinler, kullanım (istek ve belirteç sayısı, son yanıt süresi) |

## Kabul testleri (şartname 10) – telefonda sizin yapacağınız

| No | Deneme | Beklenen |
|---|---|---|
| 1 | Uygulamayı aç | Yüz görünür, mavi |
| 2 | Mikrofona dokunup konuş | Yeşil, söylediğiniz yazı olarak çıkar |
| 3 | Soru sor | Mor (düşünüyor), sonra turkuaz ve sesli cevap |
| 5 | Cevabı dinle | Ağız kelimelerle hareket eder |
| 6 | "Bugün çok mutluyum" | Gülümseme, onay jesti |
| 8–9 | "Işığı aç" / "Işığı kapat" | Fener gerçekten yanar/söner |
| 10 | "Wi-Fi ayarlarını aç" | Wi-Fi paneli açılır; kapatınca robot gerçek durumu söyler |
| 11 | "Bluetooth ayarlarını aç" | Bluetooth ayarı açılır |
| 12 | "Sesi yüzde 50 yap" | Medya sesi %50 olur, sistem ses çubuğu görünür |
| 13 | Uçak modunu açıp soru sor | Kırmızı ışık + "İnternete bağlanamadım" |
| 14 | Uçak modunu kapatıp tekrar sor | Normal cevap |
| 15 | Uygulamayı kapatıp aç | Anahtar, model, hafıza ve ayarlar duruyor |

## Teknik

| Klasör | İçerik |
|---|---|
| `aurora-ai/app/www/` | Ekran: `index.html`, `css/aurora.css`, `js/face.js` (yüz), `js/state.js` (durum makinesi), `js/lipsync.js`, `js/voice.js` (ASR/TTS), `js/brain.js` (Claude), `js/device.js` (araçlar, hafıza), `js/app.js` (akış). `vendor/`: three.js 0.170 ve Anthropic TypeScript SDK 1.3.0 (tarayıcı paketi), internetsiz yüklenir |
| `aurora-ai/app/android/` | APK projesi (`com.bektas.aurora`, min Android 10, hedef API 34). `MainActivity` (WebView + WebViewAssetLoader), `AuroraBridge` (JS köprüsü), `SpeechController` (SpeechRecognizer + TextToSpeech, tr-TR), `DeviceControl` (fener, ses, paneller, pil, ağ, cihaz), `SecretStore` (Keystore AES-256-GCM) |
| `aurora-ai/app/test/` | 16 test (Gemini dahil): durum makinesi, Türkçe viseme, araç şemaları ve doğrulama, onay, köprü, hafıza, yanıt ayrıştırma, sahte sunucuyla tam Claude araç döngüsü, Türkçe hata mesajları |
| `aurora-ai/app/proxy/worker.js` | İsteğe bağlı Cloudflare Worker: gerçek anahtar sunucuda, telefonda yalnız uygulama belirteci |
| `.github/workflows/aurora-apk.yml` | Testler + APK derleme, `aurora-apk-latest` etiketi, GitHub Release |

Notlar:
- SDK 1.3.0 API sürümü `2026-10-21` ile ve anahtarı `Authorization: Bearer` başlığıyla gönderir (şartnamedeki `x-api-key` + `2023-06-01` eski biçimdir; SDK'nın güncel varsayılanı kullanıldı).
- Opus 5.5 / Sonnet 5.5 / Fable 5.1'de güvenlik süzgeci isteği reddederse sunucu tarafında otomatik yedek model devreye girer (`fallbacks: "default"`).
- Geçmişte düşünme blokları saklanmaz (yalnız metin); böylece geçmiş kısalınca ya da hafıza değişince istekler reddedilmez.
- Fener için CAMERA izni gerekmez (`setTorchMode`); FLASHLIGHT izni eklenmedi.

## Bu ortamda denenenler

- 12/12 Node testi geçti.
- Uygulama Chromium'da (telefon boyutu 412×900) açıldı; sahte Claude sunucusuyla: yazılı soru → Düşünüyor → `remember` aracı gerçekten çalıştı → `tool_result` gitti → JSON yanıt → Konuşuyor → Bekliyor. Konsol hatası yok.
- APK GitHub Actions'ta derlendi (derleme 2, testler geçti, `BUILD SUCCESSFUL`), Release: https://github.com/nuhbektas-max/bektas/releases/tag/aurora-v1.0-2. İmza anahtarı GitHub Secrets'ta olmadığı için geçici anahtarla imzalı. Gerçek telefonda deneme, Claude'a gerçek istek ve Türkçe ses motoru bu ortamda denenemedi; kabul testleri yukarıda.
