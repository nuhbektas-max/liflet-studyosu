package com.bektas.ilactakip;

import android.app.Activity;
import android.app.Notification;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

// İlaç alınınca hastanın ebeveynine WhatsApp mesajı (www/app.js → haberMesajlari ile aynı metin).
// WhatsApp, mesajın kullanıcı onayı olmadan gönderilmesine izin vermez: mesaj hazır açılır, Gönder'e basılır.
public final class Haber {
    private Haber() {}

    // Türkiye numarası → 905xxxxxxxxx (www/model.js → telWhatsapp)
    public static String tel(String t) {
        String d = t == null ? "" : t.replaceAll("\\D", "");
        if (d.startsWith("00")) d = d.substring(2);
        if (d.startsWith("0")) d = "90" + d.substring(1);
        else if (d.length() == 10 && d.startsWith("5")) d = "90" + d;
        return d.length() >= 11 ? d : "";
    }

    // Her hasta için {numara, metin}
    public static List<String[]> mesajlar(JSONObject d, List<String> anahtarlar) {
        Map<String, List<String>> grup = new LinkedHashMap<>();
        Map<String, JSONObject> hastalar = new LinkedHashMap<>();
        for (String k : anahtarlar) {
            if (k.startsWith("deneme|")) continue;
            String[] p = k.split("\\|");
            JSONObject m = Takvim.ilacBul(d, p[0]);
            if (m == null) continue;
            JSONObject h = Takvim.hasta(d, m);
            if (!h.optBoolean("haberVer", true) || tel(h.optString("ebeveynTel")).isEmpty()) continue;
            String hid = h.optString("id");
            hastalar.put(hid, h);
            if (!grup.containsKey(hid)) grup.put(hid, new ArrayList<>());
            grup.get(hid).add(p[2] + " · " + m.optString("ad") + " · " + Takvim.dozYazi(m, p[2]));
        }
        Calendar c = Calendar.getInstance();
        String saat = String.format(Locale.ROOT, "%02d:%02d", c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE));
        List<String[]> out = new ArrayList<>();
        for (Map.Entry<String, List<String>> e : grup.entrySet()) {
            JSONObject h = hastalar.get(e.getKey());
            String ad = h.optString("ad").trim().isEmpty() ? "Hasta" : h.optString("ad").trim();
            String metin = "✅ " + ad + " ilacını aldı.\n" + android.text.TextUtils.join("\n", e.getValue()) + "\nSaat: " + saat + "\n— İlaç Takip";
            out.add(new String[]{tel(h.optString("ebeveynTel")), metin, ad});
        }
        return out;
    }

    public static Intent niyet(String no, String metin, String paket) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("https://api.whatsapp.com/send?phone=" + no + "&text=" + Uri.encode(metin)));
        if (paket != null) i.setPackage(paket);
        return i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    // WhatsApp ya da WhatsApp Business; ikisi de yoksa tarayıcıda wa.me
    public static void ac(Context c, String no, String metin) {
        for (String paket : new String[]{"com.whatsapp", "com.whatsapp.w4b", null}) {
            try { c.startActivity(niyet(no, metin, paket)); return; } catch (ActivityNotFoundException ignored) {}
        }
    }

    // ---- Otomatik gönderme (Erişilebilirlik izni bir kez verilince) ----
    private static android.content.SharedPreferences p(Context c) {
        return c.getSharedPreferences("whatsapp", Context.MODE_PRIVATE);
    }

    public static boolean otoAcik(Context c) {
        String l = android.provider.Settings.Secure.getString(c.getContentResolver(), android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (l == null) return false;
        android.content.ComponentName cn = new android.content.ComponentName(c, OtoGonder.class);
        for (String x : l.split(":")) {
            if (x.equalsIgnoreCase(cn.flattenToString()) || x.equalsIgnoreCase(cn.flattenToShortString())) return true;
        }
        return false;
    }

    // Gönderilecek mesajlar sırayla: [[no, metin, ad], ...]
    static org.json.JSONArray kuyruk(Context c) {
        try { return new org.json.JSONArray(p(c).getString("kuyruk", "[]")); } catch (Exception e) { return new org.json.JSONArray(); }
    }

    // Servis yalnızca İlaç Takip bir mesaj açtıktan sonraki 90 saniye içinde Gönder'e basar
    public static boolean bekleyenVar(Context c) {
        return kuyruk(c).length() > 0 && System.currentTimeMillis() - p(c).getLong("acildi", 0) < 90_000;
    }

    public static void gonderildi(Context c) {
        org.json.JSONArray k = kuyruk(c), y = new org.json.JSONArray();
        for (int i = 1; i < k.length(); i++) y.put(k.opt(i));
        p(c).edit().putString("kuyruk", y.toString()).putLong("acildi", 0).apply();
    }

    public static void siradakiniAc(Context c) {
        org.json.JSONArray k = kuyruk(c);
        if (k.length() == 0) return;
        org.json.JSONArray x = k.optJSONArray(0);
        p(c).edit().putLong("acildi", System.currentTimeMillis()).apply();
        ac(c, x.optString(0), x.optString(1));
    }

    // Mesajları dağıtır: otomatik açıksa hepsi sırayla kendiliğinden gider;
    // değilse ilki açılır (ekrandaysa), diğerleri dokununca açılan bildirim olur.
    public static void dagit(Context c, List<String[]> l, boolean ekranda) {
        if (l.isEmpty()) return;
        if (otoAcik(c)) {
            org.json.JSONArray k = new org.json.JSONArray();
            for (String[] x : l) { org.json.JSONArray a = new org.json.JSONArray(); a.put(x[0]); a.put(x[1]); a.put(x.length > 2 ? x[2] : ""); k.put(a); }
            p(c).edit().putString("kuyruk", k.toString()).apply();
            siradakiniAc(c);
            return;
        }
        int bas = 0;
        if (ekranda) { ac(c, l.get(0)[0], l.get(0)[1]); bas = 1; }
        for (int i = bas; i < l.size(); i++) bildirim(c, l.get(i));
    }

    // Alarm ekranından
    public static void ekrandan(Activity a, JSONObject d, List<String> anahtarlar) {
        dagit(a, mesajlar(d, anahtarlar), true);
    }

    // Bildirimdeki "Aldı" düğmesinden (uygulama açık değil)
    public static void bildirimle(Context c, JSONObject d, List<String> anahtarlar) {
        dagit(c, mesajlar(d, anahtarlar), false);
    }

    static void bildirim(Context c, String[] x) {
        Intent wa = niyet(x[0], x[1], null);
        PendingIntent pi = PendingIntent.getActivity(c, x[0].hashCode() & 0xFFFF, wa, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = Bildirim.kurucu(c, Bildirim.K_KACIRILAN)
                .setContentTitle(x[2] + " ilacını aldı · ebeveyne haber ver")
                .setContentText("Dokunun, WhatsApp mesajı hazır açılsın")
                .setStyle(new Notification.BigTextStyle().bigText(x[1]))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        Bildirim.nm(c).notify(600 + (x[0].hashCode() & 0xFFFF), n);
    }
}
