// İlaç Takip simge takımı: aynı çizgi kalınlığında, yuvarlak uçlu, telefondan telefona değişmeyen simgeler.
(function (root) {
  'use strict';
  const P = {
    tablet: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/>',
    kapsul: '<g transform="rotate(-40 12 12)"><rect x="3" y="8.2" width="18" height="7.6" rx="3.8"/><path d="M12 8.2v7.6"/></g>',
    igne: '<g transform="rotate(45 12 12)"><rect x="9" y="6" width="6" height="10" rx="1"/><path d="M12 16v5.5M10 2.5h4M12 2.5V6M9 9.5h2.2M9 12.5h2.2"/></g>',
    insulin: '<g transform="rotate(45 12 12)"><rect x="9.5" y="2.5" width="5" height="14" rx="2"/><path d="M12 16.5V21M9.5 6.5h5M11 10h2"/></g>',
    surup: '<path d="M9 3h6M10 3v3L7.5 9v10a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2V9L14 6V3"/><path d="M7.5 13h9"/>',
    damla: '<path d="M12 3.5c3 4 6 7.3 6 10.5a6 6 0 0 1-12 0c0-3.2 3-6.5 6-10.5Z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
    krem: '<path d="M9 3h6l-.8 2H9.8Z"/><path d="M9.5 5h5l2 14a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2Z"/><path d="M8.3 15h7.4"/>',
    sprey: '<rect x="7.5" y="9" width="8" height="12" rx="2"/><path d="M9.5 9V6h4v3M13.5 6H17M19.5 4.5v.01M19.5 7.5v.01M21 6v.01"/>',
    bant: '<g transform="rotate(-40 12 12)"><rect x="2.5" y="8" width="19" height="8" rx="4"/><path d="M9 8v8M15 8v8"/></g><path d="M11.3 11.3h.01M12.7 12.7h.01"/>',
    diger: '<path d="M12 5v14M5 12h14"/>',
    ekle: '<path d="M12 5v14M5 12h14"/>',
    ilaclar: '<g transform="rotate(-40 12 12)"><rect x="3" y="8.2" width="18" height="7.6" rx="3.8"/><path d="M12 8.2v7.6"/></g>',
    takvim: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M12 14h2M16 14h.01M8 17h2M12 17h2"/>',
    rapor: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4M8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
    acil: '<path d="M2.5 16.5V9a2 2 0 0 1 2-2h9.5v9.5M14 10h4l3.5 3.5v3H14"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/><path d="M8.3 9.5v4.2M6.2 11.6h4.2"/>',
    telefon: '<path d="M5 3.5h3.5l1.6 4.2-2.1 1.3a10.5 10.5 0 0 0 7 7l1.3-2.1 4.2 1.6V19a1.5 1.5 0 0 1-1.5 1.5C10.6 20.5 3.5 13.4 3.5 5A1.5 1.5 0 0 1 5 3.5Z"/>',
    doktor: '<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M10 12v2.5a5 5 0 0 0 10 0V13"/><circle cx="20" cy="11" r="2"/>',
    ayarlar: '<path d="M4 7h9M17 7h3M4 17h4M12 17h8"/><circle cx="15" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    kutu: '<path d="M3.5 8 12 4l8.5 4v8L12 20l-8.5-4Z"/><path d="M3.5 8 12 12l8.5-4M12 12v8"/>',
    uyari: '<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4.5M12 17v.01"/>',
    randevu: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/>',
    kisi: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>',
    kamera: '<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.3" r="3.5"/>',
    gunes: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    ogle: '<circle cx="12" cy="13" r="4.5"/><path d="M12 3v2.5M4.5 13H2.5M21.5 13h-2M6 7l1.5 1.5M18 7l-1.5 1.5M3 20h18"/>',
    aksam: '<path d="M3 18h18M6 14.5a6 6 0 0 1 12 0M12 4.5V7M4.2 8.7l1.6 1.6M19.8 8.7l-1.6 1.6M3 21.5h18"/>',
    gece: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>',
    tamam: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  };

  // Satır içi simge (yazının rengini alır)
  function ikon(ad, sinif) {
    return '<svg class="ik ' + (sinif || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[ad] || P.diger) + '</svg>';
  }

  // Boş ekran çizimleri: zemin, kart, vurgu ve altın renklerini kullanır
  const CIZIM = {
    ilac: '<svg class="cizim" viewBox="0 0 160 110" aria-hidden="true">' +
      '<ellipse cx="80" cy="100" rx="58" ry="6" fill="var(--kum)"/>' +
      '<rect x="44" y="30" width="44" height="64" rx="10" fill="var(--kart)" stroke="var(--cizgi-koyu)" stroke-width="2"/>' +
      '<rect x="40" y="18" width="52" height="16" rx="5" fill="var(--vurgu)"/>' +
      '<rect x="52" y="50" width="28" height="22" rx="4" fill="var(--vurgu-acik)"/>' +
      '<path d="M66 55v12M60 61h12" stroke="var(--vurgu)" stroke-width="3" stroke-linecap="round"/>' +
      '<g transform="rotate(-35 116 72)"><rect x="98" y="64" width="38" height="16" rx="8" fill="var(--altin)"/><rect x="117" y="64" width="19" height="16" rx="8" fill="var(--kart)" stroke="var(--altin)" stroke-width="2"/></g>' +
      '<circle cx="120" cy="30" r="4" fill="var(--altin)" opacity=".5"/><circle cx="30" cy="48" r="3" fill="var(--vurgu)" opacity=".35"/></svg>',
    randevu: '<svg class="cizim" viewBox="0 0 160 110" aria-hidden="true">' +
      '<ellipse cx="80" cy="100" rx="58" ry="6" fill="var(--kum)"/>' +
      '<rect x="38" y="22" width="84" height="72" rx="10" fill="var(--kart)" stroke="var(--cizgi-koyu)" stroke-width="2"/>' +
      '<rect x="38" y="22" width="84" height="18" rx="9" fill="var(--vurgu)"/><rect x="38" y="32" width="84" height="8" fill="var(--vurgu)"/>' +
      '<path d="M58 16v14M102 16v14" stroke="var(--yazi)" stroke-width="3" stroke-linecap="round" opacity=".6"/>' +
      '<g fill="var(--kum)"><rect x="50" y="50" width="12" height="10" rx="2"/><rect x="68" y="50" width="12" height="10" rx="2"/><rect x="86" y="50" width="12" height="10" rx="2"/><rect x="50" y="68" width="12" height="10" rx="2"/><rect x="68" y="68" width="12" height="10" rx="2"/></g>' +
      '<rect x="86" y="68" width="12" height="10" rx="2" fill="var(--altin)"/>' +
      '<circle cx="128" cy="78" r="13" fill="var(--kart)" stroke="var(--vurgu)" stroke-width="2.5"/><path d="M128 71v8l5 3" stroke="var(--vurgu)" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>',
    rapor: '<svg class="cizim" viewBox="0 0 160 110" aria-hidden="true">' +
      '<ellipse cx="80" cy="100" rx="58" ry="6" fill="var(--kum)"/>' +
      '<rect x="46" y="16" width="68" height="80" rx="10" fill="var(--kart)" stroke="var(--cizgi-koyu)" stroke-width="2"/>' +
      '<rect x="66" y="10" width="28" height="12" rx="4" fill="var(--altin)"/>' +
      '<rect x="58" y="62" width="9" height="22" rx="2" fill="var(--vurgu-acik)"/><rect x="72" y="50" width="9" height="34" rx="2" fill="var(--vurgu)"/><rect x="86" y="56" width="9" height="28" rx="2" fill="var(--altin)"/>' +
      '<path d="M58 34h44M58 42h30" stroke="var(--cizgi-koyu)" stroke-width="3" stroke-linecap="round"/></svg>',
  };

  root.Ikon = { ikon, P, CIZIM };
})(typeof window !== 'undefined' ? window : globalThis);
