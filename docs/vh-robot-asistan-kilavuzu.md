# Canlı 3D Robot Asistan: Unity + Claude + Android Kılavuzu

Hedef: Android (ARM64) cihazda çalışan, Claude ile düşünen, konuşurken dudak/göz/jest sergileyen, sesli komutla Flaş, Wi-Fi, Bluetooth ve ses seviyesini yöneten 3D asistan.

## 0. Önce bilmen gerekenler (dürüst notlar)

1. **VHToolkit / RIDE yolları doğrulanmadı.** İstekte geçen `Assets/RIDE/Scripts/Systems/NLP/`, `ISpeechSystem`, `RideConfig`, `VHUnityURP` sahnesi ve `SendBML` çağrısını bu ortamdan görüp doğrulayamadım. Bilgime göre SmartBody çekirdeği masaüstü (Windows/Linux/Mac) için C++ ve Android ARM64 derlemesi resmi olarak desteklenen bir yol değil. Bu yüzden kodun tamamı **VHToolkit'ten bağımsız** yazıldı: Mecanim Animator + BlendShape ile çalışır. VHToolkit'in BML gönderme fonksiyonu varsa `RobotBehaviorController.ExternalBmlSender` temsilcisine bağlarsın (Adım 2). Repo yollarını klonlayınca kendin teyit etmelisin.
2. **Model adı.** İstekteki `claude-3-5-sonnet-20241022` eski bir model. Kodda model adı ayarlardan girilir; varsayılan `claude-sonnet-5-5`.
3. **API anahtarı APK içinde güvenli değildir.** Şifreli saklamak anahtarı telefona kök erişimi olan birinden korumaz. Yayın yapacaksan istekleri kendi küçük sunucundan (proxy) geçir. Bu kılavuz kişisel kullanım içindir.
4. **Android kısıtları.** Android 10+ uygulamaların Wi-Fi'yi kendi başına açıp kapatmasına izin vermez; `Settings.Panel.ACTION_WIFI` paneli açılır, kullanıcı dokunur. Bluetooth için de ayar ekranı açılır. `CAMERA` izni flaş için gerekmez (`setTorchMode` izin istemez); eklenmedi. `FLASHLIGHT` ve `CHANGE_WIFI_STATE` eski ve etkisizdir; eklenmedi.
5. **Dudak senkronu.** Azure'un REST API'si viseme vermez (yalnızca SDK verir). ElevenLabs `with-timestamps` uç noktası harf zamanlarını verir; kod bunu viseme'e çevirir. Zaman bilgisi gelmezse ses genliğiyle çene oynatılır.
6. Kodlar derlenip cihazda denenmedi; ben burada Unity çalıştıramıyorum. İlk derlemede küçük düzeltmeler çıkabilir.

## Mimari

```
Mikrofon → SpeechBridge.java (Android SpeechRecognizer) → RobotOrchestrator
        → ClaudeNLPService (tools) ⇄ DeviceControlSkill → AndroidHardwareBridge → DeviceBridge.java
        → ElevenLabsTts (ses + harf zamanları) → VisemeLipSync + RobotBehaviorController (BML etiketleri)
```

ASR olarak Android'in kendi `SpeechRecognizer`'ı kullanıldı (anahtar gerekmez, Türkçe çalışır). Google/Azure/Whisper istenirse `SpeechBridge` yerine aynı `OnStt*` olaylarını üreten başka bir sınıf konur.

---

## Adım 1: Ortam ve sahne

### 1.1 Araçlar

```bash
git lfs install
git clone <VHToolkit deposunun adresi>        # adresi kendin doğrula
cd vhtoolkit && git lfs pull

# Unity Hub komut satırı (Windows örneği; changeset numarasını unity.com/releases/editor/archive'den al)
"C:\Program Files\Unity Hub\Unity Hub.exe" -- --headless install ^
  --version 2022.3.<son-sürüm> --changeset <changeset> ^
  -m android android-sdk-ndk-tools android-open-jdk
```

Unity Hub'dan elle de kurulur: 2022.3 LTS, modüller **Android Build Support + OpenJDK + Android SDK & NDK Tools + IL2CPP**.

### 1.2 Proje

Yeni bir **3D (URP)** proje aç (VHToolkit'in sahnesi Android'de çalışmazsa karakter modelini ve materyalleri buradan alıp yeni projeye taşı). `Packages/manifest.json` içine ekle:

```json
"com.unity.nuget.newtonsoft-json": "3.2.1"
```

Klasörler: `Assets/Robot/Scripts`, `Assets/Plugins/Android`.

### 1.3 Karakter

- Humanoid rig'li model (VHToolkit karakteri ya da Reallusion CC4). Import ayarı: Rig → Humanoid. Yüz mesh'inde ARKit tarzı blendshape'ler olmalı (`jawOpen`, `mouthFunnel`, `mouthClose`, `mouthRollLower`, `mouthStretchLeft/Right`, `eyeBlinkLeft/Right`, `mouthSmileLeft/Right`, `browInnerUp`, `eyeWideLeft/Right`). CC4'te "ExPlus/ARKit" blendshape seti ile dışa aktar.
- Karakter nesnesine **Animator** ve (aynı nesneye) `RobotBehaviorController` ekle.
- Animator Controller:
  - Katman 0 (Base): durumlar `Idle`, `Listening`, `Thinking`, `Speaking`; her birine bir döngü klibi (Mixamo'dan Idle, Listening/Idle varyantı, Thinking, Talking). Aralarına geçişi kod yapar (`CrossFadeInFixedTime`), geçiş oku çizmene gerek yok.
  - Katman 1 `Gesture` (Weight 1, üst beden Avatar Mask, **IK Pass açık**): boş `Empty` varsayılan durumu ve durumlar `G_nod`, `G_headtilt`, `G_shrug`, `G_wave`, `G_point`, `G_chin`. Her biri tek seferlik klip, sonu `Empty`'ye çıkış geçişi (Has Exit Time).
  - Eksik klip varsa ilgili durum boş bırakılır; kod çökmez, jest sadece görünmez.
- Sahnede kamera nesnesi `Main Camera`. Göz teması hedefi olarak kullanılır.

---

## Adım 2: Canlılık motoru

### 2.1 `Assets/Robot/Scripts/BmlTagParser.cs`

```csharp
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;

public struct BmlCue
{
    public string Gesture;   // nod, headtilt, shrug, wave, point, chin
    public string Emotion;   // happy, curious, alert, witty, neutral
    public string Gaze;      // camera, away, up
    public int CharIndex;    // temiz metindeki konum
}

public static class BmlTagParser
{
    static readonly Regex AnyTag = new Regex(@"<([^<>]*=[^<>]*)>|\[(happy|curious|alert|witty|neutral)\]",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    static readonly Regex Attr = new Regex("(\\w+)\\s*=\\s*\"([^\"]*)\"", RegexOptions.Compiled);

    /// <summary>Etiketleri ayıklar; temiz metni ve etiketlerin metindeki konumunu döndürür.</summary>
    public static string Parse(string raw, List<BmlCue> cues)
    {
        var sb = new StringBuilder();
        int last = 0;
        foreach (Match m in AnyTag.Matches(raw))
        {
            sb.Append(raw, last, m.Index - last);
            last = m.Index + m.Length;
            var cue = new BmlCue { CharIndex = sb.Length };
            if (m.Groups[2].Success) cue.Emotion = m.Groups[2].Value.ToLowerInvariant();
            else
            {
                foreach (Match a in Attr.Matches(m.Groups[1].Value))
                {
                    string k = a.Groups[1].Value.ToLowerInvariant(), v = a.Groups[2].Value.ToLowerInvariant();
                    if (k == "gesture") cue.Gesture = v;
                    else if (k == "emotion") cue.Emotion = v;
                    else if (k == "gaze") cue.Gaze = v;
                }
            }
            cues.Add(cue);
        }
        sb.Append(raw, last, raw.Length - last);
        return Regex.Replace(sb.ToString(), @"\s{2,}", " ").Trim();
    }

    /// <summary>Etiketi BML metnine çevirir (VHToolkit/SmartBody tarafına göndermek için).</summary>
    public static string ToBml(BmlCue c)
    {
        var sb = new StringBuilder("<bml>");
        if (!string.IsNullOrEmpty(c.Gesture))
        {
            switch (c.Gesture)
            {
                case "nod": sb.Append("<head type=\"NOD\" repeats=\"2\"/>"); break;
                case "headtilt": sb.Append("<head type=\"TILT\"/>"); break;
                default: sb.Append("<gesture lexeme=\"" + c.Gesture + "\"/>"); break;
            }
        }
        if (!string.IsNullOrEmpty(c.Gaze)) sb.Append("<gaze target=\"" + c.Gaze + "\"/>");
        if (!string.IsNullOrEmpty(c.Emotion)) sb.Append("<face type=\"facs\" emotion=\"" + c.Emotion + "\"/>");
        return sb.Append("</bml>").ToString();
    }
}
```

### 2.2 `Assets/Robot/Scripts/RobotBehaviorController.cs`

```csharp
using System;
using System.Collections.Generic;
using UnityEngine;

public enum RobotState { Idle, Listening, Thinking, Speaking }

[RequireComponent(typeof(Animator))]
public class RobotBehaviorController : MonoBehaviour
{
    [Header("Referanslar")]
    public SkinnedMeshRenderer faceMesh;
    public Transform headBone;      // Humanoid Head
    public Transform chestBone;     // Humanoid Chest/UpperChest
    public Transform gazeTarget;    // Main Camera
    public Renderer ledRenderer;    // Göğüs/kafa LED materyali (Emission açık), boş olabilir

    [Header("Ayarlar")]
    public float crossFade = 0.25f;
    public float breathAmount = 0.012f;
    public float breathSpeed = 0.35f;
    public float headNoise = 1.6f;      // derece
    public Color ledIdle = new Color(0.1f, 0.5f, 1f);
    public Color ledThink = new Color(1f, 0.6f, 0.1f);

    /// <summary>VHToolkit/SmartBody BML gönderme fonksiyonunu buraya bağla (ör. x => vhmsg.Send(x)).</summary>
    public Action<string> ExternalBmlSender;

    public RobotState State { get; private set; } = RobotState.Idle;

    Animator anim;
    int gestureLayer;
    float gazeWeight = 0.8f, gazeTargetWeight = 0.8f;
    Vector3 gazeOffset;                    // "away/up" için
    Vector3 chestBaseScale;
    float nextBlink, blinkT = -1f;
    int blinkL = -1, blinkR = -1;
    readonly Dictionary<int, float> emoTarget = new Dictionary<int, float>();
    readonly Dictionary<int, float> emoCurrent = new Dictionary<int, float>();
    string currentEmotion = "neutral";
    float emoHold;

    static readonly Dictionary<string, (string shape, float w)[]> Emotions =
        new Dictionary<string, (string, float)[]>
    {
        { "neutral", new (string, float)[0] },
        { "happy",   new[] { ("mouthSmileLeft", 55f), ("mouthSmileRight", 55f), ("cheekSquintLeft", 30f), ("cheekSquintRight", 30f) } },
        { "curious", new[] { ("browInnerUp", 70f), ("eyeWideLeft", 25f), ("eyeWideRight", 25f) } },
        { "alert",   new[] { ("eyeWideLeft", 60f), ("eyeWideRight", 60f), ("browInnerUp", 50f) } },
        { "witty",   new[] { ("mouthSmileLeft", 60f), ("browDownRight", 35f), ("browOuterUpLeft", 40f) } },
    };

    void Awake()
    {
        anim = GetComponent<Animator>();
        gestureLayer = anim.GetLayerIndex("Gesture");
        if (gazeTarget == null && Camera.main != null) gazeTarget = Camera.main.transform;
        if (chestBone != null) chestBaseScale = chestBone.localScale;
        if (faceMesh != null)
        {
            blinkL = BlendShapeUtil.Find(faceMesh, "eyeBlinkLeft");
            blinkR = BlendShapeUtil.Find(faceMesh, "eyeBlinkRight");
        }
        nextBlink = Time.time + UnityEngine.Random.Range(2f, 5f);
        SetState(RobotState.Idle);
    }

    public void SetState(RobotState s)
    {
        State = s;
        anim.CrossFadeInFixedTime(s.ToString(), crossFade, 0);
        switch (s)
        {
            case RobotState.Idle:      gazeTargetWeight = 0.5f; gazeOffset = Vector3.zero; break;
            case RobotState.Listening: gazeTargetWeight = 1.0f; gazeOffset = Vector3.zero; PlayGesture("headtilt"); break;
            case RobotState.Thinking:  gazeTargetWeight = 0.7f; gazeOffset = new Vector3(0.6f, 0.5f, 0f); PlayGesture("chin"); break;
            case RobotState.Speaking:  gazeTargetWeight = 0.9f; gazeOffset = Vector3.zero; break;
        }
    }

    public void PlayCue(BmlCue c)
    {
        if (ExternalBmlSender != null) ExternalBmlSender(BmlTagParser.ToBml(c));
        if (!string.IsNullOrEmpty(c.Gesture)) PlayGesture(c.Gesture);
        if (!string.IsNullOrEmpty(c.Emotion)) SetEmotion(c.Emotion);
        if (!string.IsNullOrEmpty(c.Gaze))
        {
            gazeOffset = c.Gaze == "away" ? new Vector3(0.8f, 0.1f, 0) : c.Gaze == "up" ? new Vector3(0, 0.7f, 0) : Vector3.zero;
            if (gazeOffset != Vector3.zero) Invoke(nameof(ResetGaze), 1.5f);
        }
    }

    void ResetGaze() { gazeOffset = Vector3.zero; }

    public void PlayGesture(string name)
    {
        string st = "G_" + name;
        if (gestureLayer >= 0 && anim.HasState(gestureLayer, Animator.StringToHash(st)))
            anim.CrossFadeInFixedTime(st, 0.15f, gestureLayer);
    }

    public void SetEmotion(string name)
    {
        if (faceMesh == null || !Emotions.ContainsKey(name)) name = "neutral";
        currentEmotion = name;
        emoHold = Time.time + 6f;      // 6 sn sonra nötre döner
        var keys = new List<int>(emoTarget.Keys);
        foreach (int k in keys) emoTarget[k] = 0f;
        foreach (var (shape, w) in Emotions[name])
        {
            int idx = BlendShapeUtil.Find(faceMesh, shape);
            if (idx >= 0) emoTarget[idx] = w;
        }
    }

    void Update()
    {
        // Duygu geçişi
        if (faceMesh != null)
        {
            if (currentEmotion != "neutral" && Time.time > emoHold && State != RobotState.Speaking) SetEmotion("neutral");
            foreach (var kv in new List<KeyValuePair<int, float>>(emoTarget))
            {
                emoCurrent.TryGetValue(kv.Key, out float cur);
                cur = Mathf.MoveTowards(cur, kv.Value, 140f * Time.deltaTime);
                emoCurrent[kv.Key] = cur;
                faceMesh.SetBlendShapeWeight(kv.Key, cur);
            }
            UpdateBlink();
        }
        // LED
        if (ledRenderer != null)
        {
            Color c = State == RobotState.Thinking
                ? ledThink * (0.6f + 0.6f * Mathf.Sin(Time.time * 6f))
                : ledIdle * (State == RobotState.Speaking ? 1.1f : 0.6f);
            ledRenderer.material.SetColor("_EmissionColor", c);
        }
        gazeWeight = Mathf.Lerp(gazeWeight, gazeTargetWeight, 4f * Time.deltaTime);
    }

    void UpdateBlink()
    {
        if (blinkL < 0) return;
        if (blinkT < 0 && Time.time >= nextBlink) blinkT = 0f;
        if (blinkT >= 0)
        {
            blinkT += Time.deltaTime / 0.16f;                       // 0.16 sn'de kapanıp açılır
            float w = 100f * Mathf.Sin(Mathf.Clamp01(blinkT) * Mathf.PI);
            faceMesh.SetBlendShapeWeight(blinkL, w);
            if (blinkR >= 0) faceMesh.SetBlendShapeWeight(blinkR, w);
            if (blinkT >= 1f)
            {
                blinkT = -1f;
                nextBlink = Time.time + UnityEngine.Random.Range(2.2f, 6f);
                if (UnityEngine.Random.value < 0.15f) nextBlink = Time.time + 0.25f;   // çift kırpma
            }
        }
    }

    void LateUpdate()
    {
        // Nefes: göğüs ölçeği
        if (chestBone != null)
        {
            float b = 1f + Mathf.Sin(Time.time * Mathf.PI * 2f * breathSpeed) * breathAmount;
            chestBone.localScale = new Vector3(chestBaseScale.x * (1f + (b - 1f) * 0.5f), chestBaseScale.y, chestBaseScale.z * b);
        }
        // Kafa salınımı (Perlin)
        if (headBone != null)
        {
            float t = Time.time * 0.4f;
            float amp = State == RobotState.Speaking ? headNoise * 1.6f : headNoise;
            Quaternion n = Quaternion.Euler(
                (Mathf.PerlinNoise(t, 0.1f) - 0.5f) * amp,
                (Mathf.PerlinNoise(0.3f, t) - 0.5f) * amp * 1.4f,
                (Mathf.PerlinNoise(t, 0.7f) - 0.5f) * amp * 0.6f);
            headBone.localRotation = headBone.localRotation * n;
        }
    }

    // Göz/kafa bakışı: Animator katmanında "IK Pass" açık olmalı.
    void OnAnimatorIK(int layer)
    {
        if (gazeTarget == null) return;
        Vector3 p = gazeTarget.position + gazeTarget.right * gazeOffset.x + gazeTarget.up * gazeOffset.y;
        anim.SetLookAtWeight(gazeWeight, 0.15f, 0.7f, 1f, 0.5f);
        anim.SetLookAtPosition(p);
    }
}

public static class BlendShapeUtil
{
    public static int Find(SkinnedMeshRenderer r, string name)
    {
        var m = r.sharedMesh;
        for (int i = 0; i < m.blendShapeCount; i++)
            if (m.GetBlendShapeName(i).EndsWith(name, StringComparison.OrdinalIgnoreCase)) return i;
        return -1;
    }
}
```

### 2.3 `Assets/Robot/Scripts/VisemeLipSync.cs`

```csharp
using UnityEngine;

public class VisemeLipSync : MonoBehaviour
{
    public SkinnedMeshRenderer face;
    public AudioSource source;
    public float smooth = 18f;

    int iOpen, iFunnel, iClose, iFV, iStrL, iStrR;
    float[] cur = new float[5];     // open, funnel, close, fv, stretch
    string text = "";
    float[] starts = new float[0], ends = new float[0];
    int idx;
    bool active;

    void Awake()
    {
        iOpen = BlendShapeUtil.Find(face, "jawOpen");
        iFunnel = BlendShapeUtil.Find(face, "mouthFunnel");
        iClose = BlendShapeUtil.Find(face, "mouthClose");
        iFV = BlendShapeUtil.Find(face, "mouthRollLower");
        iStrL = BlendShapeUtil.Find(face, "mouthStretchLeft");
        iStrR = BlendShapeUtil.Find(face, "mouthStretchRight");
    }

    public void Begin(string cleanText, float[] charStarts, float[] charEnds)
    {
        text = cleanText; starts = charStarts ?? new float[0]; ends = charEnds ?? new float[0];
        idx = 0; active = true;
    }

    public void End() { active = false; }

    // hedef: open, funnel, close, fv, stretch (0..1)
    static void Viseme(char ch, float[] t)
    {
        ch = char.ToLowerInvariant(ch);
        t[0] = t[1] = t[2] = t[3] = t[4] = 0f;
        switch (ch)
        {
            case 'a': case 'â': t[0] = 0.85f; break;
            case 'e': t[0] = 0.5f; t[4] = 0.5f; break;
            case 'ı': case 'i': case 'î': t[0] = 0.25f; t[4] = 0.7f; break;
            case 'o': case 'ö': t[0] = 0.5f; t[1] = 0.6f; break;
            case 'u': case 'ü': t[0] = 0.2f; t[1] = 0.9f; break;
            case 'p': case 'b': case 'm': t[2] = 1f; break;
            case 'f': case 'v': t[3] = 1f; t[0] = 0.15f; break;
            case ' ': case '.': case ',': case '!': case '?': case ';': case ':': break;
            default: t[0] = 0.25f; break;
        }
    }

    void Update()
    {
        var target = new float[5];
        if (active && source != null && source.isPlaying)
        {
            if (starts.Length > 0 && text.Length > 0)
            {
                float t = source.time;
                while (idx + 1 < starts.Length && starts[idx + 1] <= t) idx++;
                if (idx < text.Length && t <= ends[Mathf.Min(idx, ends.Length - 1)] + 0.04f)
                    Viseme(text[idx], target);
            }
            else
            {
                // Zaman bilgisi yoksa genlikle çene aç
                var buf = new float[128];
                source.GetOutputData(buf, 0);
                float sum = 0; foreach (float s in buf) sum += s * s;
                target[0] = Mathf.Clamp01(Mathf.Sqrt(sum / buf.Length) * 9f);
            }
        }
        for (int i = 0; i < 5; i++) cur[i] = Mathf.Lerp(cur[i], target[i], smooth * Time.deltaTime);
        Set(iOpen, cur[0]); Set(iFunnel, cur[1]); Set(iClose, cur[2]); Set(iFV, cur[3]);
        Set(iStrL, cur[4]); Set(iStrR, cur[4]);
    }

    void Set(int i, float v) { if (i >= 0) face.SetBlendShapeWeight(i, Mathf.Clamp01(v) * 100f); }
}
```

---

## Adım 3: Claude API, yapılandırma, TTS

VHToolkit içinde `Assets/RIDE/...` altında bir NLP sistemi varsa onu devre dışı bırakıp (bileşeni kapat) bu dosyaları `Assets/Robot/Scripts/` altına koy. RIDE'ın `RideConfig` arayüzünü doğrulayamadığım için ayarlar kendi panelimizden yapılır; RIDE'ın menüsü varsa `RobotConfig.Load()/Save()` çağrılarını oradan yapman yeter.

### 3.1 `Assets/Robot/Scripts/RobotConfig.cs` (şifreli saklama)

```csharp
using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;

[Serializable]
public class RobotConfig
{
    public string anthropicKey = "";
    public string model = "claude-sonnet-5-5";
    public string elevenKey = "";
    public string voiceId = "";
    public string sttLanguage = "tr-TR";

    static string FilePath { get { return Path.Combine(Application.persistentDataPath, "robot.cfg"); } }

    static byte[] Key()
    {
        using (var sha = SHA256.Create())
            return sha.ComputeHash(Encoding.UTF8.GetBytes(SystemInfo.deviceUniqueIdentifier + "|robot-v1"));
    }

    public static RobotConfig Load()
    {
        try
        {
            if (!File.Exists(FilePath)) return new RobotConfig();
            byte[] all = File.ReadAllBytes(FilePath);
            using (var aes = Aes.Create())
            {
                aes.Key = Key();
                byte[] iv = new byte[16]; Array.Copy(all, iv, 16); aes.IV = iv;
                using (var dec = aes.CreateDecryptor())
                {
                    byte[] plain = dec.TransformFinalBlock(all, 16, all.Length - 16);
                    return JsonUtility.FromJson<RobotConfig>(Encoding.UTF8.GetString(plain));
                }
            }
        }
        catch (Exception e) { Debug.LogWarning("Ayar okunamadı: " + e.Message); return new RobotConfig(); }
    }

    public void Save()
    {
        using (var aes = Aes.Create())
        {
            aes.Key = Key(); aes.GenerateIV();
            using (var enc = aes.CreateEncryptor())
            {
                byte[] plain = Encoding.UTF8.GetBytes(JsonUtility.ToJson(this));
                byte[] cipher = enc.TransformFinalBlock(plain, 0, plain.Length);
                byte[] all = new byte[16 + cipher.Length];
                Array.Copy(aes.IV, all, 16); Array.Copy(cipher, 0, all, 16, cipher.Length);
                File.WriteAllBytes(FilePath, all);
            }
        }
    }
}
```

### 3.2 `Assets/Robot/Scripts/RobotSettingsPanel.cs`

Canvas'ta bir panel oluştur (5 adet TMP InputField + Kaydet düğmesi) ve alanları sürükle:

```csharp
using TMPro;
using UnityEngine;

public class RobotSettingsPanel : MonoBehaviour
{
    public GameObject panel;
    public TMP_InputField anthropicKey, model, elevenKey, voiceId, sttLanguage;

    public void Open()
    {
        var c = RobotConfig.Load();
        anthropicKey.contentType = TMP_InputField.ContentType.Password;
        elevenKey.contentType = TMP_InputField.ContentType.Password;
        anthropicKey.text = c.anthropicKey; model.text = c.model;
        elevenKey.text = c.elevenKey; voiceId.text = c.voiceId; sttLanguage.text = c.sttLanguage;
        panel.SetActive(true);
    }

    public void SaveAndClose()
    {
        new RobotConfig
        {
            anthropicKey = anthropicKey.text.Trim(),
            model = string.IsNullOrWhiteSpace(model.text) ? "claude-sonnet-5-5" : model.text.Trim(),
            elevenKey = elevenKey.text.Trim(),
            voiceId = voiceId.text.Trim(),
            sttLanguage = string.IsNullOrWhiteSpace(sttLanguage.text) ? "tr-TR" : sttLanguage.text.Trim()
        }.Save();
        panel.SetActive(false);
    }
}
```

### 3.3 `Assets/Robot/Scripts/ClaudeNLPService.cs`

```csharp
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

public interface IToolSkill
{
    string Name { get; }
    JObject Definition { get; }                 // {name, description, input_schema}
    string Execute(JObject input);              // sonuç metni Claude'a döner
}

public class ClaudeNLPService : MonoBehaviour
{
    public const string Endpoint = "https://api.anthropic.com/v1/messages";
    const int MaxHistory = 24;
    const int MaxToolRounds = 4;

    public const string SystemPrompt =
@"Sen, bir telefon ekranının içinde yaşayan 3 boyutlu sibernetik bir robot asistansın ve bunun farkındasın. Adın Robo. Kullanıcıyla Türkçe konuşursun.
Yanıtların sesli okunacak: kısa (en çok 2-3 cümle), doğal ve akıcı konuş. Madde işareti, başlık, emoji, markdown kullanma.
Her yanıtın başına ve gerekirse cümle aralarına robotun beden dilini yöneten etiketler koy. Biçim: <gesture=""nod"" emotion=""happy""> ya da <gaze=""away"">.
gesture değerleri: nod, headtilt, shrug, wave, point, chin. emotion değerleri: happy, curious, alert, witty, neutral. gaze değerleri: camera, away, up.
Etiketler dışında metne köşeli ya da açılı parantez koyma.
Telefonun donanımını yalnızca araçlar (tools) ile kontrol edebilirsin: flaş, Wi-Fi paneli, Bluetooth ayarları, ses seviyesi. Kullanıcı bunlardan birini isterse ilgili aracı çağır, sonra ne yaptığını tek cümleyle söyle.
Wi-Fi ve Bluetooth'u Android kendi başına açıp kapatmana izin vermez; araç ayar panelini açar, kullanıcıya dokunarak değiştirmesini söyle.
Bilmediğin şeyi uydurma.";

    readonly JArray history = new JArray();
    readonly Dictionary<string, IToolSkill> skills = new Dictionary<string, IToolSkill>();

    public void RegisterSkill(IToolSkill s) { skills[s.Name] = s; }
    public void ClearHistory() { history.Clear(); }

    public IEnumerator Ask(string userText, Action<string> onReply, Action<string> onError)
    {
        var cfg = RobotConfig.Load();
        if (string.IsNullOrEmpty(cfg.anthropicKey)) { onError("Anthropic API anahtarı girilmemiş. Ayarlardan ekle."); yield break; }

        int startLen = history.Count;
        history.Add(new JObject { ["role"] = "user", ["content"] = userText });

        string lastText = "";
        for (int round = 0; round < MaxToolRounds; round++)
        {
            TrimHistory();
            var body = new JObject
            {
                ["model"] = cfg.model,
                ["max_tokens"] = 500,
                ["system"] = SystemPrompt,
                ["messages"] = history.DeepClone()
            };
            if (skills.Count > 0)
                body["tools"] = new JArray(skills.Values.Select(s => (JToken)s.Definition.DeepClone()));

            using (var req = new UnityWebRequest(Endpoint, "POST"))
            {
                req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body.ToString(Newtonsoft.Json.Formatting.None)));
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("content-type", "application/json");
                req.SetRequestHeader("x-api-key", cfg.anthropicKey);
                req.SetRequestHeader("anthropic-version", "2023-06-01");
                req.timeout = 40;
                yield return req.SendWebRequest();

                if (req.result != UnityWebRequest.Result.Success)
                {
                    string detail = req.downloadHandler != null ? req.downloadHandler.text : "";
                    string msg = req.error;
                    try { msg = JObject.Parse(detail)["error"]["message"].ToString(); } catch { }
                    while (history.Count > startLen) history.RemoveAt(history.Count - 1);
                    onError("Claude hatası: " + msg);
                    yield break;
                }

                JObject resp;
                try { resp = JObject.Parse(req.downloadHandler.text); }
                catch (Exception e)
                {
                    while (history.Count > startLen) history.RemoveAt(history.Count - 1);
                    onError("Yanıt çözülemedi: " + e.Message); yield break;
                }

                var content = (JArray)resp["content"];
                history.Add(new JObject { ["role"] = "assistant", ["content"] = content.DeepClone() });

                var sb = new StringBuilder();
                var toolUses = new List<JObject>();
                foreach (JObject block in content)
                {
                    string type = (string)block["type"];
                    if (type == "text") sb.Append((string)block["text"]);
                    else if (type == "tool_use") toolUses.Add(block);
                }
                if (sb.Length > 0) lastText = sb.ToString();

                if ((string)resp["stop_reason"] != "tool_use" || toolUses.Count == 0)
                {
                    onReply(lastText);
                    yield break;
                }

                var results = new JArray();
                foreach (var tu in toolUses)
                {
                    string name = (string)tu["name"];
                    string output; bool isErr = false;
                    try
                    {
                        if (!skills.TryGetValue(name, out var skill)) { output = "Bilinmeyen araç: " + name; isErr = true; }
                        else output = skill.Execute((JObject)tu["input"] ?? new JObject());
                    }
                    catch (Exception e) { output = "Hata: " + e.Message; isErr = true; }
                    results.Add(new JObject
                    {
                        ["type"] = "tool_result",
                        ["tool_use_id"] = tu["id"],
                        ["content"] = output,
                        ["is_error"] = isErr
                    });
                }
                history.Add(new JObject { ["role"] = "user", ["content"] = results });
            }
        }
        onReply(lastText);
    }

    // Geçmişi kısaltırken tool_use/tool_result çiftlerini bölmemek için yalnızca düz metin kullanıcı mesajında kes.
    void TrimHistory()
    {
        while (history.Count > MaxHistory)
        {
            history.RemoveAt(0);
            while (history.Count > 0 && !(((string)history[0]["role"]) == "user" && history[0]["content"].Type == JTokenType.String))
                history.RemoveAt(0);
        }
    }
}
```

### 3.4 `Assets/Robot/Scripts/ElevenLabsTts.cs`

```csharp
using System;
using System.Collections;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

public class ElevenLabsTts : MonoBehaviour
{
    const int SampleRate = 22050;

    /// <summary>Metni sese çevirir; harf zamanlarını da döndürür.</summary>
    public IEnumerator Speak(string text, Action<AudioClip, float[], float[]> onDone, Action<string> onError)
    {
        var cfg = RobotConfig.Load();
        if (string.IsNullOrEmpty(cfg.elevenKey) || string.IsNullOrEmpty(cfg.voiceId))
        { onError("ElevenLabs anahtarı veya ses kimliği yok."); yield break; }

        string url = "https://api.elevenlabs.io/v1/text-to-speech/" + cfg.voiceId + "/with-timestamps?output_format=pcm_22050";
        var body = new JObject { ["text"] = text, ["model_id"] = "eleven_multilingual_v2" };

        using (var req = new UnityWebRequest(url, "POST"))
        {
            req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body.ToString(Newtonsoft.Json.Formatting.None)));
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("content-type", "application/json");
            req.SetRequestHeader("xi-api-key", cfg.elevenKey);
            req.timeout = 40;
            yield return req.SendWebRequest();

            if (req.result != UnityWebRequest.Result.Success) { onError("TTS hatası: " + req.error); yield break; }

            try
            {
                var j = JObject.Parse(req.downloadHandler.text);
                byte[] pcm = Convert.FromBase64String((string)j["audio_base64"]);
                int n = pcm.Length / 2;
                var f = new float[n];
                for (int i = 0; i < n; i++) f[i] = (short)(pcm[2 * i] | (pcm[2 * i + 1] << 8)) / 32768f;
                var clip = AudioClip.Create("tts", n, 1, SampleRate, false);
                clip.SetData(f, 0);

                float[] starts = new float[0], ends = new float[0];
                var al = j["alignment"] as JObject;
                if (al != null)
                {
                    starts = al["character_start_times_seconds"].ToObject<float[]>();
                    ends = al["character_end_times_seconds"].ToObject<float[]>();
                }
                onDone(clip, starts, ends);
            }
            catch (Exception e) { onError("TTS çözülemedi: " + e.Message); }
        }
    }
}
```

---

## Adım 4: Android donanım köprüsü

### 4.1 `Assets/Plugins/Android/DeviceBridge.java`

```java
package com.bektas.robot;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.provider.Settings;
import com.unity3d.player.UnityPlayer;

public class DeviceBridge {
    static Activity act() { return UnityPlayer.currentActivity; }

    public static String setTorch(boolean on) {
        try {
            CameraManager cm = (CameraManager) act().getSystemService(Context.CAMERA_SERVICE);
            for (String id : cm.getCameraIdList()) {
                CameraCharacteristics c = cm.getCameraCharacteristics(id);
                Boolean flash = c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                Integer facing = c.get(CameraCharacteristics.LENS_FACING);
                if (flash != null && flash && facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                    cm.setTorchMode(id, on);
                    return "ok";
                }
            }
            return "Flaşı olan arka kamera bulunamadı.";
        } catch (Exception e) {
            return "Flaş hatası: " + e.getMessage();
        }
    }

    private static String open(final Intent i) {
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            act().startActivity(i);
            return "ok";
        } catch (Exception e) {
            return "Ekran açılamadı: " + e.getMessage();
        }
    }

    public static String openWifiPanel() {
        if (Build.VERSION.SDK_INT >= 29) return open(new Intent(Settings.Panel.ACTION_WIFI));
        return open(new Intent(Settings.ACTION_WIFI_SETTINGS));
    }

    public static String openBluetoothSettings() {
        return open(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));
    }

    public static boolean isWifiEnabled() {
        WifiManager w = (WifiManager) act().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        return w != null && w.isWifiEnabled();
    }

    public static int getVolumePercent() {
        AudioManager am = (AudioManager) act().getSystemService(Context.AUDIO_SERVICE);
        int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        return max == 0 ? 0 : Math.round(100f * am.getStreamVolume(AudioManager.STREAM_MUSIC) / max);
    }

    public static int setVolumePercent(int percent) {
        AudioManager am = (AudioManager) act().getSystemService(Context.AUDIO_SERVICE);
        int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        int v = Math.round(max * Math.max(0, Math.min(100, percent)) / 100f);
        am.setStreamVolume(AudioManager.STREAM_MUSIC, v, AudioManager.FLAG_SHOW_UI);
        return getVolumePercent();
    }
}
```

### 4.2 `Assets/Plugins/Android/SpeechBridge.java`

```java
package com.bektas.robot;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.unity3d.player.UnityPlayer;
import java.util.ArrayList;

public class SpeechBridge {
    static SpeechRecognizer rec;

    public static void start(final String lang, final String goName) {
        final Activity a = UnityPlayer.currentActivity;
        a.runOnUiThread(new Runnable() {
            public void run() {
                if (!SpeechRecognizer.isRecognitionAvailable(a)) {
                    UnityPlayer.UnitySendMessage(goName, "OnSttError", "Ses tanıma servisi yok.");
                    return;
                }
                if (rec != null) rec.destroy();
                rec = SpeechRecognizer.createSpeechRecognizer(a);
                rec.setRecognitionListener(new RecognitionListener() {
                    public void onReadyForSpeech(Bundle b) { UnityPlayer.UnitySendMessage(goName, "OnSttBegin", ""); }
                    public void onBeginningOfSpeech() {}
                    public void onRmsChanged(float v) {}
                    public void onBufferReceived(byte[] b) {}
                    public void onEndOfSpeech() {}
                    public void onError(int e) { UnityPlayer.UnitySendMessage(goName, "OnSttError", String.valueOf(e)); }
                    public void onResults(Bundle b) {
                        ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        UnityPlayer.UnitySendMessage(goName, "OnSttResult", (r != null && !r.isEmpty()) ? r.get(0) : "");
                    }
                    public void onPartialResults(Bundle b) {
                        ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (r != null && !r.isEmpty()) UnityPlayer.UnitySendMessage(goName, "OnSttPartial", r.get(0));
                    }
                    public void onEvent(int t, Bundle b) {}
                });
                Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                rec.startListening(i);
            }
        });
    }

    public static void stop() {
        final Activity a = UnityPlayer.currentActivity;
        a.runOnUiThread(new Runnable() {
            public void run() { if (rec != null) { rec.stopListening(); } }
        });
    }
}
```

### 4.3 `Assets/Robot/Scripts/AndroidHardwareBridge.cs`

```csharp
using UnityEngine;

public static class AndroidHardwareBridge
{
#if UNITY_ANDROID && !UNITY_EDITOR
    const string Cls = "com.bektas.robot.DeviceBridge";
    static string S(string m, params object[] a) { using (var c = new AndroidJavaClass(Cls)) return c.CallStatic<string>(m, a); }

    public static string SetTorch(bool on) { return S("setTorch", on); }
    public static string OpenWifiPanel() { return S("openWifiPanel"); }
    public static string OpenBluetoothSettings() { return S("openBluetoothSettings"); }
    public static bool IsWifiEnabled() { using (var c = new AndroidJavaClass(Cls)) return c.CallStatic<bool>("isWifiEnabled"); }
    public static int GetVolume() { using (var c = new AndroidJavaClass(Cls)) return c.CallStatic<int>("getVolumePercent"); }
    public static int SetVolume(int p) { using (var c = new AndroidJavaClass(Cls)) return c.CallStatic<int>("setVolumePercent", p); }
#else
    public static string SetTorch(bool on) { Debug.Log("[Editör] Flaş: " + on); return "ok"; }
    public static string OpenWifiPanel() { Debug.Log("[Editör] Wi-Fi paneli"); return "ok"; }
    public static string OpenBluetoothSettings() { Debug.Log("[Editör] Bluetooth ayarları"); return "ok"; }
    public static bool IsWifiEnabled() { return true; }
    static int vol = 50;
    public static int GetVolume() { return vol; }
    public static int SetVolume(int p) { vol = Mathf.Clamp(p, 0, 100); return vol; }
#endif
}
```

### 4.4 `Assets/Robot/Scripts/DeviceControlSkill.cs`

Dört araç tek sınıfta; her biri `IToolSkill`:

```csharp
using Newtonsoft.Json.Linq;

public abstract class DeviceTool : IToolSkill
{
    public abstract string Name { get; }
    public abstract JObject Definition { get; }
    public abstract string Execute(JObject input);

    protected static JObject Def(string name, string desc, JObject props, params string[] required)
    {
        return new JObject
        {
            ["name"] = name,
            ["description"] = desc,
            ["input_schema"] = new JObject
            {
                ["type"] = "object",
                ["properties"] = props,
                ["required"] = new JArray(required)
            }
        };
    }
}

public class TorchTool : DeviceTool
{
    public override string Name { get { return "toggle_flashlight"; } }
    public override JObject Definition { get { return Def(Name, "Telefonun arka flaşını (el feneri) açar veya kapatır.",
        new JObject { ["on"] = new JObject { ["type"] = "boolean", ["description"] = "true: aç, false: kapat" } }, "on"); } }
    public override string Execute(JObject i)
    {
        string r = AndroidHardwareBridge.SetTorch((bool)i["on"]);
        return r == "ok" ? ((bool)i["on"] ? "Flaş açıldı." : "Flaş kapandı.") : r;
    }
}

public class WifiTool : DeviceTool
{
    public override string Name { get { return "set_wifi_state"; } }
    public override JObject Definition { get { return Def(Name,
        "Wi-Fi ayar panelini açar. Android uygulamanın Wi-Fi'yi kendi başına değiştirmesine izin vermez; kullanıcı panelde dokunarak açıp kapatır. Anahtar mevcut durumu da döner.",
        new JObject { ["enabled"] = new JObject { ["type"] = "boolean", ["description"] = "İstenen durum (bilgi amaçlı)" } }, "enabled"); } }
    public override string Execute(JObject i)
    {
        bool now = AndroidHardwareBridge.IsWifiEnabled();
        string r = AndroidHardwareBridge.OpenWifiPanel();
        return r == "ok" ? "Wi-Fi şu an " + (now ? "açık" : "kapalı") + ". Wi-Fi paneli açıldı; kullanıcı değiştirmeli." : r;
    }
}

public class BluetoothTool : DeviceTool
{
    public override string Name { get { return "open_bluetooth_settings"; } }
    public override JObject Definition { get { return Def(Name, "Bluetooth ayar ekranını açar.", new JObject()); } }
    public override string Execute(JObject i)
    {
        string r = AndroidHardwareBridge.OpenBluetoothSettings();
        return r == "ok" ? "Bluetooth ayarları açıldı." : r;
    }
}

public class VolumeTool : DeviceTool
{
    public override string Name { get { return "set_volume"; } }
    public override JObject Definition { get { return Def(Name, "Medya ses seviyesini yüzde olarak ayarlar (0-100).",
        new JObject { ["level"] = new JObject { ["type"] = "integer", ["minimum"] = 0, ["maximum"] = 100 } }, "level"); } }
    public override string Execute(JObject i)
    {
        int v = AndroidHardwareBridge.SetVolume((int)i["level"]);
        return "Ses seviyesi %" + v + " oldu.";
    }
}
```

Dosyanın adı istendiği gibi `DeviceControlSkill.cs`; kayıt işi orkestratörde yapılır.

### 4.5 `Assets/Plugins/Android/AndroidManifest.xml`

Unity 2022.3'te Player Settings → Publishing Settings → **Custom Main Manifest** işaretlenince bu dosya oluşur; içeriğini şöyle yap:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
          xmlns:tools="http://schemas.android.com/tools">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <uses-feature android:name="android.hardware.camera.flash" android:required="false" />
    <uses-feature android:name="android.hardware.microphone" android:required="false" />

    <!-- Android 11+: SpeechRecognizer servisini görebilmek için -->
    <queries>
        <intent><action android:name="android.speech.RecognitionService" /></intent>
    </queries>

    <application>
        <activity android:name="com.unity3d.player.UnityPlayerActivity"
                  android:theme="@style/UnityThemeSelector"
                  android:screenOrientation="portrait"
                  android:configChanges="mcc|mnc|locale|touchscreen|keyboard|keyboardHidden|navigation|orientation|screenLayout|uiMode|screenSize|smallestScreenSize|fontScale|layoutDirection|density"
                  android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <meta-data android:name="unityplayer.UnityActivity" android:value="true" />
        </activity>
    </application>
</manifest>
```

### 4.6 `Assets/Robot/Scripts/RobotOrchestrator.cs` (her şeyi bağlar)

Sahnede boş bir nesne oluştur, adını **`RobotOrchestrator`** yap (Java tarafı bu adla mesaj gönderir), bu bileşeni ve `ClaudeNLPService`, `ElevenLabsTts`, ses için `AudioSource` ekle.

```csharp
using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.Android;
using UnityEngine.UI;

public class RobotOrchestrator : MonoBehaviour
{
    public RobotBehaviorController behavior;
    public VisemeLipSync lipSync;
    public ClaudeNLPService claude;
    public ElevenLabsTts tts;
    public AudioSource audioSource;
    public TMP_Text statusText;          // ekranda altyazı/durum
    public Toggle conversationMode;      // sürekli dinleme

    string partial = "";
    bool busy;

    void Start()
    {
        Application.targetFrameRate = 30;
        QualitySettings.vSyncCount = 0;
        Screen.sleepTimeout = SleepTimeout.NeverSleep;

        claude.RegisterSkill(new TorchTool());
        claude.RegisterSkill(new WifiTool());
        claude.RegisterSkill(new BluetoothTool());
        claude.RegisterSkill(new VolumeTool());
        lipSync.source = audioSource;
    }

    // Mikrofon düğmesine bağla
    public void OnMicPressed()
    {
        if (busy) return;
#if UNITY_ANDROID && !UNITY_EDITOR
        if (!Permission.HasUserAuthorizedPermission(Permission.Microphone))
        {
            var cb = new PermissionCallbacks();
            cb.PermissionGranted += _ => StartListening();
            cb.PermissionDenied += _ => SetStatus("Mikrofon izni verilmedi.");
            Permission.RequestUserPermission(Permission.Microphone, cb);
            return;
        }
#endif
        StartListening();
    }

    void StartListening()
    {
        busy = true; partial = "";
        behavior.SetState(RobotState.Listening);
        SetStatus("Dinliyorum...");
#if UNITY_ANDROID && !UNITY_EDITOR
        using (var c = new AndroidJavaClass("com.bektas.robot.SpeechBridge"))
            c.CallStatic("start", RobotConfig.Load().sttLanguage, gameObject.name);
#else
        StartCoroutine(EditorFakeStt());
#endif
    }

    IEnumerator EditorFakeStt() { yield return new WaitForSeconds(1f); OnSttResult("Işığı aç"); }

    // --- SpeechBridge.java geri çağrıları (UnitySendMessage) ---
    public void OnSttBegin(string _) { }
    public void OnSttPartial(string t) { partial = t; SetStatus(t); }
    public void OnSttError(string e)
    {
        // 7 = konuşma algılanmadı, 6 = zaman aşımı
        busy = false; behavior.SetState(RobotState.Idle);
        SetStatus(e == "7" || e == "6" ? "Bir şey duyamadım." : "Ses tanıma hatası: " + e);
    }
    public void OnSttResult(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) { OnSttError("7"); return; }
        StartCoroutine(Think(text));
    }

    IEnumerator Think(string userText)
    {
        SetStatus("Sen: " + userText);
        behavior.SetState(RobotState.Thinking);
        string reply = null, error = null;
        yield return claude.Ask(userText, r => reply = r, e => error = e);

        if (error != null) { SetStatus(error); behavior.SetState(RobotState.Idle); busy = false; yield break; }
        yield return Speak(reply);
    }

    IEnumerator Speak(string raw)
    {
        var cues = new List<BmlCue>();
        string clean = BmlTagParser.Parse(raw, cues);
        SetStatus(clean);
        behavior.SetState(RobotState.Speaking);

        AudioClip clip = null; float[] st = null, en = null; string ttsErr = null;
        if (!string.IsNullOrEmpty(clean))
            yield return tts.Speak(clean, (c, s, e) => { clip = c; st = s; en = e; }, e => ttsErr = e);

        if (clip != null)
        {
            audioSource.clip = clip; audioSource.Play();
            lipSync.Begin(clean, st, en);
            int ci = 0;
            while (audioSource.isPlaying)
            {
                float t = audioSource.time;
                while (ci < cues.Count && CueTime(cues[ci], st, en, clean.Length) <= t) behavior.PlayCue(cues[ci++]);
                yield return null;
            }
            lipSync.End();
        }
        else
        {
            if (ttsErr != null) SetStatus(clean + "\n(" + ttsErr + ")");
            foreach (var c in cues) behavior.PlayCue(c);
            yield return new WaitForSeconds(Mathf.Clamp(clean.Length * 0.06f, 1.5f, 12f));
        }
        behavior.SetState(RobotState.Idle);
        busy = false;
        if (conversationMode != null && conversationMode.isOn) OnMicPressed();
    }

    static float CueTime(BmlCue c, float[] st, float[] en, int len)
    {
        if (st == null || st.Length == 0) return 0f;
        int i = Mathf.Clamp(c.CharIndex, 0, st.Length - 1);
        return st[i];
    }

    void SetStatus(string s) { if (statusText != null) statusText.text = s; }
}
```

Sahne bağlantıları: mikrofon düğmesinin `OnClick`'i → `RobotOrchestrator.OnMicPressed`; ayar düğmesi → `RobotSettingsPanel.Open`. `VisemeLipSync.face` ve `RobotBehaviorController.faceMesh` aynı yüz mesh'i.

---

## Adım 5: APK, performans, test

### 5.1 Project Settings → Player (Android)

| Ayar | Değer |
|---|---|
| Scripting Backend | IL2CPP |
| Target Architectures | **ARM64** (ARMv7 kapalı) |
| Minimum API Level | 26 |
| Target API Level | Kurulu en yüksek (Play Store için güncel şartı kontrol et) |
| Api Compatibility Level | .NET Standard 2.1 |
| Internet Access | Require |
| Orientation | Portrait |
| Managed Stripping Level | Medium (Newtonsoft için `link.xml` gerekebilir, aşağıda) |
| Custom Main Manifest | Açık (Adım 4.5) |
| Graphics API | Vulkan + OpenGLES3 (otomatik kapalı, listede önce Vulkan) |

Mikrofon kullanım açıklaması Android'de manifest'te değil, çalışma zamanı izin penceresindedir (iOS'a özgü "Microphone Usage Description" burada geçerli değil).

`Assets/link.xml` (strip sorunlarına karşı):

```xml
<linker>
  <assembly fullname="Newtonsoft.Json" preserve="all"/>
</linker>
```

### 5.2 URP mobil ayarları

- URP Asset (Mobile): **Render Scale 0.8**, HDR kapalı, MSAA kapalı (ya da 2x), Main Light Shadows: soft kapalı, shadow distance 8, cascade 1, Additional Lights en çok 1–2 (per-vertex), SRP Batcher açık, Depth/Opaque Texture kapalı.
- Quality Settings: Anisotropic kapalı, VSync 0, `Application.targetFrameRate = 30` (kodda var; akıcılık için güçlü cihazda 60).
- Edit → Project Settings → Graphics → Shader Stripping: Strip Unused Variants açık; kullanılmayan fog/lightmap varyantlarını kapat.
- Karakter: 50-80 bin üçgen altı, tek yüz mesh'i için 1 materyal, 2K doku (ASTC sıkıştırma: Build Settings → Texture Compression ASTC).
- Post-processing'i minimumda tut (Bloom kısmak LED etkisi için yeterli).

### 5.3 Derleme ve cihaz testi

Telefonda **Geliştirici seçenekleri → USB hata ayıklama** aç, kabloyla bağla.

```bash
adb devices                                   # cihaz görünmeli
# Unity: File > Build Settings > Android > Build And Run   (veya APK'yı elle kur)
adb install -r Robot.apk

adb logcat -c
adb logcat -s Unity:V ActivityManager:I AndroidRuntime:E     # Unity + çökme günlüğü
adb logcat | grep -E "Unity|SpeechRecognizer|CameraManager"

# Uygulamayı yeniden başlat
adb shell am force-stop com.DefaultCompany.Robot
adb shell monkey -p com.DefaultCompany.Robot -c android.intent.category.LAUNCHER 1

# Performans
adb shell dumpsys gfxinfo com.DefaultCompany.Robot | head -40
adb shell dumpsys meminfo com.DefaultCompany.Robot | head -30
```

Paket adını Player Settings → Other Settings → Package Name'den bilip yukarıdaki komutlarda değiştir.

### 5.4 Sorun giderme tablosu

| Belirti | Neden / çözüm |
|---|---|
| `OnSttError 5/9` | Mikrofon izni yok ya da Google ses servisi kapalı; Ayarlar → Uygulamalar → İzinler |
| `OnSttError 12/13` | Seçilen dil (tr-TR) cihazda yüklü değil; Google uygulaması dil paketini indir |
| `Claude hatası: authentication_error` | Anahtar yanlış; ayarlardan tekrar gir |
| `Claude hatası: not_found_error (model)` | Model adı geçersiz; ayarlarda `claude-sonnet-5-5` yaz |
| Flaş açılmıyor | Başka uygulama kamerayı kullanıyor ya da cihazda arka flaş yok; `logcat` içinde `CameraAccessException` ara |
| Ses var, dudak oynamıyor | Blendshape adları farklı: `BlendShapeUtil.Find` sonda eşleşme yapar; modelinde `jawOpen` yerine `Mouth_Open` vb. varsa `VisemeLipSync.Awake`'teki adları değiştir |
| Dudak geç kalıyor | Harf zamanları `source.time` ile eşleşir; AudioSource'ta "Play On Awake" kapalı olmalı, Audio → DSP Buffer Size "Best Latency" |
| Yanıt süresi uzun | Sırayla ölçülür: ASR (logcat zaman damgası), Claude (`Ask` başı/sonu), TTS (`Speak`). Claude için `max_tokens` düşür, daha hızlı model seç |
| Çökme açılışta | `Managed Stripping` düşür; `link.xml` var mı bak |

### 5.5 Sonraki adımlar (isteğe bağlı)

- Claude yanıtını akışlı (stream) alıp cümle cümle TTS'e vermek yanıt gecikmesini yarıya indirir; `ClaudeNLPService`'e SSE eklemek gerekir.
- Anahtarları cihazda tutmak yerine küçük bir proxy sunucu (Cloudflare Worker vb.) kur; APK'da yalnızca kendi sunucunun adresi kalır.
