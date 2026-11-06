// Uygulama dosyalarını (Android ve web ile ortak) ../www klasöründen buraya kopyalar.
const fs = require('fs'), path = require('path');
const kaynak = path.join(__dirname, '..', 'www'), hedef = path.join(__dirname, 'www');
fs.rmSync(hedef, { recursive: true, force: true });
fs.cpSync(kaynak, hedef, { recursive: true });
console.log('www kopyalandı:', fs.readdirSync(hedef).join(', '));
