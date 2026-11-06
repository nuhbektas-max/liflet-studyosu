// Sayfaya Android sürümündeki köprüyle aynı adla (BesiAndroid) masaüstü işlevleri verilir:
// WhatsApp, metni panoya kopyalama ve raporu PDF olarak kaydetme.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('BESI_DESKTOP', true);
contextBridge.exposeInMainWorld('BesiAndroid', {
  shareWhatsApp: text => ipcRenderer.send('wa', String(text)),
  copy: text => ipcRenderer.sendSync('kopyala', String(text)),
  print: (html, title) => ipcRenderer.send('pdf', String(html), String(title || 'Besi Rasyonu'))
});
