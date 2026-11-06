package com.bektas.ilactakip;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

// Kullanıcı verisi (ilaçlar, doz kayıtları, randevular, ayarlar) tek bir JSON dosyasında durur.
// Alarmın çalışma bilgisi (bekleyen tekrarlar, çalan dozlar) ayrı tutulur; ekran bunu yazmaz.
public final class Durum {
    private Durum() {}

    private static final Object KILIT = new Object();
    private static final String DOSYA = "durum.json";

    public static JSONObject oku(Context c) {
        synchronized (KILIT) {
            File f = new File(c.getFilesDir(), DOSYA);
            if (!f.exists()) return bos();
            try (FileInputStream in = new FileInputStream(f)) {
                ByteArrayOutputStream b = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                return new JSONObject(new String(b.toByteArray(), StandardCharsets.UTF_8));
            } catch (Exception e) {
                return bos();
            }
        }
    }

    public static void yaz(Context c, JSONObject d) {
        synchronized (KILIT) {
            File f = new File(c.getFilesDir(), DOSYA);
            File g = new File(c.getFilesDir(), DOSYA + ".yeni");
            try (FileOutputStream out = new FileOutputStream(g)) {
                out.write(d.toString().getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            } catch (Exception e) {
                return;
            }
            //noinspection ResultOfMethodCallIgnored
            g.renameTo(f);
        }
    }

    public static JSONObject bos() {
        JSONObject d = new JSONObject();
        try {
            d.put("v", 1);
            d.put("ilaclar", new JSONArray());
            d.put("kayit", new JSONObject());
            d.put("randevular", new JSONArray());
            d.put("ayar", new JSONObject());
        } catch (Exception ignored) {
        }
        return d;
    }

    public static JSONObject ayar(JSONObject d) {
        JSONObject a = d.optJSONObject("ayar");
        return a == null ? new JSONObject() : a;
    }

    // Ekrandan gelen veriyi kaydeder. Ekran veriyi okuduktan sonra bildirimden işaretlenen dozlar kaybolmasın diye birleştirir.
    public static void ekrandanYaz(Context c, String json) throws Exception {
        synchronized (KILIT) {
            JSONObject yeni = new JSONObject(json);
            long okundu = yeni.optLong("_okundu", 0);
            yeni.remove("_okundu");
            JSONObject eski = oku(c);
            JSONObject ek = eski.optJSONObject("kayit"), yk = yeni.optJSONObject("kayit");
            if (yk == null) { yk = new JSONObject(); yeni.put("kayit", yk); }
            if (ek != null && okundu > 0) {
                Iterator<String> it = ek.keys();
                while (it.hasNext()) {
                    String k = it.next();
                    JSONObject e = ek.optJSONObject(k);
                    if (e == null || e.optLong("z") <= okundu) continue;
                    JSONObject y = yk.optJSONObject(k);
                    if (y != null && y.optLong("z") >= e.optLong("z")) continue;
                    // Ekran okuduktan sonra bildirimden işaretlenmiş: koru, stok farkını uygula.
                    String yd = y == null ? "bekliyor" : y.optString("d");
                    yk.put(k, e);
                    stokDuzelt(yeni, k, yd, e.optString("d"));
                }
            }
            yaz(c, yeni);
        }
    }

    private static void stokDuzelt(JSONObject d, String k, String once, String sonra) throws Exception {
        JSONObject m = Takvim.ilacBul(d, k.split("\\|")[0]);
        if (m == null) return;
        String[] p = k.split("\\|");
        double birim = p.length > 2 ? Takvim.saatDozu(m, p[2]) : Math.max(m.optDouble("birimDoz", 1), 0.01);
        double stok = m.optDouble("stok", 0);
        if (!"alindi".equals(once) && "alindi".equals(sonra)) stok = Math.max(0, stok - birim);
        if ("alindi".equals(once) && !"alindi".equals(sonra)) stok = stok + birim;
        m.put("stok", Math.round(stok * 100) / 100.0);
    }

    // Doz işaretleme (www/model.js → dozIsle ile aynı kural). İşaretlenen ilacı döndürür.
    public static JSONObject dozIsle(Context c, String k, String durum, int erteleDk) {
        synchronized (KILIT) {
            try {
                JSONObject d = oku(c);
                JSONObject kayit = d.optJSONObject("kayit");
                if (kayit == null) { kayit = new JSONObject(); d.put("kayit", kayit); }
                JSONObject once = kayit.optJSONObject(k);
                String od = once == null ? "bekliyor" : once.optString("d", "bekliyor");
                stokDuzelt(d, k, od, durum);
                long simdi = System.currentTimeMillis();
                if ("bekliyor".equals(durum)) kayit.remove(k);
                else {
                    JSONObject y = new JSONObject();
                    y.put("d", durum);
                    y.put("z", simdi);
                    if ("ertelendi".equals(durum)) y.put("e", simdi + erteleDk * Takvim.DAKIKA);
                    kayit.put(k, y);
                }
                yaz(c, d);
                return Takvim.ilacBul(d, k.split("\\|")[0]);
            } catch (Exception e) {
                return null;
            }
        }
    }

    // ---- Alarmın çalışma bilgisi ----

    private static SharedPreferences p(Context c) {
        return c.getSharedPreferences("calisma", Context.MODE_PRIVATE);
    }

    public static long sonIslenen(Context c) { return p(c).getLong("sonIslenen", 0); }
    public static void sonIslenen(Context c, long t) { p(c).edit().putLong("sonIslenen", t).apply(); }
    public static long kurulanAlarm(Context c) { return p(c).getLong("kurulan", -1); }
    public static void kurulanAlarm(Context c, long t) { p(c).edit().putLong("kurulan", t).apply(); }

    // Bekleyen tekrar ve ertelemeler: [{k, z, n}]
    public static JSONArray bekleyen(Context c) {
        try { return new JSONArray(p(c).getString("bekleyen", "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    public static void bekleyen(Context c, JSONArray a) { p(c).edit().putString("bekleyen", a.toString()).apply(); }

    public static synchronized void bekleyenEkle(Context c, String k, long z, int n) {
        JSONArray a = bekleyenCikar(c, k);
        try {
            JSONObject o = new JSONObject();
            o.put("k", k); o.put("z", z); o.put("n", n);
            a.put(o);
        } catch (Exception ignored) {
        }
        bekleyen(c, a);
    }

    public static synchronized JSONArray bekleyenCikar(Context c, String k) {
        JSONArray a = bekleyen(c), y = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && !k.equals(o.optString("k"))) y.put(o);
        }
        bekleyen(c, y);
        return y;
    }

    // Şu an çalan dozlar: {anahtar: tekrar sayısı}
    public static JSONObject caliyor(Context c) {
        try { return new JSONObject(p(c).getString("caliyor", "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    public static void caliyor(Context c, JSONObject o) { p(c).edit().putString("caliyor", o.toString()).commit(); }

    public static List<String> anahtarlar(JSONObject o) {
        List<String> l = new ArrayList<>();
        Iterator<String> it = o.keys();
        while (it.hasNext()) l.add(it.next());
        java.util.Collections.sort(l, (a, b) -> {
            String[] x = a.split("\\|"), y = b.split("\\|");
            int r = (x[1] + x[2]).compareTo(y[1] + y[2]);
            return r != 0 ? r : a.compareTo(b);
        });
        return l;
    }
}
