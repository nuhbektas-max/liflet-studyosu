package com.bektas.ilactakip;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

// Doz günü ve alarm zamanı hesapları. Kural www/model.js → gunDozVarMi ile birebir aynıdır.
public final class Takvim {
    private Takvim() {}

    public static final long DAKIKA = 60_000L;

    public static String tarihStr(Calendar c) {
        return String.format(Locale.ROOT, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    public static String tarihStr(long ms) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(ms);
        return tarihStr(c);
    }

    public static Calendar tarihOku(String s) {
        String[] p = s.split("-");
        Calendar c = Calendar.getInstance();
        c.clear();
        c.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]), 0, 0, 0);
        return c;
    }

    public static String gunEkle(String s, int n) {
        Calendar c = tarihOku(s);
        c.add(Calendar.DAY_OF_MONTH, n);
        return tarihStr(c);
    }

    // Takvim günü farkı (yaz saatinden etkilenmez)
    public static long gunFarki(String a, String b) {
        return gunNo(b) - gunNo(a);
    }

    private static long gunNo(String s) {
        String[] p = s.split("-");
        Calendar u = Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"));
        u.clear();
        u.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]));
        return Math.round(u.getTimeInMillis() / 86_400_000.0);
    }

    // 1 = Pazartesi … 7 = Pazar
    public static int haftaGunu(String s) {
        int g = tarihOku(s).get(Calendar.DAY_OF_WEEK); // 1 = Pazar
        return g == Calendar.SUNDAY ? 7 : g - 1;
    }

    public static long zamanMs(String tarih, String saat) {
        Calendar c = tarihOku(tarih);
        String[] p = saat.split(":");
        c.set(Calendar.HOUR_OF_DAY, Integer.parseInt(p[0]));
        c.set(Calendar.MINUTE, Integer.parseInt(p[1]));
        return c.getTimeInMillis();
    }

    public static boolean gunDozVarMi(JSONObject m, String tarih) {
        if (m.optBoolean("arsiv", false)) return false;
        JSONArray saatler = m.optJSONArray("saatler");
        if (saatler == null || saatler.length() == 0) return false;
        String bas = m.optString("baslangic", "");
        String bit = m.optString("bitis", "");
        if (!bas.isEmpty() && tarih.compareTo(bas) < 0) return false;
        if (!bit.isEmpty() && tarih.compareTo(bit) > 0) return false;
        JSONObject plan = m.optJSONObject("plan");
        String tur = plan == null ? "hergun" : plan.optString("tur", "hergun");
        if ("gunler".equals(tur)) {
            JSONArray g = plan.optJSONArray("gunler");
            int hg = haftaGunu(tarih);
            if (g == null) return false;
            for (int i = 0; i < g.length(); i++) if (g.optInt(i) == hg) return true;
            return false;
        }
        if ("aralik".equals(tur)) {
            int a = Math.max(1, plan.optInt("aralik", 1));
            if (bas.isEmpty()) return true;
            return gunFarki(bas, tarih) % a == 0;
        }
        return true;
    }

    public static String anahtar(String id, String tarih, String saat) {
        return id + "|" + tarih + "|" + saat;
    }

    // Kaydı olmayan (henüz işaretlenmemiş) doz
    public static boolean isaretsiz(JSONObject durum, String k) {
        JSONObject kayit = durum.optJSONObject("kayit");
        return kayit == null || !kayit.has(k);
    }

    public static final class Doz {
        public final String k;
        public final JSONObject ilac;
        public final String tarih, saat;
        public final long ms;

        Doz(String k, JSONObject ilac, String tarih, String saat, long ms) {
            this.k = k; this.ilac = ilac; this.tarih = tarih; this.saat = saat; this.ms = ms;
        }
    }

    // Bir günün dozları (saate göre sıralı)
    public static List<Doz> gununDozlari(JSONObject durum, String tarih) {
        List<Doz> out = new ArrayList<>();
        JSONArray ilaclar = durum.optJSONArray("ilaclar");
        if (ilaclar == null) return out;
        for (int i = 0; i < ilaclar.length(); i++) {
            JSONObject m = ilaclar.optJSONObject(i);
            if (m == null || !gunDozVarMi(m, tarih)) continue;
            JSONArray saatler = m.optJSONArray("saatler");
            for (int j = 0; j < saatler.length(); j++) {
                String saat = saatler.optString(j);
                if (!saat.matches("\\d{2}:\\d{2}")) continue;
                out.add(new Doz(anahtar(m.optString("id"), tarih, saat), m, tarih, saat, zamanMs(tarih, saat)));
            }
        }
        out.sort((a, b) -> Long.compare(a.ms, b.ms));
        return out;
    }

    // (a, b] aralığına düşen, işaretlenmemiş dozlar
    public static List<Doz> araliktakiDozlar(JSONObject durum, long a, long b) {
        List<Doz> out = new ArrayList<>();
        String t = gunEkle(tarihStr(a), -1), son = tarihStr(b);
        for (int i = 0; i < 400 && t.compareTo(son) <= 0; i++, t = gunEkle(t, 1)) {
            for (Doz d : gununDozlari(durum, t)) if (d.ms > a && d.ms <= b && isaretsiz(durum, d.k)) out.add(d);
        }
        return out;
    }

    // t anından sonraki ilk olay zamanı (doz ya da ön uyarı); yoksa -1
    public static long ilkOlay(JSONObject durum, long t, long onUyariMs) {
        long en = -1;
        String g = tarihStr(t);
        int bulunduSonra = -1;
        for (int i = 0; i < 400; i++, g = gunEkle(g, 1)) {
            for (Doz d : gununDozlari(durum, g)) {
                if (!isaretsiz(durum, d.k)) continue;
                if (d.ms > t && (en < 0 || d.ms < en)) en = d.ms;
                long on = d.ms - onUyariMs;
                if (onUyariMs > 0 && on > t && (en < 0 || on < en)) en = on;
            }
            if (en >= 0 && bulunduSonra < 0) bulunduSonra = i;
            if (bulunduSonra >= 0 && i > bulunduSonra) break; // ertesi günün ön uyarısı da hesaba katıldı
        }
        return en;
    }

    // Sıradaki doz(lar): aynı dakikadaki tüm işaretsiz dozlar (son 1 saattekiler dahil)
    public static List<Doz> siradaki(JSONObject durum, long simdi) {
        String g = tarihStr(simdi);
        for (int i = 0; i < 60; i++, g = gunEkle(g, 1)) {
            List<Doz> d = new ArrayList<>();
            for (Doz x : gununDozlari(durum, g)) if (x.ms > simdi - 60 * DAKIKA && isaretsiz(durum, x.k)) d.add(x);
            if (!d.isEmpty()) {
                long ilk = d.get(0).ms;
                List<Doz> out = new ArrayList<>();
                for (Doz x : d) if (x.ms == ilk) out.add(x);
                return out;
            }
        }
        return new ArrayList<>();
    }

    public static JSONObject ilacBul(JSONObject durum, String id) {
        JSONArray a = durum.optJSONArray("ilaclar");
        if (a == null) return null;
        for (int i = 0; i < a.length(); i++) {
            JSONObject m = a.optJSONObject(i);
            if (m != null && id.equals(m.optString("id"))) return m;
        }
        return null;
    }

    // ---- Saat başına doz (www/model.js → saatDozu / miktarYazi / dozYazi) ----
    public static double saatDozu(JSONObject m, String saat) {
        JSONObject d = m.optJSONObject("dozlar");
        double v = d == null ? 0 : d.optDouble(saat, 0);
        if (v > 0) return v;
        double b = m.optDouble("birimDoz", 1);
        return b > 0 ? b : 1;
    }

    public static String miktarYazi(double v) {
        long t = (long) Math.floor(v);
        double k = Math.round((v - t) * 100) / 100.0;
        if (k == 0) return String.valueOf(t);
        if (k == 0.5) return t > 0 ? t + " buçuk" : "yarım";
        if (k == 0.25) return t > 0 ? t + " çeyrek" : "çeyrek";
        if (k == 0.75) return t > 0 ? t + " tam 3/4" : "3/4";
        return String.valueOf(v).replace('.', ',');
    }

    public static String birim(String form) {
        switch (form == null ? "" : form) {
            case "igne": case "diger": return "doz";
            case "insulin": return "ünite";
            case "surup": return "ölçek";
            case "damla": return "damla";
            case "krem": return "uygulama";
            case "sprey": return "puf";
            default: return "adet";
        }
    }

    public static String dozYazi(JSONObject m, String saat) {
        return miktarYazi(saatDozu(m, saat)) + " " + birim(m.optString("form"));
    }

    // ---- Randevu hatırlatması: 1 gün ve 2 saat önce ----
    public static final long[] RANDEVU_ONCE = {24 * 60 * DAKIKA, 2 * 60 * DAKIKA};

    public static boolean randevuAcik(JSONObject durum) {
        JSONObject a = durum.optJSONObject("ayar");
        return a == null || a.optBoolean("randevuHatirlat", true);
    }

    // (a, b] aralığına düşen randevu hatırlatmaları: {randevu, kaç ms önce}
    public static List<Object[]> randevuOlaylari(JSONObject durum, long a, long b) {
        List<Object[]> out = new ArrayList<>();
        if (!randevuAcik(durum)) return out;
        JSONArray r = durum.optJSONArray("randevular");
        if (r == null) return out;
        for (int i = 0; i < r.length(); i++) {
            JSONObject x = r.optJSONObject(i);
            if (x == null || x.optBoolean("tamam")) continue;
            long z = x.optLong("zaman");
            for (long once : RANDEVU_ONCE) {
                long t = z - once;
                if (t > a && t <= b) out.add(new Object[]{x, once});
            }
        }
        return out;
    }

    public static long ilkRandevuOlayi(JSONObject durum, long t) {
        long en = -1;
        if (!randevuAcik(durum)) return en;
        JSONArray r = durum.optJSONArray("randevular");
        if (r == null) return en;
        for (int i = 0; i < r.length(); i++) {
            JSONObject x = r.optJSONObject(i);
            if (x == null || x.optBoolean("tamam")) continue;
            for (long once : RANDEVU_ONCE) {
                long z = x.optLong("zaman") - once;
                if (z > t && (en < 0 || z < en)) en = z;
            }
        }
        return en;
    }

    public static JSONObject hastaById(JSONObject durum, String id) {
        JSONObject sahte = new JSONObject();
        try { sahte.put("hasta", id); } catch (Exception ignored) {}
        return hasta(durum, sahte);
    }

    // ---- Hastalar (www/model.js → hastaBul / hastaAdi ile aynı) ----
    public static boolean cokHasta(JSONObject durum) {
        JSONArray h = durum.optJSONArray("hastalar");
        return h != null && h.length() > 1;
    }

    public static JSONObject hasta(JSONObject durum, JSONObject ilac) {
        JSONArray h = durum.optJSONArray("hastalar");
        if (h == null || h.length() == 0) return new JSONObject();
        String id = ilac == null ? "" : ilac.optString("hasta");
        for (int i = 0; i < h.length(); i++) {
            JSONObject x = h.optJSONObject(i);
            if (x != null && id.equals(x.optString("id"))) return x;
        }
        return h.optJSONObject(0);
    }

    public static String hastaAdi(JSONObject durum, JSONObject ilac) {
        JSONObject x = hasta(durum, ilac);
        String ad = x.optString("ad", "").trim();
        if (!ad.isEmpty()) return ad;
        JSONArray h = durum.optJSONArray("hastalar");
        if (h != null) for (int i = 0; i < h.length(); i++) if (h.optJSONObject(i) == x) return "Hasta " + (i + 1);
        return "Hasta";
    }

    // Sessiz saat aralığında mı? (23:00–07:00 gibi gece yarısını aşan aralıklar dahil)
    public static boolean sessizde(JSONObject ayar, long ms) {
        if (ayar == null || !ayar.optBoolean("sessiz", false)) return false;
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(ms);
        int dk = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
        int bas = dakika(ayar.optString("sessizBas", "23:00")), bit = dakika(ayar.optString("sessizBit", "07:00"));
        if (bas == bit) return false;
        return bas < bit ? (dk >= bas && dk < bit) : (dk >= bas || dk < bit);
    }

    private static int dakika(String s) {
        try {
            String[] p = s.split(":");
            return Integer.parseInt(p[0]) * 60 + Integer.parseInt(p[1]);
        } catch (Exception e) {
            return 0;
        }
    }
}
