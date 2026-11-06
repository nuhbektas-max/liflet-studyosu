// Kod Modu kütüphanesi: depodaki tekrar eden işlerin ortak parçaları.
// Script'ler bu dosyayı kullanır; ara veri script'in içinde kalır, ekrana yalnızca kısa özet basılır.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const CIKTI = path.join(KOK, '_cikti');

export const oku = rel => fs.readFileSync(path.join(KOK, rel), 'utf8');
export const yaz = (rel, icerik) => fs.writeFileSync(path.join(KOK, rel), icerik);

// Her uygulamada sürüm numarasının geçtiği yerler. `bul` eski sürümü yakalar (1. grup = sürüm),
// `yap(yeni)` yerine yazılacak metni verir. `hepsi: true` dosyadaki tüm eşleşmeleri değiştirir.
const xy = s => s.split('.').slice(0, 2).join('.');
export const UYGULAMALAR = {
  besi: {
    ad: 'Besi Rasyon',
    klasor: 'besi-rasyon',
    test: 'besi-rasyon/test/model.test.js',
    yerler: [
      { dosya: 'besi-rasyon/android/app/build.gradle', bul: /versionName '([\d.]+)'/, yap: v => `versionName '${v}'` },
      { dosya: 'besi-rasyon/www/sw.js', bul: /besi-rasyon-v([\d.]+)'/, yap: v => `besi-rasyon-v${v}'` },
      { dosya: 'besi-rasyon/www/index.html', bul: /Sürüm ([\d.]+) ·/, yap: v => `Sürüm ${v} ·` },
      { dosya: 'besi-rasyon/windows/package.json', bul: /"version": "([\d.]+)\.0"/, yap: v => `"version": "${v}.0"` },
      { dosya: 'besi-rasyon/windows/package-lock.json', bul: /"name": "besi-rasyon",\s*"version": "([\d.]+?)(?:\.0)?"/, kilit: true },
      { dosya: '.github/workflows/besi-rasyon-apk.yml', bul: /BesiRasyon-([\d.]+)\.apk/, hepsi: true, is: true },
    ],
  },
  sut: {
    ad: 'Süt Rasyon',
    klasor: 'sut-rasyon',
    test: 'sut-rasyon/test/model.test.js',
    yerler: [
      { dosya: 'sut-rasyon/android/app/build.gradle', bul: /versionName '([\d.]+)'/, yap: v => `versionName '${v}'` },
      { dosya: 'sut-rasyon/www/app.js', bul: /SURUM = '([\d.]+)'/, yap: v => `SURUM = '${v}'` },
      { dosya: 'sut-rasyon/windows/package.json', bul: /"version": "([\d.]+)\.0"/, yap: v => `"version": "${v}.0"` },
      { dosya: 'sut-rasyon/windows/package-lock.json', bul: /"name": "sut-rasyon",\s*"version": "([\d.]+?)(?:\.0)?"/, kilit: true },
      { dosya: '.github/workflows/sut-rasyon-apk.yml', bul: /SutRasyon-([\d.]+)\.apk/, hepsi: true, is: true },
    ],
  },
};

export function uygulama(kisa) {
  const u = UYGULAMALAR[kisa];
  if (!u) throw new Error(`Bilinmeyen uygulama "${kisa}". Seçenekler: ${Object.keys(UYGULAMALAR).join(', ')}`);
  return u;
}

// Her yerdeki sürümü okur: [{dosya, surum}] (bulunamazsa surum = null).
export function surumleri(u) {
  return u.yerler.map(y => {
    const m = oku(y.dosya).match(y.bul);
    return { dosya: y.dosya, surum: m ? xy(m[1]) : null };
  });
}

// Sürümü bütün dosyalarda değiştirir. yazma=false ise yalnızca ne değişeceğini döndürür (deneme).
export function surumDegistir(u, yeni, yazma) {
  if (!/^\d+\.\d+$/.test(yeni)) throw new Error('Sürüm x.y biçiminde olmalı (örn. 4.4)');
  const degisen = [];
  for (const y of u.yerler) {
    let metin = oku(y.dosya);
    const m = metin.match(y.bul);
    if (!m) { degisen.push({ dosya: y.dosya, eski: null, adet: 0 }); continue; }
    const eski = xy(m[1]);
    let adet = 0;
    if (y.kilit) {
      // package-lock: kök "version" ve packages[""].version alanları.
      const j = JSON.parse(metin);
      j.version = `${yeni}.0`;
      if (j.packages && j.packages['']) j.packages[''].version = `${yeni}.0`;
      metin = JSON.stringify(j, null, 2) + '\n';
      adet = 2;
    } else if (y.is) {
      // İş akışı: eski x.y ve x.y.0 geçen her yer (dosya adları, etiket, açıklama).
      const kacis = eski.replace('.', '\\.');
      const re = new RegExp(`(?<![\\d.])${kacis}(?=(\\.0)?(?![\\d]))`, 'g');
      metin = metin.replace(re, () => { adet++; return yeni; });
    } else {
      metin = metin.replace(y.bul, () => { adet++; return y.yap(yeni); });
    }
    if (yazma) yaz(y.dosya, metin);
    degisen.push({ dosya: y.dosya, eski, adet });
  }
  // Android versionCode bir artar.
  const gradle = u.yerler[0].dosya;
  const g = oku(gradle), vc = g.match(/versionCode (\d+)/);
  if (vc) {
    if (yazma) yaz(gradle, g.replace(/versionCode \d+/, `versionCode ${+vc[1] + 1}`));
    degisen.push({ dosya: gradle + ' (versionCode)', eski: vc[1], yeni: String(+vc[1] + 1), adet: 1 });
  }
  return degisen;
}

// Komutu sessiz çalıştırır; yalnızca başarılı mı ve son birkaç satır döner.
export function calistir(komut, args, cwd = KOK) {
  try {
    const out = execFileSync(komut, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, son: out.trim().split('\n').slice(-3).join(' | ') };
  } catch (e) {
    const out = ((e.stdout || '') + (e.stderr || '')).trim().split('\n');
    return { ok: false, son: out.slice(-5).join(' | ') };
  }
}

// Dosyanın git'teki son commit zamanı (saniye); git'te yoksa dosya zamanı.
export function sonDegisim(rel) {
  const r = calistir('git', ['log', '-1', '--format=%ct', '--', rel]);
  if (r.ok && r.son) return +r.son;
  return Math.floor(fs.statSync(path.join(KOK, rel)).mtimeMs / 1000);
}

export function ciktiYaz(ad, veri) {
  fs.mkdirSync(CIKTI, { recursive: true });
  const yol = path.join(CIKTI, ad);
  fs.writeFileSync(yol, typeof veri === 'string' ? veri : JSON.stringify(veri, null, 2));
  return path.relative(KOK, yol);
}

export const onayVar = () => process.argv.includes('--onay');
