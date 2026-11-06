package com.bektas.ilactakip;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;

import org.json.JSONObject;

import java.util.List;
import java.util.Locale;

public final class Bildirim {
    private Bildirim() {}

    static final String K_ALARM = "alarm_v2";
    static final String K_ON = "on_uyari";
    static final String K_KACIRILAN = "kacirilan";
    static final String K_STOK = "stok";
    static final String K_RANDEVU = "randevu";

    static final int N_CALMA = 100;
    static final int N_KACIRILAN = 200;

    public static void kanallar(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        // Alarm sesini ve titreşimi servis çalar; kanal sessiz ama en yüksek önemde (tam ekran açılabilsin).
        NotificationChannel a = new NotificationChannel(K_ALARM, "İlaç alarmı", NotificationManager.IMPORTANCE_HIGH);
        a.setDescription("İlaç ve iğne saati gelince çalan alarm");
        a.setSound(null, null);
        a.enableVibration(false);
        a.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        a.setBypassDnd(true);
        nm.createNotificationChannel(a);

        NotificationChannel o = new NotificationChannel(K_ON, "Ön uyarı", NotificationManager.IMPORTANCE_DEFAULT);
        o.setDescription("İlaç saatinden birkaç dakika önce bir kez uyarır");
        nm.createNotificationChannel(o);

        NotificationChannel k = new NotificationChannel(K_KACIRILAN, "Cevaplanmayan alarm", NotificationManager.IMPORTANCE_HIGH);
        k.setDescription("Alarm susunca, işaretlenmemiş doz için kalan bildirim");
        nm.createNotificationChannel(k);

        NotificationChannel s = new NotificationChannel(K_STOK, "Stok uyarısı", NotificationManager.IMPORTANCE_DEFAULT);
        s.setDescription("İlaç bitmek üzereyken reçete hatırlatması");
        nm.createNotificationChannel(s);

        NotificationChannel r = new NotificationChannel(K_RANDEVU, "Randevu hatırlatması", NotificationManager.IMPORTANCE_HIGH);
        r.setDescription("Doktor randevusundan 1 gün ve 2 saat önce");
        nm.createNotificationChannel(r);

        // Eski kanal adı kalmışsa kaldır
        nm.deleteNotificationChannel("alarm_v1");
    }

    @SuppressWarnings("deprecation")
    static Notification.Builder kurucu(Context c, String kanal) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, kanal) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_bildirim).setColor(Color.parseColor("#E30A17"));
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH);
        return b;
    }

    static PendingIntent uygulamayiAc(Context c, int kod) {
        Intent i = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, kod, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent islem(Context c, String eylem, List<String> anahtarlar, int dk, int kod) {
        Intent i = new Intent(c, IslemAlici.class).setAction(eylem);
        i.putExtra("anahtarlar", android.text.TextUtils.join("\n", anahtarlar));
        i.putExtra("dk", dk);
        return PendingIntent.getBroadcast(c, kod, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // "Coraspin 100 mg, Lantus 10 ünite" gibi kısa özet
    static String ozet(JSONObject d, List<String> anahtarlar) {
        StringBuilder sb = new StringBuilder();
        for (String k : anahtarlar) {
            if (k.startsWith("deneme|")) { if (sb.length() > 0) sb.append("\n"); sb.append("Deneme alarmı: ses ve titreşim çalışıyor"); continue; }
            JSONObject m = Takvim.ilacBul(d, k.split("\\|")[0]);
            if (m == null) continue;
            if (sb.length() > 0) sb.append("\n");
            if (Takvim.cokHasta(d)) sb.append(Takvim.hastaAdi(d, m).toUpperCase(new java.util.Locale("tr"))).append(": ");
            sb.append(m.optString("ad"));
            String[] pk = k.split("\\|");
            if (pk.length > 2) sb.append(" · ").append(Takvim.dozYazi(m, pk[2]));
            String t = m.optString("talimat");
            if (!t.isEmpty()) sb.append(" (").append(t).append(")");
        }
        return sb.toString();
    }

    // Çalan dozların hastaları: tek hasta ise adı, değilse null
    static String tekHasta(JSONObject d, List<String> anahtarlar) {
        if (!Takvim.cokHasta(d)) return null;
        String ad = null;
        for (String k : anahtarlar) {
            JSONObject m = Takvim.ilacBul(d, k.split("\\|")[0]);
            if (m == null) continue;
            String a = Takvim.hastaAdi(d, m);
            if (ad == null) ad = a; else if (!ad.equals(a)) return "";
        }
        return ad;
    }

    static String saatOf(List<String> anahtarlar) {
        return anahtarlar.isEmpty() ? "" : anahtarlar.get(0).split("\\|")[2];
    }

    // Çalan alarmın bildirimi (servis bunu ön planda tutar)
    public static Notification calma(Context c, List<String> anahtarlar) {
        JSONObject d = Durum.oku(c);
        String th = tekHasta(d, anahtarlar);
        String baslik = th == null ? (anahtarlar.size() > 1 ? anahtarlar.size() + " ilaç" : "İlaç") + " saati · " + saatOf(anahtarlar)
                : th.isEmpty() ? "Birden çok hastanın ilaç saati · " + saatOf(anahtarlar)
                : th + " · ilaç saati " + saatOf(anahtarlar);
        int renk = Color.parseColor("#22574F");
        try {
            JSONObject m0 = anahtarlar.isEmpty() ? null : Takvim.ilacBul(d, anahtarlar.get(0).split("\\|")[0]);
            if (th != null && !th.isEmpty() && m0 != null) renk = Color.parseColor(Takvim.hasta(d, m0).optString("renk", "#22574F"));
        } catch (Exception ignored) {}
        Intent ekran = new Intent(c, AlarmEkrani.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        PendingIntent tamEkran = PendingIntent.getActivity(c, 3, ekran, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String metin = ozet(d, anahtarlar);
        Notification.Builder b = kurucu(c, K_ALARM)
                .setContentTitle(baslik)
                .setContentText(metin)
                .setStyle(new Notification.BigTextStyle().bigText(metin))
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(tamEkran)
                .setFullScreenIntent(tamEkran, true)
                .setColor(renk);
        if (th != null && th.isEmpty()) {
            // İki ayrı hastanın ilacı aynı anda: tek düğmeyle hepsi işaretlenmesin, ekranda ayrı ayrı seçilsin
            b.addAction(new Notification.Action.Builder(null, "Ekranı aç", tamEkran).build())
             .addAction(new Notification.Action.Builder(null, "10 dk ertele", islem(c, IslemAlici.ERTELE, anahtarlar, 10, 11)).build());
        } else {
            b.addAction(new Notification.Action.Builder(null, th == null ? "Aldım" : "Aldı", islem(c, IslemAlici.ALDIM, anahtarlar, 0, 10)).build())
             .addAction(new Notification.Action.Builder(null, "10 dk ertele", islem(c, IslemAlici.ERTELE, anahtarlar, 10, 11)).build())
             .addAction(new Notification.Action.Builder(null, "Atla", islem(c, IslemAlici.ATLA, anahtarlar, 0, 12)).build());
        }
        return b.build();
    }

    // Alarm susup doz işaretlenmediyse kalan bildirim
    public static void kacirildi(Context c, List<String> anahtarlar) {
        if (anahtarlar.isEmpty()) return;
        JSONObject d = Durum.oku(c);
        String metin = ozet(d, anahtarlar);
        String th = tekHasta(d, anahtarlar);
        Notification.Builder kb = kurucu(c, K_KACIRILAN)
                .setContentTitle((th != null && !th.isEmpty() ? th + " · " : "") + "Cevaplanmadı · " + saatOf(anahtarlar) + " dozu")
                .setContentText(metin)
                .setStyle(new Notification.BigTextStyle().bigText(metin + "\nAlarm biraz sonra yeniden çalacak."))
                .setCategory(Notification.CATEGORY_REMINDER)
                .setContentIntent(uygulamayiAc(c, 4))
                .setAutoCancel(true);
        if (th == null || !th.isEmpty()) {
            kb.addAction(new Notification.Action.Builder(null, th == null ? "Aldım" : "Aldı", islem(c, IslemAlici.ALDIM, anahtarlar, 0, 20)).build())
              .addAction(new Notification.Action.Builder(null, "Atla", islem(c, IslemAlici.ATLA, anahtarlar, 0, 21)).build());
        }
        nm(c).notify(N_KACIRILAN, kb.build());
    }

    public static void kacirilanKapat(Context c, List<String> anahtarlar) {
        nm(c).cancel(N_KACIRILAN);
    }

    public static void onUyari(Context c, Takvim.Doz x, int dk) {
        JSONObject dd = Durum.oku(c);
        String metin = (Takvim.cokHasta(dd) ? Takvim.hastaAdi(dd, x.ilac) + ": " : "") + x.ilac.optString("ad") + (x.ilac.optString("doz").isEmpty() ? "" : " · " + x.ilac.optString("doz"));
        Notification.Builder b = kurucu(c, K_ON)
                .setContentTitle(dk + " dakika sonra ilaç saati (" + x.saat + ")")
                .setContentText(metin)
                .setStyle(new Notification.BigTextStyle().bigText(metin))
                .setContentIntent(uygulamayiAc(c, 5))
                .setAutoCancel(true);
        if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(dk * Takvim.DAKIKA);
        Notification n = b.build();
        nm(c).notify(300 + (x.k.hashCode() & 0xFFFF), n);
    }

    public static void randevu(Context c, JSONObject d, JSONObject r, long once) {
        long z = r.optLong("zaman");
        java.util.Calendar cal = java.util.Calendar.getInstance();
        cal.setTimeInMillis(z);
        String saat = String.format(Locale.ROOT, "%02d:%02d", cal.get(java.util.Calendar.HOUR_OF_DAY), cal.get(java.util.Calendar.MINUTE));
        String ne = once >= 24 * 60 * Takvim.DAKIKA ? "Yarın " + saat : "2 saat sonra (" + saat + ")";
        String kim = Takvim.cokHasta(d) ? Takvim.hastaAdi(d, r) + " · " : "";
        StringBuilder sb = new StringBuilder();
        String dr = r.optString("doktor").trim(), br = r.optString("brans").trim(), hs = r.optString("hastane").trim();
        if (!dr.isEmpty()) sb.append(dr);
        if (!br.isEmpty()) sb.append(sb.length() > 0 ? " · " : "").append(br);
        if (!hs.isEmpty()) sb.append(sb.length() > 0 ? "\n" : "").append(hs);
        String sor = r.optString("sorular").trim();
        String uzun = sb + (sor.isEmpty() ? "" : "\nSorulacaklar: " + sor) + "\nKimliğinizi ve ilaç listenizi yanınıza alın.";
        Notification n = kurucu(c, K_RANDEVU)
                .setContentTitle(kim + "Doktor randevusu: " + ne)
                .setContentText(sb.length() > 0 ? sb.toString() : "Randevunuzu unutmayın")
                .setStyle(new Notification.BigTextStyle().bigText(uzun.trim()))
                .setCategory(Notification.CATEGORY_REMINDER)
                .setContentIntent(uygulamayiAc(c, 8))
                .setAutoCancel(true)
                .build();
        nm(c).notify(500 + ((r.optString("id") + once).hashCode() & 0xFFFF), n);
    }

    public static void stokKontrol(Context c, JSONObject m) {
        double stok = m.optDouble("stok", 0), kritik = m.optDouble("kritik", 0);
        if (stok > kritik) return;
        String birim = m.optString("form").equals("igne") ? "doz" : "adet";
        JSONObject dd = Durum.oku(c);
        String kim = Takvim.cokHasta(dd) ? Takvim.hastaAdi(dd, m) + ": " : "";
        String metin = kim + (stok <= 0 ? m.optString("ad") + " bitti. Reçeteyi yeniletin."
                : m.optString("ad") + " için " + sayi(stok) + " " + birim + " kaldı. Reçete yenileme zamanı.");
        Notification n = kurucu(c, K_STOK)
                .setContentTitle("Stok azaldı")
                .setContentText(metin)
                .setStyle(new Notification.BigTextStyle().bigText(metin))
                .setContentIntent(uygulamayiAc(c, 6))
                .setAutoCancel(true)
                .build();
        nm(c).notify(400 + (m.optString("id").hashCode() & 0xFFFF), n);
    }

    static String sayi(double v) {
        return v == Math.rint(v) ? String.valueOf((long) v) : String.format(Locale.ROOT, "%.1f", v).replace('.', ',');
    }

    static NotificationManager nm(Context c) {
        return (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    // Android 14'te tam ekran alarm izni ayrıca verilmeli
    public static boolean tamEkranIzni(Context c) {
        if (Build.VERSION.SDK_INT < 34) return true;
        return nm(c).canUseFullScreenIntent();
    }

    public static boolean bildirimIzni(Context c) {
        if (Build.VERSION.SDK_INT >= 24 && !nm(c).areNotificationsEnabled()) return false;
        return true;
    }
}
