"""Süt Rasyon'u tek dosyalık HTML yapar (betikler içine gömülür; internetsiz her tarayıcıda açılır).

Kullanım: python3 sut-rasyon/build.py <çıkış.html> [kullanici|yonetici]   (varsayılan: kullanici)

kullanici: beyan ve lisans ister. yonetici: yalnızca yönetici şifresiyle açılır, lisans vermek için kullanılır;
bu dosyayı başkalarına vermeyin (lisans sormaz).
"""
import os
import re
import sys

KOK = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(KOK, 'www')
YONETICI_ROL = os.path.join(KOK, 'android', 'app', 'src', 'yonetici', 'assets', 'rol.js')


def build(out, rol='kullanici'):
    html = open(os.path.join(WWW, 'index.html'), encoding='utf-8').read()

    def gom(m):
        yol = YONETICI_ROL if (m.group(1) == 'rol.js' and rol == 'yonetici') else os.path.join(WWW, m.group(1))
        kod = open(yol, encoding='utf-8').read()
        # </script> içeren kod gömülemez; çözücü ve uygulama kodunda yok, yine de denetlenir.
        assert '</script' not in kod.lower(), m.group(1)
        return '<script>\n' + kod + '\n</script>'

    html, n = re.subn(r'<script src="([^"]+)"></script>', gom, html)
    assert n == 6, n
    if rol == 'yonetici':
        html = html.replace('<title>Süt Rasyon</title>', '<title>Süt Rasyon Yönetici</title>', 1)
    open(out, 'w', encoding='utf-8').write(html)


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'kullanici')
