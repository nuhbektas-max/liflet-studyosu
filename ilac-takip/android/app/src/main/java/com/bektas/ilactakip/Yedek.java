package com.bektas.ilactakip;

import android.app.backup.BackupManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

// Otomatik yedek:
// 1) Android'in Google yedeği (manifestteki kurallar) durum.json'u günde bir kez Google hesabına (Drive) gönderir.
// 2) Ayrıca her gün telefonun İndirilenler > İlaç Takip klasörüne okunabilir bir yedek dosyası yazılır.
public final class Yedek {
    private Yedek() {}

    static final String DOSYA_ADI = "ilac-takip-yedek.json";

    private static SharedPreferences p(Context c) {
        return c.getSharedPreferences("yedek", Context.MODE_PRIVATE);
    }

    public static String sonYedek(Context c) {
        return p(c).getString("son", "");
    }

    // Veri değişince çağrılır: Google yedeğine haber verir, günde bir kez dosyaya yazar.
    public static void degisti(Context c) {
        try { new BackupManager(c).dataChanged(); } catch (Exception ignored) {}
        String bugun = Takvim.tarihStr(System.currentTimeMillis());
        if (bugun.equals(p(c).getString("son", ""))) return;
        if (dosyayaYaz(c)) p(c).edit().putString("son", bugun).apply();
    }

    // İndirilenler/İlaç Takip/ilac-takip-yedek.json (Android 10 ve sonrası, izin gerekmez)
    public static boolean dosyayaYaz(Context c) {
        if (Build.VERSION.SDK_INT < 29) return false;
        byte[] veri = Durum.oku(c).toString().getBytes(StandardCharsets.UTF_8);
        ContentResolver cr = c.getContentResolver();
        String eski = p(c).getString("uri", "");
        if (!eski.isEmpty()) {
            try (OutputStream o = cr.openOutputStream(Uri.parse(eski), "wt")) {
                if (o != null) { o.write(veri); return true; }
            } catch (Exception ignored) {
                // dosya silinmiş ya da artık bizim değil: yenisini oluştur
            }
        }
        try {
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, DOSYA_ADI);
            v.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/İlaç Takip");
            Uri u = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (u == null) return false;
            try (OutputStream o = cr.openOutputStream(u, "wt")) {
                if (o == null) return false;
                o.write(veri);
            }
            p(c).edit().putString("uri", u.toString()).apply();
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
