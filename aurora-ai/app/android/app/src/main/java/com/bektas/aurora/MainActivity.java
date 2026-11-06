package com.bektas.aurora;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/**
 * AURORA ana ekranı. Yüz, arayüz ve Claude bağlantısı assets içindeki web dosyalarıdır
 * (aurora-ai/app/www); WebViewAssetLoader ile https://appassets.androidplatform.net
 * adresinden sunulur. Telefon donanımı, ses tanıma ve metin okuma AuroraBridge üzerinden
 * "AuroraAndroid" adıyla sayfaya verilir.
 */
public class MainActivity extends Activity {

    private WebView web;
    private AuroraBridge bridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(0x16, 0x0B, 0x4A));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);

        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);
        ws.setTextZoom(100);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
        });

        bridge = new AuroraBridge(this, web);
        web.addJavascriptInterface(bridge, "AuroraAndroid");
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        if (bridge != null) bridge.onResume();
    }

    @Override
    protected void onPause() {
        if (bridge != null) bridge.onPause();
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (bridge != null) bridge.destroy();
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (bridge != null) bridge.onPermissionResult(requestCode, grantResults);
    }
}
