import { describe, expect, it } from 'vitest';
import { beyaziSaydamYap, icerikSinirlari, kirp, kucultOlcusu, type RGBA } from './logoIsle';

function resim(W: number, H: number, zemin: [number, number, number, number], kutular: { x: number; y: number; w: number; h: number; renk: [number, number, number, number] }[]): RGBA {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set(zemin, i * 4);
  for (const k of kutular) for (let y = k.y; y < k.y + k.h; y++) for (let x = k.x; x < k.x + k.w; x++) data.set(k.renk, (y * W + x) * 4);
  return { data, width: W, height: H };
}

describe('logo işleme', () => {
  it('saydam zeminli logoda içerik sınırını bulur', () => {
    const r = icerikSinirlari(resim(200, 100, [0, 0, 0, 0], [{ x: 50, y: 20, w: 100, h: 40, renk: [200, 0, 0, 255] }]));
    expect(r.x).toBeLessThanOrEqual(50); expect(r.x).toBeGreaterThanOrEqual(47);
    expect(r.x + r.w).toBeGreaterThanOrEqual(150); expect(r.x + r.w).toBeLessThanOrEqual(153);
    expect(r.y + r.h).toBeGreaterThanOrEqual(60);
  });
  it('beyaz zeminli (JPEG tarzı) logoda da içerik sınırını bulur', () => {
    const r = icerikSinirlari(resim(300, 300, [255, 255, 255, 255], [{ x: 100, y: 120, w: 100, h: 60, renk: [0, 80, 160, 255] }]));
    expect(r.w).toBeLessThan(110); expect(r.h).toBeLessThan(70);
    expect(r.x).toBeLessThanOrEqual(100); expect(r.y).toBeLessThanOrEqual(120);
  });
  it('zemin belirsizse (köşeler farklı) hiç kırpmaz', () => {
    const img = resim(40, 40, [255, 255, 255, 255], []);
    img.data.set([0, 0, 0, 255], 0); img.data.set([255, 0, 0, 255], 39 * 4);
    expect(icerikSinirlari(img)).toEqual({ x: 0, y: 0, w: 40, h: 40 });
  });
  it('boş (tek renk) görüntü bozulmadan kalır', () => {
    expect(icerikSinirlari(resim(50, 30, [255, 255, 255, 255], []))).toEqual({ x: 0, y: 0, w: 50, h: 30 });
  });
  it('kırpma oranı: kırpılan parça içerik kutusu kadar, veri doğru', () => {
    const img = resim(100, 100, [0, 0, 0, 0], [{ x: 10, y: 10, w: 20, h: 10, renk: [9, 9, 9, 255] }]);
    const k = kirp(img, { x: 10, y: 10, w: 20, h: 10 });
    expect(k.width).toBe(20); expect(k.height).toBe(10);
    expect([...k.data.subarray(0, 4)]).toEqual([9, 9, 9, 255]);
  });
  it('beyaz saydam olur, koyu renk korunur, ara tonlar yumuşar', () => {
    const img: RGBA = { width: 3, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255, 230, 230, 230, 255, 10, 10, 10, 255]) };
    const s = beyaziSaydamYap(img);
    expect(s.data[3]).toBe(0);
    expect(s.data[7]).toBeGreaterThan(0); expect(s.data[7]).toBeLessThan(255);
    expect(s.data[11]).toBe(255);
    expect(img.data[3]).toBe(255); // girdi değişmez
  });
  it('küçültme oranı korur ve büyütmez', () => {
    expect(kucultOlcusu(3200, 1600)).toEqual({ w: 1600, h: 800 });
    expect(kucultOlcusu(500, 200)).toEqual({ w: 500, h: 200 });
  });
});
