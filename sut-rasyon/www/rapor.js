// PDF raporu: rapor sayfası (HTML) görüntüye çevrilir, A4 sayfalara bölünüp bir PDF dosyası yazılır.
// Her tarayıcıda, Android'de ve Windows'ta aynı çıktıyı verir; harici kütüphane gerekmez.
(function (root) {
  'use strict';
  var W = 794, H = 1123, MARJ = 36, OLCEK = 2;   // A4 (96 dpi), kenar boşluğu, çözünürlük çarpanı
  var PT = 72 / 96;

  function latin1(s) { var b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; }

  // Sayfa görüntülerinden (JPEG baytları) PDF yazar. sayfalar: [{ jpeg: Uint8Array, w: px, h: px }]
  function pdfYaz(sayfalar) {
    var parcalar = [], ofs = [], boy = 0;
    function ekle(x) { var b = typeof x === 'string' ? latin1(x) : x; parcalar.push(b); boy += b.length; }
    function nesne(n, govde) { ofs[n] = boy; ekle(n + ' 0 obj\n'); ekle(govde); ekle('\nendobj\n'); }
    var n = sayfalar.length, genislik = (W * PT).toFixed(2), yukseklik = (H * PT).toFixed(2);
    ekle('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    nesne(1, '<< /Type /Catalog /Pages 2 0 R >>');
    var kids = []; for (var i = 0; i < n; i++) kids.push((3 + 3 * i) + ' 0 R');
    nesne(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>');
    sayfalar.forEach(function (s, k) {
      var pg = 3 + 3 * k, ic = pg + 1, im = pg + 2;
      nesne(pg, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + genislik + ' ' + yukseklik + '] /Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ic + ' 0 R >>');
      var akis = 'q ' + genislik + ' 0 0 ' + yukseklik + ' 0 0 cm /Im0 Do Q';
      nesne(ic, '<< /Length ' + akis.length + ' >>\nstream\n' + akis + '\nendstream');
      ofs[im] = boy;
      ekle(im + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + s.w + ' /Height ' + s.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + s.jpeg.length + ' >>\nstream\n');
      ekle(s.jpeg); ekle('\nendstream\nendobj\n');
    });
    var xref = boy, say = 3 + 3 * n;
    ekle('xref\n0 ' + say + '\n0000000000 65535 f \n');
    for (var j = 1; j < say; j++) ekle(('0000000000' + ofs[j]).slice(-10) + ' 00000 n \n');
    ekle('trailer\n<< /Size ' + say + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    var out = new Uint8Array(boy), p = 0;
    parcalar.forEach(function (b) { out.set(b, p); p += b.length; });
    return out;
  }

  function base64(bytes) {
    var s = '', adim = 0x8000;
    for (var i = 0; i < bytes.length; i += adim) s += String.fromCharCode.apply(null, bytes.subarray(i, i + adim));
    return btoa(s);
  }

  function dataBytes(url) {
    var b = atob(url.split(',')[1]), o = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) o[i] = b.charCodeAt(i);
    return o;
  }

  // html: stil + blok (.blok) dizisi. Dönen: Promise<Uint8Array> (PDF).
  function pdfUret(html) {
    var kok = document.createElement('div');
    kok.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + (W - 2 * MARJ) + 'px;background:#fff;color:#000;font:13px/1.35 Arial,Helvetica,sans-serif';
    kok.innerHTML = html;
    document.body.appendChild(kok);
    var icerikH = H - 2 * MARJ, toplam = kok.offsetHeight, bloklar = [];
    Array.prototype.forEach.call(kok.querySelectorAll('.blok'), function (b) { bloklar.push({ ust: b.offsetTop, alt: b.offsetTop + b.offsetHeight, baslik: b.classList.contains('baslik') }); });
    // Sayfa kesimleri: sayfaya sığmayan ilk blokta kes (blok sayfadan uzunsa zorla kes).
    var kesim = [0], baslangic = 0;
    while (toplam - baslangic > icerikH) {
      var limit = baslangic + icerikH, kes = limit;
      for (var i = 0; i < bloklar.length; i++) if (bloklar[i].alt <= limit && bloklar[i].alt > baslangic + 40 && !bloklar[i].baslik) kes = bloklar[i].alt;
      kesim.push(kes); baslangic = kes;
    }
    kesim.push(toplam);
    var klon = kok.cloneNode(true);
    klon.style.position = 'static'; klon.style.left = '0';
    var xhtml = new XMLSerializer().serializeToString(klon);
    document.body.removeChild(kok);
    var gw = W - 2 * MARJ, svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + gw + '" height="' + toplam + '"><foreignObject x="0" y="0" width="100%" height="100%">' + xhtml + '</foreignObject></svg>';
    return new Promise(function (ok, hata) {
      var img = new Image();
      img.onload = function () {
        try {
          var tam = document.createElement('canvas'); tam.width = gw * OLCEK; tam.height = toplam * OLCEK;
          var g = tam.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, tam.width, tam.height);
          g.drawImage(img, 0, 0, tam.width, tam.height);
          var sayfalar = [];
          for (var k = 0; k + 1 < kesim.length; k++) {
            var sy = kesim[k], sh = kesim[k + 1] - kesim[k];
            var c = document.createElement('canvas'); c.width = W * OLCEK; c.height = H * OLCEK;
            var cg = c.getContext('2d'); cg.fillStyle = '#fff'; cg.fillRect(0, 0, c.width, c.height);
            cg.drawImage(tam, 0, sy * OLCEK, tam.width, sh * OLCEK, MARJ * OLCEK, MARJ * OLCEK, tam.width, sh * OLCEK);
            cg.fillStyle = '#666'; cg.font = (9 * OLCEK) + 'px Arial,sans-serif'; cg.textAlign = 'right';
            cg.fillText('Sayfa ' + (k + 1) + ' / ' + (kesim.length - 1), (W - MARJ) * OLCEK, (H - 14) * OLCEK);
            sayfalar.push({ jpeg: dataBytes(c.toDataURL('image/jpeg', 0.9)), w: c.width, h: c.height });
          }
          ok(pdfYaz(sayfalar));
        } catch (e) { hata(e); }
      };
      img.onerror = function () { hata(new Error('Rapor görüntüye çevrilemedi.')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  // PDF'i paylaşır ya da kaydeder: Android/Windows uygulamasında köprü, tarayıcıda paylaşım menüsü ya da indirme.
  function paylas(bytes, ad) {
    // Dosya adı ASCII yapılır: bazı tarayıcılar Türkçe harfli adı kaydederken "download"a çevirir.
    var TR = { 'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U' };
    var dosya = ad.replace(/[çÇğĞıİöÖşŞüÜ]/g, function (c) { return TR[c]; }).replace(/[^A-Za-z0-9 ._()-]+/g, '-') + '.pdf';
    if (root.SutAndroid && root.SutAndroid.sharePdf) { root.SutAndroid.sharePdf(base64(bytes), dosya); return Promise.resolve('uygulama'); }
    var blob = new Blob([bytes], { type: 'application/pdf' });
    try {
      var f = new File([blob], dosya, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) return navigator.share({ files: [f], title: ad }).then(function () { return 'paylasildi'; }, function () { return 'iptal'; });
    } catch (e) { /* paylaşım yok, indirmeye düş */ }
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = dosya;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return Promise.resolve('indirildi');
  }

  root.SutRapor = { pdfYaz: pdfYaz, pdfUret: pdfUret, paylas: paylas, base64: base64 };
})(typeof window !== 'undefined' ? window : globalThis);
