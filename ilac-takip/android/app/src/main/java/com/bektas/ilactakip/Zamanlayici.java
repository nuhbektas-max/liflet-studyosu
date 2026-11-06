package com.bektas.ilactakip;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

// Sistemde her zaman tek bir alarm kuruludur: sıradaki olayın (doz, ön uyarı, tekrar ya da erteleme) zamanı.
// Alarm çalınca o ana kadarki olaylar işlenir ve bir sonraki kurulur. Telefon yeniden açılınca da kurulur.
public final class Zamanlayici {
    private Zamanlayici() {}

    static final String ALARM = "com.bektas.ilactakip.ALARM";

    static PendingIntent alarmNiyeti(Context c) {
        Intent i = new Intent(c, AlarmAlici.class).setAction(ALARM);
        return PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    public static long onUyariMs(JSONObject ayar) {
        if (!ayar.optBoolean("onAlarm", true)) return 0;
        return Math.max(1, ayar.optInt("onDk", 15)) * Takvim.DAKIKA;
    }

    // Sıradaki olay zamanını hesaplar ve alarmı kurar. Kurulan zamanı döndürür (-1: olay yok).
    public static long kur(Context c) {
        long simdi = System.currentTimeMillis();
        long son = Durum.sonIslenen(c);
        if (son == 0 || son > simdi + 120_000) Durum.sonIslenen(c, simdi);
        JSONObject d = Durum.oku(c);
        long t = Math.max(simdi, Durum.sonIslenen(c));
        long en = Takvim.ilkOlay(d, t, onUyariMs(Durum.ayar(d)));
        long rnd = Takvim.ilkRandevuOlayi(d, t);
        if (rnd > 0 && (en < 0 || rnd < en)) en = rnd;
        JSONArray b = Durum.bekleyen(c);
        for (int i = 0; i < b.length(); i++) {
            JSONObject o = b.optJSONObject(i);
            if (o == null) continue;
            long z = Math.max(o.optLong("z"), simdi + 1000);
            if (en < 0 || z < en) en = z;
        }
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = alarmNiyeti(c);
        if (en < 0) {
            am.cancel(pi);
            Durum.kurulanAlarm(c, -1);
            return -1;
        }
        Intent ac = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent goster = PendingIntent.getActivity(c, 2, ac, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        try {
            // Çalar saat alarmı: pil tasarrufu ve uyku modunda bile tam zamanında çalar, durum çubuğunda saat simgesi görünür.
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(en, goster), pi);
        } catch (SecurityException e) {
            if (Build.VERSION.SDK_INT >= 23) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, en, pi);
            else am.setExact(AlarmManager.RTC_WAKEUP, en, pi);
        }
        Durum.kurulanAlarm(c, en);
        return en;
    }

    public static boolean kesinAlarmIzni(Context c) {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return am.canScheduleExactAlarms();
    }
}
