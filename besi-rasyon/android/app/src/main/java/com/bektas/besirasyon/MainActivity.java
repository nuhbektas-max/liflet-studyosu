package com.bektas.besirasyon;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
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
        web.addJavascriptInterface(new ShareBridge(), "BesiAndroid");
        web.setWebViewClient(new WebViewClient());
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
