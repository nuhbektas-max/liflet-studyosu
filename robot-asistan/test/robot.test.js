// Robot asistan ekran sınaması (sahte Android köprüsüyle). Çalıştır: node robot-asistan/test/robot.test.js
// Gerekli: playwright (yerelde kurulu). Ekran görüntüleri robot-asistan/test/out/ altına yazılır.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? 'GEÇTİ ' : 'HATA  ') + m); if (!c) fails++; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await p.addInitScript(() => {
    window.__calls = []; window.__torch = null; window.__sent = [];
    const prefs = { provider: 'gemini' };
    let step = 0;
    window.RobotAndroid = {
      getPref: k => prefs[k] || '', setPref: (k, v) => { prefs[k] = v; },
      startListening: () => { setTimeout(() => onStt('begin', ''), 50); setTimeout(() => onStt('partial', 'ışığı'), 150); setTimeout(() => onStt('result', window.__say || 'Ortam karanlık, ışığı aç'), 300); },
      stopListening() {}, stopSpeaking() { window.__stopped = true; },
      speak: (text) => { window.__spoken = text; setTimeout(() => onTtsStart(), 80); let i = 0; const words = [...text.matchAll(/\S+/g)];
        words.forEach((w, n) => setTimeout(() => onTtsRange(w.index, w.index + w[0].length), 150 + n * 260));
        setTimeout(() => onTtsDone(), 250 + words.length * 260); },
      post: (id, url, headers, body) => {
        const req = JSON.parse(body); window.__sent.push({ url, headers: JSON.parse(headers), req });
        let res;
        if (url.includes('generativelanguage')) {
          const last = req.contents[req.contents.length - 1];
          if (last.parts[0].functionResponse)
            res = { candidates: [{ content: { role: 'model', parts: [{ text: '<gesture="nod" emotion="happy"> Işığı açtım, artık daha iyi görürsün. <gesture="wave"> Başka bir şey ister misin?' }] } }] };
          else
            res = { candidates: [{ content: { role: 'model', parts: [{ text: 'Hemen açıyorum.' }, { functionCall: { name: 'toggle_flashlight', args: { on: true }, id: 'call_9' } }] } }] };
        } else {
          const last = req.messages[req.messages.length - 1];
          if (Array.isArray(last.content) && last.content[0].type === 'tool_result')
            res = { stop_reason: 'end_turn', content: [{ type: 'text', text: '<gesture="nod" emotion="happy"> Işığı açtım, artık daha iyi görürsün. <gesture="wave"> Başka bir şey ister misin?' }] };
          else
            res = { stop_reason: 'tool_use', content: [{ type: 'text', text: 'Hemen açıyorum.' }, { type: 'tool_use', id: 'tu_1', name: 'toggle_flashlight', input: { on: true } }] };
        }
        setTimeout(() => onHttp(id, 200, JSON.stringify(res)), 900);
      },
      torch: on => { window.__torch = on; return 'ok'; }, openWifiPanel: () => 'ok', openBluetooth: () => 'ok',
      isWifiEnabled: () => true, getVolume: () => 40, setVolume: v => v
    };
  });
  await p.goto('file://' + path.resolve(__dirname, '../www/index.html'));
  await p.waitForTimeout(500);
  await p.screenshot({ path: out + '/1-bekleme.png' });
  ok(await p.textContent('#chip') === 'Hazır', 'açılışta Hazır');
  ok(!(await p.isVisible('#sheet.show')), 'anahtar varken ayar penceresi açılmaz');

  // etiket ayrıştırma
  const t = await p.evaluate(() => __robot.parseTags('<gesture="nod" emotion="happy"> Merhaba [curious] dünya <gaze="away">!'));
  ok(t.text === 'Merhaba dünya !' || t.text === 'Merhaba dünya!' , 'etiketler metinden ayıklandı: "' + t.text + '"');
  ok(t.cues.length === 3 && t.cues[0].gesture === 'nod' && t.cues[0].emotion === 'happy' && t.cues[1].emotion === 'curious' && t.cues[2].gaze === 'away', 'etiketler doğru ayrıştı');

  // tam akış
  await p.click('#mic');
  await p.waitForTimeout(200);
  ok(await p.textContent('#chip') === 'Dinliyorum', 'dinleme durumu');
  await p.screenshot({ path: out + '/2-dinleme.png' });
  await p.waitForTimeout(500);
  ok(await p.textContent('#chip') === 'Düşünüyor', 'düşünme durumu');
  await p.screenshot({ path: out + '/3-dusunme.png' });
  await p.waitForTimeout(1900);
  ok(await p.textContent('#chip') === 'Konuşuyor', 'konuşma durumu');
  ok(await p.evaluate(() => window.__torch) === true, 'Claude araç çağrısı flaşı açtı');
  const sent = await p.evaluate(() => window.__sent);
  const lastG = sent[1] && sent[1].req.contents.slice(-1)[0].parts[0].functionResponse;
  ok(sent.length === 2 && sent[0].url.includes('gemini-3.8-flash:generateContent') && sent[0].headers['x-goog-api-key'].startsWith('AQ.'), 'Gemini adresi ve anahtar başlığı doğru');
  ok(!!lastG && lastG.name === 'toggle_flashlight' && lastG.id === 'call_9' && /Flaş açıldı/.test(lastG.response.result), 'functionResponse Gemini\'ye geri gönderildi');
  const decl = sent[0].req.tools[0].functionDeclarations;
  ok(decl.length === 5 && decl.find(d => d.name === 'open_bluetooth_settings').parameters === undefined && decl.find(d => d.name === 'set_volume').parameters.properties.level, 'araç tanımları Gemini biçiminde (parametresiz araçta parameters yok)');
  ok(sent[0].req.systemInstruction.parts[0].text.includes('Robo'), 'sistem istemi gönderildi');
  ok(!/[<>]/.test(await p.evaluate(() => window.__spoken)), 'seslendirilen metinde etiket yok');
  await p.waitForTimeout(900);
  await p.screenshot({ path: out + '/4-konusma.png' });
  const lit = await p.evaluate(() => { const c = document.getElementById('robot'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; });
  ok(lit > 5000, 'yüz canvas\'a çiziliyor (parlak piksel: ' + lit + ')');
  await p.waitForTimeout(3500);
  const chip = await p.textContent('#chip');
  ok(chip === 'Hazır', 'konuşma bitince Hazır (şu an: ' + chip + ')');
  const ctx = await p.evaluate(() => __robot.R.emo);
  ok(!!ctx, 'duygu durumu: ' + ctx);

  // iptal: konuşurken mikrofona dokun
  await p.evaluate(() => { window.__stopped = false; });
  await p.click('#mic'); await p.waitForTimeout(900);
  ok(await p.textContent('#chip') !== 'Hazır', 'ikinci tur başladı');
  await p.click('#mic'); await p.waitForTimeout(300);
  ok(await p.textContent('#chip') === 'Hazır', 'dokununca iptal edilir');

  // sürekli sohbet
  await p.click('#btnConv'); ok(await p.getAttribute('#conv', 'class') === 'active', 'sürekli sohbet açılır');
  await p.click('#btnConv');

  // ayarlar
  await p.click('#btnSet'); await p.fill('#fGKey', 'AIza-yeni'); await p.fill('#fLang', 'en-US'); await p.click('#fSave');
  ok(await p.evaluate(() => __robot.cfg.gkey === 'AIza-yeni' && __robot.cfg.lang === 'en-US'), 'ayarlar kaydedildi');

  // Claude sağlayıcısı
  await p.evaluate(() => { Object.assign(__robot.cfg, { provider: 'claude', key: 'sk-test', gkey: 'x', lang: 'tr-TR' }); window.__sent = []; window.__torch = null; });
  await p.click('#mic'); await p.waitForTimeout(2600);
  const sc = await p.evaluate(() => window.__sent);
  ok(sc.length === 2 && sc[0].url.includes('api.anthropic.com') && sc[0].headers['x-api-key'] === 'sk-test' && sc[1].req.messages.slice(-1)[0].content[0].tool_use_id === 'tu_1', 'Claude sağlayıcısı da çalışır (tool_result geri gitti)');
  ok(await p.evaluate(() => window.__torch) === true, 'Claude araç çağrısı flaşı açtı');
  await p.waitForTimeout(4500);
  await p.evaluate(() => { __robot.cfg.provider = 'gemini'; });

  // hata yolu: anahtarsız
  await p.evaluate(() => { __robot.cfg.gkey = ''; });
  await p.click('#mic'); await p.waitForTimeout(1200);
  ok(/Gemini API anahtarı/i.test(await p.textContent('#sub')), 'anahtarsız kullanımda uyarı: ' + await p.textContent('#sub'));
  ok(await p.textContent('#chip') === 'Hazır', 'hatadan sonra Hazır');

  // duygu ekran görüntüleri
  await p.evaluate(() => { __robot.cfg.gkey = 'x'; });
  for (const e of ['happy', 'curious', 'alert', 'witty']) { await p.evaluate(e => __robot.applyCue({ emotion: e }), e); await p.waitForTimeout(700); await p.screenshot({ path: out + '/duygu-' + e + '.png' }); }

  ok(errs.length === 0, 'konsol/sayfa hatası yok ' + errs.join(' | '));
  await b.close();
  console.log(fails ? fails + ' HATA' : 'Hepsi geçti'); process.exit(fails ? 1 : 0);
})();
