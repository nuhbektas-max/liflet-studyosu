---
name: besi-sunu
description: >-
  Besi sığırcılığı bakım, besleme ve kârlılık sunusu hazırlar (.pptx). Rasyon ve
  maliyet rakamlarını Besi Rasyon hesap motorundan alır, fiyatları açıkça
  varsayım olarak işaretler. Kullanıcı besi, sığır, rasyon veya çiftlik
  sunusu/slaytı istediğinde kullan.
argument-hint: "<kitle, süre, varsa gerçek fiyatlar>"
---

# Besi sunusu

Örnek çıktı: `sunu/besi-bakim-besleme-sunusu.pptx` (17 slayt). Üreten betik: `make.js` (pptxgenjs, bu klasörde).

## Adımlar

1. Kitleyi, süreyi ve gerçek fiyatları (hayvan alış/satış TL/kg, yem dışı gider TL/gün) sor. Yoksa varsayılanla yap ve slaytta "varsayım" yaz.
2. Rasyon ve maliyet rakamlarını uydurma. `besi-rasyon/www/model.js` hesap motorunu çalıştır (`test/model.test.js` yükleme biçimi): `BesiModel.compute` ve `BesiModel.economics`. Yem fiyatları motordaki varsayılan fiyatlardır; motor değişince sunudaki rakamlar da yenilenir.
3. `make.js` içindeki rakamları (rasyon tablosu, TL/gün, TL/kg artış, süre, kârlılık varsayımları) güncelle. Slayt 2, rasyon, artış hızı, kârlılık ve duyarlılık slaytları aynı rakamlara bağlıdır, birlikte değiştir.
4. Derle: `pptxgenjs`, `react-icons`, `sharp` kurulu olmalı (`npm install` ayrı bir klasörde, depoya koyma). `NODE_PATH=<node_modules> node make.js`. `anthropic-skills:pptx` skill'indeki doğrulama ve görsel kontrol (validate, PDF, resim) adımlarını çalıştır.
5. Çıktıyı `sunu/` altına koy, `CLAUDE.md` içindeki satırı güncelle.

## Kurallar

- Türkçe, yer tutucu veya uydurma gerçek veri yok. Genel aralıklar (alan, su, süre) "yaklaşık" diye yazılır; aşı takvimi veterinere bırakılır.
- Örnek grafikler ve varsayımsal fiyatlar slaytta ve konuşmacı notunda işaretlenir.
- Tasarım: koyu yeşil, saman sarısı vurgu, Cambria başlık, Calibri gövde; slayt başına bir mesaj ve bir görsel öğe.
