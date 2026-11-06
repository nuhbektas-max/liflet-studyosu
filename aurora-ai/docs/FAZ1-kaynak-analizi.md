# AURORA AI – FAZ 1: Kaynak Kod Analizi ve Geliştirme Planı

Tarih: 2026-11-02
İncelenen sürüm: `USC-ICT/vhtoolkit` commit `a5a7af736864d3f55c0aae71034486cce4d61871` (31.10.2026), RIDE paketleri `USC-ICT/ride` commit `6daea6a891764eeede4f82cc73289d1d973b22e8` (30.10.2026). İkisi de `aurora-ai/vhtoolkit.lock` dosyasına sabitlendi.

Bu rapor kaynak koddan okunarak yazıldı. Unity bu ortamda kurulu değil; hiçbir şey Unity'de açılmadı, derlenmedi veya telefonda denenmedi. "Doğrulandı" denen her şey kaynak dosyada görüldü demektir, çalıştırıldı demek değildir.

---

## 1. Kısa sonuç

1. **Unity sürümü şartnameyle uyuşmuyor.** Proje Unity **6000.5.11f1** (Unity 6.5) istiyor, URP 17.5.0 kullanıyor. Unity 2022.3 LTS'ye geri inmek mümkün değil: URP 17, Addressables 2.9, RIDE paketleri ve CC araçları Unity 6 API'lerine bağlı. Öneri: **Unity 6000.5.11f1'de kalmak.** `runUnity.sh/.bat` bu sürümü Unity Hub ile kendisi indiriyor.
2. **Claude sağlayıcısı var** (`NlpSystemClaude`), ama Tool Use, yapılandırılmış yanıt (duygu/jest), iptal, akış, token sayacı ve yapılandırmadan model seçimi yok. Model kimlikleri koda gömülü bir `enum`'da. Bu sınıf bir git paketinin içinde (salt okunur), yerinde değiştirilemez. Bu yüzden aynı taban sınıftan (`NlpSystemUnity`) türeyen **yeni bir sağlayıcı** gerekiyor (gerekçe 6. bölümde).
3. **Android'de ASR seçeneği dar.** Yerleşik "Mobile" ASR modu kodda yorum satırı (kapalı). Android için kullanılabilir yol: **Azure Speech** (SDK'nın arm64 `.so` dosyaları pakette var) ya da **OpenAI Realtime**. Yerel Whisper (Faster-Whisper) bir Docker sunucusu istiyor, telefonda tek başına çalışmaz.
4. **Dudak senkronu var**, ama Türkçe için eksik. ElevenLabs'ın karakter zaman damgaları + İngilizce IPA sözlüğüyle FaceFX tarzı viseme üretiliyor. Sözlükte olmayan Türkçe kelimeler için harf→viseme eşlemesi yazılmalı (Türkçe yazıldığı gibi okunduğu için bu güvenilir bir yol).
5. **Davranış motorunun çoğu zaten var.** Göz kırpma, sakkad, bakış, kafa, düşünme, dinleme, yüz animasyonu oynatıcısı, NVBG (otomatik jest üretici) ve BML zamanlaması hazır. Şartnamedeki `BlinkController`, `EyeGazeController`, `LipSyncController` gibi sınıflar **yeniden yazılmamalı**; AURORA katmanı bunları yöneten bir durum makinesi olmalı.
6. **SmartBody yok.** Güncel VHToolkit Mecanim tabanlı; SmartBody kodu depoda bulunmuyor. Şartnamedeki "SmartBody entegrasyonu" maddesi bu sürüme uygulanamaz.
7. **Robot karakteri yok.** Depodaki karakterler Reallusion Character Creator insan karakterleri. Robot görünümlü, humanoid rig'li, yüz BlendShape'li bir model gerekiyor. **Bu bir duraklama noktası** (10. bölüm).
8. **Lisans:** VHToolkit USC-RL v3.0 lisanslı: akademik ve kişisel kullanım serbest; ticari kullanım için USC-ICT ile görüşmek gerekiyor.

---

## 2. Depo yapısı

| Klasör | İçerik | AURORA için |
|---|---|---|
| `VHUnityURP` | Ana Unity projesi (URP). Sahne: `Assets/Scenes/SampleScene.unity` | **Temel proje** |
| `VHUnityHDRP` | Masaüstü için HDRP sürümü | Kullanılmaz (mobilde HDRP yok) |
| `VHUnityURP-Assets`, `VHUnityHDRP-Assets` | Yeni CC karakteri hazırlama projeleri | Robot karakteri CC'den gelirse kullanılır |
| `VHUnityAR` | Quest 3 projesi | Kullanılmaz |
| `RideServices` (submodule → `USC-ICT/ride-services`) | Yerel AI servisleri için Docker | Yalnızca yerel Whisper/Piper istenirse |

Toplam 16.715 dosya, `VHUnityURP` altında 2.295. Sanat dosyaları Git LFS'te.

`VHUnityURP/Assets` içinde: `VHShared` (demo denetleyicisi, hata ayıklama menüleri, karakter profili, istemler), `VHSharedCCAssets`, `VHSharedInternal` (`RideConfigSetKeys`), `Reallusion` (CC araçları 2.2.6), `TextMesh Pro`, `SampleSceneAssets`, `Settings`, `StreamingAssets`. **`Assets/Plugins/Android` yok**: yeni Android eklentisi hiçbir şeyle çakışmaz.

## 3. Paket bağımlılıkları (`VHUnityURP/Packages/manifest.json`)

| Paket | Sürüm |
|---|---|
| com.unity.render-pipelines.universal | 17.5.0 |
| com.unity.addressables | 2.9.1 |
| com.unity.nuget.newtonsoft-json | 3.2.2 (JSON için bu kullanılacak) |
| com.unity.timeline | 1.8.13 |
| com.unity.ugui | 2.5.0 |
| com.soupday.cc3_unity_tools | git #2.2.7 |
| com.unity.ai.assistant | 2.21.0-pre.2 (ön sürüm) |
| com.unity.pipeline | 0.9.1-exp.1 (deneysel) |
| edu.usc.ict.ride.* (abstract, core, core.ui, cognition, vh, vendor.*) | git, `USC-ICT/ride` @ `6daea6a` |
| com.unity.modules.androidjni | 1.0.0 (JNI için gerekli, zaten var) |

İki ön sürüm/deneysel paket (`ai.assistant`, `pipeline`) Android derlemesinde sorun çıkarırsa ilk şüpheliler bunlar; FAZ 7'de derleme sırasında bakılacak.

## 4. Android oyuncu ayarları (`ProjectSettings.asset`)

| Ayar | Mevcut değer | Değerlendirme |
|---|---|---|
| Uygulama kimliği | `edu.usc.ict.ridevh` | AURORA için değişmeli (öneri: `com.bektas.aurora`) |
| Scripting backend | IL2CPP | Şartnameye uygun |
| Mimari | ARM64 | Şartnameye uygun |
| Min SDK | 29 (Android 10) | Uygun; Wi-Fi paneli (`Settings.Panel`) 29'dan beri var |
| Target SDK | 33 | **Google Play için düşük.** Play şu an en az 35 istiyor; güncel şart Play Console'dan teyit edilecek |
| API uyumluluğu | .NET Standard 2.1 / .NET Framework seviyesi 6 | — |
| Tanımlı semboller | `RIDEVH_URP;USE_INPUT_SYSTEM_POSE_CONTROL;USE_STICK_CONTROL_THUMBSTICKS` | Korunacak |
| Sürüm | 0.1.0 | AURORA 0.1.0'dan başlar |

## 5. RIDE mimarisi

- **Servis bulucu:** `Systems.Get<T>()`. Her sağlayıcı `RideSystemMonoBehaviour`'dan türer ve sahnedeki "Ride/Systems" nesnelerinde durur (sahnede `ASR`, `NLP`, `TTS`, `Lipsync`, `Face`, `Gaze`, `Animation`, `Sensing`, `Timeline`, `MicrophoneAudioSystem` nesneleri görüldü).
- **Arayüzler** (`edu.usc.ict.ride.abstract`): `INlpSystem` (`Request(NlpRequest, Action<NlpResponse>)`, `SetSystemPrompt`), `ISpeechRecognitionSystem`, `ITextToSpeechSystem`, `ILipsyncedTextToSpeechSystem`, `ILipsyncMapper`, `INonverbalGeneratorSystem`, `INlpSentimentSystem`, `ISensingEmotionSystem`.
- **Yapılandırma:** `ConfigurationSystemUnity`, `RideConfig`'i `persistentDataPath/config/ride.json` dosyasına **düz metin** olarak yazar. Anthropic ayarı `config.anthropic.endpoint` (varsayılan `https://api.anthropic.com/v1/messages`) ve `config.anthropic.endpointKey`. Editörde `Ride > Config...` menüsünden girilir.
- **Montaj (assembly) yapısı:** RIDE paketleri asmdef'li (`USC-ICT.Ride.Abstract`, `.Core`, `.Cognition`, `.VH`, `.Vendor.VHAssets` …). Ama `Assets/VHShared` (demo denetleyicisi) **asmdef'siz**, yani `Assembly-CSharp` içinde. Bir asmdef `Assembly-CSharp`'a başvuramaz. Bu yüzden `DemoControllerBase`'i genişletecek AURORA kodu da **asmdef'siz** (`Assembly-CSharp` içinde) yazılmalı. Bu, FAZ 1'in en önemli yapısal bulgusu.

## 6. Konuşma döngüsü (`DemoControllerBase`, 2.021 satır)

Klasik akış (kaynakta doğrulandı):

```
ASR.SpeechRecognized → OnSpeechRecognized(text)
  → AskNLPQuestion(text)
       StopUtterance(); ThinkingController.StartThinkingBehavior(true)
       m_classicPipelineGeneration++   ← araya giren konuşma eski yanıtı geçersiz kılar
       DetectLanguageForUserText(...)
       m_currentLLM.Request(new NlpRequest(q), QuestionResponse)
  → QuestionResponse → SendResponse → OnNlpResponseReceived(text)
       TrimToSpokenLength; UI'ya yaz; CreateTTS(text)
  → TTS.CreateTextToSpeech(voice, text, (lipsyncXML, audioPath) => OnTtsGenerated)
  → GenerateNonverbalBehavior (NVBG → BML)
  → PlayUtterance(nvbgResult)  (ses + viseme + jestler aynı zamanlamayla)
```

Kesme (barge-in) için temel hazır: `StopUtterance()` ve "generation" sayacı. Ayrıca OpenAI Realtime ile "Unified" konuşma modu var.

Seçilebilir sağlayıcılar `enum`'larla:
- `AsrMode`: Azure, Windows, Mobile (**kapalı**), AzureWebGL, OpenAI, FasterWhisper, Gemini
- `NlpMode`: ChatGPT, **Claude**, AwsLex, Rasa, VLLM, Gemini, Ollama
- `TtsMode`: Polly, ElevenLabs, Piper, Kokoro, XTTS, Gemini

Varsayılanlar: ASR OpenAI, NLP ChatGPT, TTS ElevenLabs. `ChangeNlp(NlpMode)`, `ChangeASR`, `ChangeTts` public; `m_currentLLM` public alan (`NlpSystemUnity` türünde). Yani `NlpSystemUnity`'den türeyen yeni bir sağlayıcı `m_currentLLM`'e atanarak mevcut döngüye bozmadan takılabilir.

## 7. Mevcut Anthropic sağlayıcısı: `NlpSystemClaude`

Konum: `edu.usc.ict.ride.cognition/Runtime/Nlp/NlpSystemClaude.cs` (git paketi, Unity'de `Library/PackageCache` altında, salt okunur).

| Şartname maddesi | NlpSystemClaude'da | Not |
|---|---|---|
| Messages API, `anthropic-version: 2023-06-01`, `x-api-key` | Var | |
| UnityWebRequest | Var | `await Task.Yield()` döngüsüyle |
| Zaman aşımı | Var (20 sn, Inspector'dan) | |
| HTTP hata yönetimi | Kısmen | Hata metni İngilizce olarak konuşturuluyor; 429/529 için yeniden deneme yok |
| JSON kütüphanesi | Var (`RideIO.JsonSerialize`, Newtonsoft) | Elle JSON yok |
| Konuşma geçmişi | Var (`m_interactionHistory`) | Yalnızca metin |
| Sistem istemi | Var (`SetSystemPrompt`) | |
| Yanıt süresi ölçümü | Var (`ResponseTime`) | |
| Model seçimi | **Kodda sabit enum** | `claude-fable-5`, `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`; varsayılan Haiku 4.5. Yapılandırmadan değiştirilemez, yeni model eklemek paket değişikliği ister |
| Tool Use | **Yok** | Mesaj içeriği `string`; `tool_use`/`tool_result` blokları taşınamaz |
| Yapılandırılmış yanıt (duygu, jest, yoğunluk, bakış) | **Yok** | Yalnızca `content[0].text` okunuyor |
| İptal edilebilir istek | **Yok** | `CancellationToken` yok |
| Token/kullanım takibi | **Yok** | `usage` ayrıştırılıyor ama kullanılmıyor |
| Ağ kesintisi yönetimi | Kısmen | Hata konuşturuluyor; yeniden bağlanma/kuyruk yok |
| Güvenlik süzgeci | Var (taban sınıfta `ConversationGuardPipeline`) | Korunacak |
| Bilgi tabanı (RAG) | Var (`KnowledgeAugmentation`) | Korunacak |
| WebGL için proxy | Var (`anthropicProxyEndpoint`) | Android için de aynı fikir kullanılacak |

**Neden yeni sınıf:** Tool Use, mesaj içeriğinin `[{type:"text"}, {type:"tool_use"}, {type:"tool_result"}]` blok dizisi olmasını ister. `NlpSystemClaude`'un iç sınıfları (`ClaudeMessage.content : string`), model sözlüğü ve geçmiş ayrıştırıcısı `private`; alt sınıftan değiştirilemez, paket de salt okunur. Bu yüzden şartnamedeki "mevcut sistem ihtiyacı karşılamıyor" koşulu kaynakla kanıtlanmış oluyor.

**Karar:** `AuroraClaudeNlpSystem : NlpSystemUnity` (FAZ 3). Taban sınıfın `Request()` akışı (güvenlik süzgeci + bilgi ekleme) aynen kalır, yalnızca `RequestInternal` yeniden yazılır. Uç nokta ve anahtar yine `config.anthropic`'ten okunur; böylece `Ride > Config...` ekranı ve `ride.json` aynen çalışır. Model kimliği serbest metin (Inspector + ayarlar ekranı), varsayılan güncel bir model; API "model bulunamadı" dönerse kullanıcıya liste sunulur. Mevcut `NlpSystemClaude` silinmez, `NlpMode.Claude` ile çalışmaya devam eder.

## 8. Ses tanıma (ASR) ve ses üretimi (TTS)

**ASR – Android durumu:**
- `SpeechRecognitionSystemAzure`: `#if UNITY_ANDROID` mikrofon izni kodu var; Speech SDK'nın `arm64-v8a` kütüphaneleri pakette. Dil otomatik algılama listesi var (Türkçe eklenmeli, `tr-TR`). **Android için önerilen yol.**
- `SpeechRecognitionSystemOpenAI` (Realtime, WebSocket): Android'de çalışması beklenir, telefonda doğrulanacak.
- `FasterWhisper`: `RideServices` Docker sunucusu ister; telefonun kendi içinde değil.
- `Windows`: yalnızca Windows. `Mobile`: kapalı; README "mobil yerel ASR üçüncü taraf Unity paketi ister" diyor.

**TTS:** ElevenLabs, Azure, Polly, Piper, Kokoro, XTTS, Gemini. ElevenLabs karakter zaman damgası döndürüyor; `TextToSpeechSystemElevenLabs` bunları kelime/ses parçalarına ayırıp **FaceFX tarzı viseme XML** üretiyor (`TextToSpeechSystemLipsynced` taban sınıfında viseme budama ve gruplama da var). Fonem karşılığı `IpaDictionary` (kelime→IPA TSV) ile bulunuyor; varsayılan sözlük İngilizce.

**Türkçe dudak senkronu:** Sözlükte olmayan Türkçe kelimeler için RIDE'ın davranışı Unity'de denenmeli. Türkçe ses-harf ilişkisi düzenli olduğu için (ç, ş, ğ, ı, ö, ü dahil) **harften viseme'ye kural tabanlı eşleyici** FAZ 4'te yazılacak ve `ILipsyncMapper`/IPA yoluna bağlanacak. Şartnamedeki 15'li viseme kümesi (sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, I, O, U) Oculus/ARKit adlandırması; karakter FaceFX/CC viseme adları kullanıyor, araya bir eşleme tablosu (`VisemeMapper`) girecek. Zamanlama zaten ses dosyasının zaman çizelgesine bağlı (kare hızına değil).

Azure Neural TTS de viseme olayı veriyor; ama RIDE'ın Azure TTS sınıfının viseme'leri kullanıp kullanmadığı FAZ 4'te kontrol edilecek.

## 9. Davranış ve animasyon (mevcut bileşenler)

`edu.usc.ict.ride.vendor.vhassets/Runtime/VHAssets/Mecanim/` ve `edu.usc.ict.ride.vh/Runtime/` altında:

| Şartnamedeki bileşen | VHToolkit'te karşılığı | Yapılacak |
|---|---|---|
| BlinkController | `BlinkController`, `BlinkExampleBasedController`, `EyelidController_BlendShapes` | Yeniden kullan |
| EyeGazeController / EyeController | `EyeController`, `GazeController_IK`, `GazeController_LookAt`, `SaccadeController`, `BlendshapeSaccadeController` | Yeniden kullan |
| Baş hareketi | `HeadController` | Yeniden kullan |
| FacialExpressionController | `FacialAnimationPlayer_BlendShape` / `_Animator` | Duygu → yüz ifadesi eşlemesi eklenecek |
| Thinking durumu | `ThinkingController.StartThinkingBehavior/StopThinkingBehavior` | Yeniden kullan |
| Listening durumu | `ListeningController.StartListening(MicrophoneAudioSystem, eşik)/StopListening` | Yeniden kullan |
| GestureController / BML | `NonverbalBehaviorGeneratorSystem` (NVBG) + `MecanimCharacter` + BML zamanlaması | Claude'un jest alanı BML'e çevrilip NVBG çıktısına eklenecek |
| LipSyncController | TTS viseme XML + `MecanimCharacter` | Türkçe eşleyici eklenecek |
| BreathingController | **Yok** (bekleme animasyonuna gömülü) | Yeni: göğüs/omuz için hafif ek katman (FAZ 4) |
| EmotionController (9 duygu) | **Yok** (yalnızca kameradan duygu algılama arayüzü `ISensingEmotionSystem` var) | Yeni (FAZ 4) |
| RobotStateMachine (IDLE/LISTENING/THINKING/SPEAKING/ERROR) | Durumlar dağınık: `IsListening`, `IsThinking`, `IsCharacterSpeaking()` | Yeni: bunları tek yerde toplayan, sahibi olmayan bir izleyici-yönetici (FAZ 2) |
| SmartBody | **Yok** | Uygulanamaz |

NVBG dil desteği (`NvbgLanguageRouting`): İngilizce + İspanyolca, Fransızca, Felemenkçe, Almanca, İtalyanca, Portekizce anahtar kelime haritaları. **Türkçe yok.** NVBG'nin cümle ayrıştırıcısı (BLLIP) İngilizce model kullanıyor. Bu yüzden Türkçe yanıtlarda jest ve duygu bilgisi NVBG'nin metin analizinden değil, **Claude'un yapılandırılmış yanıtından** (`emotion`, `gesture`, `intensity`, `gaze`) gelecek. Şartnamenin istediği de bu.

Mevcut BML jest adları ve karakterin animasyon kütüphanesi (`GenericMaleAdultGestureMap.cs`, `AnimationData.cs`) FAZ 2'de Unity'de okunup "jest adı" listesi buradan çıkarılacak; Claude'a yalnızca gerçekten var olan jest adları verilecek.

## 10. Duraklama noktaları (kullanıcıdan gereken)

Şartnamenin "eksik bileşeni varmış gibi kabul etme" kuralı gereği şunlar olmadan ilgili faz başlamaz:

| # | Eksik | Hangi faz | Seçenekler |
|---|---|---|---|
| 1 | **Robot karakteri** (humanoid rig, göz kemikleri, çene/dudak ve en az 8 ifade BlendShape'i, mobil lisanslı) | FAZ 2 | a) Character Creator 4 ile robot görünümlü karakter (CC4 lisansı gerekir) b) Hazır satın alınmış robot modeli (mobil kullanım lisansı kontrol edilir) c) Geçici olarak depodaki CC insan karakteriyle başlamak, robot sonra |
| 2 | **Unity 6000.5.11f1 + Android Build Support** kurulu bir bilgisayar | Her faz | Bu bulut ortamında Unity yok. Derleme ya sizin bilgisayarınızda ya da Unity lisanslı bir GitHub Actions iş akışında (GameCI, `UNITY_LICENSE` sırrı) yapılır |
| 3 | **ASR sağlayıcısı ve hesabı** | FAZ 3 | Önerilen: Azure Speech (`tr-TR`, Android'de çalışan SDK pakette) |
| 4 | **TTS sağlayıcısı ve hesabı** | FAZ 3–4 | ElevenLabs (zaman damgası + mevcut dudak senkronu) ya da Azure Neural TTS (`tr-TR` sesleri) |
| 5 | **Anthropic API erişimi** | FAZ 3 | Anahtar uygulamaya gömülmeyecek (aşağıya bakın) |
| 6 | **Backend proxy nerede barınacak** | FAZ 3 | Örn. Cloudflare Workers / küçük bir sunucu. Kişisel test için doğrudan anahtar `ride.json`'a girilebilir (riskleri 11. bölümde) |
| 7 | ~~Gerçek Android telefon~~ | FAZ 5–7 | **Var (2026-11-02): Android 14 (API 34).** Min SDK 29 ile uyumlu; Bluetooth için Android 12+ izinleri (BLUETOOTH_CONNECT) geçerli, Wi-Fi yalnızca panelle. Telefonda Geliştirici seçenekleri > USB hata ayıklama açılmalı |
| 8 | ~~Kullanım amacı~~ | — | **Karar (2026-11-02): kişisel kullanım.** USC-RL v3.0 bunu serbest bırakıyor; APK Google Play'de satılmayacak/ticari dağıtılmayacak. Ticariye geçilirse USC-ICT lisansı gerekir |

## 11. Güvenlik notları

- RIDE anahtarları `ride.json` içinde **düz metin** saklıyor. Android'de bu dosya uygulamanın özel klasöründe ama şifresiz; root'lu cihazda ya da yedekten okunabilir.
- Üretim için yol: `config.anthropic.endpoint` bir **proxy** adresine çevrilir, anahtar proxy'de durur, cihazda yalnızca proxy'nin verdiği kısa ömürlü bir oturum belirteci olur. RIDE bunu WebGL için zaten yapıyor (`anthropicProxyEndpoint`); Android'e aynı desen uygulanacak.
- Kişisel test modu: anahtar ayarlar ekranından girilir, Android Keystore ile şifrelenmiş olarak saklanır (FAZ 6), APK'ya hiç girmez. Risk: telefonu ele geçiren anahtarı kullanabilir; harcama sınırı konmalı.
- Mikrofon yalnızca düğmeye basınca açılır; arka planda dinleme yok.

## 12. Geliştirme planı

AURORA kodu bu depoda `aurora-ai/Assets/Aurora/` altında durur. VHToolkit ayrı klonlanır (çok büyük, LFS'li; bu depoya girmez) ve kurulum betiği `Assets/Aurora`'yı klonun `VHUnityURP/Assets/Aurora` klasörüne bağlar. VHToolkit dosyalarına dokunulmaz; klonda `aurora` dalı açılır, orijinal sürüm git geçmişinde yedek olarak kalır. Sahne: `SampleScene` kopyası `Assets/Aurora/Scenes/AuroraMain.unity`.

Dosya yerleşimi (şartnamedeki yapı, mevcut bileşenlere göre sadeleştirilmiş):

```
aurora-ai/Assets/Aurora/            (asmdef yok → Assembly-CSharp, DemoControllerBase'e erişir)
  Scenes/AuroraMain.unity
  Scripts/Core/       AuroraController.cs (DemoController'dan türer, AURORA akışı)
  Scripts/Behavior/   RobotStateMachine.cs, RobotBehaviorController.cs, EmotionController.cs,
                      BreathingController.cs, AuroraBmlBuilder.cs, VisemeMapper.cs,
                      TurkishVisemeMapper.cs
  Scripts/AI/         AuroraClaudeNlpSystem.cs, AuroraResponse.cs, ClaudeResponseParser.cs,
                      ClaudeToolDispatcher.cs, ToolDefinitions.cs, MemoryManager.cs,
                      AIConfiguration.cs, AuroraPersona.cs
  Scripts/Android/    AndroidHardwareBridge.cs, AndroidPermissionManager.cs,
                      DeviceControlSkill.cs (+ skill başına bir sınıf), DeviceOperationResult.cs
  Scripts/UI/         AuroraMainUI.cs, StatusIndicator.cs, SettingsPanel.cs
  Plugins/Android/aurora.androidlib/  AndroidManifest.xml, build.gradle,
                      src/main/java/com/aurora/assistant/AuroraAndroidBridge.java
  Tests/EditMode/     ayrıştırıcı, araç doğrulama, viseme eşleme testleri (asmdef'li ayrı test montajı)
```

Şartnamedeki `FaceController`, `EyeController`, `BlinkController`, `GestureController`, `LipSyncController` ayrı sınıf olarak **yazılmayacak**: aynı işi yapan VHToolkit bileşenleri (9. bölüm) kullanılacak. `ConversationManager`, `SpeechRecognitionManager`, `SpeechSynthesisManager` da yazılmayacak: bu iş `DemoControllerBase`'de var; `AuroraController` onu genişletecek.

| Faz | İş | Teslim ölçütü |
|---|---|---|
| FAZ 1 (bu belge) | Analiz, sürüm kilidi, kurulum betikleri (Linux/Windows) | Betikler klonlar, `aurora` dalını açar, Aurora klasörünü bağlar, sahneyi kopyalar |
| FAZ 2 | Robotu sahneye bağla; `RobotStateMachine` mevcut `IsListening/IsThinking/IsCharacterSpeaking` sinyallerinden 5 durumu üretir; durum ışığı | Editörde Play: durum geçişleri ve ışık renkleri doğru |
| FAZ 3 | `AuroraClaudeNlpSystem`: blok tabanlı mesajlar, yapılandırılmış yanıt (JSON şema), Tool Use döngüsü, iptal, yeniden deneme, kullanım sayacı, model seçimi; Türkçe kişilik istemi; Azure ASR `tr-TR`; hafıza (kısa/uzun, silme) | Editörde Türkçe konuşma; araç çağrısı → gerçek sonuç → Claude yanıtı |
| FAZ 4 | Duygu → yüz ifadesi (9 duygu), jest → BML, nefes, Türkçe viseme eşleyici | Test sahnesinde her duygu ve viseme gözle denetlenir; eşleyici için birim testi |
| FAZ 5 | Java eklentisi + C# köprüsü: flaş, ses (medya/zil/alarm), Wi-Fi ve Bluetooth paneli + durum doğrulama, pil, cihaz bilgisi; çalışma zamanı izinleri | Gerçek telefonda kabul testleri 8–12 |
| FAZ 6 | Koyu neon arayüz (robot %75), ayarlar, şifreli ayar saklama | Testler 1, 15 |
| FAZ 7 | ARM64 APK, target SDK yükseltme, performans ölçümü, rapor | 15 kabul testinin hepsi telefonda |

Her fazın sonunda değişen/yeni dosyalar, derleme sonucu, test sonucu ve bilinen sorunlar `aurora-ai/docs/FAZn-*.md` olarak yazılır.

## 13. Bu fazda üretilen dosyalar

| Dosya | Ne yapar | Denendi mi |
|---|---|---|
| `aurora-ai/vhtoolkit.lock` | VHToolkit commit'i, Unity sürümü, RIDE commit'i | — |
| `aurora-ai/tools/kurulum-linux.sh` | Linux/macOS kurulumu (7 adım) | Sahte bir yerel depoyla iki kez çalıştırıldı (ilk kurulum + tekrar). Gerçek VHToolkit klonu ve LFS indirmesi bu ortamda denenmedi (depo çok büyük) |
| `aurora-ai/tools/kurulum-windows.ps1` | Windows kurulumu (aynı 7 adım, junction ile bağ) | **Denenmedi** (bu ortamda PowerShell yok). İlk çalıştırmada çıktıyı kontrol edin |
| `aurora-ai/docs/FAZ1-kaynak-analizi.md` | Bu rapor | — |

Unity sembolik bağlı klasörleri içe aktarır ama editörde "symlink" uyarısı verebilir; sorun çıkarsa `Assets/Aurora` bağ yerine kopya olarak tutulup değişiklikler bu depoya geri kopyalanabilir.

## 14. Kurulum (özet)

Linux / macOS:

```bash
sudo apt install git git-lfs          # macOS: brew install git git-lfs
git clone <bu depo> && cd bektas
aurora-ai/tools/kurulum-linux.sh      # varsayılan hedef ~/AuroraAI/vhtoolkit
~/AuroraAI/vhtoolkit/VHUnityURP/runUnity.sh
```

Windows (PowerShell):

```powershell
winget install Git.Git
git clone <bu depo>; cd bektas
powershell -ExecutionPolicy Bypass -File aurora-ai\tools\kurulum-windows.ps1
& "$env:USERPROFILE\AuroraAI\vhtoolkit\VHUnityURP\runUnity.bat"
```

Unity Hub'da 6000.5.11f1 kurulurken **Android Build Support**, **Android SDK & NDK Tools** ve **OpenJDK** modülleri seçilmeli. Unity açılınca `Assets/Aurora/Scenes/AuroraMain` sahnesi açılır, anahtarlar `Ride > Config...` menüsünden girilir.
