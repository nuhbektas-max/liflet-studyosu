// AURORA AI - robotun beş davranış durumu ve durum ışığı renkleri.
// Bu dosya UnityEngine kullanmaz: Unity'de Assembly-CSharp'ta, testlerde düz .NET'te derlenir.

namespace Aurora.Core
{
    /// <summary>Robotun görünür davranış durumu (şartname 5.1).</summary>
    public enum RobotState
    {
        Idle = 0,
        Listening = 1,
        Thinking = 2,
        Speaking = 3,
        Error = 4,
    }

    /// <summary>sRGB renk (0-1 aralığında). Unity tarafı bunu UnityEngine.Color'a çevirir.</summary>
    public readonly struct StatusColor
    {
        public readonly float R;
        public readonly float G;
        public readonly float B;

        public StatusColor(float r, float g, float b)
        {
            R = r;
            G = g;
            B = b;
        }

        public static StatusColor FromHex(int rgb) =>
            new StatusColor(((rgb >> 16) & 0xFF) / 255f, ((rgb >> 8) & 0xFF) / 255f, (rgb & 0xFF) / 255f);
    }

    /// <summary>Durum göstergesi renkleri (şartname bölüm 8) ve ekranda yazılacak Türkçe adlar.</summary>
    public static class RobotStatePalette
    {
        public static StatusColor ColorOf(RobotState state)
        {
            switch (state)
            {
                case RobotState.Listening: return StatusColor.FromHex(0x22C55E); // yeşil
                case RobotState.Thinking:  return StatusColor.FromHex(0xA855F7); // mor
                case RobotState.Speaking:  return StatusColor.FromHex(0x14D3C5); // turkuaz
                case RobotState.Error:     return StatusColor.FromHex(0xFF5A1F); // turuncu-kırmızı
                default:                   return StatusColor.FromHex(0x2F7BFF); // mavi (bekliyor)
            }
        }

        public static string LabelOf(RobotState state)
        {
            switch (state)
            {
                case RobotState.Listening: return "Dinliyor";
                case RobotState.Thinking:  return "Düşünüyor";
                case RobotState.Speaking:  return "Konuşuyor";
                case RobotState.Error:     return "Hata";
                default:                   return "Bekliyor";
            }
        }
    }
}
