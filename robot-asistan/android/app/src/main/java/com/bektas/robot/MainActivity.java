package com.bektas.robot;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Locale;

// Robot asistanın ekranı (assets/index.html) bir WebView'de çalışır.
// Bu sınıf telefonun ses tanıma, konuşma, internet isteği ve donanım işlerini ekrana köprüler.
public class MainActivity extends Activity {
    private static final int IZIN_MIKROFON = 11;

    private WebView web;
    private SharedPreferences prefs;
    private SpeechRecognizer rec;
    private TextToSpeech tts;
    private boolean ttsHazir = false;
    private int konusmaNo = 0;
    private String bekleyenDil = "tr-TR";

    // ---- Sayfaya geri çağrı ----
    private void js(final String kod) {
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null) web.evaluateJavascript(kod, null);
            }
        });
    }

    private static String q(String s) {
        return JSONObject.quote(s == null ? "" : s);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(0xFF3A1B8F);
        getWindow().setNavigationBarColor(0xFF08308F);
        prefs = getSharedPreferences("robot", MODE_PRIVATE);

        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            public void onInit(int status) {
                ttsHazir = status == TextToSpeech.SUCCESS;
                if (ttsHazir) {
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        public void onStart(String id) { js("window.onTtsStart&&onTtsStart()"); }
                        public void onDone(String id) { js("window.onTtsDone&&onTtsDone()"); }
                        public void onError(String id) { js("window.onTtsError&&onTtsError('hata')"); }
                        public void onRangeStart(String id, int start, int end, int frame) {
                            js("window.onTtsRange&&onTtsRange(" + start + "," + end + ")");
                        }
                    });
                }
            }
        });

        web = new WebView(this);
        web.setBackgroundColor(0xFF1C2A9C);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        web.addJavascriptInterface(new Kopru(), "RobotAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !url.startsWith("file://");
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (tts != null) tts.stop();
        if (rec != null) rec.cancel();
        js("window.onAppPause&&onAppPause()");
    }

    @Override
    protected void onDestroy() {
        if (rec != null) rec.destroy();
        if (tts != null) { tts.stop(); tts.shutdown(); }
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code == IZIN_MIKROFON) {
            if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) dinlemeyiBaslat(bekleyenDil);
            else js("onStt('error','izin')");
        }
    }

    // ---- Ses tanıma ----
    private void dinlemeyiBaslat(final String dil) {
        runOnUiThread(new Runnable() {
            public void run() {
                if (!SpeechRecognizer.isRecognitionAvailable(MainActivity.this)) {
                    js("onStt('error','servis')");
                    return;
                }
                if (rec != null) rec.destroy();
                rec = SpeechRecognizer.createSpeechRecognizer(MainActivity.this);
                rec.setRecognitionListener(new RecognitionListener() {
                    public void onReadyForSpeech(android.os.Bundle b) { js("onStt('begin','')"); }
                    public void onBeginningOfSpeech() {}
                    public void onRmsChanged(float v) {}
                    public void onBufferReceived(byte[] b) {}
                    public void onEndOfSpeech() {}
                    public void onEvent(int t, android.os.Bundle b) {}
                    public void onError(int e) { js("onStt('error','" + e + "')"); }
                    public void onResults(android.os.Bundle b) {
                        ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        js("onStt('result'," + q(r != null && !r.isEmpty() ? r.get(0) : "") + ")");
                    }
                    public void onPartialResults(android.os.Bundle b) {
                        ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (r != null && !r.isEmpty()) js("onStt('partial'," + q(r.get(0)) + ")");
                    }
                });
                Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, dil);
                i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                rec.startListening(i);
            }
        });
    }

    // ---- Sayfanın çağırdığı köprü ----
    class Kopru {
        @JavascriptInterface
        public String getPref(String k) { return prefs.getString(k, ""); }

        @JavascriptInterface
        public void setPref(String k, String v) { prefs.edit().putString(k, v).apply(); }

        @JavascriptInterface
        public void startListening(String dil) {
            bekleyenDil = dil;
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(new Runnable() {
                    public void run() { requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, IZIN_MIKROFON); }
                });
                return;
            }
            dinlemeyiBaslat(dil);
        }

        @JavascriptInterface
        public void stopListening() {
            runOnUiThread(new Runnable() {
                public void run() { if (rec != null) rec.cancel(); }
            });
        }

        @JavascriptInterface
        public void speak(final String text, final String dil, final float hiz, final float perde) {
            runOnUiThread(new Runnable() {
                public void run() {
                    if (!ttsHazir) { js("onTtsError('hazir degil')"); return; }
                    tts.setLanguage(Locale.forLanguageTag(dil));
                    tts.setSpeechRate(hiz);
                    tts.setPitch(perde);
                    String t = text.length() > 3900 ? text.substring(0, 3900) : text;
                    tts.speak(t, TextToSpeech.QUEUE_FLUSH, null, "u" + (++konusmaNo));
                }
            });
        }

        @JavascriptInterface
        public void stopSpeaking() {
            runOnUiThread(new Runnable() {
                public void run() { if (tts != null) tts.stop(); }
            });
        }

        // Yapay zekâ isteği burada yapılır (tarayıcı CORS kısıtına takılmamak için).
        @JavascriptInterface
        public void post(final String id, final String adres, final String basliklar, final String govde) {
            new Thread(new Runnable() {
                public void run() {
                    int kod = 0;
                    String govdeYanit;
                    try {
                        HttpURLConnection c = (HttpURLConnection) new URL(adres).openConnection();
                        c.setRequestMethod("POST");
                        c.setConnectTimeout(15000);
                        c.setReadTimeout(60000);
                        c.setDoOutput(true);
                        c.setRequestProperty("content-type", "application/json");
                        JSONObject h = new JSONObject(basliklar);
                        java.util.Iterator<String> it = h.keys();
                        while (it.hasNext()) { String k = it.next(); c.setRequestProperty(k, h.getString(k)); }
                        OutputStream os = c.getOutputStream();
                        os.write(govde.getBytes("UTF-8"));
                        os.close();
                        kod = c.getResponseCode();
                        InputStream in = kod >= 400 ? c.getErrorStream() : c.getInputStream();
                        ByteArrayOutputStream bo = new ByteArrayOutputStream();
                        if (in != null) {
                            byte[] buf = new byte[8192];
                            int n;
                            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                        }
                        govdeYanit = bo.toString("UTF-8");
                    } catch (Exception e) {
                        kod = 0;
                        govdeYanit = e.getClass().getSimpleName() + ": " + e.getMessage();
                    }
                    js("onHttp(" + q(id) + "," + kod + "," + q(govdeYanit) + ")");
                }
            }).start();
        }

        // ---- Donanım ----
        @JavascriptInterface
        public String torch(boolean ac) {
            try {
                CameraManager cm = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
                for (String id : cm.getCameraIdList()) {
                    CameraCharacteristics c = cm.getCameraCharacteristics(id);
                    Boolean flas = c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                    Integer yon = c.get(CameraCharacteristics.LENS_FACING);
                    if (flas != null && flas && yon != null && yon == CameraCharacteristics.LENS_FACING_BACK) {
                        cm.setTorchMode(id, ac);
                        return "ok";
                    }
                }
                return "Flaşı olan arka kamera bulunamadı.";
            } catch (Exception e) {
                return "Flaş hatası: " + e.getMessage();
            }
        }

        private String ekranAc(final Intent i) {
            try {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
                return "ok";
            } catch (Exception e) {
                return "Ekran açılamadı: " + e.getMessage();
            }
        }

        @JavascriptInterface
        public String openWifiPanel() { return ekranAc(new Intent(Settings.Panel.ACTION_WIFI)); }

        @JavascriptInterface
        public String openBluetooth() { return ekranAc(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS)); }

        @JavascriptInterface
        public boolean isWifiEnabled() {
            WifiManager w = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            return w != null && w.isWifiEnabled();
        }

        @JavascriptInterface
        public int getVolume() {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            return max == 0 ? 0 : Math.round(100f * am.getStreamVolume(AudioManager.STREAM_MUSIC) / max);
        }

        @JavascriptInterface
        public int setVolume(int yuzde) {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int v = Math.round(max * Math.max(0, Math.min(100, yuzde)) / 100f);
            am.setStreamVolume(AudioManager.STREAM_MUSIC, v, AudioManager.FLAG_SHOW_UI);
            return getVolume();
        }
    }
}
