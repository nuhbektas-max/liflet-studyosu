package com.bektas.ilactakip;

import android.accessibilityservice.AccessibilityService;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.List;

// WhatsApp otomatik gönderme: kullanıcı Erişilebilirlik ayarından bir kez izin verir.
// Yalnızca İlaç Takip'in açtığı mesaj beklerken (Haber kuyruğu, 90 saniye) ve yalnızca WhatsApp'ta
// "Gönder" düğmesine basar; başka hiçbir ekranı okumaz.
public class OtoGonder extends AccessibilityService {
    private final Handler h = new Handler(Looper.getMainLooper());
    private long sonTik;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        if (e == null || e.getPackageName() == null) return;
        String paket = e.getPackageName().toString();
        if (!paket.startsWith("com.whatsapp")) return;
        if (!Haber.bekleyenVar(this)) return;
        if (System.currentTimeMillis() - sonTik < 2500) return; // aynı mesaja iki kez basma
        AccessibilityNodeInfo kok = getRootInActiveWindow();
        if (kok == null) return;
        AccessibilityNodeInfo dugme = bul(kok, paket);
        if (dugme == null) return;
        if (dugme.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
            sonTik = System.currentTimeMillis();
            Haber.gonderildi(this);
            // Mesaj gidince WhatsApp'tan çık; kuyrukta başka hasta varsa onun mesajını aç
            h.postDelayed(() -> {
                performGlobalAction(GLOBAL_ACTION_BACK);
                h.postDelayed(() -> Haber.siradakiniAc(this), 900);
            }, 1200);
        }
    }

    private AccessibilityNodeInfo bul(AccessibilityNodeInfo kok, String paket) {
        for (String id : new String[]{paket + ":id/send", "com.whatsapp:id/send", "com.whatsapp.w4b:id/send"}) {
            List<AccessibilityNodeInfo> l = kok.findAccessibilityNodeInfosByViewId(id);
            if (l != null) for (AccessibilityNodeInfo n : l) {
                AccessibilityNodeInfo t = tiklanir(n);
                if (t != null) return t;
            }
        }
        for (String ad : new String[]{"Gönder", "Send"}) {
            List<AccessibilityNodeInfo> l = kok.findAccessibilityNodeInfosByText(ad);
            if (l != null) for (AccessibilityNodeInfo n : l) {
                CharSequence cd = n.getContentDescription();
                if (cd != null && cd.toString().equalsIgnoreCase(ad)) {
                    AccessibilityNodeInfo t = tiklanir(n);
                    if (t != null) return t;
                }
            }
        }
        return null;
    }

    private static AccessibilityNodeInfo tiklanir(AccessibilityNodeInfo n) {
        for (int i = 0; n != null && i < 4; i++, n = n.getParent()) {
            if (n.isClickable() && n.isEnabled()) return n;
        }
        return null;
    }

    @Override
    public void onInterrupt() {}
}
