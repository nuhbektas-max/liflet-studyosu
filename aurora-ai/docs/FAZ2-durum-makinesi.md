# AURORA AI – FAZ 2: Temel robot ve durum makinesi

Tarih: 2026-11-02

## Alınan kararlar (kullanıcı: "hepsini yapalım")

- **Karakter:** kod karaktere bağlı değil. Şimdilik VHToolkit'in kendi karakteri sahnede kalır; robot modeli (CC4 ya da satın alınmış) gelince yalnızca model değişir. Robot gövdesindeki LED parçaları `StatusIndicator`'a Inspector'dan bağlanır.
- **TTS:** ElevenLabs ve Azure ikisi de seçilebilir kalır (VHToolkit ikisini de destekliyor; ayarlar ekranında seçim FAZ 6).
- **Anahtar:** hem kişisel test için şifreli anahtar girişi hem de ara sunucu (proxy) yolu yapılacak (FAZ 3 ve 6).
- **Test telefonu:** Android 14.

## Yeni dosyalar

| Dosya | Ne yapar |
|---|---|
| `Assets/Aurora/Scripts/Core/RobotState.cs` | 5 durum (Idle, Listening, Thinking, Speaking, Error), durum renkleri ve Türkçe adları |
| `Assets/Aurora/Scripts/Core/RobotStateMachine.cs` | Durum makinesi: girdilerden durumu seçer, izinli geçişleri uygular, aynı duruma tekrar girmez, hatada en az 3 sn kalır, izinsiz geçişte bekleme üzerinden geçer |
| `Assets/Aurora/Scripts/Core/ConversationTurnTracker.cs` | Konuşma turu: soru geldi mi, yanıt metni geldi mi, ses başladı mı; zaman aşımı (30 sn) ve gecikme ölçümü |
| `Assets/Aurora/Scripts/Behavior/RobotBehaviorController.cs` | Unity bileşeni. VHToolkit'in `DemoController` olaylarını ve karakterin sesini dinler, durum makinesini sürer; mikrofon, yazılı soru, konuşmayı durdurma, hata bildirme işlemleri; kullanıcı robotun sözünü keserse sesi durdurur |
| `Assets/Aurora/Scripts/UI/StatusIndicator.cs` | Durum ışığı: arayüzdeki ışık + yazı, robot LED'leri (Emission) ve renkli ışık. Düşünürken yavaş nabız, hatada yanıp sönme |
| `Assets/Aurora/Editor/AuroraSceneSetup.cs` | Menü **Aurora > Sahneye AURORA bileşenlerini ekle**: `AURORA_AI/Robot` ve `AURORA_AI/UI` nesnelerini kurar, bağlantıları kendisi yapar |
| `tests/Aurora.Core.Tests/` | Çekirdek kod için 23 birim testi (.NET 8, xUnit) |

Değiştirilen VHToolkit dosyası: **yok**.

Şartnamedeki durum geçişleri (`IDLE → LISTENING → THINKING → SPEAKING → IDLE`, her durumdan `ERROR`, `ERROR → IDLE`) aynen var. Gerçek kullanım için eklenen kısa yollar: yazılı soru (Idle → Thinking), karşılama konuşması (Idle → Speaking), vazgeçme (Listening/Thinking → Idle), söz kesme (Speaking → Listening), konuşurken yeni yazılı soru (Speaking → Thinking).

Göz kırpma, bakış, düşünürken gözün kayması ve dinlerken başın eğilmesi VHToolkit'in kendi bileşenlerinde (`BlinkController`, `GazeController`, `ThinkingController`, `ListeningController`) zaten çalışıyor; bunlara dokunulmadı. Duygu, jest ve nefes FAZ 4'te.

## Derleme ve test sonucu

- **Çekirdek kod** (`Scripts/Core`, UnityEngine kullanmaz): .NET 8'de C# 9 ile (Unity 6 derleyicisinin sürümü) uyarısız derlendi, **23/23 test geçti**:
  ```
  cd aurora-ai/tests && dotnet test Aurora.Core.Tests
  ```
- **Unity kodu** (`Behavior`, `UI`, `Editor`): Unity bu ortamda yok. Kullanılan her Unity ve VHToolkit API'sinin imzası kaynaktan alınıp taklit edildi, kod bu iskelete karşı hatasız derlendi. Bu, yazım hatası ve yanlış tür olmadığını gösterir, **Unity'de derlendiği anlamına gelmez**. Unity'de ilk açılışta Console'da hata olup olmadığına bakılmalı.
- Editörde Play testi ve telefon testi **yapılmadı**.

## Kurulum ve deneme (sizin bilgisayarınızda)

1. `aurora-ai/tools/kurulum-linux.sh` ya da `kurulum-windows.ps1` (FAZ 1).
2. Unity'de `Assets/Aurora/Scenes/AuroraMain` sahnesini açın.
3. Menü **Aurora > Sahneye AURORA bileşenlerini ekle**. Sahneyi kaydedin (Ctrl+S).
4. `Ride > Config...` menüsünden ASR, NLP ve TTS anahtarlarını girin.
5. Play'e basın ve kontrol edin:

| Deneme | Beklenen |
|---|---|
| Hiçbir şey yapmayın | Sağ üstte mavi ışık, "Bekliyor" |
| VHToolkit'in mikrofon düğmesiyle konuşun | Konuşurken yeşil "Dinliyor" |
| Konuşma bitince | Mor, yavaş nabız "Düşünüyor" |
| Robot konuşurken | Turkuaz "Konuşuyor" |
| Konuşma bitince | Mavi "Bekliyor" |
| İnterneti kesip soru sorun | Turuncu-kırmızı yanıp sönen "Hata", 3 sn sonra mavi |

6. Unity'nin `Assets/Aurora` altında oluşturduğu `.meta` dosyalarını bu depoya commit edin (bağlar bunlara dayanır).

## Bilinen sorunlar ve sınırlar

- **Mikrofon durumu:** VHToolkit'in mikrofon açık/kapalı bilgisi dışarıya kapalı (`protected`). Mikrofon AURORA düğmesiyle (`SetMicrophone`) açılınca "Dinliyor" doğru görünür. VHToolkit'in kendi mikrofon düğmesi kullanılırsa yalnızca kullanıcı konuşurken yeşil yanar. AURORA arayüzü FAZ 6'da gelince bu fark kalkar.
- **VHToolkit'in yazı kutusu:** VHToolkit'in kendi yazı kutusu `AskNLPQuestion`'ı doğrudan çağırıyor ve olay yaymıyor; oradan yazılan soruda "Düşünüyor" görünmez. AURORA'nın `SubmitText` yolu (`SubmitUserText`) olay yayar ve doğru çalışır. FAZ 6 arayüzü bu yolu kullanacak.
- **OpenAI Realtime ("Unified") modu:** Bu modda robotun sesi ayrı bir ses kaynağından çalıyor ve bu kaynak dışarıya kapalı, o yüzden "Konuşuyor" algılanmaz. AURORA klasik modda (ASR → Claude → TTS) çalışacak.
- **Hata metni:** RIDE'ın kendi Claude sağlayıcısı hatayı İngilizce cümle olarak döndürüyor; bu cümleler yakalanıp Hata durumuna çevriliyor ama robot o cümleyi İngilizce okuyabilir. Türkçe sesli hata açıklaması FAZ 3'teki AURORA sağlayıcısıyla gelecek.
- **ListeningController:** karakterin altında aranıyor, yoksa sahnede aranıyor. Yeri Unity'de doğrulanacak.
- **Robot modeli** hâlâ yok; LED efekti model gelince bağlanacak.

## Sonraki faz

FAZ 3: AURORA Claude sağlayıcısı (blok tabanlı mesajlar, yapılandırılmış yanıt, Tool Use döngüsü, iptal, yeniden deneme, kullanım sayacı, model seçimi), Türkçe kişilik istemi, Azure ASR `tr-TR`, kısa/uzun süreli hafıza. FAZ 3'e geçmeden önce yukarıdaki Play denemesinin sonucunu bildirmeniz iyi olur; Console'da hata çıkarsa önce o düzeltilir.
