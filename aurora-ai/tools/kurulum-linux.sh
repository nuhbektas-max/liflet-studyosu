#!/usr/bin/env bash
# AURORA AI - FAZ 1 ortam kurulumu (Linux / macOS)
#
# Yaptıkları:
#   1. git ve git-lfs var mı bakar.
#   2. VHToolkit'i vhtoolkit.lock'taki commit'e klonlar (ya da var olanı kullanır)
#      ve o commit'ten "aurora" dalını açar. Orijinal sürüm git geçmişinde durur;
#      bu, çalışan sahnenin yedeğidir.
#   3. Submodule (RideServices) ve LFS dosyalarını indirir.
#   4. Unity sürümünü ProjectVersion.txt'den doğrular.
#   5. Bu depodaki aurora-ai/Assets/Aurora klasörünü VHUnityURP/Assets/Aurora'ya bağlar.
#   6. SampleScene'in kopyasını Assets/Aurora/Scenes/AuroraMain.unity olarak açar
#      (yalnızca yoksa; orijinal SampleScene'e dokunulmaz).
#   7. Unity Hub'da doğru editör ve Android modülü kurulu mu bakar.
#
# Kullanım:
#   tools/kurulum-linux.sh [--hedef KLASOR] [--lfs-yok] [--submodule-yok]
#
#   --hedef KLASOR   VHToolkit'in klonlanacağı yer (varsayılan: ~/AuroraAI/vhtoolkit)
#   --lfs-yok        LFS sanat dosyalarını indirme (yalnızca kod incelemesi için;
#                    Unity'de karakterler pembe/eksik görünür)
#   --submodule-yok  RideServices (yerel Docker servisleri) submodule'ünü indirme
set -euo pipefail

BURASI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AURORA_KOK="$(cd "$BURASI/.." && pwd)"
KILIT="$AURORA_KOK/vhtoolkit.lock"

HEDEF="${HOME}/AuroraAI/vhtoolkit"
LFS=1
SUBMODULE=1

while [ $# -gt 0 ]; do
  case "$1" in
    --hedef) HEDEF="$2"; shift 2 ;;
    --lfs-yok) LFS=0; shift ;;
    --submodule-yok) SUBMODULE=0; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "Bilinmeyen seçenek: $1" >&2; exit 2 ;;
  esac
done

oku() { grep -E "^$1=" "$KILIT" | head -1 | cut -d= -f2-; }
VHTOOLKIT_URL="${VHTOOLKIT_URL:-$(oku VHTOOLKIT_URL)}"
VHTOOLKIT_COMMIT="$(oku VHTOOLKIT_COMMIT)"
UNITY_VERSION="$(oku UNITY_VERSION)"
AURORA_BRANCH="$(oku AURORA_BRANCH)"

tamam() { printf '  [TAMAM] %s\n' "$1"; }
uyari() { printf '  [UYARI] %s\n' "$1"; UYARI_SAYISI=$((UYARI_SAYISI + 1)); }
hata()  { printf '  [HATA]  %s\n' "$1" >&2; exit 1; }
UYARI_SAYISI=0

echo "1) Araçlar"
command -v git >/dev/null 2>&1 || hata "git bulunamadı. Kurun: sudo apt install git (macOS: brew install git)"
tamam "git $(git --version | awk '{print $3}')"
if [ "$LFS" = 1 ]; then
  command -v git-lfs >/dev/null 2>&1 || hata "git-lfs bulunamadı. Kurun: sudo apt install git-lfs (macOS: brew install git-lfs)"
  git lfs install --skip-repo >/dev/null
  tamam "git-lfs $(git lfs version | awk '{print $1}' | cut -d/ -f2)"
fi

echo "2) VHToolkit deposu ($VHTOOLKIT_COMMIT)"
if [ -d "$HEDEF/.git" ]; then
  tamam "Var olan klon kullanılıyor: $HEDEF"
  if [ -n "$(git -C "$HEDEF" status --porcelain --untracked-files=no)" ]; then
    uyari "Klonda kaydedilmemiş değişiklik var; dal değiştirilmedi. Önce commit edin."
  fi
else
  mkdir -p "$(dirname "$HEDEF")"
  echo "  Klonlanıyor (büyük depo, zaman alabilir)..."
  # LFS dosyaları klon sırasında değil, 3. adımda "git lfs pull" ile iner (kesilirse kaldığı yerden sürer).
  GIT_LFS_SKIP_SMUDGE=1 git clone "$VHTOOLKIT_URL" "$HEDEF"
  tamam "Klonlandı: $HEDEF"
fi

if ! git -C "$HEDEF" cat-file -e "${VHTOOLKIT_COMMIT}^{commit}" 2>/dev/null; then
  git -C "$HEDEF" fetch origin "$VHTOOLKIT_COMMIT" || hata "Commit indirilemedi: $VHTOOLKIT_COMMIT"
fi
SIMDIKI_DAL="$(git -C "$HEDEF" rev-parse --abbrev-ref HEAD)"
if [ "$SIMDIKI_DAL" != "$AURORA_BRANCH" ] && [ -z "$(git -C "$HEDEF" status --porcelain --untracked-files=no)" ]; then
  if git -C "$HEDEF" show-ref --verify --quiet "refs/heads/$AURORA_BRANCH"; then
    GIT_LFS_SKIP_SMUDGE=1 git -C "$HEDEF" checkout -q "$AURORA_BRANCH"
  else
    GIT_LFS_SKIP_SMUDGE=1 git -C "$HEDEF" checkout -q -b "$AURORA_BRANCH" "$VHTOOLKIT_COMMIT"
  fi
fi
tamam "Dal: $(git -C "$HEDEF" rev-parse --abbrev-ref HEAD) (orijinal sürüm $VHTOOLKIT_COMMIT git geçmişinde yedekli)"

echo "3) Submodule ve LFS"
if [ "$SUBMODULE" = 1 ]; then
  git -C "$HEDEF" submodule update --init --recursive
  tamam "Submodule'ler güncel"
else
  tamam "Submodule atlandı (--submodule-yok)"
fi
if [ "$LFS" = 1 ]; then
  git -C "$HEDEF" lfs pull
  tamam "LFS dosyaları indirildi"
else
  uyari "LFS atlandı: karakter ve sahne sanat dosyaları eksik olacak."
fi

echo "4) Unity sürümü"
URP="$HEDEF/VHUnityURP"
[ -f "$URP/ProjectSettings/ProjectVersion.txt" ] || hata "VHUnityURP bulunamadı: $URP"
PROJE_UNITY="$(grep -E '^m_EditorVersion:' "$URP/ProjectSettings/ProjectVersion.txt" | awk '{print $2}')"
if [ "$PROJE_UNITY" = "$UNITY_VERSION" ]; then
  tamam "VHUnityURP Unity $PROJE_UNITY istiyor (kilit dosyasıyla aynı)"
else
  uyari "VHUnityURP Unity $PROJE_UNITY istiyor, kilit dosyası $UNITY_VERSION diyor. FAZ 1 analizini yeni sürümle tekrarlayın."
fi

echo "5) Aurora klasörü"
AURORA_KAYNAK="$AURORA_KOK/Assets/Aurora"
AURORA_HEDEF="$URP/Assets/Aurora"
mkdir -p "$AURORA_KAYNAK/Scenes"
if [ -L "$AURORA_HEDEF" ]; then
  tamam "Bağ zaten var: $AURORA_HEDEF -> $(readlink "$AURORA_HEDEF")"
elif [ -e "$AURORA_HEDEF" ]; then
  uyari "$AURORA_HEDEF gerçek bir klasör; bağ kurulmadı. İçeriğini aurora-ai/Assets/Aurora'ya taşıyıp betiği yeniden çalıştırın."
else
  ln -s "$AURORA_KAYNAK" "$AURORA_HEDEF"
  tamam "Bağlandı: $AURORA_HEDEF -> $AURORA_KAYNAK"
fi
if ! grep -qxF 'VHUnityURP/Assets/Aurora' "$HEDEF/.git/info/exclude" 2>/dev/null; then
  printf '%s\n%s\n' 'VHUnityURP/Assets/Aurora' 'VHUnityURP/Assets/Aurora.meta' >> "$HEDEF/.git/info/exclude"
fi

echo "6) Sahne"
if [ -f "$AURORA_KAYNAK/Scenes/AuroraMain.unity" ]; then
  tamam "AuroraMain.unity zaten var; üzerine yazılmadı"
else
  # .meta kopyalanmaz: Unity yeni sahneye yeni GUID verir, SampleScene'le çakışmaz.
  cp "$URP/Assets/Scenes/SampleScene.unity" "$AURORA_KAYNAK/Scenes/AuroraMain.unity"
  tamam "SampleScene kopyalandı -> Assets/Aurora/Scenes/AuroraMain.unity (orijinal değişmedi)"
fi

echo "7) Unity Hub ve Android modülü"
EDITOR_ADAYLARI=(
  "$HOME/Unity/Hub/Editor/$UNITY_VERSION/Editor"
  "/Applications/Unity/Hub/Editor/$UNITY_VERSION/Unity.app/Contents"
)
EDITOR=""
for a in "${EDITOR_ADAYLARI[@]}"; do [ -d "$a" ] && EDITOR="$a" && break; done
if [ -z "$EDITOR" ]; then
  uyari "Unity $UNITY_VERSION bulunamadı. $URP/runUnity.sh Unity Hub ile doğru sürümü indirir (Android Build Support modülünü de seçin)."
else
  tamam "Unity editörü: $EDITOR"
  ANDROID="$(dirname "$EDITOR")/Editor/Data/PlaybackEngines/AndroidPlayer"
  [ -d "$ANDROID" ] || ANDROID="$EDITOR/PlaybackEngines/AndroidPlayer"
  if [ -d "$ANDROID" ]; then
    tamam "Android Build Support kurulu"
    for alt in SDK NDK OpenJDK; do
      if [ -d "$ANDROID/$alt" ]; then tamam "  $alt: $ANDROID/$alt"; else uyari "  $alt eksik (Unity Hub > Installs > Add modules > Android SDK & NDK Tools / OpenJDK)"; fi
    done
  else
    uyari "Android Build Support kurulu değil (Unity Hub > Installs > $UNITY_VERSION > Add modules)."
  fi
fi

echo
if [ "$UYARI_SAYISI" -eq 0 ]; then
  echo "Kurulum tamam. Unity'yi açmak için: $URP/runUnity.sh"
else
  echo "Kurulum $UYARI_SAYISI uyarıyla bitti; yukarıdaki [UYARI] satırlarına bakın."
fi
echo "Unity açılınca: Assets/Aurora/Scenes/AuroraMain sahnesini açın, API anahtarlarını Ride > Config... menüsünden girin."
