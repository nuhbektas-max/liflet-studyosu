// Süt Rasyon masaüstü kabuğu: www/ içindeki uygulamayı bir pencerede açar. Hesap yine uygulamanın kendi kodunda yapılır.
const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, shell } = require('electron');
const path = require('path'), fs = require('fs');

// Derleme sırasında sınama: --smoke-test ile açılınca rasyon hesaplanır, PDF üretilir,
// sonuç smoke-result.json dosyasına yazılır ve uygulama kapanır.
const SMOKE = process.argv.includes('--smoke-test');
const smoke = { pdfBayt: 0 };

if (!app.requestSingleInstanceLock()) app.quit();

let pencere = null;

function ac() {
  pencere = new BrowserWindow({
    width: 1180, height: 860, minWidth: 420, minHeight: 600,
    backgroundColor: '#ffffff', title: 'Süt Rasyon', autoHideMenuBar: true,
    icon: path.join(__dirname, 'www', 'icon-512.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  pencere.loadFile(path.join(__dirname, 'www', 'index.html'));
  // WhatsApp ve diğer dış bağlantılar tarayıcıda açılır, uygulama penceresinde değil.
  pencere.webContents.setWindowOpenHandler(function (e) {
    if (/^(https:\/\/|mailto:)/.test(e.url)) shell.openExternal(e.url);
    return { action: 'deny' };
  });
  pencere.webContents.on('will-navigate', function (ev, url) {
    if (!url.startsWith('file://')) { ev.preventDefault(); if (/^(https:\/\/|mailto:)/.test(url)) shell.openExternal(url); }
  });
  pencere.on('closed', function () { pencere = null; });
}

// Menü çubuğu gizli (Alt ile açılır); yakınlaştırma kısayolları (Ctrl + / Ctrl − / Ctrl 0) çalışsın diye var.
const menu = Menu.buildFromTemplate([
  { label: 'Dosya', submenu: [{ role: 'reload', label: 'Yenile' }, { type: 'separator' }, { role: 'quit', label: 'Çıkış' }] },
  { label: 'Görünüm', submenu: [
    { role: 'zoomIn', label: 'Yakınlaştır' }, { role: 'zoomOut', label: 'Uzaklaştır' }, { role: 'resetZoom', label: 'Gerçek boyut' },
    { type: 'separator' }, { role: 'togglefullscreen', label: 'Tam ekran' }] }
]);

ipcMain.on('wa', function (e, text) { shell.openExternal('https://wa.me/?text=' + encodeURIComponent(text)); });
// Uygulamanın kendi ürettiği PDF raporu (base64): kullanıcının seçtiği yere kaydedilip açılır.
ipcMain.on('pdfKaydet', async function (e, b64, ad) {
  const pdf = Buffer.from(b64, 'base64');
  if (SMOKE) { smoke.pdfBayt = pdf.length; smoke.pdfBaslik = pdf.slice(0, 5).toString(); return; }
  const r = await dialog.showSaveDialog(pencere, { title: 'Raporu kaydet', defaultPath: path.join(app.getPath('documents'), ad), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (!r.canceled && r.filePath) { fs.writeFileSync(r.filePath, pdf); shell.openPath(r.filePath); }
});
ipcMain.on('kopyala', function (e, text) { clipboard.writeText(text); e.returnValue = true; });

// Rapor: gizli pencerede A4 PDF'e çevrilir, kullanıcının seçtiği yere kaydedilip açılır.
ipcMain.on('pdf', async function (e, html, title) {
  const pw = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  try {
    await pw.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdf = await pw.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
    if (SMOKE) { smoke.pdfBayt = pdf.length; return; }
    const ad = (title || 'Süt Rasyonu').replace(/[\\/:*?"<>|]+/g, '-') + '.pdf';
    const r = await dialog.showSaveDialog(pencere, { title: 'Raporu kaydet', defaultPath: path.join(app.getPath('documents'), ad), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!r.canceled && r.filePath) { fs.writeFileSync(r.filePath, pdf); shell.openPath(r.filePath); }
  } catch (err) {
    dialog.showErrorBox('PDF oluşturulamadı', String((err && err.message) || err));
  } finally {
    pw.destroy();
  }
});

async function sinama() {
  try {
    const r = await pencere.webContents.executeJavaScript(`new Promise(function (ok) {
      var kilit = document.body.classList.contains('kilitli') && !!(document.getElementById('byKabul') || document.getElementById('lsKod'));
      document.getElementById('hesapla').click();
      setTimeout(function () {
        var pdf = document.getElementById('pdfPaylas'); if (pdf) pdf.click();
        ok({ masaustu: !!window.SUT_DESKTOP, kilit: kilit, tablo: !!document.querySelector('#sonuc table.xl'),
             maliyet: (document.querySelector('#sonuc .kutu b') || {}).textContent || '',
             hata: !!document.querySelector('#sonuc .hata') });
      }, 3000);
    })`);
    await new Promise(function (res) { setTimeout(res, 8000); });   // PDF'in üretilip köprüye gelmesi
    Object.assign(smoke, r);
  } catch (err) { smoke.hata = String((err && err.message) || err); }
  fs.writeFileSync(path.join(process.cwd(), 'smoke-result.json'), JSON.stringify(smoke, null, 1));
  app.exit(0);
}

app.whenReady().then(function () {
  Menu.setApplicationMenu(menu);
  ac();
  if (SMOKE) pencere.webContents.once('did-finish-load', sinama);
  app.on('activate', function () { if (!BrowserWindow.getAllWindows().length) ac(); });
});
app.on('second-instance', function () { if (pencere) { if (pencere.isMinimized()) pencere.restore(); pencere.focus(); } });
app.on('window-all-closed', function () { app.quit(); });
