package com.bektas.ilactakip;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;

// Kurulu alarm çaldığında ve telefon açıldığında / saat değiştiğinde çalışır.
public class AlarmAlici extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String a = i.getAction();
        if (Zamanlayici.ALARM.equals(a)) {
            isle(c);
        } else {
            // Açılış, saat/saat dilimi değişikliği, uygulama güncellemesi: alarmı yeniden kur.
            if (Intent.ACTION_TIME_CHANGED.equals(a) || Intent.ACTION_TIMEZONE_CHANGED.equals(a)) {
                Durum.sonIslenen(c, System.currentTimeMillis());
            }
            Zamanlayici.kur(c);
            Widget.guncelle(c);
        }
    }

    static void isle(Context c) {
        long simdi = System.currentTimeMillis();
        long a = Math.max(Durum.sonIslenen(c), simdi - 60 * Takvim.DAKIKA);
        long b = simdi + 30_000;
        JSONObject d = Durum.oku(c);
        JSONObject ayar = Durum.ayar(d);
        JSONObject calacak = new JSONObject();
        try {
            // 1) Saati gelen dozlar
            for (Takvim.Doz x : Takvim.araliktakiDozlar(d, a, b)) calacak.put(x.k, 0);

            // 2) Ön uyarılar (dozdan N dakika önce, tek sefer)
            long on = Zamanlayici.onUyariMs(ayar);
            if (on > 0) {
                List<Takvim.Doz> l = Takvim.araliktakiDozlar(d, a + on, b + on);
                for (Takvim.Doz x : l) if (x.ms > b) Bildirim.onUyari(c, x, (int) (on / Takvim.DAKIKA));
            }

            // Randevu hatırlatmaları (1 gün ve 2 saat önce)
            for (Object[] r : Takvim.randevuOlaylari(d, a, b)) Bildirim.randevu(c, d, (JSONObject) r[0], (Long) r[1]);

            // 3) Tekrarlar ve ertelemeler
            JSONArray bek = Durum.bekleyen(c), kalan = new JSONArray();
            JSONObject kayit = d.optJSONObject("kayit");
            for (int i = 0; i < bek.length(); i++) {
                JSONObject o = bek.optJSONObject(i);
                if (o == null) continue;
                if (o.optLong("z") > b) { kalan.put(o); continue; }
                String k = o.optString("k");
                JSONObject ky = kayit == null ? null : kayit.optJSONObject(k);
                String dd = ky == null ? "bekliyor" : ky.optString("d");
                if ("alindi".equals(dd) || "atlandi".equals(dd)) continue; // bu arada işaretlenmiş
                if (Takvim.ilacBul(d, k.split("\\|")[0]) == null) continue; // ilaç silinmiş
                calacak.put(k, o.optInt("n", 0));
            }
            Durum.bekleyen(c, kalan);
        } catch (Exception ignored) {
        }
        Durum.sonIslenen(c, b);
        if (calacak.length() > 0) CalmaServisi.cal(c, calacak);
        Zamanlayici.kur(c);
        Widget.guncelle(c);
        Islem.ekranaHaberVer();
    }
}
