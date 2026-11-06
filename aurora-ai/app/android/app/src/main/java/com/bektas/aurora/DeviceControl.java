package com.bektas.aurora;

import android.app.Activity;
import android.app.ActivityManager;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;
import android.provider.Settings;
import android.util.DisplayMetrics;

import org.json.JSONArray;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/**
 * Claude'un araçlarının Android tarafı. Her işlem gerçekten yapılır ve sonucu (gerçek durum
 * yeniden okunarak) döner. Wi-Fi ve Bluetooth Android 10+ sürümlerde uygulamalarca açılıp
 * kapatılamaz; ayar paneli açılır, kullanıcı dönünce durum okunur.
 */
public class DeviceControl {

    private final Activity activity;
    private final AuroraBridge bridge;
    private final CameraManager cameras;
    private String torchId;
    private volatile Boolean torchOn = null;
    private volatile boolean torchAvailable = false;
    private CameraManager.TorchCallback torchCallback;

    public DeviceControl(Activity activity, AuroraBridge bridge) {
        this.activity = activity;
        this.bridge = bridge;
        this.cameras = (CameraManager) activity.getSystemService(Context.CAMERA_SERVICE);
        findTorch();
    }

    private void findTorch() {
        if (cameras == null) return;
        try {
            String fallback = null;
            for (String id : cameras.getCameraIdList()) {
                CameraCharacteristics c = cameras.getCameraCharacteristics(id);
                Boolean flash = c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (flash == null || !flash) continue;
                Integer facing = c.get(CameraCharacteristics.LENS_FACING);
                if (facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                    torchId = id;
                    break;
                }
                if (fallback == null) fallback = id;
            }
            if (torchId == null) torchId = fallback;
        } catch (Exception ignored) {
            torchId = null;
        }
        if (torchId == null) return;
        torchCallback = new CameraManager.TorchCallback() {
            @Override
            public void onTorchModeChanged(String cameraId, boolean enabled) {
                if (cameraId.equals(torchId)) {
                    torchOn = enabled;
                    torchAvailable = true;
                }
            }

            @Override
            public void onTorchModeUnavailable(String cameraId) {
                if (cameraId.equals(torchId)) torchAvailable = false;
            }
        };
        cameras.registerTorchCallback(torchCallback, new Handler(Looper.getMainLooper()));
    }

    void onPause() {
        // Uygulama arka plana geçince fener açık kalabilir (kullanıcı istedi); bir şey yapılmaz.
    }

    void destroy() {
        if (cameras != null && torchCallback != null) cameras.unregisterTorchCallback(torchCallback);
    }

    JSONObject handle(String name, JSONObject args) throws Exception {
        switch (name) {
            case "torch": return torch(args.optString("state", "toggle"));
            case "volume": return volume(args.optString("stream"), args.optString("action"), args.isNull("level") ? -1 : args.optInt("level", -1));
            case "openPanel": return openPanel(args.optString("kind"));
            case "wifiState": return wifiState();
            case "bluetoothState": return bluetoothState();
            case "openSettings": return openSettings(args.optString("section", "main"));
            case "deviceInfo": return deviceInfo();
            case "battery": return battery();
            case "network": return network();
            default: return error("Bilinmeyen işlem: " + name);
        }
    }

    private static JSONObject error(String message) throws Exception {
        return new JSONObject().put("ok", false).put("error", message);
    }

    // ---------------- Fener ----------------

    private JSONObject torch(String state) throws Exception {
        if (cameras == null || torchId == null) return error("Bu telefonda fener (flaş) yok.");
        boolean current = torchOn != null && torchOn;
        boolean target = "on".equals(state) || (!"off".equals(state) && !current);
        try {
            cameras.setTorchMode(torchId, target);
        } catch (CameraAccessException e) {
            return error("Kamera şu an başka bir uygulama tarafından kullanılıyor; fener değiştirilemedi.");
        } catch (IllegalArgumentException e) {
            return error("Fener bulunamadı.");
        }
        // Gerçek durumu sistemden gelen bildirimle doğrula (en çok 1,5 sn bekle).
        long until = System.currentTimeMillis() + 1500;
        while (System.currentTimeMillis() < until && (torchOn == null || torchOn != target)) {
            Thread.sleep(50);
        }
        boolean verified = torchOn != null && torchOn == target;
        return new JSONObject().put("ok", verified).put("on", torchOn != null && torchOn).put("verified", verified)
                .put("error", verified ? JSONObject.NULL : "Fener isteğe yanıt vermedi.");
    }

    // ---------------- Ses ----------------

    private JSONObject volume(String stream, String action, int level) throws Exception {
        AudioManager am = (AudioManager) activity.getSystemService(Context.AUDIO_SERVICE);
        int type;
        String label;
        switch (stream) {
            case "ring": type = AudioManager.STREAM_RING; label = "zil"; break;
            case "alarm": type = AudioManager.STREAM_ALARM; label = "alarm"; break;
            default: type = AudioManager.STREAM_MUSIC; label = "medya"; break;
        }
        int max = am.getStreamMaxVolume(type);
        int min = am.getStreamMinVolume(type);
        int before = am.getStreamVolume(type);
        int step = Math.max(1, Math.round(max * 0.15f));
        int target;
        switch (action) {
            case "set": target = Math.round(Math.max(0, Math.min(100, level)) / 100f * max); break;
            case "up": target = before + step; break;
            case "down": target = before - step; break;
            case "mute": target = 0; break;
            case "max": target = max; break;
            default: return error("Geçersiz işlem: " + action);
        }
        target = Math.max(min, Math.min(max, target));
        try {
            am.setStreamVolume(type, target, AudioManager.FLAG_SHOW_UI);
        } catch (SecurityException e) {
            return error("Rahatsız Etmeyin modu açık olduğu için " + label + " sesi değiştirilemedi.");
        }
        int after = am.getStreamVolume(type);
        JSONObject r = new JSONObject()
                .put("ok", true)
                .put("stream", stream)
                .put("percent", Math.round(after * 100f / max))
                .put("previous_percent", Math.round(before * 100f / max))
                .put("level", after).put("max", max);
        if (after != target) r.put("note", "Sistem istenen seviyeyi tam uygulamadı (en düşük " + Math.round(min * 100f / max) + "%).");
        return r;
    }

    // ---------------- Wi-Fi / Bluetooth / Ayarlar ----------------

    private JSONObject openPanel(String kind) throws Exception {
        Intent intent;
        if ("wifi".equals(kind)) intent = new Intent(Settings.Panel.ACTION_WIFI);
        else if ("bluetooth".equals(kind)) intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
        else return error("Bilinmeyen panel: " + kind);
        return start(intent);
    }

    private JSONObject openSettings(String section) throws Exception {
        Intent intent;
        switch (section) {
            case "app":
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", activity.getPackageName(), null));
                break;
            case "location": intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS); break;
            case "display": intent = new Intent(Settings.ACTION_DISPLAY_SETTINGS); break;
            case "sound": intent = new Intent(Settings.ACTION_SOUND_SETTINGS); break;
            case "battery": intent = new Intent(Intent.ACTION_POWER_USAGE_SUMMARY); break;
            case "internet": intent = new Intent(Settings.Panel.ACTION_INTERNET_CONNECTIVITY); break;
            default: intent = new Intent(Settings.ACTION_SETTINGS); break;
        }
        JSONObject r = start(intent);
        if (r.optBoolean("ok")) r.put("section", section);
        return r;
    }

    private JSONObject start(Intent intent) throws Exception {
        final boolean[] ok = {false};
        final String[] err = {null};
        final CountDownLatch done = new CountDownLatch(1);
        bridge.expectReturn();
        bridge.runOnUi(() -> {
            try {
                activity.startActivity(intent);
                ok[0] = true;
            } catch (ActivityNotFoundException e) {
                err[0] = "Bu ayar ekranı bu telefonda yok.";
            } catch (Exception e) {
                err[0] = String.valueOf(e.getMessage());
            }
            done.countDown();
        });
        done.await(2, TimeUnit.SECONDS);
        return ok[0] ? new JSONObject().put("ok", true).put("opened", true) : error(err[0] == null ? "Ayar ekranı açılamadı." : err[0]);
    }

    private JSONObject wifiState() throws Exception {
        WifiManager wm = (WifiManager) activity.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        boolean enabled = wm != null && wm.isWifiEnabled();
        return new JSONObject().put("ok", true).put("wifi_enabled", enabled).put("wifi_connected", hasTransport(NetworkCapabilities.TRANSPORT_WIFI));
    }

    private JSONObject bluetoothState() throws Exception {
        BluetoothManager bm = (BluetoothManager) activity.getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = bm == null ? null : bm.getAdapter();
        if (adapter == null) return error("Bu telefonda Bluetooth yok.");
        try {
            return new JSONObject().put("ok", true).put("bluetooth_enabled", adapter.isEnabled());
        } catch (SecurityException e) {
            return new JSONObject().put("ok", true).put("bluetooth_enabled", JSONObject.NULL)
                    .put("note", "Durumu okumak için 'Yakındaki cihazlar' izni gerekiyor; ayarlar sayfasından izin verilebilir.");
        }
    }

    // ---------------- Bilgi ----------------

    private JSONObject deviceInfo() throws Exception {
        ActivityManager am = (ActivityManager) activity.getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
        am.getMemoryInfo(mi);
        StatFs fs = new StatFs(activity.getFilesDir().getAbsolutePath());
        DisplayMetrics dm = activity.getResources().getDisplayMetrics();
        JSONArray abis = new JSONArray();
        for (String a : Build.SUPPORTED_ABIS) abis.put(a);
        return new JSONObject()
                .put("ok", true)
                .put("manufacturer", Build.MANUFACTURER)
                .put("model", Build.MODEL)
                .put("android_version", Build.VERSION.RELEASE)
                .put("sdk", Build.VERSION.SDK_INT)
                .put("abis", abis)
                .put("ram_total_gb", round1(mi.totalMem / 1073741824.0))
                .put("ram_free_gb", round1(mi.availMem / 1073741824.0))
                .put("storage_total_gb", round1(fs.getTotalBytes() / 1073741824.0))
                .put("storage_free_gb", round1(fs.getAvailableBytes() / 1073741824.0))
                .put("screen", dm.widthPixels + "x" + dm.heightPixels);
    }

    private JSONObject battery() throws Exception {
        BatteryManager bm = (BatteryManager) activity.getSystemService(Context.BATTERY_SERVICE);
        int percent = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
        Intent sticky = activity.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        int plugged = sticky == null ? 0 : sticky.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
        int temp = sticky == null ? Integer.MIN_VALUE : sticky.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
        String source = plugged == BatteryManager.BATTERY_PLUGGED_AC ? "priz" : plugged == BatteryManager.BATTERY_PLUGGED_USB ? "USB"
                : plugged == BatteryManager.BATTERY_PLUGGED_WIRELESS ? "kablosuz" : "takılı değil";
        JSONObject r = new JSONObject().put("ok", true).put("percent", percent).put("charging", bm.isCharging()).put("charger", source);
        if (temp != Integer.MIN_VALUE) r.put("temperature_c", temp / 10.0);
        return r;
    }

    private JSONObject network() throws Exception {
        boolean wifi = hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
        boolean cell = hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR);
        boolean eth = hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET);
        ConnectivityManager cm = (ConnectivityManager) activity.getSystemService(Context.CONNECTIVITY_SERVICE);
        Network n = cm.getActiveNetwork();
        NetworkCapabilities caps = n == null ? null : cm.getNetworkCapabilities(n);
        boolean online = caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        String type = wifi ? "Wi-Fi" : cell ? "mobil veri" : eth ? "kablolu" : "yok";
        return new JSONObject().put("ok", true).put("online", online).put("type", type);
    }

    private boolean hasTransport(int transport) {
        ConnectivityManager cm = (ConnectivityManager) activity.getSystemService(Context.CONNECTIVITY_SERVICE);
        Network n = cm.getActiveNetwork();
        NetworkCapabilities caps = n == null ? null : cm.getNetworkCapabilities(n);
        return caps != null && caps.hasTransport(transport);
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }
}
