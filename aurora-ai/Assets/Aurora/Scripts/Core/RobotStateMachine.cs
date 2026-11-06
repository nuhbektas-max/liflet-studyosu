// AURORA AI - beş durumlu davranış durum makinesi (şartname 5.1 ve 5.3).
// Girdiler (mikrofon, kullanıcı konuşuyor mu, yanıt bekleniyor mu, robot konuşuyor mu, hata)
// her karede verilir; makine hangi durumda olunacağına karar verir ve yalnızca durum
// gerçekten değişince olay yayar. Aynı duruma tekrar geçilmez (animasyon yeniden başlamaz).
// UnityEngine kullanmaz.

using System;

namespace Aurora.Core
{
    /// <summary>Bir karedeki gözlenen durum.</summary>
    public readonly struct RobotSignals
    {
        /// <summary>Mikrofon açık (kullanıcı düğmeye bastı).</summary>
        public readonly bool MicrophoneOpen;

        /// <summary>Kullanıcının sesi algılanıyor (VHToolkit ListeningController.IsListening).</summary>
        public readonly bool UserSpeaking;

        /// <summary>Kullanıcı girdisi verildi, robot henüz konuşmaya başlamadı.</summary>
        public readonly bool AwaitingResponse;

        /// <summary>Robotun sesi çalıyor.</summary>
        public readonly bool CharacterSpeaking;

        /// <summary>Etkin hata; yoksa null.</summary>
        public readonly string ErrorMessage;

        public RobotSignals(bool microphoneOpen, bool userSpeaking, bool awaitingResponse,
                            bool characterSpeaking, string errorMessage)
        {
            MicrophoneOpen = microphoneOpen;
            UserSpeaking = userSpeaking;
            AwaitingResponse = awaitingResponse;
            CharacterSpeaking = characterSpeaking;
            ErrorMessage = errorMessage;
        }
    }

    public sealed class RobotStateMachine
    {
        /// <summary>Hata durumunda en az bu kadar kalınır ki kullanıcı ışığı ve açıklamayı görsün.</summary>
        public double MinimumErrorSeconds { get; set; } = 3.0;

        public RobotState Current { get; private set; } = RobotState.Idle;
        public RobotState Previous { get; private set; } = RobotState.Idle;
        public double EnteredAt { get; private set; }
        public string ErrorMessage { get; private set; }

        /// <summary>(önceki, yeni) durum. Yalnızca gerçek değişimde çağrılır.</summary>
        public event Action<RobotState, RobotState> StateChanged;

        public RobotStateMachine(double now = 0.0)
        {
            EnteredAt = now;
        }

        public double TimeInState(double now) => now - EnteredAt;

        /// <summary>
        /// İzin verilen doğrudan geçişler. Şartnamedeki temel akış
        /// Idle → Listening → Thinking → Speaking → Idle, her durumdan Error'a ve Error'dan Idle'a.
        /// Ek olarak gerçek kullanımda gereken kısa yollar:
        /// Idle → Thinking (yazılı soru), Idle → Speaking (karşılama), Listening → Idle (vazgeçme),
        /// Thinking → Idle (iptal), Speaking → Listening (kullanıcı robotun sözünü kesti),
        /// Speaking → Thinking (konuşma sürerken yeni yazılı soru).
        /// </summary>
        public static bool IsAllowed(RobotState from, RobotState to)
        {
            if (from == to) return false;
            if (to == RobotState.Error) return true;
            switch (from)
            {
                case RobotState.Idle:      return to == RobotState.Listening || to == RobotState.Thinking || to == RobotState.Speaking;
                case RobotState.Listening: return to == RobotState.Thinking || to == RobotState.Idle;
                case RobotState.Thinking:  return to == RobotState.Speaking || to == RobotState.Idle;
                case RobotState.Speaking:  return to == RobotState.Idle || to == RobotState.Listening || to == RobotState.Thinking;
                case RobotState.Error:     return to == RobotState.Idle;
                default:                   return false;
            }
        }

        /// <summary>Gözlenen girdilerden olması gereken durum (öncelik sırası önemli).</summary>
        public static RobotState Desired(in RobotSignals s)
        {
            if (!string.IsNullOrEmpty(s.ErrorMessage)) return RobotState.Error;
            if (s.MicrophoneOpen && s.UserSpeaking) return RobotState.Listening;   // söz kesme dahil
            if (s.CharacterSpeaking) return RobotState.Speaking;
            if (s.AwaitingResponse) return RobotState.Thinking;
            if (s.MicrophoneOpen) return RobotState.Listening;
            return RobotState.Idle;
        }

        /// <summary>Girdileri değerlendirir, gerekirse geçiş yapar ve geçerli durumu döndürür.</summary>
        public RobotState Update(in RobotSignals signals, double now)
        {
            RobotState target = Desired(signals);

            if (Current == RobotState.Error)
            {
                if (target == RobotState.Error)
                {
                    ErrorMessage = signals.ErrorMessage;
                    return Current;
                }
                if (TimeInState(now) < MinimumErrorSeconds)
                    return Current;
            }

            if (target == RobotState.Error)
                ErrorMessage = signals.ErrorMessage;

            if (target == Current)
                return Current;

            if (IsAllowed(Current, target))
            {
                Enter(target, now);
            }
            else
            {
                // Doğrudan geçiş yoksa bekleme durumu üzerinden geçilir (örn. Error → Speaking).
                Enter(RobotState.Idle, now);
                if (IsAllowed(RobotState.Idle, target))
                    Enter(target, now);
            }
            return Current;
        }

        /// <summary>Durumu doğrudan bekleme durumuna alır (sahne yeniden kurulunca, karakter değişince).</summary>
        public void Reset(double now)
        {
            if (Current != RobotState.Idle)
                Enter(RobotState.Idle, now);
            ErrorMessage = null;
        }

        private void Enter(RobotState next, double now)
        {
            if (next == Current) return;
            Previous = Current;
            Current = next;
            EnteredAt = now;
            if (next != RobotState.Error)
                ErrorMessage = null;
            StateChanged?.Invoke(Previous, Current);
        }
    }
}
