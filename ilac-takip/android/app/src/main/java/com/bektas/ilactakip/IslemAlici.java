package com.bektas.ilactakip;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

// Bildirimdeki "Aldım / Ertele / Atla" düğmeleri
public class IslemAlici extends BroadcastReceiver {
    static final String ALDIM = "com.bektas.ilactakip.ALDIM";
    static final String ERTELE = "com.bektas.ilactakip.ERTELE";
    static final String ATLA = "com.bektas.ilactakip.ATLA";

    @Override
    public void onReceive(Context c, Intent i) {
        String s = i.getStringExtra("anahtarlar");
        if (s == null || s.isEmpty()) return;
        List<String> l = new ArrayList<>(Arrays.asList(s.split("\n")));
        String a = i.getAction();
        if (ALDIM.equals(a)) {
            Islem.isle(c, l, "alindi", 0);
            Haber.bildirimle(c, Durum.oku(c), l);
        }
        else if (ATLA.equals(a)) Islem.isle(c, l, "atlandi", 0);
        else if (ERTELE.equals(a)) Islem.isle(c, l, "ertelendi", Math.max(1, i.getIntExtra("dk", 10)));
    }
}
