package com.bektas.ilactakip;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.util.List;

// Doz işaretleme: alarm ekranı, bildirim düğmeleri ve uygulama ekranı hep bunu kullanır.
public final class Islem {
    private Islem() {}

    // Açık olan ekranlar (uygulama, alarm ekranı) veri değişince haber alır.
    private static final java.util.Set<Runnable> dinleyiciler = new java.util.LinkedHashSet<>();

    public static synchronized void dinle(Runnable r) { dinleyiciler.add(r); }
    public static synchronized void birak(Runnable r) { dinleyiciler.remove(r); }

    public static void ekranaHaberVer() {
        final Runnable[] l;
        synchronized (Islem.class) { l = dinleyiciler.toArray(new Runnable[0]); }
        Handler h = new Handler(Looper.getMainLooper());
        for (Runnable r : l) h.post(r);
    }

    public static void isle(Context c, List<String> anahtarlar, String durum, int erteleDk) {
        long simdi = System.currentTimeMillis();
        JSONObject cal = Durum.caliyor(c);
        for (String k : anahtarlar) {
            if (k.startsWith("deneme|")) { cal.remove(k); continue; }
            JSONObject m = Durum.dozIsle(c, k, durum, erteleDk);
            Durum.bekleyenCikar(c, k);
            if ("ertelendi".equals(durum)) Durum.bekleyenEkle(c, k, simdi + erteleDk * Takvim.DAKIKA, 0);
            cal.remove(k);
            if (m != null && "alindi".equals(durum)) Bildirim.stokKontrol(c, m);
        }
        Durum.caliyor(c, cal);
        Bildirim.kacirilanKapat(c, anahtarlar);
        if (cal.length() == 0) CalmaServisi.durdur(c);
        else CalmaServisi.guncelle(c);
        Zamanlayici.kur(c);
        Widget.guncelle(c);
        Yedek.degisti(c);
        ekranaHaberVer();
    }
}
