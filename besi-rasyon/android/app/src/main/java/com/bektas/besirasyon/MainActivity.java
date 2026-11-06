package com.bektas.besirasyon;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import androidx.core.content.FileProvider;
import java.io.File;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// Uygulama, telefona gömülü ekranı (assets/index.html) internetsiz açar.
public class MainActivity extends Activity {
    private WebView web;
    private WebView printWeb;  // yazdırma bitene kadar elde tutulmalı
    private ValueCallback<Uri[]> dosyaGeri;  // fotoğraf seçimi bekleyen sayfa
    private Uri kameraUri;                   // kameranın fotoğrafı yazacağı dosya
    private static final int FOTO_ISTEK = 7;

    // Ekrandaki paylaşım ve "PDF olarak kaydet / yazdır" düğmeleri bunları çağırır.
    class ShareBridge {
        @JavascriptInterface
        public void shareWhatsApp(final String text) {
            runOnUiThread(() -> {
                Intent i = textIntent(text);
                i.setPackage("com.whatsapp");
                try {
                    startActivity(i);
                } catch (ActivityNotFoundException e) {
                    // WhatsApp yoksa (veya yalnızca WhatsApp Business varsa) paylaşım menüsünü aç.
                    openChooser(text);
                }
            });
        }

        @JavascriptInterface
        public void share(final String text) {
            runOnUiThread(() -> openChooser(text));
        }

        // Yedek gibi büyük metinleri dosya olarak paylaşır (metin olarak paylaşım ~1 MB'ta Android sınırına takılır).
        @JavascriptInterface
        public void shareFile(final String content, final String name, final String mime) {
            runOnUiThread(() -> shareAsFile(content, name, mime));
        }

        // Raporu Android'in yazdırma ekranında açar; oradan "PDF olarak kaydet" seçilebilir.
        @JavascriptInterface
        public void print(final String html, final String title) {
            runOnUiThread(() -> printHtml(html, title));
        }
    }

    private void printHtml(String html, String title) {
        final String job = title.replaceAll("[\\\\/:*?\"<>|]", "-");
        final WebView pw = new WebView(this);
        pw.setWebViewClient(new WebViewClient() {
            private boolean started;

            @Override
            public void onPageFinished(WebView view, String url) {
                if (started) return;
                started = true;
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                PrintAttributes attrs = new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                        .build();
                pm.print(job, view.createPrintDocumentAdapter(job), attrs);
            }
        });
        printWeb = pw;
        pw.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    private Intent textIntent(String text) {
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, text);
        return i;
    }

    private void shareAsFile(String content, String name, String mime) {
        try {
            File klasor = new File(getCacheDir(), "yedek");
            klasor.mkdirs();
            File f = new File(klasor, name.replaceAll("[\\\\/:*?\"<>|]", "-"));
            java.io.FileOutputStream o = new java.io.FileOutputStream(f);
            try {
                o.write(content.getBytes("UTF-8"));
            } finally {
                o.close();
            }
            Uri u = FileProvider.getUriForFile(this, getPackageName() + ".dosya", f);
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType(mime);
            i.putExtra(Intent.EXTRA_STREAM, u);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(i, "Yedeği kaydet / gönder"));
        } catch (Exception e) {
            android.widget.Toast.makeText(this, "Yedek dosyası oluşturulamadı", android.widget.Toast.LENGTH_LONG).show();
        }
    }

    private void openChooser(String text) {
        startActivity(Intent.createChooser(textIntent(text), "Rasyonu paylaş"));
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // fiyatlar, seçimler ve kayıtlı rasyonlar telefonda saklansın
        // Telefonun yazı büyütmesi sayfayı şişirmesin; yazı boyutu uygulamanın Ayarlar sayfasından seçilir.
        s.setTextZoom(100);
        web.addJavascriptInterface(new ShareBridge(), "BesiAndroid");
        // Hayvan fotoğrafı: <input type="file"> kamera ya da galeri ile doldurulur.
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> geri, FileChooserParams p) {
                if (dosyaGeri != null) dosyaGeri.onReceiveValue(null);
                dosyaGeri = geri;
                // Fotoğraf istenmiyorsa (ör. yedek dosyası) kamera yerine dosya seçici açılır.
                boolean resim = false;
                for (String t : p.getAcceptTypes()) if (t != null && t.contains("image")) resim = true;
                Intent kamera = null;
                if (resim) try {
                    File klasor = new File(getCacheDir(), "foto");
                    klasor.mkdirs();
                    File f = new File(klasor, "hayvan-" + System.currentTimeMillis() + ".jpg");
                    kameraUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".dosya", f);
                    kamera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    kamera.putExtra(MediaStore.EXTRA_OUTPUT, kameraUri);
                    kamera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Exception e) {
                    kamera = null;
                }
                Intent galeri = new Intent(Intent.ACTION_GET_CONTENT);
                galeri.addCategory(Intent.CATEGORY_OPENABLE);
                galeri.setType(resim ? "image/*" : "*/*");
                Intent secim = Intent.createChooser(galeri, resim ? "Hayvan fotoğrafı" : "Dosya seçin");
                if (kamera != null) secim.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { kamera });
                try {
                    startActivityForResult(secim, FOTO_ISTEK);
                } catch (ActivityNotFoundException e) {
                    dosyaGeri = null;
                    return false;
                }
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            // WhatsApp, e-posta ve diğer dış bağlantılar ilgili uygulamada açılır; uygulama ekranı değişmez.
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file://")) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (ActivityNotFoundException e) {
                    // Bağlantıyı açacak uygulama yok.
                }
                return true;
            }
        });
        setContentView(web);
        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl("file:///android_asset/index.html");
        }
    }

    @Override
    protected void onActivityResult(int istek, int sonuc, Intent veri) {
        super.onActivityResult(istek, sonuc, veri);
        if (istek != FOTO_ISTEK || dosyaGeri == null) return;
        Uri[] secilen = null;
        if (sonuc == RESULT_OK) {
            // Galeriden seçildiyse veri adresi gelir; kamerayla çekildiyse fotoğraf kameraUri'dedir.
            Uri u = veri != null && veri.getData() != null ? veri.getData() : kameraUri;
            if (u != null) secilen = new Uri[] { u };
        }
        dosyaGeri.onReceiveValue(secilen);
        dosyaGeri = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
