// AURORA AI - bir konuşma turunun nerede olduğunu izler (kullanıcı sordu mu, yanıt geldi mi,
// ses başladı mı, zaman aşımı oldu mu). UnityEngine kullanmaz; zaman dışarıdan saniye olarak verilir.

using System;

namespace Aurora.Core
{
    public sealed class ConversationTurnTracker
    {
        /// <summary>Kullanıcı girdisinden sonra sesin başlaması için beklenen en uzun süre (saniye).</summary>
        public double ResponseTimeoutSeconds { get; set; } = 30.0;

        /// <summary>Kullanıcının sorusu var, robot henüz konuşmaya başlamadı.</summary>
        public bool AwaitingResponse { get; private set; }

        /// <summary>Yanıt metni geldi, ses henüz başlamadı (TTS üretiliyor).</summary>
        public bool ResponseTextReceived { get; private set; }

        /// <summary>Hata bu kadar süre gösterildikten sonra kendiliğinden silinir (saniye).</summary>
        public double ErrorDisplaySeconds { get; set; } = 3.0;

        /// <summary>Son hata; yoksa null.</summary>
        public string ErrorMessage { get; private set; }

        /// <summary>Son hatanın zamanı; hata yoksa NaN.</summary>
        public double ErrorTime { get; private set; } = double.NaN;

        /// <summary>Son kullanıcı girdisinin zamanı; girdi yoksa NaN.</summary>
        public double InputTime { get; private set; } = double.NaN;

        /// <summary>Son kullanıcı girdisinden ilk sese kadar geçen süre; ölçülmediyse NaN.</summary>
        public double LastResponseLatency { get; private set; } = double.NaN;

        /// <summary>Kullanıcı bir şey söyledi ya da yazdı; yeni tur başlar, önceki hata silinir.</summary>
        public void NotifyUserInput(double now)
        {
            AwaitingResponse = true;
            ResponseTextReceived = false;
            ClearError();
            InputTime = now;
        }

        /// <summary>Dil modelinden yanıt metni geldi.</summary>
        public void NotifyResponseText(double now)
        {
            if (AwaitingResponse)
                ResponseTextReceived = true;
        }

        /// <summary>Robotun sesi çalmaya başladı; bekleme biter.</summary>
        public void NotifySpeechStarted(double now)
        {
            if (AwaitingResponse && !double.IsNaN(InputTime))
                LastResponseLatency = Math.Max(0.0, now - InputTime);
            AwaitingResponse = false;
            ResponseTextReceived = false;
        }

        /// <summary>Tur kullanıcı tarafından durduruldu ya da yeni girdiyle kesildi.</summary>
        public void NotifyCancelled()
        {
            AwaitingResponse = false;
            ResponseTextReceived = false;
        }

        /// <summary>Bağlantı, ses ya da servis hatası. Bekleyen tur biter.</summary>
        public void NotifyError(string message, double now)
        {
            ErrorMessage = string.IsNullOrWhiteSpace(message) ? "Bilinmeyen hata" : message;
            ErrorTime = now;
            AwaitingResponse = false;
            ResponseTextReceived = false;
        }

        /// <summary>Hata gösterildi ve kapatıldı.</summary>
        public void ClearError()
        {
            ErrorMessage = null;
            ErrorTime = double.NaN;
        }

        /// <summary>Her karede çağrılır; zaman aşımını denetler ve süresi dolan hatayı siler.</summary>
        public void Tick(double now)
        {
            if (ErrorMessage != null && !double.IsNaN(ErrorTime) && now - ErrorTime >= ErrorDisplaySeconds)
                ClearError();

            if (!AwaitingResponse || double.IsNaN(InputTime))
                return;
            if (now - InputTime > ResponseTimeoutSeconds)
            {
                NotifyError(ResponseTextReceived
                    ? "Yanıt geldi ama ses üretilemedi."
                    : "Yanıt zamanında gelmedi. İnternet bağlantısını kontrol edin.", now);
            }
        }
    }
}
