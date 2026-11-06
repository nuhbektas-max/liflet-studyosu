// Sayfaya Android sürümündeki köprüyle aynı adla (SutAndroid) masaüstü işlevleri verilir:
// metni panoya kopyalama ve raporu PDF olarak kaydetme.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('SUT_DESKTOP', true);
contextBridge.exposeInMainWorld('SutAndroid', {
  copy: text => ipcRenderer.sendSync('kopyala', String(text)),
  shareWhatsApp: text => ipcRenderer.send('wa', String(text)),
  sharePdf: (b64, ad) => ipcRenderer.send('pdfKaydet', String(b64), String(ad)),
  print: (html, title) => ipcRenderer.send('pdf', String(html), String(title || 'Süt Rasyonu'))
});
