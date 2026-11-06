// İnternetsiz çalışma için dosyaları önbelleğe alır.
const CACHE = 'besi-rasyon-v4.4';
const FILES = ['./', 'index.html', 'app.js', 'model.js', 'lisans.js', 'rol.js', 'sayfalar.js', 'asistan.js', 'vendor/lp-solver.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
