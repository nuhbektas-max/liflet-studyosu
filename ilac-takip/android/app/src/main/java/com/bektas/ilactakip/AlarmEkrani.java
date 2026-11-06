package com.bektas.ilactakip;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

// Kilit ekranının üstünde açılan büyük alarm ekranı. Yazılar kısaltılmaz, satıra sığmazsa alt satıra geçer.
public class AlarmEkrani extends Activity {
    private LinearLayout liste;
    private Button aldimTum;
    private JSONObject durum = new JSONObject();
    private TextView saat, baslik;
    private final Runnable yenile = this::doldur;

    private int ZEMIN = Color.parseColor("#1B4741");
    private int KART = Color.parseColor("#245A52");

    // Ayarlar > Renk seçimine göre [zemin, kart]
    static int[] renkler(String r) {
        switch (r == null ? "" : r) {
        case "kirmizi": return new int[]{Color.parseColor("#A50D14"), Color.parseColor("#C8121C")};
        case "yesil": return new int[]{Color.parseColor("#1B4741"), Color.parseColor("#285F57")};
        case "lacivert": return new int[]{Color.parseColor("#1C3557"), Color.parseColor("#2C4F7C")};
        case "mavi": return new int[]{Color.parseColor("#185A73"), Color.parseColor("#2A7D9C")};
        case "mor": return new int[]{Color.parseColor("#45317A"), Color.parseColor("#6A51A6")};
        case "bordo": return new int[]{Color.parseColor("#5E1D2A"), Color.parseColor("#8C3344")};
        case "toprak": return new int[]{Color.parseColor("#7A3A13"), Color.parseColor("#A85A28")};
        default: return new int[]{Color.parseColor("#1B4741"), Color.parseColor("#285F57")};
        }
    }
    private static final int YAZI = Color.WHITE;
    private static final int SOLUK = Color.parseColor("#CFE0D9");
    private static final int YESIL = Color.parseColor("#16A34A");
    private static final int GRI = Color.parseColor("#2E6A61");

    @SuppressWarnings("deprecation")
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        int[] rk = renkler(Durum.ayar(Durum.oku(this)).optString("renk", "kirmizi"));
        ZEMIN = rk[0];
        KART = rk[1];
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(ZEMIN);
        getWindow().setNavigationBarColor(ZEMIN);

        ScrollView sv = new ScrollView(this);
        sv.setFillViewport(true);
        sv.setBackgroundColor(ZEMIN);
        LinearLayout kok = new LinearLayout(this);
        kok.setOrientation(LinearLayout.VERTICAL);
        kok.setPadding(dp(20), dp(28), dp(20), dp(24));
        sv.addView(kok, new ViewGroup.LayoutParams(-1, -2));

        baslik = yazi("İlaç saati", 18, SOLUK, false);
        baslik.setGravity(Gravity.CENTER);
        kok.addView(baslik, tam());
        saat = yazi("", 64, YAZI, true);
        saat.setGravity(Gravity.CENTER);
        kok.addView(saat, tam());

        liste = new LinearLayout(this);
        liste.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams lp = tam();
        lp.topMargin = dp(16);
        kok.addView(liste, lp);

        View bosluk = new View(this);
        kok.addView(bosluk, new LinearLayout.LayoutParams(-1, 0, 1f));

        Button aldim = dugme("✓ Aldım", Color.parseColor("#F6F1E7"), ZEMIN, 22);
        aldimTum = aldim;
        aldim.setOnClickListener(v -> isle("alindi", 0));
        LinearLayout.LayoutParams al = new LinearLayout.LayoutParams(-1, -2);
        aldim.setMinHeight(dp(72));
        al.topMargin = dp(20);
        kok.addView(aldim, al);

        TextView ert = yazi("Ertele", 15, SOLUK, false);
        LinearLayout.LayoutParams el = tam();
        el.topMargin = dp(18);
        el.bottomMargin = dp(6);
        kok.addView(ert, el);
        LinearLayout satir = new LinearLayout(this);
        satir.setOrientation(LinearLayout.HORIZONTAL);
        for (int dk : new int[]{5, 10, 15, 30}) {
            Button e = dugme(dk + " dk", GRI, YAZI, 17);
            e.setOnClickListener(v -> isle("ertelendi", dk));
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, -2, 1f);
            e.setMinHeight(dp(56));
            p.setMarginEnd(dk == 30 ? 0 : dp(8));
            satir.addView(e, p);
        }
        kok.addView(satir, tam());

        Button atla = dugme("Bu dozu atla", Color.TRANSPARENT, Color.parseColor("#FCA5A5"), 17);
        GradientDrawable kenar = new GradientDrawable();
        kenar.setCornerRadius(dp(14));
        kenar.setStroke(dp(1), Color.parseColor("#7F1D1D"));
        atla.setBackground(kenar);
        atla.setOnClickListener(v -> isle("atlandi", 0));
        LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(-1, -2);
        atla.setMinHeight(dp(56));
        ap.topMargin = dp(12);
        kok.addView(atla, ap);

        setContentView(sv);
        doldur();
    }

    @Override
    protected void onResume() {
        super.onResume();
        Islem.dinle(yenile);
        doldur();
    }

    @Override
    protected void onPause() {
        Islem.birak(yenile);
        super.onPause();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        doldur();
    }

    private void doldur() {
        List<String> keys = Durum.anahtarlar(Durum.caliyor(this));
        if (keys.isEmpty()) { finish(); return; }
        Calendar c = Calendar.getInstance();
        saat.setText(String.format(Locale.ROOT, "%02d:%02d", c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE)));
        liste.removeAllViews();
        JSONObject d = Durum.oku(this);
        durum = d;
        // Çalan dozlar kaç ayrı hastanın?
        java.util.LinkedHashSet<String> hastalar = new java.util.LinkedHashSet<>();
        for (String k : keys) {
            JSONObject m = k.startsWith("deneme|") ? null : Takvim.ilacBul(d, k.split("\\|")[0]);
            if (m != null) hastalar.add(Takvim.hastaAdi(d, m));
        }
        boolean cok = Takvim.cokHasta(d);
        if (cok && hastalar.size() == 1) baslik.setText(hastalar.iterator().next() + " için ilaç saati");
        else if (hastalar.size() > 1) baslik.setText(hastalar.size() + " hastanın ilaç saati geldi");
        else baslik.setText(keys.size() > 1 ? keys.size() + " ilacın saati geldi" : "İlaç saati geldi");
        // Farklı hastaların ilaçları aynı anda çalıyorsa tek "Aldım" ile hepsi işaretlenmesin
        aldimTum.setVisibility(hastalar.size() > 1 ? View.GONE : View.VISIBLE);
        for (String k : keys) {
            JSONObject m = k.startsWith("deneme|") ? null : Takvim.ilacBul(d, k.split("\\|")[0]);
            liste.addView(kart(k, m, keys.size() > 1, cok));
        }
    }

    private View kart(String k, JSONObject m, boolean tekTekDugme, boolean cokHasta) {
        LinearLayout kart = new LinearLayout(this);
        kart.setOrientation(LinearLayout.VERTICAL);
        kart.setPadding(dp(16), dp(14), dp(16), dp(14));
        GradientDrawable z = new GradientDrawable();
        z.setColor(KART);
        z.setCornerRadius(dp(16));
        int renk = YESIL;
        String hastaAd = null;
        try {
            if (m != null && cokHasta) { renk = Color.parseColor(Takvim.hasta(durum, m).optString("renk", "#22574F")); hastaAd = Takvim.hastaAdi(durum, m); }
            else if (m != null) renk = Color.parseColor(m.optString("renk", "#16A34A"));
        } catch (Exception ignored) {}
        z.setStroke(dp(cokHasta ? 4 : 2), renk);
        kart.setBackground(z);
        if (hastaAd != null) {
            // Hastanın fotoğrafı varsa büyük ve yuvarlak
            String foto = Takvim.hasta(durum, m).optString("foto", "");
            if (foto.startsWith("data:image/")) {
                try {
                    byte[] bayt = android.util.Base64.decode(foto.substring(foto.indexOf(',') + 1), android.util.Base64.DEFAULT);
                    android.graphics.Bitmap bm = android.graphics.BitmapFactory.decodeByteArray(bayt, 0, bayt.length);
                    fotoEkle(kart, bm, renk, dp(96));
                } catch (Exception ignored) {}
            }
            // Hastanın adı, kendi renginde büyük bir şerit
            TextView h = yazi(hastaAd.toUpperCase(new Locale("tr")), 20, Color.WHITE, true);
            GradientDrawable hz = new GradientDrawable();
            hz.setColor(renk);
            hz.setCornerRadius(dp(10));
            h.setBackground(hz);
            h.setPadding(dp(12), dp(6), dp(12), dp(6));
            LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(-2, -2);
            hp.bottomMargin = dp(8);
            kart.addView(h, hp);
        }

        // İlaç kutusunun fotoğrafı: okumadan tanınsın diye büyük
        String kutu = m == null ? "" : m.optString("foto", "");
        if (kutu.startsWith("data:image/")) {
            try {
                byte[] bayt = android.util.Base64.decode(kutu.substring(kutu.indexOf(',') + 1), android.util.Base64.DEFAULT);
                android.graphics.Bitmap bm = android.graphics.BitmapFactory.decodeByteArray(bayt, 0, bayt.length);
                if (bm != null) {
                    android.widget.ImageView iv = new android.widget.ImageView(this);
                    iv.setImageBitmap(bm);
                    iv.setScaleType(android.widget.ImageView.ScaleType.CENTER_CROP);
                    iv.setClipToOutline(true);
                    GradientDrawable kz = new GradientDrawable();
                    kz.setCornerRadius(dp(14));
                    kz.setColor(Color.WHITE);
                    iv.setBackground(kz);
                    LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(-1, dp(170));
                    ip.bottomMargin = dp(10);
                    kart.addView(iv, ip);
                }
            } catch (Exception ignored) {}
        }

        String ad = m == null ? "Deneme alarmı" : m.optString("ad");
        String[] pk = k.split("\\|");
        String doz = m == null ? "Ses ve titreşim çalışıyor"
                : (pk.length > 2 ? Takvim.dozYazi(m, pk[2]) : "") + (m.optString("doz").trim().isEmpty() ? "" : " · " + m.optString("doz").trim());
        String plan = k.split("\\|").length > 2 ? "Planlanan saat " + k.split("\\|")[2] : "";
        kart.addView(yazi(ad, 24, YAZI, true), tam());
        if (!doz.isEmpty()) kart.addView(yazi(doz, 21, Color.parseColor("#FFF3CF"), true), tam());
        if (m != null && !m.optString("talimat").isEmpty()) {
            TextView t = yazi(m.optString("talimat"), 17, Color.parseColor("#FDE68A"), false);
            LinearLayout.LayoutParams p = tam();
            p.topMargin = dp(4);
            kart.addView(t, p);
        }
        if (!plan.isEmpty() && m != null) kart.addView(yazi(plan, 14, SOLUK, false), tam());

        if (tekTekDugme && m != null) {
            LinearLayout s = new LinearLayout(this);
            s.setOrientation(LinearLayout.HORIZONTAL);
            Button al = dugme(hastaAd != null ? hastaAd.split(" ")[0] + " aldı" : "Bunu aldım", hastaAd != null ? renk : YESIL, YAZI, 15);
            al.setOnClickListener(v -> {
                Islem.isle(this, Collections.singletonList(k), "alindi", 0);
                Haber.ekrandan(this, Durum.oku(this), Collections.singletonList(k));
            });
            Button at = dugme("Bunu atla", GRI, YAZI, 15);
            at.setOnClickListener(v -> Islem.isle(this, Collections.singletonList(k), "atlandi", 0));
            LinearLayout.LayoutParams p1 = new LinearLayout.LayoutParams(0, -2, 1f);
            p1.setMarginEnd(dp(8));
            s.addView(al, p1);
            s.addView(at, new LinearLayout.LayoutParams(0, -2, 1f));
            LinearLayout.LayoutParams sp = tam();
            sp.topMargin = dp(10);
            kart.addView(s, sp);
        }
        LinearLayout.LayoutParams lp = tam();
        lp.bottomMargin = dp(10);
        kart.setLayoutParams(lp);
        return kart;
    }

    private void isle(String durum, int dk) {
        List<String> keys = new ArrayList<>(Durum.anahtarlar(Durum.caliyor(this)));
        Islem.isle(this, keys, durum, dk);
        if ("alindi".equals(durum) && !Haber.mesajlar(Durum.oku(this), keys).isEmpty()) {
            // Ebeveyne WhatsApp mesajı hazır açılır (kilitliyse önce kilit açılır)
            Haber.ekrandan(this, Durum.oku(this), keys);
            finish();
            return;
        }
        if ("alindi".equals(durum)) {
            // Telefon kilitliyse kilidi açmadan kapan; açıksa uygulamaya geç
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null && !km.isKeyguardLocked()) {
                startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
            }
        }
        finish();
    }

    @Override
    public void onBackPressed() {
        // Geri tuşu alarmı susturmaz; bilinçli bir seçim yapılmalı.
    }

    // Yuvarlak, hasta renginde halkalı fotoğraf
    private void fotoEkle(LinearLayout kart, android.graphics.Bitmap bm, int renk, int boy) {
        if (bm == null) return;
        android.graphics.Bitmap yuv = android.graphics.Bitmap.createBitmap(boy, boy, android.graphics.Bitmap.Config.ARGB_8888);
        android.graphics.Canvas cv = new android.graphics.Canvas(yuv);
        android.graphics.Paint p = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        android.graphics.Bitmap olcek = android.graphics.Bitmap.createScaledBitmap(bm, boy, boy, true);
        p.setShader(new android.graphics.BitmapShader(olcek, android.graphics.Shader.TileMode.CLAMP, android.graphics.Shader.TileMode.CLAMP));
        float r = boy / 2f, halka = dp(4);
        cv.drawCircle(r, r, r - halka, p);
        android.graphics.Paint h = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        h.setStyle(android.graphics.Paint.Style.STROKE);
        h.setStrokeWidth(halka);
        h.setColor(renk);
        cv.drawCircle(r, r, r - halka / 2, h);
        android.widget.ImageView iv = new android.widget.ImageView(this);
        iv.setImageBitmap(yuv);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(boy, boy);
        lp.bottomMargin = dp(10);
        kart.addView(iv, lp);
    }

    private TextView yazi(String s, int sp, int renk, boolean kalin) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(renk);
        t.setSingleLine(false);
        t.setEllipsize(null);
        if (kalin) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private Button dugme(String s, int zemin, int yazi, int sp) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        b.setTextColor(yazi);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setSingleLine(false);
        b.setMinHeight(dp(52));
        b.setMinimumHeight(dp(52));
        b.setPadding(dp(8), dp(6), dp(8), dp(6));
        GradientDrawable g = new GradientDrawable();
        g.setColor(zemin);
        g.setCornerRadius(dp(14));
        b.setBackground(g);
        b.setStateListAnimator(null);
        return b;
    }

    private LinearLayout.LayoutParams tam() {
        return new LinearLayout.LayoutParams(-1, -2);
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }
}
