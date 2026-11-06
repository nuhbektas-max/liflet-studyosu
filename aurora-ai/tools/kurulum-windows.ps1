# AURORA AI - FAZ 1 ortam kurulumu (Windows PowerShell 5.1 veya PowerShell 7)
#
# Linux betiğiyle (kurulum-linux.sh) aynı adımları yapar:
#   1. git ve git-lfs var mı bakar.
#   2. VHToolkit'i vhtoolkit.lock'taki commit'e klonlar, o commit'ten "aurora" dalını açar
#      (orijinal sürüm git geçmişinde yedekli kalır).
#   3. Submodule ve LFS dosyalarını indirir.
#   4. Unity sürümünü ProjectVersion.txt'den doğrular.
#   5. aurora-ai\Assets\Aurora klasörünü VHUnityURP\Assets\Aurora'ya "junction" ile bağlar
#      (yönetici yetkisi gerekmez).
#   6. SampleScene kopyasını Assets\Aurora\Scenes\AuroraMain.unity olarak açar (yoksa).
#   7. Unity Hub'da doğru editör ve Android modülü kurulu mu bakar.
#
# Kullanım (PowerShell'de, bu deponun kökünden):
#   powershell -ExecutionPolicy Bypass -File aurora-ai\tools\kurulum-windows.ps1 [-Hedef C:\AuroraAI\vhtoolkit] [-LfsYok] [-SubmoduleYok]

param(
    [string]$Hedef = (Join-Path $env:USERPROFILE "AuroraAI\vhtoolkit"),
    [switch]$LfsYok,
    [switch]$SubmoduleYok
)

# "Stop" kullanılmaz: Windows PowerShell 5.1 git'in stderr çıktısını hata sayıp betiği keser.
# Her git çağrısının çıkış kodu ayrıca denetlenir.
$ErrorActionPreference = "Continue"
$script:UyariSayisi = 0

function Tamam([string]$m) { Write-Host "  [TAMAM] $m" -ForegroundColor Green }
function Uyari([string]$m) { Write-Host "  [UYARI] $m" -ForegroundColor Yellow; $script:UyariSayisi++ }
function Hata([string]$m)  { Write-Host "  [HATA]  $m" -ForegroundColor Red; exit 1 }

# Basit fonksiyon ($args): "-C", "-q", "-b" gibi git seçenekleri PowerShell parametresi sanılmaz.
function Git-Calistir {
    & git @args
    if ($LASTEXITCODE -ne 0) { Hata "git $($args -join ' ') başarısız oldu (çıkış kodu $LASTEXITCODE)" }
}

$AuroraKok = Split-Path -Parent $PSScriptRoot
$Kilit = Join-Path $AuroraKok "vhtoolkit.lock"
$Degerler = @{}
Get-Content $Kilit | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object {
    $parca = $_.Split('=', 2); $Degerler[$parca[0]] = $parca[1]
}
$VhtUrl = if ($env:VHTOOLKIT_URL) { $env:VHTOOLKIT_URL } else { $Degerler["VHTOOLKIT_URL"] }
$VhtCommit = $Degerler["VHTOOLKIT_COMMIT"]
$UnitySurum = $Degerler["UNITY_VERSION"]
$AuroraDal = $Degerler["AURORA_BRANCH"]

Write-Host "1) Araçlar"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Hata "git bulunamadı. Kurun: winget install Git.Git" }
Tamam (git --version)
if (-not $LfsYok) {
    & git lfs version *> $null
    if ($LASTEXITCODE -ne 0) { Hata "git-lfs bulunamadı. Git for Windows ile gelir; yoksa: winget install GitHub.GitLFS" }
    Git-Calistir lfs install --skip-repo | Out-Null
    Tamam (git lfs version)
}

Write-Host "2) VHToolkit deposu ($VhtCommit)"
$env:GIT_LFS_SKIP_SMUDGE = "1"
if (Test-Path (Join-Path $Hedef ".git")) {
    Tamam "Var olan klon kullanılıyor: $Hedef"
} else {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Hedef) | Out-Null
    Write-Host "  Klonlanıyor (büyük depo, zaman alabilir)..."
    Git-Calistir clone $VhtUrl $Hedef
    Tamam "Klonlandı: $Hedef"
}
# Windows'ta uzun yollar (Reallusion klasörleri) için:
Git-Calistir -C $Hedef config core.longpaths true

& git -C $Hedef cat-file -e "$VhtCommit^{commit}" 2>$null
if ($LASTEXITCODE -ne 0) { Git-Calistir -C $Hedef fetch origin $VhtCommit }

$Degisiklik = (& git -C $Hedef status --porcelain --untracked-files=no)
$SimdikiDal = (& git -C $Hedef rev-parse --abbrev-ref HEAD)
if ($Degisiklik) {
    Uyari "Klonda kaydedilmemiş değişiklik var; dal değiştirilmedi. Önce commit edin."
} elseif ($SimdikiDal -ne $AuroraDal) {
    & git -C $Hedef show-ref --verify --quiet "refs/heads/$AuroraDal"
    if ($LASTEXITCODE -eq 0) { Git-Calistir -C $Hedef checkout -q $AuroraDal }
    else { Git-Calistir -C $Hedef checkout -q -b $AuroraDal $VhtCommit }
}
Tamam "Dal: $(& git -C $Hedef rev-parse --abbrev-ref HEAD) (orijinal sürüm $VhtCommit git geçmişinde yedekli)"

Write-Host "3) Submodule ve LFS"
if (-not $SubmoduleYok) { Git-Calistir -C $Hedef submodule update --init --recursive; Tamam "Submodule'ler güncel" }
else { Tamam "Submodule atlandı (-SubmoduleYok)" }
Remove-Item Env:\GIT_LFS_SKIP_SMUDGE
if (-not $LfsYok) { Git-Calistir -C $Hedef lfs pull; Tamam "LFS dosyaları indirildi" }
else { Uyari "LFS atlandı: karakter ve sahne sanat dosyaları eksik olacak." }

Write-Host "4) Unity sürümü"
$Urp = Join-Path $Hedef "VHUnityURP"
$SurumDosyasi = Join-Path $Urp "ProjectSettings\ProjectVersion.txt"
if (-not (Test-Path $SurumDosyasi)) { Hata "VHUnityURP bulunamadı: $Urp" }
$ProjeUnity = ((Get-Content $SurumDosyasi | Where-Object { $_ -match '^m_EditorVersion:' }) -split '\s+')[1]
if ($ProjeUnity -eq $UnitySurum) { Tamam "VHUnityURP Unity $ProjeUnity istiyor (kilit dosyasıyla aynı)" }
else { Uyari "VHUnityURP Unity $ProjeUnity istiyor, kilit dosyası $UnitySurum diyor. FAZ 1 analizini yeni sürümle tekrarlayın." }

Write-Host "5) Aurora klasörü"
$AuroraKaynak = Join-Path $AuroraKok "Assets\Aurora"
$AuroraHedef = Join-Path $Urp "Assets\Aurora"
New-Item -ItemType Directory -Force -Path (Join-Path $AuroraKaynak "Scenes") | Out-Null
if (Test-Path $AuroraHedef) {
    $oge = Get-Item $AuroraHedef -Force
    if ($oge.Attributes -band [IO.FileAttributes]::ReparsePoint) { Tamam "Bağ zaten var: $AuroraHedef" }
    else { Uyari "$AuroraHedef gerçek bir klasör; bağ kurulmadı. İçeriğini aurora-ai\Assets\Aurora'ya taşıyıp betiği yeniden çalıştırın." }
} else {
    New-Item -ItemType Junction -Path $AuroraHedef -Target $AuroraKaynak | Out-Null
    Tamam "Bağlandı: $AuroraHedef -> $AuroraKaynak"
}
$Exclude = Join-Path $Hedef ".git\info\exclude"
if (-not (Select-String -Path $Exclude -SimpleMatch -Pattern "VHUnityURP/Assets/Aurora" -Quiet -ErrorAction SilentlyContinue)) {
    Add-Content -Path $Exclude -Value "VHUnityURP/Assets/Aurora`nVHUnityURP/Assets/Aurora.meta"
}

Write-Host "6) Sahne"
$Sahne = Join-Path $AuroraKaynak "Scenes\AuroraMain.unity"
if (Test-Path $Sahne) { Tamam "AuroraMain.unity zaten var; üzerine yazılmadı" }
else {
    # .meta kopyalanmaz: Unity yeni sahneye yeni GUID verir.
    Copy-Item (Join-Path $Urp "Assets\Scenes\SampleScene.unity") $Sahne
    Tamam "SampleScene kopyalandı -> Assets\Aurora\Scenes\AuroraMain.unity (orijinal değişmedi)"
}

Write-Host "7) Unity Hub ve Android modülü"
$Editor = Join-Path $env:ProgramFiles "Unity\Hub\Editor\$UnitySurum\Editor"
if (-not (Test-Path $Editor)) {
    Uyari "Unity $UnitySurum bulunamadı. $Urp\runUnity.bat Unity Hub ile doğru sürümü indirir (Android Build Support modülünü de seçin)."
} else {
    Tamam "Unity editörü: $Editor"
    $Android = Join-Path $Editor "Data\PlaybackEngines\AndroidPlayer"
    if (Test-Path $Android) {
        Tamam "Android Build Support kurulu"
        foreach ($alt in "SDK", "NDK", "OpenJDK") {
            if (Test-Path (Join-Path $Android $alt)) { Tamam "  ${alt}: $(Join-Path $Android $alt)" }
            else { Uyari "  $alt eksik (Unity Hub > Installs > Add modules > Android SDK & NDK Tools / OpenJDK)" }
        }
    } else {
        Uyari "Android Build Support kurulu değil (Unity Hub > Installs > $UnitySurum > Add modules)."
    }
}

Write-Host ""
if ($script:UyariSayisi -eq 0) { Write-Host "Kurulum tamam. Unity'yi açmak için: $Urp\runUnity.bat" }
else { Write-Host "Kurulum $($script:UyariSayisi) uyarıyla bitti; yukarıdaki [UYARI] satırlarına bakın." }
Write-Host "Unity açılınca: Assets/Aurora/Scenes/AuroraMain sahnesini açın, API anahtarlarını Ride > Config... menüsünden girin."
