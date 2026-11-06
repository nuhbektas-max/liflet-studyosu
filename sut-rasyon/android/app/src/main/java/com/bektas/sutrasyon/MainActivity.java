package com.bektas.sutrasyon;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
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

    // Ekrandaki "Rasyonu kopyala" ve "Yazdır / PDF" düğmeleri bunları çağırır.
    class Kopru {
        @JavascriptInterface
        public void copy(final String text) {
            runOnUiThread(() -> {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("Rasyon", text));
            });
        }

        // PDF raporu (base64): cihaza yazılır ve paylaşım menüsü açılır (WhatsApp, e-posta, Drive...).
        @JavascriptInterface
        public void sharePdf(final String b64, final String name) {
            runOnUiThread(() -> {
                try {
                    File klasor = new File(getCacheDir(), "pdf");
                    klasor.mkdirs();
                    String ad = name.replaceAll("[\\\\/:*?\"<>|]", "-");
                    File f = new File(klasor, ad.endsWith(".pdf") ? ad : ad + ".pdf");
                    FileOutputStream o = new FileOutputStream(f);
                    o.write(Base64.decode(b64, Base64.DEFAULT));
                    o.close();
                    Uri u = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".dosya", f);
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("application/pdf");
                    i.putExtra(Intent.EXTRA_STREAM, u);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(i, "Rasyon PDF'ini paylaş"));
                } catch (Exception e) {
                    // PDF yazılamadı ya da paylaşım uygulaması yok.
                }
            });
        }

        // WhatsApp: metni WhatsApp'ta açar, yoksa paylaşım menüsünü gösterir.
        @JavascriptInterface
        public void shareWhatsApp(final String text) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                i.setPackage("com.whatsapp");
                try {
                    startActivity(i);
                } catch (ActivityNotFoundException e) {
                    i.setPackage(null);
                    startActivity(Intent.createChooser(i, "Rasyonu paylaş"));
                }
            });
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // fiyatlar ve girdiler telefonda saklansın
        s.setTextZoom(100);             // telefonun yazı büyütmesi tabloyu bozmasın
        web.addJavascriptInterface(new Kopru(), "SutAndroid");
        web.setWebViewClient(new WebViewClient() {
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
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
