// AURORA AI - VHToolkit konuşma döngüsünü izleyip robotun beş durumunu üreten bileşen (FAZ 2).
//
// VHToolkit'in hiçbir dosyasını değiştirmez. Sahnedeki DemoController'ı (Ride.Examples.DemoControllerBase)
// bulur, onun public olaylarını ve karakterin ses kaynağını dinler. Göz, kırpma, bakış, düşünme ve
// dinleme hareketlerini VHToolkit'in kendi bileşenleri yapmaya devam eder; bu sınıf yalnızca
// "robot şu an hangi durumda" sorusunu tek yerde cevaplar ve durum değişince olay yayar.
//
// Kaynakta doğrulanan API'ler (RIDE 6daea6a, VHToolkit a5a7af7):
//   DemoControllerBase.OnUserUtterance / OnCharacterResponse / OnCharacterReady (event)
//   DemoControllerBase.CurrentCharacter (MecanimCharacter), SetASR(bool), SubmitUserText(string),
//   DemoControllerBase.StopUtterance(), UsingRealtimeConversationMode
//   MecanimCharacter.Voice (AudioSource), ListeningController.IsListening (namespace Ride)
//
// Inspector: sahnede boş bir GameObject'e (örn. AURORA_AI/Robot/RobotBehaviorController) ekleyin.
// "Demo Controller" alanı boş bırakılırsa sahnede kendisi bulur.

using System;
using Aurora.Core;
using Ride;
using Ride.Examples;
using UnityEngine;
using UnityEngine.Events;
using VHAssets;

namespace Aurora.Behavior
{
    [Serializable]
    public class RobotStateEvent : UnityEvent<RobotState, RobotState> { }

    [DisallowMultipleComponent]
    public class RobotBehaviorController : MonoBehaviour
    {
        [Header("Bağlantılar")]
        [Tooltip("Sahnedeki DemoController. Boşsa açılışta bulunur.")]
        [SerializeField] private DemoControllerBase m_demoController;

        [Header("Zamanlama")]
        [Tooltip("Kullanıcı girdisinden sonra sesin başlaması için en uzun bekleme (saniye). Aşılırsa ERROR.")]
        [SerializeField, Min(5f)] private float m_responseTimeoutSeconds = 30f;

        [Tooltip("Hata ışığının en az yanık kalacağı süre (saniye).")]
        [SerializeField, Min(0f)] private float m_minimumErrorSeconds = 3f;

        [Header("Söz kesme")]
        [Tooltip("Robot konuşurken kullanıcı konuşmaya başlarsa robotun sesini durdur.")]
        [SerializeField] private bool m_stopSpeechOnUserInterrupt = true;

        [Header("Olaylar")]
        [Tooltip("(önceki durum, yeni durum). Yalnızca durum gerçekten değişince çağrılır.")]
        public RobotStateEvent StateChanged = new RobotStateEvent();

        /// <summary>C# tarafından dinlemek için aynı olay.</summary>
        public event Action<RobotState, RobotState> OnStateChanged;

        private readonly ConversationTurnTracker m_turn = new ConversationTurnTracker();
        private RobotStateMachine m_machine;
        private ListeningController m_listeningController;
        private MecanimCharacter m_boundCharacter;
        private bool m_microphoneOpen;
        private bool m_wasSpeaking;

        public RobotState CurrentState => m_machine != null ? m_machine.Current : RobotState.Idle;
        public string CurrentError => m_machine?.ErrorMessage;
        public bool MicrophoneOpen => m_microphoneOpen;

        /// <summary>Son kullanıcı girdisinden robotun sesine kadar geçen süre (saniye); ölçülmediyse NaN.</summary>
        public double LastResponseLatency => m_turn.LastResponseLatency;

        private static double Now => Time.unscaledTimeAsDouble;

        private void Awake()
        {
            m_machine = new RobotStateMachine(Now) { MinimumErrorSeconds = m_minimumErrorSeconds };
            m_turn.ResponseTimeoutSeconds = m_responseTimeoutSeconds;
            m_turn.ErrorDisplaySeconds = m_minimumErrorSeconds;
            m_machine.StateChanged += HandleStateChanged;
        }

        private void OnEnable()
        {
            if (m_demoController == null)
                m_demoController = FindAnyObjectByType<DemoControllerBase>();

            if (m_demoController == null)
            {
                Debug.LogError("[AURORA] RobotBehaviorController: sahnede DemoController bulunamadı. " +
                               "AuroraMain sahnesinin SampleScene kopyası olduğundan emin olun.", this);
                enabled = false;
                return;
            }

            m_demoController.OnUserUtterance += HandleUserUtterance;
            m_demoController.OnCharacterResponse += HandleCharacterResponse;
            m_demoController.OnCharacterReady += HandleCharacterReady;
        }

        private void OnDisable()
        {
            if (m_demoController == null)
                return;
            m_demoController.OnUserUtterance -= HandleUserUtterance;
            m_demoController.OnCharacterResponse -= HandleCharacterResponse;
            m_demoController.OnCharacterReady -= HandleCharacterReady;
        }

        // ---- Arayüzün (FAZ 6) çağıracağı işlemler ----

        /// <summary>Mikrofon düğmesi. VHToolkit'in ASR'sini açar/kapatır ve durumu kaydeder.</summary>
        public void SetMicrophone(bool open)
        {
            m_microphoneOpen = open;
            if (m_demoController != null)
                m_demoController.SetASR(open);
        }

        public void ToggleMicrophone() => SetMicrophone(!m_microphoneOpen);

        /// <summary>Yazılı soru gönderir (VHToolkit'in SubmitUserText yolu; OnUserUtterance tetiklenir).</summary>
        public void SubmitText(string text)
        {
            if (m_demoController == null || string.IsNullOrWhiteSpace(text))
                return;
            m_demoController.SubmitUserText(text.Trim());
        }

        /// <summary>"Konuşmayı durdur" düğmesi.</summary>
        public void StopSpeaking()
        {
            m_turn.NotifyCancelled();
            if (m_demoController != null)
                m_demoController.StopUtterance();
        }

        /// <summary>Başka bir modül (ASR, TTS, ağ, donanım) hata bildirdiğinde çağrılır.</summary>
        public void ReportError(string message) => m_turn.NotifyError(message, Now);

        // ---- VHToolkit olayları ----

        private void HandleUserUtterance(string text)
        {
            if (Application.internetReachability == NetworkReachability.NotReachable)
            {
                m_turn.NotifyError("İnternet bağlantısı yok.", Now);
                return;
            }
            m_turn.NotifyUserInput(Now);
        }

        private void HandleCharacterResponse(string text)
        {
            // RIDE'ın NlpSystemClaude/ChatGPT sağlayıcıları hata durumunda yanıt metni olarak bu
            // İngilizce cümleleri döndürür (NlpSystemClaude.cs). FAZ 3'teki AURORA sağlayıcısı
            // hatayı doğrudan ReportError ile bildirecek; bu denetim mevcut sağlayıcılar içindir.
            if (!string.IsNullOrEmpty(text) &&
                (text.StartsWith("I'm sorry, something went wrong", StringComparison.Ordinal) ||
                 text.StartsWith("I'm sorry, I did not receive a text response", StringComparison.Ordinal)))
            {
                m_turn.NotifyError("Dil modeli yanıt veremedi.", Now);
                return;
            }
            m_turn.NotifyResponseText(Now);
        }

        private void HandleCharacterReady(MecanimCharacter character)
        {
            BindCharacter(character);
            m_turn.NotifyCancelled();
            m_machine.Reset(Now);
        }

        // ---- Her kare ----

        private void Update()
        {
            if (m_demoController == null)
                return;

            var character = m_demoController.CurrentCharacter;
            if (character != m_boundCharacter)
                BindCharacter(character);

            AudioSource voice = character != null ? character.Voice : null;
            bool speaking = voice != null && voice.isPlaying;
            if (speaking && !m_wasSpeaking)
                m_turn.NotifySpeechStarted(Now);
            m_wasSpeaking = speaking;

            m_turn.Tick(Now);

            bool userSpeaking = m_listeningController != null && m_listeningController.IsListening;
            var signals = new RobotSignals(m_microphoneOpen, userSpeaking, m_turn.AwaitingResponse,
                                           speaking, m_turn.ErrorMessage);
            m_machine.Update(signals, Now);
        }

        private void BindCharacter(MecanimCharacter character)
        {
            m_boundCharacter = character;
            m_listeningController = character != null
                ? character.GetComponentInChildren<ListeningController>(true)
                : null;
            // ListeningController karakterin altında değilse sahnedekini kullan.
            if (m_listeningController == null)
                m_listeningController = FindAnyObjectByType<ListeningController>();
            m_wasSpeaking = false;
        }

        private void HandleStateChanged(RobotState previous, RobotState next)
        {
            if (previous == RobotState.Speaking && next == RobotState.Listening && m_stopSpeechOnUserInterrupt)
            {
                m_turn.NotifyCancelled();
                m_demoController.StopUtterance();
            }

            if (next == RobotState.Error)
                Debug.LogWarning($"[AURORA] Hata durumu: {m_machine.ErrorMessage}", this);

            OnStateChanged?.Invoke(previous, next);
            StateChanged.Invoke(previous, next);
        }
    }
}
