// AURORA AI - durum ışığı (şartname bölüm 8 ve 5.1).
// RobotBehaviorController'ın durumunu renk olarak gösterir:
//   Bekliyor mavi, Dinliyor yeşil, Düşünüyor mor (yavaş nabız), Konuşuyor turkuaz, Hata turuncu-kırmızı (hızlı yanıp söner).
// Aynı renk üç yere birden verilebilir; hepsi isteğe bağlıdır:
//   1. Arayüzdeki bir Image (ekrandaki küçük ışık)
//   2. Robot modelindeki LED parçaları (Renderer; malzemede Emission açık olmalı, URP Lit "_EmissionColor")
//   3. Bir Light (robotun yüzüne/göğsüne vuran renkli ışık)
// Robot modeli gelince (FAZ 2 duraklama noktası) LED parçaları Inspector'dan bağlanır.

using Aurora.Behavior;
using Aurora.Core;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace Aurora.UI
{
    public class StatusIndicator : MonoBehaviour
    {
        private static readonly int EmissionColorId = Shader.PropertyToID("_EmissionColor");

        [Tooltip("Boşsa sahnede bulunur.")]
        [SerializeField] private RobotBehaviorController m_behavior;

        [Header("Gösterim (hepsi isteğe bağlı)")]
        [SerializeField] private Image m_statusImage;
        [SerializeField] private TMP_Text m_statusLabel;
        [SerializeField] private Renderer[] m_ledRenderers = new Renderer[0];
        [SerializeField] private Light m_statusLight;

        [Header("Işık")]
        [SerializeField, Min(0f)] private float m_ledIntensity = 2.5f;
        [SerializeField, Min(0f)] private float m_lightIntensity = 1.2f;
        [Tooltip("Renk geçiş süresi (saniye).")]
        [SerializeField, Min(0.01f)] private float m_blendSeconds = 0.25f;

        private MaterialPropertyBlock m_block;
        private Color m_from;
        private Color m_to;
        private float m_blendStart;

        private void Awake()
        {
            m_block = new MaterialPropertyBlock();
            if (m_behavior == null)
                m_behavior = FindAnyObjectByType<RobotBehaviorController>();
            m_to = m_from = ToColor(RobotStatePalette.ColorOf(RobotState.Idle));
        }

        private void OnEnable()
        {
            if (m_behavior != null)
            {
                m_behavior.OnStateChanged += HandleStateChanged;
                Show(m_behavior.CurrentState, instant: true);
            }
            else
            {
                Debug.LogWarning("[AURORA] StatusIndicator: RobotBehaviorController bulunamadı.", this);
            }
        }

        private void OnDisable()
        {
            if (m_behavior != null)
                m_behavior.OnStateChanged -= HandleStateChanged;
        }

        private void HandleStateChanged(RobotState previous, RobotState next) => Show(next, instant: false);

        private void Show(RobotState state, bool instant)
        {
            m_from = instant ? ToColor(RobotStatePalette.ColorOf(state)) : CurrentBaseColor();
            m_to = ToColor(RobotStatePalette.ColorOf(state));
            m_blendStart = instant ? -m_blendSeconds : Time.unscaledTime;
            if (m_statusLabel != null)
                m_statusLabel.text = RobotStatePalette.LabelOf(state);
        }

        private Color CurrentBaseColor()
        {
            float t = Mathf.Clamp01((Time.unscaledTime - m_blendStart) / m_blendSeconds);
            return Color.Lerp(m_from, m_to, t);
        }

        private void Update()
        {
            RobotState state = m_behavior != null ? m_behavior.CurrentState : RobotState.Idle;
            Color baseColor = CurrentBaseColor();
            float pulse = PulseFor(state, Time.unscaledTime);

            if (m_statusImage != null)
                m_statusImage.color = new Color(baseColor.r, baseColor.g, baseColor.b, Mathf.Lerp(0.55f, 1f, pulse));

            if (m_ledRenderers != null && m_ledRenderers.Length > 0)
            {
                Color emission = baseColor * (m_ledIntensity * Mathf.Lerp(0.35f, 1f, pulse));
                for (int i = 0; i < m_ledRenderers.Length; i++)
                {
                    Renderer r = m_ledRenderers[i];
                    if (r == null) continue;
                    r.GetPropertyBlock(m_block);
                    m_block.SetColor(EmissionColorId, emission);
                    r.SetPropertyBlock(m_block);
                }
            }

            if (m_statusLight != null)
            {
                m_statusLight.color = baseColor;
                m_statusLight.intensity = m_lightIntensity * Mathf.Lerp(0.4f, 1f, pulse);
            }
        }

        /// <summary>0..1 parlaklık. Düşünürken yavaş nabız, hatada hızlı yanıp sönme, diğerlerinde sabit.</summary>
        private static float PulseFor(RobotState state, float time)
        {
            switch (state)
            {
                case RobotState.Thinking: return 0.5f + 0.5f * Mathf.Sin(time * Mathf.PI * 1.2f);
                case RobotState.Error:    return Mathf.Repeat(time * 2f, 1f) < 0.5f ? 1f : 0.2f;
                case RobotState.Listening:return 0.85f + 0.15f * Mathf.Sin(time * Mathf.PI * 2f);
                default:                  return 1f;
            }
        }

        private static Color ToColor(StatusColor c) => new Color(c.R, c.G, c.B, 1f);
    }
}
