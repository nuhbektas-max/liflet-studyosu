package com.bektas.ilactakip;

import android.content.Context;
import android.media.AudioAttributes;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import org.json.JSONObject;

import java.util.List;
import java.util.Locale;

// Alarm çalarken ilacı Türkçe sesli okur (telefonun kendi ses motoru, internetsiz).
public final class Sesli {
    private TextToSpeech tts;
    private boolean hazir;
    private String bekleyen;
    private final Runnable basladi, bitti;

    // basladi: konuşma başlarken (alarm sesi kısılsın), bitti: konuşma bitince (ses geri gelsin)
    public Sesli(Context c, Runnable basladi, Runnable bitti) {
        this.basladi = basladi;
        this.bitti = bitti;
        tts = new TextToSpeech(c.getApplicationContext(), durum -> {
            if (durum != TextToSpeech.SUCCESS) return;
            int r = tts.setLanguage(new Locale("tr", "TR"));
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) return;
            tts.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            tts.setSpeechRate(0.9f);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { if (Sesli.this.basladi != null) Sesli.this.basladi.run(); }
                @Override public void onDone(String id) { if (Sesli.this.bitti != null) Sesli.this.bitti.run(); }
                @Override public void onError(String id) { if (Sesli.this.bitti != null) Sesli.this.bitti.run(); }
            });
            hazir = true;
            if (bekleyen != null) { soyle(bekleyen); bekleyen = null; }
        });
    }

    public void soyle(String metin) {
        if (tts == null || metin == null || metin.isEmpty()) return;
        if (!hazir) { bekleyen = metin; return; }
        Bundle b = new Bundle();
        b.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1f);
        tts.speak(metin, TextToSpeech.QUEUE_FLUSH, b, "ilac");
    }

    public void kapat() {
        if (tts != null) {
            try { tts.stop(); tts.shutdown(); } catch (Exception ignored) {}
            tts = null;
        }
    }

    // "Fatma Bektaş, Coraspin 100 mg ilacının saati geldi. 1 tablet. Tok karnına."
    public static String metin(JSONObject d, List<String> anahtarlar) {
        StringBuilder sb = new StringBuilder();
        boolean cok = Takvim.cokHasta(d);
        for (String k : anahtarlar) {
            if (k.startsWith("deneme|")) { sb.append("Bu bir deneme alarmıdır. Sesli okuma çalışıyor. "); continue; }
            JSONObject m = Takvim.ilacBul(d, k.split("\\|")[0]);
            if (m == null) continue;
            if (cok) sb.append(Takvim.hastaAdi(d, m)).append(", ");
            sb.append(m.optString("ad")).append(" ilacının saati geldi. ");
            String[] p = k.split("\\|");
            if (p.length > 2) sb.append(Takvim.dozYazi(m, p[2])).append(". ");
            String t = m.optString("talimat").trim();
            if (!t.isEmpty()) sb.append(t).append(". ");
        }
        if (sb.length() == 0) return "";
        if (!cok) sb.insert(0, "İlaç saati. ");
        return sb.toString().trim();
    }
}
