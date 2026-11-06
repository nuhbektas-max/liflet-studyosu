package com.bektas.ilactakip;

import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

import org.json.JSONObject;

import java.util.Iterator;
import java.util.List;

// Alarm sesi ve titreşimi: ekran kapalı ve kilitliyken de çalar. Belirlenen süre sonunda susar,
// doz işaretlenmediyse ayarlanan aralıkla yeniden çalar.
public class CalmaServisi extends Service {
    static final String CAL = "cal", DUR = "dur", GUNCELLE = "guncelle";

    private MediaPlayer oynatici;
    private Vibrator titresim;
    private PowerManager.WakeLock uyanik;
    private final Handler h = new Handler(Looper.getMainLooper());
    private int eskiSes = -1;
    private float sesSeviyesi;
    private final Runnable zamanAsimi = this::zamanAsimi;
    private Sesli sesli;
    private boolean konusuyor;
    // Alarm çaldıkça ilaç 30 saniyede bir sesli okunur; okurken alarm sesi kısılır
    private final Runnable oku = new Runnable() {
        @Override
        public void run() {
            if (sesli == null) return;
            sesli.soyle(Sesli.metin(Durum.oku(CalmaServisi.this), Durum.anahtarlar(Durum.caliyor(CalmaServisi.this))));
            h.postDelayed(this, 30_000);
        }
    };
    private final Runnable sesArtir = new Runnable() {
        @Override
        public void run() {
            if (oynatici == null) return;
            sesSeviyesi = Math.min(1f, sesSeviyesi + 0.05f);
            if (!konusuyor) try { oynatici.setVolume(sesSeviyesi, sesSeviyesi); } catch (Exception ignored) {}
            if (sesSeviyesi < 1f) h.postDelayed(this, 1000);
        }
    };

    // Yeni dozları çalan listeye ekler ve servisi başlatır. calacak: {anahtar: tekrar no}
    public static void cal(Context c, JSONObject calacak) {
        JSONObject ayar = Durum.ayar(Durum.oku(c));
        int tekrarSayi = Math.max(0, ayar.optInt("tekrarSayi", 3));
        long aralik = (Math.max(1, ayar.optInt("calmaDk", 2)) + Math.max(1, ayar.optInt("tekrarDk", 5))) * Takvim.DAKIKA;
        long simdi = System.currentTimeMillis();
        JSONObject cal = Durum.caliyor(c);
        Iterator<String> it = calacak.keys();
        while (it.hasNext()) {
            String k = it.next();
            int n = calacak.optInt(k, 0);
            try { cal.put(k, n); } catch (Exception ignored) {}
            // Cevap gelmezse yeniden çalsın (son tekrara kadar)
            if (!k.startsWith("deneme|") && n < tekrarSayi) Durum.bekleyenEkle(c, k, simdi + aralik, n + 1);
            else Durum.bekleyenCikar(c, k);
        }
        Durum.caliyor(c, cal);
        Intent i = new Intent(c, CalmaServisi.class).setAction(CAL);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        // Uygulama öndeyse alarm ekranını doğrudan aç (değilse tam ekran bildirim açar)
        try {
            c.startActivity(new Intent(c, AlarmEkrani.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) {
        }
    }

    public static void durdur(Context c) {
        try { c.startService(new Intent(c, CalmaServisi.class).setAction(DUR)); } catch (Exception e) { c.stopService(new Intent(c, CalmaServisi.class)); }
    }

    public static void guncelle(Context c) {
        try { c.startService(new Intent(c, CalmaServisi.class).setAction(GUNCELLE)); } catch (Exception ignored) {}
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent == null ? CAL : intent.getAction();
        List<String> keys = Durum.anahtarlar(Durum.caliyor(this));
        if (DUR.equals(a) || keys.isEmpty()) {
            on(keys.isEmpty() ? null : keys);
            bitir();
            return START_NOT_STICKY;
        }
        on(keys);
        if (CAL.equals(a)) {
            JSONObject ayar = Durum.ayar(Durum.oku(this));
            boolean sessiz = Takvim.sessizde(ayar, System.currentTimeMillis());
            sesiBaslat(ayar, sessiz);
            if (ayar.optBoolean("titresim", true) || sessiz) titret();
            h.removeCallbacks(oku);
            if (!sessiz && ayar.optBoolean("sesliOku", true)) {
                if (sesli == null) sesli = new Sesli(this,
                        () -> h.post(() -> { konusuyor = true; sesKis(0.12f); }),
                        () -> h.post(() -> { konusuyor = false; sesKis(sesSeviyesi); }));
                h.postDelayed(oku, 2500);
            }
            if (uyanik == null) {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                uyanik = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ilactakip:alarm");
                uyanik.setReferenceCounted(false);
            }
            long sure = Math.max(1, ayar.optInt("calmaDk", 2)) * Takvim.DAKIKA;
            uyanik.acquire(sure + 30_000);
            h.removeCallbacks(zamanAsimi);
            h.postDelayed(zamanAsimi, sure);
        }
        return START_NOT_STICKY;
    }

    private void on(List<String> keys) {
        Notification n = Bildirim.calma(this, keys == null ? java.util.Collections.<String>emptyList() : keys);
        if (Build.VERSION.SDK_INT >= 29) startForeground(Bildirim.N_CALMA, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(Bildirim.N_CALMA, n);
    }

    private void sesiBaslat(JSONObject ayar, boolean sessiz) {
        sesiDurdur();
        if (sessiz) return; // sessiz saatlerde yalnızca titreşim
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        try {
            // Alarm sesi çok kısıksa duyulur seviyeye çek (alarm susunca eski hâline döner)
            int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM), su = am.getStreamVolume(AudioManager.STREAM_ALARM);
            if (su < max * 0.6) { eskiSes = su; am.setStreamVolume(AudioManager.STREAM_ALARM, (int) Math.ceil(max * 0.7), 0); }
        } catch (Exception ignored) {
        }
        Uri[] adaylar = {
                ayar.optString("sesUri", "").isEmpty() ? null : Uri.parse(ayar.optString("sesUri")),
                RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM),
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
        };
        boolean artan = ayar.optBoolean("artanSes", true);
        for (Uri u : adaylar) {
            if (u == null) continue;
            try {
                MediaPlayer mp = new MediaPlayer();
                mp.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                mp.setDataSource(this, u);
                mp.setLooping(true);
                mp.prepare();
                sesSeviyesi = artan ? 0.25f : 1f;
                mp.setVolume(sesSeviyesi, sesSeviyesi);
                mp.start();
                oynatici = mp;
                if (artan) h.postDelayed(sesArtir, 1000);
                return;
            } catch (Exception ignored) {
            }
        }
    }

    @SuppressWarnings("deprecation")
    private void titret() {
        if (titresim != null) return;
        titresim = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (titresim == null || !titresim.hasVibrator()) { titresim = null; return; }
        long[] desen = {0, 900, 700, 900, 1500};
        AudioAttributes aa = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build();
        if (Build.VERSION.SDK_INT >= 26) titresim.vibrate(VibrationEffect.createWaveform(desen, 0), aa);
        else titresim.vibrate(desen, 0, aa);
    }

    private void sesiDurdur() {
        h.removeCallbacks(sesArtir);
        if (oynatici != null) {
            try { oynatici.stop(); } catch (Exception ignored) {}
            oynatici.release();
            oynatici = null;
        }
        if (eskiSes >= 0) {
            try { ((AudioManager) getSystemService(AUDIO_SERVICE)).setStreamVolume(AudioManager.STREAM_ALARM, eskiSes, 0); } catch (Exception ignored) {}
            eskiSes = -1;
        }
    }

    // Süre doldu, kimse dokunmadı: sesi kes, "cevaplanmadı" bildirimi bırak. Tekrar alarmı zaten kurulu.
    private void zamanAsimi() {
        JSONObject cal = Durum.caliyor(this);
        List<String> keys = Durum.anahtarlar(cal);
        List<String> gercek = new java.util.ArrayList<>();
        for (String k : keys) if (!k.startsWith("deneme|")) gercek.add(k);
        Durum.caliyor(this, new JSONObject());
        Bildirim.kacirildi(this, gercek);
        Islem.ekranaHaberVer();
        bitir();
    }

    private void sesKis(float v) {
        if (oynatici == null) return;
        try { oynatici.setVolume(v, v); } catch (Exception ignored) {}
    }

    private void bitir() {
        h.removeCallbacks(oku);
        if (sesli != null) { sesli.kapat(); sesli = null; }
        h.removeCallbacks(zamanAsimi);
        sesiDurdur();
        if (titresim != null) { titresim.cancel(); titresim = null; }
        if (uyanik != null && uyanik.isHeld()) uyanik.release();
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (sesli != null) { sesli.kapat(); sesli = null; }
        h.removeCallbacksAndMessages(null);
        sesiDurdur();
        if (titresim != null) titresim.cancel();
        if (uyanik != null && uyanik.isHeld()) uyanik.release();
        super.onDestroy();
    }
}
