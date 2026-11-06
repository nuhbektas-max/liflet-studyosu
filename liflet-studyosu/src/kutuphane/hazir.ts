import veri from '../../kutuphane/kutuphane.json';
import type { DepoKaydi } from '../storage/db';

/**
 * Uygulamayla gelen hazır liflet kütüphanesi (kutuphane/pdf → araclar/kutuphane-uret.ts ile üretilir).
 * Salt okunur; metinleri aranır ve editörde alanlara aktarılır. PDF dosyaları depoda durur.
 */
export const HAZIR_KUTUPHANE: DepoKaydi[] = (veri as unknown as Omit<DepoKaydi, 'hazir' | 'eklenme'>[]).map((k) => ({ ...k, hazir: true, eklenme: 0 }));
