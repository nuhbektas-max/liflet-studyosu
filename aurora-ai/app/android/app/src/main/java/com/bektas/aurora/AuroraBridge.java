package com.bektas.aurora;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

/**
 * Sayfaya "AuroraAndroid" adıyla verilen köprü. Yöntemler JavaBridge iş parçacığında çağrılır;
 * arayüz işleri (ses tanıma, ayar ekranı açma) ana iş parçacığına aktarılır.
 * Java'dan sayfaya olaylar window.AuroraNative.emit(tür, veri) ile gider.
 */
public class AuroraBridge {

    private static final int REQ_MIC = 41;
    private static final int REQ_BT = 42;

    private final Activity activity;
    private final WebView web;
    private final SpeechController speech;
    private final DeviceControl device;
    private final SecretStore secrets;
    private volatile boolean awaitingReturn = false;
    private volatile boolean paused = false;

    public AuroraBridge(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        this.speech = new SpeechController(activity, this);
        this.device = new DeviceControl(activity, this);
        this.secrets = new SecretStore(activity);
    }

    /** Sayfaya olay gönderir. */
    void emit(String type, JSONObject data) {
        final String js = "window.AuroraNative&&window.AuroraNative.emit(" + JSONObject.quote(type) + "," + data.toString() + ")";
        web.post(() -> web.evaluateJavascript(js, null));
    }

    void runOnUi(Runnable r) {
        activity.runOnUiThread(r);
    }

    void expectReturn() {
        awaitingReturn = true;
    }

    // ---------------- Yaşam döngüsü ----------------

    void onResume() {
        boolean wasPaused = paused;
        paused = false;
        if (awaitingReturn && wasPaused) {
            awaitingReturn = false;
            emit("returned", new JSONObject());
        }
    }

    void onPause() {
        paused = true;
        speech.cancelListening();   // arka planda dinleme yok
        device.onPause();
    }

    void destroy() {
        speech.destroy();
        device.destroy();
    }

    void onPermissionResult(int requestCode, int[] grantResults) {
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        String name = requestCode == REQ_MIC ? "microphone" : requestCode == REQ_BT ? "bluetooth" : "unknown";
        try {
            emit("permission", new JSONObject().put("name", name).put("granted", granted));
        } catch (Exception ignored) {
        }
    }

    // ---------------- İzinler ----------------

    private static String permissionFor(String name) {
        if ("microphone".equals(name)) return Manifest.permission.RECORD_AUDIO;
        if ("bluetooth".equals(name)) {
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? Manifest.permission.BLUETOOTH_CONNECT : null;
        }
        return null;
    }

    @JavascriptInterface
    public boolean hasPermission(String name) {
        String p = permissionFor(name);
        return p == null || activity.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED;
    }

    @JavascriptInterface
    public void requestPermission(String name) {
        String p = permissionFor(name);
        if (p == null || hasPermission(name)) {
            try {
                emit("permission", new JSONObject().put("name", name).put("granted", true));
            } catch (Exception ignored) {
            }
            return;
        }
        final int code = "microphone".equals(name) ? REQ_MIC : REQ_BT;
        runOnUi(() -> activity.requestPermissions(new String[]{p}, code));
    }

    // ---------------- Ses ----------------

    @JavascriptInterface
    public void startListening(String language) {
        runOnUi(() -> speech.startListening(language));
    }

    @JavascriptInterface
    public void stopListening() {
        runOnUi(speech::stopListening);
    }

    @JavascriptInterface
    public void cancelListening() {
        runOnUi(speech::cancelListening);
    }

    @JavascriptInterface
    public void speak(String text, double rate, double pitch, String id) {
        speech.speak(text, (float) rate, (float) pitch, id);
    }

    @JavascriptInterface
    public void stopSpeaking() {
        speech.stopSpeaking();
    }

    // ---------------- Donanım ----------------

    /** name: torch, volume, openPanel, wifiState, bluetoothState, openSettings, deviceInfo, battery, network */
    @JavascriptInterface
    public String device(String name, String argsJson) {
        try {
            JSONObject args = argsJson == null || argsJson.isEmpty() ? new JSONObject() : new JSONObject(argsJson);
            return device.handle(name, args).toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}";
        }
    }

    // ---------------- Şifreli anahtar deposu ----------------

    @JavascriptInterface
    public String secretLoad(String key) {
        return secrets.load(key);
    }

    @JavascriptInterface
    public boolean secretSave(String key, String value) {
        return secrets.save(key, value);
    }
}
