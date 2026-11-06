"""Besi Rasyon web sürümünü (claude.ai'de yayınlanan sayfa) www/ klasöründen üretir.

Kullanım: python3 besi-rasyon/web/build.py <çıkış klasörü> [yonetici|kullanici]  (varsayılan: yonetici)

Yayın ortamı sayfayı kendi <html>/<head>/<body> iskeletine sarar; bu yüzden
iskelet etiketleri ve uygulamaya özel bağlantılar (manifest, simge) çıkarılır,
window.BESI_WEB işareti eklenir. Kod dosyaları olduğu gibi kopyalanır.
"""
import os
import re
import shutil
import sys

WWW = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'www')


def build(out, rol='yonetici'):
    html = open(os.path.join(WWW, 'index.html'), encoding='utf-8').read()
    for pat in [r'<!doctype html>\s*', r'<html[^>]*>\s*', r'</?head>\s*', r'</?body>\s*', r'</html>\s*',
                r'<meta charset[^>]*>\s*', r'<meta name="viewport"[^>]*>\s*', r'<meta name="theme-color"[^>]*>\s*',
                r'<link rel="manifest"[^>]*>\s*', r'<link rel="icon"[^>]*>\s*', r'<link rel="apple-touch-icon"[^>]*>\s*',
                r'<meta name="apple-mobile-web-app-capable"[^>]*>\s*', r'<meta name="mobile-web-app-capable"[^>]*>\s*',
                r'<meta name="apple-mobile-web-app-title"[^>]*>\s*', r'<meta name="apple-mobile-web-app-status-bar-style"[^>]*>\s*']:
        html, n = re.subn(pat, '', html, flags=re.I)
        if n == 0 and 'head' not in pat and 'body' not in pat:
            raise SystemExit('beklenen etiket bulunamadı: ' + pat)
    html = html.replace('<title>Besi Rasyon</title>',
                        '<title>Besi Rasyon</title>\n<meta name="claude:viewport-fit-sides" content="cover">', 1)
    html = html.replace('<script src="vendor/lp-solver.js"></script>',
                        '<script>window.BESI_WEB = true;</script>\n<script src="vendor/lp-solver.js"></script>', 1)
    assert html.lstrip().startswith('<title>'), 'sayfa <title> ile başlamalı'
    assert 'BESI_WEB' in html and 'viewport-fit-sides' in html
    os.makedirs(os.path.join(out, 'vendor'), exist_ok=True)
    open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(html)
    for f in ['app.js', 'model.js', 'sayfalar.js', 'lisans.js', 'rol.js', 'vendor/lp-solver.js']:
        shutil.copyfile(os.path.join(WWW, f), os.path.join(out, f))
    # claude.ai'deki sayfa kullanıcının kendisine özel: yönetici rolüyle üretilir.
    if rol == 'yonetici':
        shutil.copyfile(os.path.join(WWW, '..', 'android', 'app', 'src', 'yonetici', 'assets', 'rol.js'), os.path.join(out, 'rol.js'))


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'yonetici')
