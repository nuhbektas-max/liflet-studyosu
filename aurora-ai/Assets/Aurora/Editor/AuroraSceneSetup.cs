// AURORA AI - sahne kurulum menüsü (yalnızca Unity editöründe çalışır).
// Menü: Aurora > Sahneye AURORA bileşenlerini ekle
// Açık sahneye (AuroraMain) şu nesneleri ekler; VHToolkit nesnelerine dokunmaz:
//   AURORA_AI
//   ├── Robot  (RobotBehaviorController)
//   └── UI     (Canvas: sağ üstte durum ışığı + yazısı, StatusIndicator)
// Tekrar çalıştırılırsa var olanı bulur, ikinci kopya açmaz. Geri al (Ctrl+Z) çalışır.

using Aurora.Behavior;
using Aurora.UI;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;

namespace Aurora.EditorTools
{
    public static class AuroraSceneSetup
    {
        private const string RootName = "AURORA_AI";

        [MenuItem("Aurora/Sahneye AURORA bileşenlerini ekle")]
        public static void AddAuroraToScene()
        {
            GameObject root = GameObject.Find(RootName);
            if (root == null)
            {
                root = new GameObject(RootName);
                Undo.RegisterCreatedObjectUndo(root, "AURORA kur");
            }

            RobotBehaviorController behavior = Object.FindAnyObjectByType<RobotBehaviorController>();
            if (behavior == null)
            {
                var robot = new GameObject("Robot");
                Undo.RegisterCreatedObjectUndo(robot, "AURORA kur");
                robot.transform.SetParent(root.transform, false);
                behavior = Undo.AddComponent<RobotBehaviorController>(robot);
            }

            StatusIndicator indicator = Object.FindAnyObjectByType<StatusIndicator>();
            if (indicator == null)
                indicator = CreateStatusUi(root.transform);

            var so = new SerializedObject(indicator);
            so.FindProperty("m_behavior").objectReferenceValue = behavior;
            so.ApplyModifiedProperties();

            EditorSceneManager.MarkSceneDirty(root.scene);
            Selection.activeGameObject = root;
            Debug.Log("[AURORA] Sahneye eklendi: AURORA_AI/Robot (RobotBehaviorController) ve AURORA_AI/UI (StatusIndicator). Sahneyi kaydedin.");
        }

        private static StatusIndicator CreateStatusUi(Transform parent)
        {
            var ui = new GameObject("UI", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            Undo.RegisterCreatedObjectUndo(ui, "AURORA kur");
            ui.transform.SetParent(parent, false);

            var canvas = ui.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 50;
            var scaler = ui.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080f, 1920f);
            scaler.matchWidthOrHeight = 0.5f;

            var badge = new GameObject("StatusIndicator", typeof(RectTransform));
            badge.transform.SetParent(ui.transform, false);
            var badgeRect = (RectTransform)badge.transform;
            badgeRect.anchorMin = badgeRect.anchorMax = new Vector2(1f, 1f);
            badgeRect.pivot = new Vector2(1f, 1f);
            badgeRect.anchoredPosition = new Vector2(-40f, -60f);
            badgeRect.sizeDelta = new Vector2(320f, 64f);

            var light = new GameObject("Light", typeof(RectTransform), typeof(Image));
            light.transform.SetParent(badge.transform, false);
            var lightRect = (RectTransform)light.transform;
            lightRect.anchorMin = lightRect.anchorMax = new Vector2(1f, 0.5f);
            lightRect.pivot = new Vector2(1f, 0.5f);
            lightRect.anchoredPosition = Vector2.zero;
            lightRect.sizeDelta = new Vector2(40f, 40f);
            var image = light.GetComponent<Image>();
            image.sprite = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/Knob.psd");
            image.raycastTarget = false;

            var label = new GameObject("Label", typeof(RectTransform), typeof(TextMeshProUGUI));
            label.transform.SetParent(badge.transform, false);
            var labelRect = (RectTransform)label.transform;
            labelRect.anchorMin = new Vector2(0f, 0f);
            labelRect.anchorMax = new Vector2(1f, 1f);
            labelRect.offsetMin = Vector2.zero;
            labelRect.offsetMax = new Vector2(-56f, 0f);
            var text = label.GetComponent<TextMeshProUGUI>();
            text.text = "Bekliyor";
            text.fontSize = 34f;
            text.alignment = TextAlignmentOptions.MidlineRight;
            text.color = new Color(0.92f, 0.95f, 1f, 1f);
            text.raycastTarget = false;

            var indicator = Undo.AddComponent<StatusIndicator>(badge);
            var so = new SerializedObject(indicator);
            so.FindProperty("m_statusImage").objectReferenceValue = image;
            so.FindProperty("m_statusLabel").objectReferenceValue = text;
            so.ApplyModifiedProperties();
            return indicator;
        }
    }
}
