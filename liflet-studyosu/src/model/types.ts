/** Ölçüler milimetre cinsindendir. Koordinat başlangıcı sayfanın sol üst köşesidir. */
export type Rect = { x: number; y: number; w: number; h: number };

export type SlotKind = 'metin' | 'baslik' | 'foto' | 'logo' | 'tablo' | 'iletisim';

/** Sabit (kilitli) şablon öğesi: geometri, arka plan, logo alanı, kenar boşluğu vb. */
export type FixedItem = {
  id: string;
  sayfa: number;
  tur: 'arkaplan' | 'cerceve' | 'logoAlani' | 'sutun' | 'altBilgi' | 'diger';
  rect: Rect;
  /** Çizim bilgisi (renk, yol vb.). PDF analizinden gelir. */
  cizim?: Record<string, unknown>;
};

/** Değiştirilebilir alan: kutusu şablonda sabittir, içeriği kullanıcıya aittir. */
export type KimlikRolu = 'logo-bakanlik' | 'logo-valilik' | 'logo-mudurluk' | 'mudurluk-adi' | 'iletisim';

export type Slot = {
  id: string;
  /** Kurumsal kimlik bilgisinin otomatik aktarılacağı alan. */
  kimlikRolu?: KimlikRolu;
  sayfa: number;
  tur: SlotKind;
  ad: string;
  rect: Rect;
  /** Yalnızca metin alanları için. */
  yazi?: YaziStili;
};

export type Template = {
  id: string;
  ad: string;
  surum: number;
  /** 'bekliyor': kaynak PDF henüz analiz edilmedi; gerçek geometri yok. */
  durum: 'bekliyor' | 'onayli';
  sayfa: { genislik: number; yukseklik: number; yon: 'yatay' | 'dikey'; sayi: number };
  sutunSayisi: number;
  kenarBosluk?: { ust: number; sag: number; alt: number; sol: number };
  renkler: string[];
  sabit: FixedItem[];
  alanlar: Slot[];
  /** Sabit geometrinin parmak izi; onay anında hesaplanır. */
  muhur?: string;
  kaynakPdfSha256?: string;
  /** Geliştirme/deneme şablonu: Bakanlık tasarımı değildir. */
  deneme?: boolean;
};

export type YaziStili = { aile: 'Sans' | 'Serif'; kalin?: boolean; punto: number; satirAraligi: number; hiza: 'sol' | 'orta' | 'sag' | 'iki' };

export type Golge = { renk: string; dx: number; dy: number; bulanik: number; opaklik: number };
export type YaziGolge = { renk: string; dx: number; dy: number; opaklik: number };

export type SlotContent = {
  /** Alanın içerik türü; verilmezse şablondaki tür geçerlidir. Alan kutusu (geometri) değişmez. */
  mod?: 'metin' | 'foto' | 'logo';
  /** Zemin rengi ve saydamlık (0..1). */
  zemin?: { renk: string; opaklik: number };
  kenar?: { renk: string; kalinlik: number };
  /** Kutu gölgesi. */
  golge?: Golge;
  /** Metin için: yazı rengi, yazı gölgesi, iç boşluk (mm). */
  yaziRenk?: string;
  yaziGolge?: YaziGolge;
  bosluk?: number;
  /** Fotoğraf yerleşimi: 'kapla' alanı doldurur (kırpar), 'sigdir' tamamını gösterir (logolar için). */
  sigdir?: 'kapla' | 'sigdir';
  metin?: string;
  /** Fotoğraf: veri adresi (data URL). Yerelde saklanır. */
  foto?: string;
  fotoBoyut?: { w: number; h: number };
  /** Logo: yüklenen asıl (küçültülmüş) görüntü; kırpma/beyaz zemin seçenekleri bundan yeniden uygulanır. */
  fotoHam?: string;
  logo?: { kirp: boolean; beyazSaydam: boolean; hx: number; hy: number };
  /** Yakınlaştırma (1 = alanı tam kaplar, orijinal en-boy oranı korunur). */
  olcek?: number;
  /** Görünen kısmın merkezi, 0..1 (varsayılan 0,5/0,5). */
  konum?: { x: number; y: number };
  yazi?: Partial<YaziStili>;
};

export type Project = {
  id: string;
  ad: string;
  kategori: string;
  sablon: Template;
  icerik: Record<string, SlotContent>;
  /** Uygulanan kurumsal kimlik profili ve renkleri (şablon mührüne girmez). */
  kimlikId?: string;
  kimlikRenkleri?: string[];
  guncelleme: number;
};

export const KATEGORILER = [
  'Meyvecilik', 'Sebzecilik', 'Bağcılık', 'Tarla bitkileri', 'Süs bitkileri',
  'Tıbbi ve aromatik bitkiler', 'Örtü altı yetiştiriciliği', 'Organik tarım',
  'İyi tarım uygulamaları', 'Arıcılık', 'Büyükbaş hayvancılık', 'Küçükbaş hayvancılık',
  'Kanatlı yetiştiriciliği', 'Su ürünleri', 'Tarımsal desteklemeler', 'Kooperatifçilik',
] as const;
