---
name: kod
description: >-
  Kod bilmeyen bir kullanıcı için baştan sona yazılım işi yapar: web sitesi,
  küçük araç, Excel/veri otomasyonu, mobil veya büyük uygulama. İsteği sade
  Türkçeyle netleştirir, en basit teknolojiyi kendisi seçer, kodu yazar,
  çalıştırıp doğrular, sonucu gösterir ve repoya kaydeder. Kullanıcı /kod
  yazdığında veya bir şey "yapmak", "kodlamak", "program/site/uygulama
  yazmak" istediğinde kullan.
argument-hint: "<ne yapılmasını istediğiniz, kendi cümlelerinizle>"
---

# kod

Kullanıcı kod bilmiyor. Teknik kararları sen verirsin, sonucu çalışır halde
teslim edersin ve her şeyi sade Türkçeyle anlatırsın. Kullanıcının istediği:
`$ARGUMENTS`. Boşsa, konuşmadaki son isteği al.

Kod yazarken `karpathy-guidelines` skill'indeki kurallara uy: varsayımlarını
söyle, istenmeyeni ekleme, en küçük çalışan çözümü yaz, başarıyı doğrula.

## 1. Anla, gerekirse bir kez sor

İsteği şu beş soruya cevap verecek şekilde netleştir: **ne** yapılacak, **kim**
kullanacak, **nerede** kullanılacak (telefon, bilgisayar, Excel), **hangi
veriyle** çalışacak, **bitti** ne zaman sayılır.

Cevabı konuşmadan çıkar. Gerçekten eksik ve yanlış tahmin bir turu boşa
harcayacaksa, hepsini **tek seferde**, her birine bir varsayılan önererek sor.
Teknik soru sorma ("React mi Vue mu?" yok); kullanıcının bilebileceği şeyi sor
("Bu sayfaya telefondan mı bakılacak?").

## 2. Teknolojiyi sen seç

En az parçalı, kurulumu en kolay çözümü seç:

| İş | Varsayılan |
| --- | --- |
| Tek sayfalık araç, hesaplayıcı, form | Tek HTML dosyası (HTML + CSS + JavaScript), kurulum yok |
| Web sitesi | Statik HTML/CSS; gerekirse az JavaScript |
| Excel / veri işleri | Python (`openpyxl`, `pandas`); sonuç yine Excel dosyası |
| Mobil uygulama | Önce telefona eklenebilen web uygulaması (PWA); mağaza uygulaması ancak kullanıcı açıkça isterse |
| Giriş, veritabanı, çok kullanıcılı sistem | Önce tek kullanıcılı küçük sürüm; büyütme planını ayrıca anlat |

Seçimini tek cümleyle ve neden o olduğunu söyleyerek bildir.

## 3. Büyük işi küçült

Mobil uygulama, giriş sistemi, ödeme, birden çok ekran gibi büyük işlerde
kodlamadan önce **3–5 maddelik sade bir plan** göster: ilk gün çalışacak en
küçük sürüm ne, sonra ne eklenecek. Kullanıcı onaylayınca başla. Küçük işlerde
plan gösterme, doğrudan yap.

## 4. Yaz

- Kodu repoda, işe uygun adlı bir klasöre koy (ör. `araclar/hibe-hesap/`).
- Yorumları ve ekrandaki tüm yazıları Türkçe yaz; kod içindeki değişken adları
  İngilizce kalabilir.
- Şifre, API anahtarı, TC kimlik numarası gibi gizli bilgileri asla koda yazma.
  Gerekirse kullanıcıya nereye gireceğini anlat.
- Kişisel veriyle çalışıyorsa örnek veriyle test et; gerçek veriyi repoya koyma.

## 5. Çalıştır ve doğrula

Teslim etmeden önce kendin çalıştır. "Çalışmalı" deme; çalıştığını gör.

- **Web sayfası/araç:** Playwright ile aç, ana işlevi kullan (butona bas, form
  doldur), hem bilgisayar hem telefon genişliğinde ekran görüntüsü al ve bak.
- **Python/Excel:** örnek veriyle çalıştır, çıkan dosyayı aç ve rakamları kontrol et.
- Hata varsa düzelt ve tekrar dene. Düzeltemediğin hatayı saklama, söyle.

## 6. Teslim et

1. Sonucu göster: ekran görüntüsü veya çıktı dosyasını kullanıcıya gönder.
   Tek sayfalık araçlar paylaşılabilir bir sayfa olarak da yayınlanabilir.
2. Repoya commit et ve çalışılan branch'e push et.
3. Sade Türkçeyle kısa bir özet yaz:
   - Ne yapıldı (bir iki cümle).
   - **Nasıl kullanılır:** adım adım, teknik terimsiz ("Dosyaya çift tıklayın",
     "Telefonda açıp Paylaş → Ana Ekrana Ekle'ye basın").
   - Neyi test ettin, neyi edemedin.
   - Sonraki mantıklı adım (en fazla bir öneri).

Kod bloklarını kullanıcıya ancak kendisi bir şey yapıştıracaksa göster.

## Kurallar

- Kullanıcıya teknik karar yükleme; karar ver, gerekçesini bir cümleyle söyle.
- Jargon kullanırsan aynı cümlede açıkla ("commit, yani kaydetme").
- Bir turda bir soru turu, o da toplu ve varsayılanlı.
- Kullanıcının bilgisayarına veya hesaplarına dokunan, geri alınamayan ya da
  dışarıya bir şey gönderen adımlardan önce izin iste.
