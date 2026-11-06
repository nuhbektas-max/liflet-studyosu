# CLAUDE.md

Bu dosya her oturumun başında okunur. Önemli kararları ve kuralları buraya ekleyin.

## Rol

- Varsayılan rol: Excel Asistanı. Tablo, hesap, analiz, rapor, araştırma ve kıyaslama işlerinde `.claude/agents/excel-asistani.md` kurallarına uy.
- Yazılım yazmak varsayılan iş değil, ama yasak da değil. Kullanıcı açıkça isterse (örneğin `/kod` ile) yazılım işi yapılır.

## Dil

- Kullanıcıyla Türkçe konuş.
- Bir iş bitince bağlantıları sorulmadan, mesajın en başında ver: Besi Rasyon için APK dosyasını sohbete gönder, GitHub indirme sayfasının ve web sürümünün bağlantısını yaz.
- Commit mesajları İngilizce.

## Çalışmaları ayrı tutma

- Claude'un Drive'a yazdığı her şey **"Claude depo"** klasörünün içine gider (kullanıcı kuralı, 2026-11-01): https://drive.google.com/drive/folders/15A_cnCunXfBao2kn3gytUpwbws3ie790 . Drive'ın köküne ya da başka bir yere klasör veya dosya açılmaz; tüm yedekler buraya yazılır.
- Kullanıcının her çalışması "Claude depo" içinde kendi klasöründe durur; çalışmalar birbirine karıştırılmaz. Yeni bir çalışma başlarsa ona da "Claude depo" içinde ayrı klasör açılır ve aşağıdaki listeye eklenir.
- Yeşil Eller (AnkaraKA başvurusu): https://drive.google.com/drive/folders/1TPKT6ykFDOtSm_hf9Ze5BCKUQulA6GR4
- Besi Rasyon: https://drive.google.com/drive/folders/18d1dRmDv89du2wq4KemMlfm2R8Mukvdv
- Excel - Liste Karşılaştırma: https://drive.google.com/drive/folders/1JRjomjqKhn4Q7copWJ7c-ZJenHCY_uj3
- OmniRoute Kılavuzu: https://drive.google.com/drive/folders/1HnD-p9Ek0RW8o0lluYiCmuOd7OOxXzrj
- Excel Veri Analiz Programı: https://drive.google.com/drive/folders/17J1587Br6QixAKVkJKEYEsSeQ7R5Xanb
- İlaç Takip: https://drive.google.com/drive/folders/1MK-282Mb4IWAqAU7kHlcqLzJJOvvDJ2L
- Kod GitHub'daki bu depoda kalır (kullanıcı tercihi, 2026-10-31).

## Depo içeriği

- Excel işleri (Veri Analiz uygulaması, eski PowerShell programı, liste karşılaştırma şablonu ve sayfası) `nuhbektas-max/bektas2` deposunda. Bu depoda yok.

- `yesil-eller/anka-basvuru-metni.md`: Ankara Kalkınma Ajansı (AnkaraKA) 2026 Yılı Anadoludakiler Kırsal Kalkınma Mali Destek Programı (TR51/26/ALT_KIR) başvuru taslağı. Proje adı "Yeşil Eller: Kırsalda Kadın Emeğiyle Tam Otomasyonlu Serada Süs Bitkisi Üretimi". Ana metin budur.
- Google Drive kopyası: "Yeşil Eller - AnkaraKA Başvurusu" klasöründe Google Dokümanı (https://docs.google.com/document/d/1YSC7gXSawIBY2tlhMahI5qPNL6HsRz_-SCwEXwXvgM0/edit). Önceki taslaklar "Eski Sürümler" alt klasöründedir. Klasör: https://drive.google.com/drive/folders/1TPKT6ykFDOtSm_hf9Ze5BCKUQulA6GR4. Markdown değişirse bu kopya kendiliğinden güncellenmez.
- `yesil-eller/on-basvuru-ozeti.md` / `.docx`: Ön başvuru için kısa proje özeti (son tarih 23/11/2026 17:00). Drive kopyası: https://docs.google.com/document/d/1xgAYlDGEu89fefjS6KA525sTnDAW6wBN4xT8LczrHCw/edit Ana metinden türetilir; ana metinde rakam değişirse bu da güncellenir.
- `yesil-eller/imzaya-gidecek/belediye-niyet-mektubu-taslagi.md` / `.docx`: Kalecik Belediyesi'nin imzalayacağı destek ve mevsimlik çiçek alım niyet mektubu taslağı. Drive kopyası: https://docs.google.com/document/d/1zaPDohm1vUMylROvDaIMBRL9z9lg-9NSmcgJjwYR6wo/edit
- `yesil-eller/imzaya-gidecek/dosim-niyet-mektubu-taslagi.md` / `.docx`: Ankara Üniversitesi DÖSİM satış-pazarlama niyet mektubu taslağı. Drive: https://docs.google.com/document/d/1nDzFN2yGidRyoVgeVrCNxQX8TwYeVyu6I8wmDe2UsB4/edit
- `yesil-eller/imzaya-gidecek/tarim-il-mudurlugu-niyet-mektubu-taslagi.md` / `.docx`: İl Tarım ve Orman Müdürlüğü arazi tahsisi niyet mektubu taslağı. Drive: https://docs.google.com/document/d/1W5MesuMsB8RvHoyV8ScvGHR7ZDzr6U5B21EKPdJwJzA/edit
- `yesil-eller/imzaya-gidecek/ziraat-odasi-meclis-karari-taslagi.md` / `.docx`: Kalecik Ziraat Odası meclis kararı taslağı (başvuru, 5 milyon TL eş finansman, 2,4 milyon TL personel katkısı, yetki). Drive: https://docs.google.com/document/d/1EitwjBVs5xG9i9UXJFsNALEAQU9Irqbf_UhQAQ4kOPc/edit
- Drive düzeni (Yeşil Eller klasörü): ana metin ve ön başvuru özeti klasörün kökünde; imzaya gidecek dört yazı "İmzaya Gidecek Yazılar" alt klasöründe (https://drive.google.com/drive/folders/1ah2KZgXLhPm4LLagwSs-2JO3YK4Gkh4d); eski taslaklar "Eski Sürümler" alt klasöründe (https://drive.google.com/drive/folders/1yPObBkEBwyZSvFLtQSvY6Zyzl-JebK6l).
- `yesil-eller/anka-basvuru-metni.docx`: Aynı metnin Word sürümü. Markdown değişince Word sürümünü de yeniden üret, ikisi farklılaşmasın.
- Android imzası: APK'lar GitHub Secrets'taki `ANDROID_KEYSTORE_B64` (base64 keystore, takma ad `bektas`) ve `ANDROID_KEYSTORE_PASS` ile imzalanır; tanımlı değilse geçici anahtar kullanılır ve güncelleme eskisinin üzerine kurulmaz. Anahtar depoya konmaz.
- `besi-rasyon/`: Besi Rasyon, besi sığırı için en ucuz dengeli rasyonu hesaplayan uygulama. `www/` ekran ve hesap motoru (Android ve web aynı dosyaları kullanır), `android/` APK projesi, `web/build.py` claude.ai'de yayınlanan web sürümünü üretir, `test/model.test.js` hesap testleri. APK'yı `.github/workflows/besi-rasyon-apk.yml` derleyip GitHub Releases'a koyar; sürüm numarası `android/app/build.gradle`, `www/sw.js`, `www/index.html`, `windows/package.json` (x.y.0 biçiminde) ve iş akışında birlikte artırılır. `windows/`: Windows kurulum ve taşınabilir exe; `www/` dosyalarını Electron ile paketler, aynı iş akışında `windows-latest` üzerinde derlenip aynı release'e eklenir (`npm run dist`; yerelde Linux'ta derlenmez, wine ister). `preload.js` sayfaya `BesiAndroid` köprüsünü verir (PDF kaydetme, panoya kopyalama, WhatsApp); iş akışı derlemeden önce `electron . --smoke-test` ile uygulamayı açıp rasyon ve PDF üretimini sınar. Ekran: telefon, dikey tablet (720–1079 px: geniş tek sütun, alanlar 3, yemler 2 sütun), geniş ekran (1080 px üstü: solda giriş, sağda sonuç). Web sürümü: https://claude.ai/artifact/CUdzMnj5MNWjZ5jyJ8wAim. iPhone: `www/` klasörü olduğu gibi herkese açık `nuhbektas-max/besi-rasyon` deposuna kopyalanır ve hem `main` hem `gh-pages` dalına gönderilir (GitHub Pages `gh-pages` dalından yayınlar, `.nojekyll` var); Safari'de "Ana Ekrana Ekle" ile kurulur, servis çalışanıyla internetsiz çalışır. Depo 2026-11-01'de açıldı (adres: https://nuhbektas-max.github.io/besi-rasyon/); sürüm her artışta `www/` içeriği oraya da kopyalanıp gönderilir (bu ortamdan github.io adresine erişilemiyor, yayını kullanıcı doğrular).
- `ilac-takip/`: İlaç Takip 2.0, ilaç ve iğne hatırlatma uygulaması (Android). Kullanıcının Google AI Studio'da yaptırdığı "İlaç ve İğne Takip" APK'sının (`com.aistudio.ilactakip`, kaynak kodu yok) yeniden yazımı; paket `com.bektas.ilactakip`, eskisinin üzerine kurulmaz, veri eski uygulamanın yedeğinden aktarılır. `www/` ekran (`model.js` kurallar, `app.js` ekran), `android/` Java: tek alarm kurulur (`Zamanlayici`, `setAlarmClock`), çalınca `AlarmAlici` olayları işler; `CalmaServisi` sesi/titreşimi çalar, `AlarmEkrani` kilit ekranında açılır, `Islem` doz işaretler. Doz günü kuralı `model.js` ve `Takvim.java`'da birebir aynı, biri değişirse öteki de. Veri `durum.json`'da (Android), web'de localStorage. `test/model.test.js` testleri; APK'yı `.github/workflows/ilac-takip-apk.yml` her dalda derler, `ilac-takip-apk-latest` etiketine ve Releases'a koyar. Sürüm `android/app/build.gradle`, `www/index.html` (meta surum) ve iş akışında birlikte artırılır. Ekran 320 px'te de taşmadan çalışmalı (Playwright ile denetlendi). İnternet izni yok, tamamen çevrimdışı. Otomatik yedek: Android Google yedeği (`res/xml/veri_kurallari.xml`, yalnızca `durum.json`) ve her gün İndirilenler/İlaç Takip/ilac-takip-yedek.json (`Yedek.java`). Ayarlar'da 6 renk seçeneği var (`data-renk`). Çoklu hasta (kullanıcı isteği): `hastalar` dizisi, her ilaç ve randevuda `hasta` kimliği, her hastanın ayrı rengi; alarm ekranı ve bildirimler hasta adıyla çalar, farklı hastaların dozu aynı anda çalarsa toplu "Aldım" yok, her hasta ayrı işaretlenir. 2.5: kendi simge takımı (`www/ikonlar.js`), sabah/öğle/akşam/gece dilimleri, hasta fotoğrafı, akşam 21–07 kendiliğinden koyu tema, "Aldım" onay hareketi. Logo: Türk kırmızısı zemin üzerinde beyaz kapsül; varsayılan renk Türk kırmızısı. Kızılay'ın kırmızı hilal amblemi koruma altında olduğu için logo olarak kullanılmadı (kullanıcı istemişti, uyarıldı). Doktor ekranında MHRS (Alo 182), e-Nabız ve e-Devlet nöbetçi eczane bağlantıları var. 2.6: sesli okuma (`Sesli.java`, telefonun Türkçe ses motoru, alarm çalarken 30 saniyede bir) ve randevu hatırlatması (1 gün ve 2 saat önce, `Takvim.randevuOlaylari`). 2.7: ilaç kutusu fotoğrafı (`ilac.foto`, 320 px JPEG; kamera ya da galeri), listede, sıradaki ilaçta ve alarm ekranında büyük görünür. 2.8 (kullanıcı isteği): her hastanın ekranı kendi çok uçuk renginde (sarı, yeşil, mor, mavi, pembe, turuncu…; hasta seçilince bütün tema değişir), hastanın telefonu ve ebeveyni (ad + WhatsApp numarası); ilaç alınınca WhatsApp ebeveyne hazır mesajla açılır (`Haber.java`; WhatsApp otomatik göndermeye izin vermez, Gönder'e basılır), her ilaç saatinin dozu ayrı (`ilac.dozlar` {saat: miktar}; stok o saatin dozuyla düşer). 2.9 (kullanıcı isteği): Bugün listesinde yalnızca sıradaki ilaç açık, diğerleri tek satır (dokununca açılır); her ilacın kendi rengi (12 renk, formda öne çıkarıldı, yeni ilaca hastanın kullanmadığı renk); WhatsApp otomatik gönderme: kullanıcı bir kez Erişilebilirlik iznini verir (`OtoGonder.java`, yalnızca WhatsApp'ta ve yalnızca İlaç Takip'in açtığı mesajda 90 saniye içinde Gönder'e basar), sonra mesaj onaysız gider. Android 13+ yandan yüklenen uygulamada önce "Kısıtlanmış ayarlara izin ver" gerekir.
- `sunu/besi-bakim-besleme-sunusu.pptx`: Besi sığırcılığında bakım ve besleme sunusu (14 slayt, Türkçe; rasyon örneği Besi Rasyon hesap motorundan, kârlılık slaytındaki fiyatlar varsayım). Rakamlar genel aralıktır, örnek grafikler işaretlidir.
- `.claude/skills/`: Projeye özel skill'ler (`arena`, `promptmaster`, `karpathy-guidelines`, `kod`, `ankaraka-proje-ve-editor-asistani`: AnkaraKA Kırsal Kalkınma programı kuralları ve editör denetimi).
- `.claude/agents/proje-ajani.md`: Proje Ajanı. Başvuru metnini doldurur, tutarlılığını denetler, Word sürümünü ve bu dosyayı günceller. Kullanıcı "Proje Ajanı" dediğinde bu ajanı kullan.
- `.claude/agents/excel-asistani.md`: Excel Asistanı. Excel/Google Sheets tabloları hazırlar ve denetler, analiz, rapor, araştırma ve kıyaslama yapar.

- `docs/omniroute-claude-code.md`: Claude Code'u OmniRoute yönlendiricisi üzerinden başka sağlayıcılarla çalıştırma kılavuzu (yerel bilgisayar için).

## Başvuru metni kuralları

- Yer tutucular: `[DOLDURULACAK: ...]` kullanıcının sağlayacağı bilgi, `[TEYİT EDİLECEK: ...]` rehberden veya resmi kaynaktan doğrulanacak bilgi. Bunları tahminle doldurma; kaynağı yoksa yer tutucu olarak bırak.
- Tutarlılık: Bütçe ve varsayımlar birbirine bağlı. Bir rakam değişirse Bölüm 7 (göstergeler), 8 (bütçe) ve 10 (sürdürülebilirlik) tablolarını birlikte güncelle.
- Varsayımlar ve süre kuralı metnin sonundaki "Doldurana Notlar" bölümünde. Bu bölüm forma aktarılmaz.
- Temel rakamlar: toplam uygun bütçe 10.000.000 TL (kullanıcı sınırı, aşılmayacak), destek 5.000.000 TL (%50; programın azami tutarı ve oranı), eş finansman 5.000.000 TL (Kalecik Ziraat Odası nakdi), bütçe dışı katkılar 2.800.000 TL + arazi, süre 12 ay, Öncelik 4 (Öncelik 5'e de katkı). Destek 500.000–5.000.000 TL arasında, oran %25–50 arasında olmalı.
- Sera (kullanıcının istediği): 2.000 m² (2 dekar), polikarbonat örtü, galvaniz iskelet, betonarme çevre temeli, iki kademeli servis kapısı ve işçi girişi, tam otomasyonlu iklim kontrolü, ısıtma doğalgazlı sıcak hava üreteçleri + ısı pompalı klimalar (güneş ısısı ve ısı pompası bütçe nedeniyle çıkarıldı).
- Başvuru sahibi Kalecik Ziraat Odası (kullanıcı kararı); sera Kalecik merkez, Kümbet Mahallesi'nde. Odanın ziraat mühendisi ve işçi maaşları (2.400.000 TL) odanın ayni katkısı olarak yazılır. Ayni katkı eş finansman sayılmazsa odanın nakit payı 5.000.000 TL, sayılırsa (bütçe 10 milyonda tutulup sera kalemleri 2,4 milyon azaltılarak) 2.600.000 TL; rehberden teyit edilecek.
- Projenin iki ayağı var: sera (köklendirme, ana bitki, üretim) ve evde üretim ağı (kadınlar evde büyütür, oda geri alır). Evde üretim ağırlıklı anlatılır; hedef Kalecik'i süs bitkisi üretim üssü yapmak.
- Kadın kooperatifi projede yok (kullanıcı kararı, 2026-10-31). Sera Kalecik Ziraat Odası'nın mülkiyetinde ve işletmesinde; kadınlar odanın sera işletmesinde çalışır; 400.000 TL işletme sermayesi de odadan. Ortaklar: Kalecik Belediyesi, İl Tarım ve Orman Müdürlüğü, AÜ DÖSİM (3 protokol).
- Yazım dili: metinler ziraat mühendisi ağzından, sade ve teknik; yapay zekâ kokan kalıplardan ("kapalı döngü", madde madde süslü listeler) kaçınılır.
- Ortaklar (kullanıcının verdiği): Ziraat Odası ziraat mühendisi (100.000 TL/ay) ve 2 işçi (50.000 TL/ay) karşılar; yer İl Tarım ve Orman Müdürlüğü'nden; su ve elektrik belediyeden; satış ve pazarlama Ankara Üniversitesi DÖSİM'den.
- Proje programın 16 kırsal ilçesinden birinde olmalı (Kalecik listede). Ön başvuru son tarihi 23/11/2026 17:00, KAYS son tarihi 22/01/2027.
- Satış fiyatları KDV hariç, giderler KDV dahil yazılır.

## Alınan kararlar

<!-- Biçim: tarih: karar. Kısa gerekçe. -->
- 2026-10-29: Başvuru metninin bu sürümü `arena` skill'i ile birden fazla taslak karşılaştırılarak seçildi.
- 2026-10-30: Bulut oturumlarında hafıza için claude-mem yerine claude-mem-cowork kullanılıyor. Yerel sürüm konteynerle birlikte siliniyor, ayrıca cowork sürümünü devre dışı bırakıyor.
- 2026-10-31: claude-mem-cowork eklentisi depodan kaldırıldı (`.claude/settings.json` silindi; kullanıcı kararı). Oturum notları dış bir hizmete (cmem.ai) gönderilmeyecek; hafıza eklentisi kullanılmıyor.
- 2026-10-30: Depo gizliye alındı.
- 2026-11-01: Ana dalın adı `claude/karpathy-skills-plugin-a2cx6e` iken `main` yapıldı.
- 2026-10-30: Depodaki işler için "Proje Ajanı" tanımlandı.

- 2026-10-30: Varsayılan rol Excel Asistanı oldu. Kod yazma yasaklanmadı, yalnızca istenirse yapılıyor.
- 2026-10-30: Besi Rasyon 2.6–2.8: ırk/cinsiyet/sıcaklık düzeltmesi (NRC), dönem rasyonları, stok sınırı, fiyat dayanıklılığı. Varsayılan cinsiyet tosun (Türkiye besisinde yaygın); bu, eski sürüme göre yaşama payı enerjisini %15 artırır.
- 2026-10-31: Besi Rasyon 2.9: arayüz `design-taste-frontend` skill'inin `accent-ladder` stiliyle yenilendi (açık üst çubuk, yeşil yalnızca küçük işaretlerde, 1px çizgili düz kartlar, ayraçlı gösterge kutusu, ihtiyaç karşılama çubukları, geniş ekranda iki sütun). Hesap motoru değişmedi. Skill `.claude/skills/design-taste-frontend/` altında.
- 2026-11-01: Besi Rasyon 3.0: Windows uygulamasına PDF kaydetme, kopyalama, WhatsApp, yakınlaştırma ve taşınabilir exe; derlemede uygulama sınaması; dikey tablet düzeni.
- 2026-11-01: Besi Rasyon 3.1: iPhone için ana ekran uygulaması (PWA) seçildi (kullanıcı kararı; App Store yerine). Uygulama dosyaları ayrı, herkese açık bir depoda yayınlanacak; ana depo gizli kalır.
- 2026-10-31: Besi Rasyon için Windows kurulum dosyası eklendi (Electron + NSIS, imzasız; Windows SmartScreen uyarısı verebilir). Uygulama kodu Android ve web ile ortak.
- 2026-10-31: Başvuru metni geliştirildi: sosyal girişim modeli (2.4), yenilikçi yön (2.5), paydaşlar (12), yatay konular (13), etki anketi (F5.1) ve 4 yeni risk eklendi. Rakamlar değişmedi; tüm hesaplar yeniden kontrol edildi.
- 2026-11-01: Claude'un açtığı tüm Drive klasörleri (Besi Rasyon, Yeşil Eller, OmniRoute Kılavuzu, Excel - Liste Karşılaştırma, Excel Veri Analiz Programı) "Claude depo" klasörüne taşındı; bundan sonra tüm yedekler oraya yazılır (kullanıcı kararı).
- 2026-10-31: Her çalışma Google Drive'da ayrı klasörde tutulacak (Yeşil Eller, Besi Rasyon, Excel - Liste Karşılaştırma, OmniRoute Kılavuzu). Kod aynı GitHub deposunda kalıyor.
- 2026-10-31: Başvuru Sosyal Girişimcilik programından 2026 Anadoludakiler Kırsal Kalkınma MDP'ye taşındı. Ortaklar ve ayni katkılar kullanıcıdan; fiyatlar Ekim 2026 piyasasına göre güncellendi; destek oranı %75'ten %50'ye indi. Öncelik 5 seçildi (Öncelik 4 alternatif).
- 2026-10-31: Proje 10.000.000 TL bütçeli (5.000.000 TL destek), 1.000 m² tam otomasyonlu hibrit ısıtmalı polikarbonat seraya dönüştürüldü (kullanıcı isteği). LED raflı kapalı alan modeli bırakıldı.
- 2026-10-31: Başvuru sahibi Ziraat Odası oldu; kadın kooperatifi ortak ve işletmeci. Eş finansman odadan.
- 2026-10-31: Başvuru sahibi Kalecik Ziraat Odası; personel maaşları odanın ayni katkısı.
- 2026-10-31: Sera 2 dekara (2.000 m²) büyütüldü; gerçekçi maliyetle toplam bütçe 13.300.000 TL, destek 5.000.000 TL (%37,6), oda eş finansmanı 8.300.000 TL.
- 2026-10-31: Proje sonrası için Kalecik Belediyesi'ne yılda 30.000 adet mevsimlik çiçek satışı eklendi (20 TL/adet varsayım, teyit edilecek). Adet kullanıcı tarafından teyit edildi. 2. yıl fazlası 854.106 TL.
- 2026-10-31: Belediyenin su-elektrik desteği proje bitiminden itibaren 3 yıl sürecek (kullanıcı teyit etti); niyet mektubuna eklendi.
- 2026-10-31: Toplam bütçe 10.000.000 TL'yi geçmeyecek (kullanıcı). Isıtma doğalgazlı sıcak hava üreteçleri ve klimaya indirildi; güneş ısısı, ısı pompası, sıcak su borulu tesisat çıkarıldı; masalar sabit, jeneratör 60 kVA. Destek %50, oda eş finansmanı 5.000.000 TL. 2. yıl fazlası 714.106 TL.
- 2026-10-31: Kadın kooperatifi projeden tamamen çıkarıldı; sera odanın işletmesi. Proje adında "Kooperatifiyle" yerine "Emeğiyle". Ön başvuru özeti ziraat mühendisi diliyle, genişletilmiş hikâyeyle yeniden yazıldı; ana metnin 2.1–2.2 bölümleri de aynı hikâyeye geçti.
- 2026-10-31: Evde üretim ayağı eklendi (kullanıcı isteği): sera köklendirir, kadınlar evde 8–10 hafta büyütür, oda kabul edilen bitki başına 60 TL ile geri alır. Proje döneminde 30 kadın (pilot, Ay 8'den), sonrasında 50 kadın; hedef Kalecik'i süs bitkisi üretim üssü yapmak. Eğitim 60 kadına çıktı. Bütçe 10 milyonda sabit (masalar 800 m², set kalemi 135.000 TL). Proje dönemi fazlası 474.878 TL, 2. yıl fazlası 1.153.606 TL.
- 2026-10-31: Başvurulan öncelik Öncelik 5'ten Öncelik 4'e (Yerel istihdamın artırılması) geçti (kullanıcı kararı). Bölüm 11 iki başlığa göre yeniden yazıldı; Öncelik 5 katkı olarak anılıyor.
- 2026-11-01: Dallar toparlandı. Veri Analiz, besi sunusu, Besi Rasyon 2.9 ve Kalecik seralı başvuru ana dala eklendi. Başvurunun geçerli sürümü Kalecik Ziraat Odası seralı sürüm (kullanıcı kararı); kooperatifli kırsal sürüm `arsiv/` klasöründe.
- 2026-11-01: İlaç Takip 2.0 yazıldı (kullanıcı isteği): eski AI Studio APK'sı yerine; alarmlar geliştirildi (kilit ekranı, artan ses, cevap yoksa tekrar, erteleme, ön uyarı, sessiz saat, alarm kontrolü ekranı), arayüz yenilendi, yazılar kesilmez. Kullanıcılar sıradan yaşlı insanlar (kullanıcı uyarısı): Besi Rasyon gibi yapılmaz; yazılar baştan büyük, 4 sekme, her dozda büyük "Aldım" düğmesi, günlük dil, az kullanılan seçenekler gizli.
- 2026-11-01: Temizlik: aynı işin yalnızca son sürümü kalır. Excel işleri bu depodan çıkarıldı (bektas2'de), kooperatifli eski başvuru arşivi silindi (git geçmişinde duruyor), Drive'daki eski başvuru sürümleri çöp kutusuna taşındı.

## Açık işler

- APK imza anahtarı 2026-11-01'de üretildi ve kullanıcıya sohbette dosya olarak verildi (`ANDROID_KEYSTORE_B64.txt`, `ANDROID_KEYSTORE_PASS.txt`, yedek `bektas.keystore`). Kullanıcı bunları `bektas` ve `bektas2` depolarına GitHub Secrets olarak ekleyecek (iş yerindeki bilgisayardan). Yeni anahtar ÜRETME; o dosyalar kullanılacak. Eklenince iki uygulamayı derletip imzayı doğrula; ilk kurulumda eski uygulama bir kez silinmeli.

- `[DOLDURULACAK]` (14 yer) ve `[TEYİT EDİLECEK]` (27 yer) alanları doldurulacak.
- Kalecik Belediyesi niyet mektubunu imzalayacak (yılda 30.000 adet mevsimlik çiçek, 3 yıl su-elektrik; taslak hazır). Sayı, tarih ve başkan adı belediyede doldurulacak.
- Odanın iktisadi işletme kurma ve satış yapma usulü mali müşavirle netleştirilecek.
- Ziraat Odası meclis kararı (taslak hazır) ve 5.000.000 TL eş finansmanın kaynak belgesi; 400.000 TL işletme sermayesinin kaynağı (oda).
- DÖSİM ve İl Tarım ve Orman Müdürlüğü yazıları imzaya gidecek (taslaklar hazır). DÖSİM oranları %20/%5'ten farklı çıkarsa Bölüm 7 ve 10 yeniden hesaplanır.
- Başvuru Rehberi (rehber_4.pdf) ve ekleri okunacak; ankaraka.org.tr bu ortamdan erişilemiyor, kullanıcı indirip yüklemeli.
- Ön başvuru özetindeki boşluk (iletişim) doldurulacak; rehberde ön başvuru formu/şablonu varsa özet ona aktarılacak.
- AnkaraKA başvuru rehberinden kontrol edilecekler "Doldurana Notlar" bölümünde listelenmiş.
