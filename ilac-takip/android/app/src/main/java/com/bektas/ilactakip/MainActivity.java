package com.bektas.ilactakip;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.PowerManager;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

// Uygulama ekranı (assets/index.html) internetsiz açılır; alarm, bildirim ve dosya işleri bu köprüden yapılır.
public class MainActivity extends Activity {
    private WebView web;
    private WebView yaziciWeb; // yazdırma bitene kadar elde tutulmalı
    private String kaydedilecek;
    private Sesli deneSes;
    private static final int SES_SEC = 41, YEDEK_KAYDET = 42, YEDEK_AC = 43, IZIN = 44, FOTO = 45;
    private final Runnable degisti = () -> olay("degisti", null);

    class Kopru {
        @JavascriptInterface
        public String durumOku() {
            return Durum.oku(MainActivity.this).toString();
        }

        @JavascriptInterface
        public boolean durumYaz(String json) {
            try {
                Durum.ekrandanYaz(MainActivity.this, json);
                Zamanlayici.kur(MainActivity.this);
                Yedek.degisti(MainActivity.this);
                Widget.guncelle(MainActivity.this);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void dozIsle(String k, String durum, int dk) {
            Islem.isle(MainActivity.this, Collections.singletonList(k), durum, dk);
        }

        @JavascriptInterface
        public void alarmDene() {
            try {
                JSONObject o = new JSONObject();
                o.put("deneme|" + System.currentTimeMillis() + "|" + new java.text.SimpleDateFormat("HH:mm", java.util.Locale.ROOT).format(new java.util.Date()), 99);
                CalmaServisi.cal(MainActivity.this, o);
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public long sonrakiAlarm() {
            return Durum.kurulanAlarm(MainActivity.this);
        }

        @JavascriptInterface
        public void sesSec(String mevcut) {
            runOnUiThread(() -> {
                Intent i = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER);
                i.putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM | RingtoneManager.TYPE_RINGTONE);
                i.putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Alarm sesi");
                i.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false);
                i.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true);
                i.putExtra(RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM));
                if (mevcut != null && !mevcut.isEmpty()) i.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Uri.parse(mevcut));
                try { startActivityForResult(i, SES_SEC); } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public String izinler() {
            Context c = MainActivity.this;
            JSONObject o = new JSONObject();
            try {
                o.put("bildirim", Bildirim.bildirimIzni(c) && (Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED));
                o.put("kesinAlarm", Zamanlayici.kesinAlarmIzni(c));
                o.put("tamEkran", Bildirim.tamEkranIzni(c));
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                o.put("pil", pm.isIgnoringBatteryOptimizations(getPackageName()));
                o.put("android", Build.VERSION.SDK_INT);
                o.put("uretici", Build.MANUFACTURER);
            } catch (Exception ignored) {
            }
            return o.toString();
        }

        @JavascriptInterface
        public void izinAc(String tur) {
            runOnUiThread(() -> izinAcUi(tur));
        }

        @JavascriptInterface
        public void paylas(String metin) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, metin);
                startActivity(Intent.createChooser(i, "Paylaş"));
            });
        }

        @JavascriptInterface
        public void yazdir(String html, String baslik) {
            runOnUiThread(() -> yazdirUi(html, baslik));
        }

        @JavascriptInterface
        public void yedekKaydet(String json, String ad) {
            runOnUiThread(() -> {
                kaydedilecek = json;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("application/json").putExtra(Intent.EXTRA_TITLE, ad);
                try { startActivityForResult(i, YEDEK_KAYDET); } catch (Exception e) { olay("yedekKaydedildi", "false"); }
            });
        }

        @JavascriptInterface
        public void yedekAc() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                try { startActivityForResult(i, YEDEK_AC); } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public void ara(String tel) {
            runOnUiThread(() -> {
                try { startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + tel.replaceAll("[^0-9+]", "")))); } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public boolean parmakVar() {
            if (Build.VERSION.SDK_INT < 29) return false;
            android.hardware.biometrics.BiometricManager bm = getSystemService(android.hardware.biometrics.BiometricManager.class);
            return bm != null && bm.canAuthenticate() == android.hardware.biometrics.BiometricManager.BIOMETRIC_SUCCESS;
        }

        @JavascriptInterface
        public void parmakIzi() {
            runOnUiThread(MainActivity.this::parmakUi);
        }

        @JavascriptInterface
        public void fotoSec() {
            runOnUiThread(() -> {
                // Galeri ya da kamera (kamera küçük bir önizleme döndürür; 320 piksel için yeterli, izin istemez)
                Intent i = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
                Intent secici = Intent.createChooser(i, "Fotoğraf çek ya da seç");
                Intent kamera = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
                if (kamera.resolveActivity(getPackageManager()) != null) secici.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{kamera});
                try { startActivityForResult(secici, FOTO); } catch (Exception e) { olay("foto", "null"); }
            });
        }

        // Ekran koyu/açık temaya geçince durum çubuğu da uysun
        @JavascriptInterface
        public void temaRengi(boolean koyu, String zemin) {
            runOnUiThread(() -> {
                cubukRengi(koyu);
                // Seçili hastanın uçuk rengi durum çubuğuna da geçsin
                if (!koyu && zemin != null && zemin.matches("#[0-9a-fA-F]{6}")) {
                    getWindow().setStatusBarColor(Color.parseColor(zemin));
                    if (web != null) web.setBackgroundColor(Color.parseColor(zemin));
                }
            });
        }

        @JavascriptInterface
        public void whatsapp(String no, String metin) {
            runOnUiThread(() -> Haber.ac(MainActivity.this, no, metin));
        }

        // [[no, metin, ad], ...] → otomatik açıksa hepsi kendiliğinden gider
        @JavascriptInterface
        public void whatsappListe(String json) {
            runOnUiThread(() -> {
                try {
                    org.json.JSONArray a = new org.json.JSONArray(json);
                    java.util.List<String[]> l = new java.util.ArrayList<>();
                    for (int i = 0; i < a.length(); i++) {
                        org.json.JSONArray x = a.getJSONArray(i);
                        l.add(new String[]{x.optString(0), x.optString(1), x.optString(2)});
                    }
                    Haber.dagit(MainActivity.this, l, true);
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public boolean otoGonderAcik() {
            return Haber.otoAcik(MainActivity.this);
        }

        // Ayarlardaki "Sesli okumayı dene": ilk ilacın metnini okur
        @JavascriptInterface
        public void sesliDene(String metin) {
            runOnUiThread(() -> {
                if (deneSes == null) deneSes = new Sesli(MainActivity.this, null, null);
                deneSes.soyle(metin);
            });
        }

        @JavascriptInterface
        public String sonYedek() {
            return Yedek.sonYedek(MainActivity.this);
        }

        @JavascriptInterface
        public boolean yedekSimdi() {
            boolean ok = Yedek.dosyayaYaz(MainActivity.this);
            Yedek.degisti(MainActivity.this);
            return ok;
        }

        @JavascriptInterface
        public String surum() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
        }
    }

    private void parmakUi() {
        if (Build.VERSION.SDK_INT < 29) { olay("parmak", "false"); return; }
        parmakSor();
    }

    @android.annotation.TargetApi(29)
    private void parmakSor() {
        android.hardware.biometrics.BiometricPrompt bp = new android.hardware.biometrics.BiometricPrompt.Builder(this)
                .setTitle("İlaç Takip")
                .setSubtitle("Kilidi parmak izi ile açın")
                .setNegativeButton("PIN gir", getMainExecutor(), (d, w) -> olay("parmak", "false"))
                .build();
        bp.authenticate(new CancellationSignal(), getMainExecutor(), new android.hardware.biometrics.BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(android.hardware.biometrics.BiometricPrompt.AuthenticationResult r) { olay("parmak", "true"); }

            @Override
            public void onAuthenticationError(int code, CharSequence s) { olay("parmak", "false"); }
        });
    }

    private void izinAcUi(String tur) {
        Intent i = null;
        String p = getPackageName();
        switch (tur) {
            case "bildirim":
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                        && shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, IZIN);
                    return;
                }
                if (Build.VERSION.SDK_INT >= 26) i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, p);
                break;
            case "kesinAlarm":
                if (Build.VERSION.SDK_INT >= 31) i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + p));
                break;
            case "tamEkran":
                if (Build.VERSION.SDK_INT >= 34) i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + p));
                break;
            case "yedek":
                // Telefonun Google yedekleme ekranı (üreticiye göre farklı; açılmazsa genel ayarlar)
                for (Intent y : new Intent[]{
                        new Intent("android.settings.BACKUP_AND_RESET_SETTINGS"),
                        new Intent().setClassName("com.google.android.gms", "com.google.android.gms.backup.component.BackupSettingsActivity"),
                        new Intent(Settings.ACTION_PRIVACY_SETTINGS),
                        new Intent(Settings.ACTION_SETTINGS)}) {
                    try { startActivity(y); return; } catch (Exception ignored) {}
                }
                return;
            case "erisilebilirlik":
                i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                break;
            case "pil":
                i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + p));
                break;
            case "kanal":
                if (Build.VERSION.SDK_INT >= 26) i = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, p).putExtra(Settings.EXTRA_CHANNEL_ID, Bildirim.K_ALARM);
                break;
            default:
                break;
        }
        if (i == null) i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + p));
        try {
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            try { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + p))); } catch (Exception ignored) {}
        }
    }

    private void yazdirUi(String html, String baslik) {
        final String is = baslik.replaceAll("[\\\\/:*?\"<>|]", "-");
        final WebView pw = new WebView(this);
        pw.setWebViewClient(new WebViewClient() {
            private boolean basladi;

            @Override
            public void onPageFinished(WebView view, String url) {
                if (basladi) return;
                basladi = true;
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                PrintAttributes a = new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build();
                pm.print(is, view.createPrintDocumentAdapter(is), a);
            }
        });
        yaziciWeb = pw;
        pw.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    // Ekrana olay gönderir: window.yerelOlay(tur, veri)
    void olay(String tur, String jsonVeri) {
        if (web == null) return;
        String js = "window.yerelOlay&&window.yerelOlay(" + JSONObject.quote(tur) + "," + (jsonVeri == null ? "null" : jsonVeri) + ")";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    @Override
    protected void onActivityResult(int kod, int sonuc, Intent veri) {
        super.onActivityResult(kod, sonuc, veri);
        if (kod == SES_SEC && sonuc == RESULT_OK && veri != null) {
            Uri u = veri.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
            JSONObject o = new JSONObject();
            try {
                String ad = "Varsayılan alarm sesi";
                if (u != null && !RingtoneManager.isDefault(u)) {
                    Ringtone r = RingtoneManager.getRingtone(this, u);
                    if (r != null) ad = r.getTitle(this);
                }
                o.put("uri", u == null || RingtoneManager.isDefault(u) ? "" : u.toString());
                o.put("ad", ad);
            } catch (Exception ignored) {
            }
            olay("ses", o.toString());
        } else if (kod == YEDEK_KAYDET) {
            boolean ok = false;
            if (sonuc == RESULT_OK && veri != null && veri.getData() != null && kaydedilecek != null) {
                try (OutputStream out = getContentResolver().openOutputStream(veri.getData(), "wt")) {
                    out.write(kaydedilecek.getBytes(StandardCharsets.UTF_8));
                    ok = true;
                } catch (Exception ignored) {
                }
            }
            kaydedilecek = null;
            if (sonuc == RESULT_OK) olay("yedekKaydedildi", ok ? "true" : "false");
        } else if (kod == FOTO) {
            if (sonuc == RESULT_OK && veri != null && veri.getData() != null) fotoIsle(veri.getData());
            else if (sonuc == RESULT_OK && veri != null && veri.getExtras() != null && veri.getExtras().get("data") instanceof android.graphics.Bitmap) {
                try { kareGonder((android.graphics.Bitmap) veri.getExtras().get("data")); } catch (Exception e) { olay("foto", "null"); }
            }
        } else if (kod == YEDEK_AC && sonuc == RESULT_OK && veri != null && veri.getData() != null) {
            try (InputStream in = getContentResolver().openInputStream(veri.getData())) {
                ByteArrayOutputStream b = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0 && b.size() < 20_000_000) b.write(buf, 0, n);
                olay("yedekAcildi", JSONObject.quote(new String(b.toByteArray(), StandardCharsets.UTF_8)));
            } catch (Exception e) {
                olay("yedekAcildi", "null");
            }
        }
    }

    private void cubukRengi(boolean koyu) {
        getWindow().setStatusBarColor(Color.parseColor(koyu ? "#121916" : "#F6F1E7"));
        getWindow().setNavigationBarColor(Color.parseColor(koyu ? "#1A2420" : "#FCFAF5"));
        int bayrak = koyu ? 0 : (android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                | (Build.VERSION.SDK_INT >= 26 ? android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0));
        getWindow().getDecorView().setSystemUiVisibility(bayrak);
        if (web != null) web.setBackgroundColor(Color.parseColor(koyu ? "#121916" : "#F6F1E7"));
    }

    // Seçilen fotoğrafı 256 px kare JPEG'e çevirip ekrana verir
    private void fotoIsle(Uri u) {
        try {
            android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            try (InputStream in = getContentResolver().openInputStream(u)) { android.graphics.BitmapFactory.decodeStream(in, null, o); }
            int ornek = 1;
            while (Math.min(o.outWidth, o.outHeight) / (ornek * 2) >= 320) ornek *= 2;
            android.graphics.BitmapFactory.Options o2 = new android.graphics.BitmapFactory.Options();
            o2.inSampleSize = ornek;
            android.graphics.Bitmap b;
            try (InputStream in = getContentResolver().openInputStream(u)) { b = android.graphics.BitmapFactory.decodeStream(in, null, o2); }
            if (b == null) { olay("foto", "null"); return; }
            // Telefonla çekilen fotoğrafın yönünü düzelt
            if (Build.VERSION.SDK_INT >= 24) {
                try (InputStream in = getContentResolver().openInputStream(u)) {
                    int yon = new android.media.ExifInterface(in).getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, 1);
                    int aci = yon == 6 ? 90 : yon == 3 ? 180 : yon == 8 ? 270 : 0;
                    if (aci != 0) {
                        android.graphics.Matrix mt = new android.graphics.Matrix();
                        mt.postRotate(aci);
                        b = android.graphics.Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), mt, true);
                    }
                } catch (Exception ignored) {}
            }
            kareGonder(b);
        } catch (Exception e) {
            olay("foto", "null");
        }
    }

    // Ortadan kare kırpar, 320 px JPEG olarak ekrana gönderir
    private void kareGonder(android.graphics.Bitmap b) {
        int k = Math.min(b.getWidth(), b.getHeight());
        android.graphics.Bitmap kare = android.graphics.Bitmap.createBitmap(b, (b.getWidth() - k) / 2, (b.getHeight() - k) / 2, k, k);
        android.graphics.Bitmap son = android.graphics.Bitmap.createScaledBitmap(kare, 320, 320, true);
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        son.compress(android.graphics.Bitmap.CompressFormat.JPEG, 78, out);
        String veri = "data:image/jpeg;base64," + android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP);
        olay("foto", JSONObject.quote(veri));
    }

    @Override
    public void onRequestPermissionsResult(int kod, String[] izin, int[] sonuc) {
        olay("izinDegisti", null);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Bildirim.kanallar(this);
        Zamanlayici.kur(this);
        getWindow().setStatusBarColor(Color.parseColor("#F6F1E7"));
        getWindow().setNavigationBarColor(Color.parseColor("#FCFAF5"));
        getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                | (Build.VERSION.SDK_INT >= 26 ? android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#F6F1E7"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        web.addJavascriptInterface(new Kopru(), "IlacAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("file".equals(u.getScheme())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, IZIN);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        Islem.dinle(degisti);
        Zamanlayici.kur(this);
        Yedek.degisti(this);
        olay("degisti", null);
        olay("izinDegisti", null);
    }

    @Override
    protected void onDestroy() {
        if (deneSes != null) deneSes.kapat();
        super.onDestroy();
    }

    @Override
    protected void onPause() {
        Islem.birak(degisti);
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.geriTusu?window.geriTusu():false", r -> {
            if (!"true".equals(r)) finish();
        });
    }
}
