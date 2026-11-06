package com.bektas.ilactakip;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.List;

// Ana ekran parçacığı: sıradaki doz ve bugünkü durum
public class Widget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        ciz(c, m, ids);
    }

    public static void guncelle(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            int[] ids = m.getAppWidgetIds(new ComponentName(c, Widget.class));
            if (ids.length > 0) ciz(c, m, ids);
        } catch (Exception ignored) {
        }
    }

    static void ciz(Context c, AppWidgetManager m, int[] ids) {
        JSONObject d = Durum.oku(c);
        long simdi = System.currentTimeMillis();
        List<Takvim.Doz> bugun = Takvim.gununDozlari(d, Takvim.tarihStr(simdi));
        JSONObject kayit = d.optJSONObject("kayit");
        int alinan = 0;
        for (Takvim.Doz x : bugun) {
            JSONObject k = kayit == null ? null : kayit.optJSONObject(x.k);
            if (k != null && "alindi".equals(k.optString("d"))) alinan++;
        }
        List<Takvim.Doz> sira = Takvim.siradaki(d, simdi);
        String ust, alt;
        if (sira.isEmpty()) {
            ust = "Planlı doz yok";
            alt = "";
        } else {
            Takvim.Doz x = sira.get(0);
            boolean bugunMu = x.tarih.equals(Takvim.tarihStr(simdi));
            ust = (bugunMu ? "" : "Yarın ") + x.saat;
            StringBuilder sb = new StringBuilder();
            for (Takvim.Doz y : sira) {
                if (sb.length() > 0) sb.append(", ");
                if (Takvim.cokHasta(d)) sb.append(Takvim.hastaAdi(d, y.ilac).split(" ")[0]).append(": ");
                sb.append(y.ilac.optString("ad"));
            }
            alt = sb.toString();
        }
        String durum = bugun.isEmpty() ? "Bugün doz yok" : "Bugün " + alinan + "/" + bugun.size() + " alındı";
        Intent i = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 7, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        for (int id : ids) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
            v.setTextViewText(R.id.w_saat, ust);
            v.setTextViewText(R.id.w_ilac, alt);
            v.setTextViewText(R.id.w_durum, durum);
            v.setOnClickPendingIntent(R.id.w_kok, pi);
            m.updateAppWidget(id, v);
        }
    }
}
