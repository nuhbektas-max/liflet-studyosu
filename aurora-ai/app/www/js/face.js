// AURORA - parlayan çizgilerden oluşan 3D holografik yüz (Three.js).
// Baş, deforme edilmiş bir küreden yatay kontur halkalarıyla çizilir; burun, göz çukuru,
// kaş, elmacık, dudak ve çene yüzeye eklenen tümseklerle oluşur. Ağız (çene açılması,
// dudak yuvarlama, gülümseme), kaş, göz kırpma, bakış, nefes ve baş hareketleri her karede
// köşe noktalarını yeniden hesaplayarak canlandırılır. Arkada kalan çizgileri görünmez bir
// "örtücü" yüzey gizler; parıltı UnrealBloom ile verilir.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const RINGS = 46;        // baştaki yatay halka sayısı
const SEG = 220;         // halka başına nokta
const NECK_RINGS = 22;

const STATE_COLORS = {
  idle: 0x5b8cff,       // mavi
  listening: 0x3ee88a,  // yeşil
  thinking: 0xb36bff,   // mor
  speaking: 0x3fe6dc,   // turkuaz
  error: 0xff6a2b,      // turuncu-kırmızı
};

// Duygu → yüz ayarları (gülümseme, kaş, ağız gerginliği, ışık).
const EMOTIONS = {
  neutral:     { smile: 0.0,  brow: 0.0,  browIn: 0.0, glow: 1.0 },
  happy:       { smile: 1.0,  brow: 0.25, browIn: 0.0, glow: 1.25 },
  curious:     { smile: 0.2,  brow: 0.8,  browIn: 0.0, glow: 1.1 },
  thoughtful:  { smile: -0.1, brow: -0.2, browIn: 0.6, glow: 0.95 },
  surprised:   { smile: 0.0,  brow: 1.0,  browIn: 0.0, glow: 1.35 },
  sad:         { smile: -0.8, brow: 0.3,  browIn: 0.9, glow: 0.75 },
  alert:       { smile: -0.1, brow: 0.6,  browIn: 0.3, glow: 1.3 },
  witty:       { smile: 0.7,  brow: 0.4,  browIn: -0.2, glow: 1.15 },
  empathetic:  { smile: 0.35, brow: 0.35, browIn: 0.5, glow: 1.0 },
};

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const gauss = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));

/** Baş yüzeyi: y yüksekliği (-0.9..1) ve p açısı (0 = ön) için nokta ve canlandırma ağırlıkları. */
function headPoint(yLevel, p) {
  const th = Math.acos(Math.max(-1, Math.min(1, yLevel)));
  let x = Math.sin(th) * Math.sin(p);
  let y = yLevel;
  let z = Math.sin(th) * Math.cos(p);

  x *= 0.74;
  z *= 0.84;
  if (z < 0) z *= 1.14 + 0.06 * y;                 // kafatası arkası
  if (y > 0.45) z += 0.02 * smooth(0.45, 0.9, y) * Math.max(0, Math.cos(p)); // alın

  // Alt yüzde çene daralması
  const k = smooth(0.15, -0.9, y);
  x *= 1 - 0.27 * k;
  z *= z > 0 ? 1 - 0.06 * k : 1 - 0.3 * k;

  const front = smooth(0.15, 0.75, Math.cos(p));    // yüzün önü
  let d = 0;
  // Burun: köprüden uca yükselen sırt, uçta yuvarlak, altında içe dönüş
  const noseT = smooth(0.16, -0.22, y) * (1 - smooth(-0.22, -0.3, y));
  const noseW = lerp(0.045, 0.085, smooth(0.1, -0.22, y));
  d += 0.21 * noseT * Math.exp(-((x / noseW) ** 2));
  d += 0.035 * gauss(x, y, 0.075, -0.235, 0.04, 0.035) + 0.035 * gauss(x, y, -0.075, -0.235, 0.04, 0.035);
  // Göz çukurları ve göz kapakları
  d -= 0.075 * (gauss(x, y, 0.27, 0.1, 0.11, 0.075) + gauss(x, y, -0.27, 0.1, 0.11, 0.075));
  d += 0.04 * (gauss(x, y, 0.27, 0.095, 0.055, 0.04) + gauss(x, y, -0.27, 0.095, 0.055, 0.04));
  // Kaş kemeri
  d += 0.045 * Math.exp(-(((y - 0.235) / 0.05) ** 2)) * smooth(0.5, 0.15, Math.abs(x));
  // Elmacık kemikleri
  d += 0.045 * (gauss(x, y, 0.38, -0.08, 0.12, 0.1) + gauss(x, y, -0.38, -0.08, 0.12, 0.1));
  // Dudaklar ve ağız çizgisi
  d += 0.05 * gauss(x, y, 0, -0.41, 0.15, 0.035);
  d += 0.045 * gauss(x, y, 0, -0.505, 0.125, 0.035);
  d -= 0.02 * gauss(x, y, 0, -0.455, 0.14, 0.012);
  // Çene
  d += 0.065 * gauss(x, y, 0, -0.665, 0.13, 0.075);
  z += d * front;

  // Canlandırma ağırlıkları
  const mouthX = smooth(0.34, 0.06, Math.abs(x));
  const jaw = front * smooth(-0.44, -0.6, y) * smooth(0.55, 0.2, Math.abs(x)) * (1 - smooth(-0.85, -0.95, y));
  const upperLip = front * Math.exp(-(((y + 0.41) / 0.05) ** 2)) * mouthX;
  const lips = front * Math.exp(-(((y + 0.46) / 0.08) ** 2)) * mouthX;
  const corner = front * (gauss(x, y, 0.14, -0.46, 0.06, 0.05) + gauss(x, y, -0.14, -0.46, 0.06, 0.05));
  const brow = front * Math.exp(-(((y - 0.24) / 0.07) ** 2)) * smooth(0.5, 0.12, Math.abs(x));
  const browInner = brow * smooth(0.3, 0.05, Math.abs(x));
  return { x, y, z, jaw, upperLip, lips, corner, brow, browInner, sign: Math.sign(x) || 1 };
}

export class HoloFace {
  constructor(container) {
    this.container = container;
    this.state = 'idle';
    this.emotion = 'neutral';
    this.intensity = 0.6;
    this.mouthOpenTarget = 0;
    this.mouthRoundTarget = 0;
    this.mouthOpen = 0;
    this.mouthRound = 0;
    this.smile = 0;
    this.brow = 0;
    this.browIn = 0;
    this.glow = 1;
    this.gazeTarget = new THREE.Vector2(0, 0);
    this.gaze = new THREE.Vector2(0, 0);
    this.blink = 0;
    this.nextBlink = 1.5;
    this.gesture = null;
    this.yaw = -0.5;
    this.audioLevel = 0;
    this.animScale = 1;
    this.lowPower = false;
    this.color = new THREE.Color(STATE_COLORS.idle);
    this.targetColor = new THREE.Color(STATE_COLORS.idle);
    this.clock = new THREE.Clock();
    this._build();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ---- Dışarıdan kullanılan işlemler ----
  setState(state) {
    this.state = state;
    this.targetColor.set(STATE_COLORS[state] ?? STATE_COLORS.idle);
    if (state === 'thinking') this.gazeTarget.set(0.5, 0.55);
    else if (state === 'listening' || state === 'speaking') this.gazeTarget.set(0, 0);
  }
  setEmotion(emotion, intensity = 0.6) {
    this.emotion = EMOTIONS[emotion] ? emotion : 'neutral';
    this.intensity = Math.max(0, Math.min(1, Number(intensity) || 0.6));
  }
  /** open: 0..1 çene, round: 0..1 dudak yuvarlama (o, u). */
  setMouth(open, round = 0) {
    this.mouthOpenTarget = Math.max(0, Math.min(1, open));
    this.mouthRoundTarget = Math.max(0, Math.min(1, round));
  }
  /** Pil tasarrufu: parıltı kapalı, çözünürlük düşük. */
  setPerformance(low) {
    this.lowPower = !!low;
    this.renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.bloom.enabled = !low;
    this._resize();
  }
  setAudioLevel(level) { this.audioLevel = Math.max(0, Math.min(1, level)); }
  playGesture(name) {
    if (!name || name === 'none') return;
    this.gesture = { name, t: 0, dur: name === 'shake' ? 1.1 : name === 'tilt' ? 1.4 : 0.9 };
  }
  lookAt(where) {
    const m = { camera: [0, 0], up: [0, 0.8], down: [0, -0.7], left: [-0.8, 0], right: [0.8, 0], away: [0.7, 0.3] };
    const v = m[where] || m.camera;
    this.gazeTarget.set(v[0], v[1]);
  }

  // ---- Kurulum ----
  _build() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    this.container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.background = this._gradientTexture();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    this.camera.position.set(0, -0.3, 6.4);

    this.head = new THREE.Group();
    this.scene.add(this.head);

    this.uniforms = {
      uColor: { value: this.color },
      uTime: { value: 0 },
      uGlow: { value: 1 },
    };
    const lineMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aDist;
        attribute float aBright;
        attribute vec3 aNormal;
        varying float vDist;
        varying float vBright;
        varying float vFacing;
        varying float vSelf;
        void main() {
          vDist = aDist;
          vSelf = step(length(aNormal), 0.01);
          vBright = aBright;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * (aNormal + vec3(0.0, 0.0, vSelf)));
          vFacing = clamp(dot(n, normalize(-mv.xyz)), 0.0, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uGlow;
        varying float vDist;
        varying float vBright;
        varying float vFacing;
        varying float vSelf;
        void main() {
          float dash = step(fract(vDist * 22.0 - uTime * 0.35), 0.62);
          float edge = mix(0.3 + 1.2 * pow(1.0 - vFacing, 2.2), 1.0, vSelf);
          float a = (0.12 + 0.88 * dash) * edge * vBright * uGlow;
          vec3 c = mix(uColor, vec3(0.85, 0.95, 1.0), 0.25 * dash);
          gl_FragColor = vec4(c * a, a);
        }`,
    });
    this.lineMat = lineMat;

    // Baş halkaları
    this.points = [];
    const pos = new Float32Array(RINGS * SEG * 3);
    const dist = new Float32Array(RINGS * SEG);
    const bright = new Float32Array(RINGS * SEG);
    const index = [];
    for (let r = 0; r < RINGS; r++) {
      const yLevel = lerp(0.975, -0.86, r / (RINGS - 1));
      let acc = 0;
      let prev = null;
      for (let s = 0; s < SEG; s++) {
        const p = (s / SEG) * Math.PI * 2;
        const pt = headPoint(yLevel, p);
        const i = r * SEG + s;
        this.points.push(pt);
        pos.set([pt.x, pt.y, pt.z], i * 3);
        if (prev) acc += Math.hypot(pt.x - prev.x, pt.y - prev.y, pt.z - prev.z);
        dist[i] = acc + r * 0.37;
        // Alt kısımda (boyun birleşimi) sönükleşir
        bright[i] = 0.9 * (1 - 0.6 * smooth(-0.6, -0.86, yLevel)) * (1 - 0.55 * smooth(0.7, 0.97, yLevel));
        prev = pt;
        index.push(i, r * SEG + ((s + 1) % SEG));
      }
    }
    this.basePos = pos.slice();
    const headNormals = this._gridNormals(pos, RINGS, SEG);
    // Eğriliğin yüksek olduğu yerler (burun, dudak, kaş, çene) daha parlak: yüz hatları okunur.
    for (let r = 1; r < RINGS - 1; r++) {
      for (let s2 = 0; s2 < SEG; s2++) {
        const i = r * SEG + s2;
        const a = (r * SEG + ((s2 + 1) % SEG)) * 3, b = (r * SEG + ((s2 - 1 + SEG) % SEG)) * 3;
        const c = ((r + 1) * SEG + s2) * 3, d = ((r - 1) * SEG + s2) * 3, o = i * 3;
        let lap = 0;
        for (let q = 0; q < 3; q++) lap += Math.abs(pos[a + q] + pos[b + q] + pos[c + q] + pos[d + q] - 4 * pos[o + q]);
        if (this.points[i].z > 0) bright[i] *= 1 + Math.min(1.6, lap * 50);
      }
    }
    const headGeo = new THREE.BufferGeometry();
    headGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    headGeo.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
    headGeo.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
    headGeo.setAttribute('aNormal', new THREE.BufferAttribute(headNormals, 3));
    headGeo.setIndex(index);
    this.headGeo = headGeo;
    this.head.add(new THREE.LineSegments(headGeo, lineMat));
    // Hareket eden noktaların listesi (her karede yalnızca bunlar güncellenir)
    this.animated = [];
    this.points.forEach((pt, i) => {
      if (pt.jaw > 0.002 || pt.lips > 0.002 || pt.upperLip > 0.002 || pt.corner > 0.002 || pt.brow > 0.002) this.animated.push(i);
    });

    // Örtücü: arkadaki çizgileri gizleyen görünmez yüzey
    const occIndex = [];
    for (let r = 0; r < RINGS - 1; r++) {
      for (let s = 0; s < SEG; s++) {
        const a = r * SEG + s, b = r * SEG + ((s + 1) % SEG), c = (r + 1) * SEG + s, d = (r + 1) * SEG + ((s + 1) % SEG);
        occIndex.push(a, c, b, b, c, d);
      }
    }
    this.occPos = new Float32Array(pos.length);
    const occGeo = new THREE.BufferGeometry();
    occGeo.setAttribute('position', new THREE.BufferAttribute(this.occPos, 3).setUsage(THREE.DynamicDrawUsage));
    occGeo.setIndex(occIndex);
    this.occGeo = occGeo;
    const occMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    const occ = new THREE.Mesh(occGeo, occMat);
    occ.renderOrder = -1;
    this.head.add(occ);
    this._updateOccluder();

    // Boyun
    const neckPos = [], neckDist = [], neckBright = [], neckIdx = [], neckNrm = [];
    const NS = 140;
    for (let r = 0; r < NECK_RINGS; r++) {
      const y = lerp(-0.62, -1.95, r / (NECK_RINGS - 1));
      const widen = smooth(-1.35, -1.95, y);
      const rx = 0.33 + 0.5 * widen * widen, rz = 0.3 + 0.12 * widen;
      let acc = 0;
      for (let s = 0; s < NS; s++) {
        const p = (s / NS) * Math.PI * 2;
        const x = Math.sin(p) * rx, z = Math.cos(p) * rz - 0.16;
        const yy = y + 0.05 * Math.cos(p);
        neckPos.push(x, yy, z);
        neckNrm.push(Math.sin(p), 0, Math.cos(p));
        acc += (Math.PI * 2 * rx) / NS;
        neckDist.push(acc + r * 0.5);
        neckBright.push(0.85 * (1 - smooth(-1.4, -1.95, y)));
        neckIdx.push(r * NS + s, r * NS + ((s + 1) % NS));
      }
    }
    const neckGeo = new THREE.BufferGeometry();
    neckGeo.setAttribute('position', new THREE.Float32BufferAttribute(neckPos, 3));
    neckGeo.setAttribute('aDist', new THREE.Float32BufferAttribute(neckDist, 1));
    neckGeo.setAttribute('aBright', new THREE.Float32BufferAttribute(neckBright, 1));
    neckGeo.setAttribute('aNormal', new THREE.Float32BufferAttribute(neckNrm, 3));
    neckGeo.setIndex(neckIdx);
    this.neck = new THREE.LineSegments(neckGeo, lineMat);
    this.scene.add(this.neck);
    const neckOcc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.38, 1.4, 48, 1, true),
      new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }),
    );
    neckOcc.position.set(0, -1.3, -0.16);
    neckOcc.renderOrder = -1;
    this.scene.add(neckOcc);

    // Gözler: yüzeye oturan iç içe halkalar + parlak bebek
    this.eyes = [];
    for (const side of [1, -1]) {
      const eye = new THREE.Group();
      const cx = 0.27 * side, cy = 0.1;
      const cz = this._surfaceZ(cx, cy);
      eye.position.set(cx, cy, cz + 0.012);
      const ringPos = [], ringDist = [], ringBright = [], ringIdx = [], ringNrm = [];
      const RS = 64, RN = 6;
      for (let k = 0; k < RN; k++) {
        const rad = 0.018 + k * 0.017;
        for (let s = 0; s < RS; s++) {
          const a = (s / RS) * Math.PI * 2;
          const x = Math.cos(a) * rad * 1.35, y = Math.sin(a) * rad * 0.85;
          const z = this._surfaceZ(cx + x, cy + y) - cz;
          ringPos.push(x, y, z + 0.004);
          ringDist.push(s / RS * rad * 8 + k);
          ringBright.push(1.2 - k * 0.16);
          ringNrm.push(0, 0, 0);
          ringIdx.push(k * RS + s, k * RS + ((s + 1) % RS));
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(ringPos, 3));
      g.setAttribute('aDist', new THREE.Float32BufferAttribute(ringDist, 1));
      g.setAttribute('aBright', new THREE.Float32BufferAttribute(ringBright, 1));
      g.setAttribute('aNormal', new THREE.Float32BufferAttribute(ringNrm, 3));
      g.setIndex(ringIdx);
      const rings = new THREE.LineSegments(g, lineMat);
      eye.add(rings);
      const pupil = new THREE.Mesh(
        new THREE.CircleGeometry(0.009, 20),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      pupil.position.z = 0.02;
      eye.add(pupil);
      eye.userData = { rings, pupil, base: new THREE.Vector3(cx, cy, cz + 0.012) };
      this.head.add(eye);
      this.eyes.push(eye);
    }

    // Kulaklar: sarmal
    for (const side of [1, -1]) {
      const spiralPos = [], spiralDist = [], spiralBright = [], spiralIdx = [], spiralNrm = [];
      const N = 420;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const a = t * Math.PI * 2 * 5.5;
        const rad = 0.025 + 0.11 * t;
        const yy = Math.sin(a) * rad * 1.35 - 0.02;
        const zz = Math.cos(a) * rad * 0.8 - 0.1;
        const xx = side * (0.69 + 0.035 * (1 - t));
        spiralPos.push(xx, yy, zz);
        spiralDist.push(t * 9);
        spiralBright.push(0.9);
        spiralNrm.push(0, 0, 0);
        if (i < N - 1) spiralIdx.push(i, i + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(spiralPos, 3));
      g.setAttribute('aDist', new THREE.Float32BufferAttribute(spiralDist, 1));
      g.setAttribute('aBright', new THREE.Float32BufferAttribute(spiralBright, 1));
      g.setAttribute('aNormal', new THREE.Float32BufferAttribute(spiralNrm, 3));
      g.setIndex(spiralIdx);
      this.head.add(new THREE.LineSegments(g, lineMat));
    }

    // Parıltı
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.4, 0.08);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /** Görseldeki gibi mor-lacivert geçişli arka plan. */
  _gradientTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 512;
    const g = c.getContext('2d');
    const lin = g.createLinearGradient(0, 0, 256, 512);
    lin.addColorStop(0, '#1b2f8f');
    lin.addColorStop(0.55, '#24208a');
    lin.addColorStop(1, '#2c0f6e');
    g.fillStyle = lin; g.fillRect(0, 0, 256, 512);
    const rad = g.createRadialGradient(170, 170, 10, 170, 170, 320);
    rad.addColorStop(0, 'rgba(40,90,220,0.45)');
    rad.addColorStop(1, 'rgba(10,5,40,0)');
    g.fillStyle = rad; g.fillRect(0, 0, 256, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Halka ızgarası için yüzey normalleri (komşu noktalardan). */
  _gridNormals(pos, rings, seg) {
    const n = new Float32Array(pos.length);
    const P = (r, s) => {
      r = Math.max(0, Math.min(rings - 1, r)); s = (s + seg) % seg;
      const i = (r * seg + s) * 3;
      return [pos[i], pos[i + 1], pos[i + 2]];
    };
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < seg; s++) {
        const a = P(r, s + 1), b = P(r, s - 1), c = P(r + 1, s), d = P(r - 1, s);
        const tx = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
        const ty = [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
        let nx = tx[1] * ty[2] - tx[2] * ty[1], ny = tx[2] * ty[0] - tx[0] * ty[2], nz = tx[0] * ty[1] - tx[1] * ty[0];
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        const i = (r * seg + s) * 3, p = P(r, s);
        if (nx * p[0] + ny * p[1] + nz * p[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
        n[i] = nx; n[i + 1] = ny; n[i + 2] = nz;
      }
    }
    return n;
  }

  /** Yüzün önünde (x, y) noktasındaki yüzey derinliği (ön yarıküredeki noktalardan bulunur). */
  _surfaceZ(x, y) {
    let best = -1, bestD = 1e9;
    for (const pt of this.points) {
      if (pt.z <= 0) continue;
      const d = (pt.x - x) ** 2 + (pt.y - y) ** 2;
      if (d < bestD) { bestD = d; best = pt.z; }
    }
    return best;
  }

  _updateOccluder() {
    const src = this.headGeo.attributes.position.array;
    for (let i = 0; i < src.length; i += 3) {
      this.occPos[i] = src[i] * 0.985;
      this.occPos[i + 1] = src[i + 1] * 0.985;
      this.occPos[i + 2] = src[i + 2] * 0.985 - 0.004;
    }
    this.occGeo.attributes.position.needsUpdate = true;
  }

  _resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    // Dar ekranda baş sığsın
    this.camera.position.z = w / h < 0.75 ? 6.4 / Math.max(0.55, (w / h) / 0.75) : 6.4;
    this.camera.updateProjectionMatrix();
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
  }

  // ---- Her kare ----
  _frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.uniforms.uTime.value = t;

    // Renk ve duygu
    this.color.lerp(this.targetColor, 1 - Math.exp(-6 * dt));
    const emo = EMOTIONS[this.emotion];
    const k = this.state === 'speaking' || this.state === 'idle' ? this.intensity : this.intensity * 0.6;
    this.smile = damp(this.smile, emo.smile * k, 4, dt);
    this.brow = damp(this.brow, emo.brow * k + (this.state === 'listening' ? 0.25 : 0), 4, dt);
    this.browIn = damp(this.browIn, emo.browIn * k + (this.state === 'thinking' ? 0.4 : 0), 4, dt);
    const pulse = this.state === 'thinking' ? 0.15 * Math.sin(t * 3.4)
      : this.state === 'error' ? (Math.sin(t * 12) > 0 ? 0.25 : -0.25)
      : this.state === 'listening' ? 0.25 * this.audioLevel : 0;
    this.glow = damp(this.glow, emo.glow + pulse, 8, dt);
    this.uniforms.uGlow.value = this.glow;
    this.bloom.strength = 0.45 + 0.35 * this.glow;

    // Ağız
    this.mouthOpen = damp(this.mouthOpen, this.mouthOpenTarget, 22, dt);
    this.mouthRound = damp(this.mouthRound, this.mouthRoundTarget, 18, dt);
    this._deform();

    // Göz kırpma
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 1;
      this.nextBlink = 2 + Math.random() * 4 + (Math.random() < 0.15 ? -1.8 : 0);
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const lid = this.blink > 0.5 ? (1 - this.blink) * 2 : this.blink * 2; // 0 açık .. 1 kapalı (üçgen)
    const open = 1 - 0.92 * Math.min(1, lid * (this.blink > 0 ? 1 : 0) * 1.0);

    // Bakış (göz bebeği) ve ufak sakkadlar
    if (Math.random() < dt * (this.state === 'idle' ? 0.6 : 0.25)) {
      this.saccade = new THREE.Vector2((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3);
    }
    const sac = this.state === 'idle' && this.saccade ? this.saccade : new THREE.Vector2();
    this.gaze.x = damp(this.gaze.x, this.gazeTarget.x + sac.x, 10, dt);
    this.gaze.y = damp(this.gaze.y, this.gazeTarget.y + sac.y, 10, dt);
    for (const eye of this.eyes) {
      eye.scale.y = Math.max(0.08, open);
      const { pupil } = eye.userData;
      pupil.position.x = this.gaze.x * 0.03;
      pupil.position.y = this.gaze.y * 0.02;
      pupil.material.opacity = (0.35 + 0.4 * open) * Math.min(1.3, this.glow);
    }

    // Baş: duruma göre yöneliş, nefes, jestler
    const targetYaw = this.state === 'idle' ? -0.5 + 0.08 * Math.sin(t * 0.31)
      : this.state === 'thinking' ? -0.3 : -0.16;
    this.yaw = damp(this.yaw, targetYaw, 2.2, dt);
    let pitch = 0.03 * Math.sin(t * 0.23) + (this.state === 'thinking' ? -0.07 : 0);
    let roll = this.state === 'listening' ? 0.07 : 0.015 * Math.sin(t * 0.4);
    let yaw = this.yaw + 0.25 * this.gaze.x * 0.2;
    if (this.state === 'speaking') pitch += 0.025 * Math.sin(t * 5.3) * this.mouthOpen;
    if (this.gesture) {
      const g = this.gesture;
      g.t += dt;
      const u = g.t / g.dur;
      const env = Math.sin(Math.min(1, u) * Math.PI);
      if (g.name === 'nod') pitch += 0.12 * Math.sin(u * Math.PI * 4) * env;
      else if (g.name === 'shake') yaw += 0.16 * Math.sin(u * Math.PI * 5) * env;
      else if (g.name === 'tilt') roll += 0.14 * env;
      else if (g.name === 'lean') pitch += 0.08 * env;
      if (u >= 1) this.gesture = null;
    }
    const a = this.animScale;
    this.head.rotation.set(-pitch * a, this.yaw + (yaw - this.yaw) * a, roll * a);
    const breathe = Math.sin(t * 1.25);
    this.head.position.y = 0.012 * breathe;
    this.neck.rotation.y = yaw * 0.35;
    this.neck.scale.set(1 + 0.008 * breathe, 1, 1 + 0.008 * breathe);

    if (this.lowPower) this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);
  }

  _deform() {
    const pos = this.headGeo.attributes.position.array;
    const base = this.basePos;
    const o = this.mouthOpen, r = this.mouthRound, sm = this.smile, br = this.brow, bi = this.browIn;
    for (const i of this.animated) {
      const pt = this.points[i];
      const j = i * 3;
      let x = base[j], y = base[j + 1], z = base[j + 2];
      // Çene açılır: alt dudak ve çene aşağı ve biraz geri
      y -= 0.13 * o * pt.jaw;
      z -= 0.035 * o * pt.jaw;
      y += 0.018 * o * pt.upperLip;
      // Yuvarlama: dudaklar öne ve içe
      x *= 1 - 0.28 * r * pt.lips;
      z += 0.035 * r * pt.lips;
      // Gülümseme: köşeler yukarı-dışa (üzgünde aşağı)
      y += 0.035 * sm * pt.corner;
      x += 0.02 * Math.max(0, sm) * pt.corner * pt.sign;
      // Kaşlar
      y += 0.045 * br * pt.brow - 0.02 * bi * pt.browInner;
      pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
    }
    this.headGeo.attributes.position.needsUpdate = true;
    this._updateOccluder();
  }
}
