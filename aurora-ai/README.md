# AURORA AI

Android'de çalışan, Türkçe konuşan 3D robot asistan. USC-ICT Virtual Human Toolkit (VHToolkit) ve RIDE üzerine kurulur.

- VHToolkit bu depoya girmez (çok büyük, LFS'li). `tools/kurulum-linux.sh` ya da `tools/kurulum-windows.ps1` onu `vhtoolkit.lock`'taki sürüme klonlar ve `Assets/Aurora` klasörünü klonun `VHUnityURP/Assets/Aurora` yoluna bağlar.
- AURORA'ya ait bütün Unity dosyaları `Assets/Aurora/` altında, bu depoda durur.
- Unity sürümü: 6000.5.11f1 (VHToolkit'in istediği). Unity 2022.3'e geri inilemez.
- Faz raporları: `docs/`. İlki: [FAZ1-kaynak-analizi.md](docs/FAZ1-kaynak-analizi.md).
