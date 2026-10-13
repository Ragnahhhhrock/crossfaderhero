import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { alpha, hex } from '../design/tokens';

/**
 * The bar at the back of the club, built in its own frame: x along the counter,
 * −z out towards the dance floor, the back wall at z = BACK.
 *
 * A long counter with a brass foot rail and a row of stools, a back bar of
 * neon-backlit glass shelves stacked with top-shelf bottles, and a big neon
 * BAR sign hanging over it all.
 */

/** Where the back wall is, from the counter's centre line. */
const BACK = 1.3;
const COUNTER = { w: 7, h: 1.08, d: 0.7 };
/** The back bar's three bays: left, centre (the top shelf), right. */
const BAYS = [
  { x: -2.6, w: 2.3 },
  { x: 0, w: 2.3 },
  { x: 2.6, w: 2.3 },
];
const SHELVES = [1.42, 2.0, 2.58, 3.16];
const SHELF_Z = 1.13;
const STOOLS = 7;
const SEAT_H = 0.78;
/** Where the bartender works, between the counter and the back bar. */
export const BARTENDER_Z = 0.63;

type Shape = 'tall' | 'square' | 'round' | 'wine' | 'squat';

/** What goes in each shape of bottle, and how tall it stands. */
const BOTTLES: Record<Shape, { liquor: string[]; caps: string[]; h: number; r: number }> = {
  tall: { liquor: ['club-vodka', 'club-gin', 'club-gin'], caps: ['tt-chrome', 'print-ink', 'club-neon-trim'], h: 0.34, r: 0.042 },
  square: { liquor: ['club-whisky', 'club-whisky', 'club-cognac'], caps: ['print-ink', 'print-gold'], h: 0.28, r: 0.045 },
  round: { liquor: ['club-cognac', 'club-whisky'], caps: ['print-gold', 'print-gold', 'tt-chrome'], h: 0.25, r: 0.065 },
  wine: { liquor: ['club-champagne', 'club-liqueur', 'club-champagne'], caps: ['print-gold', 'print-red'], h: 0.34, r: 0.044 },
  squat: { liquor: ['club-tequila', 'club-rum', 'club-tequila'], caps: ['print-ink', 'club-bar'], h: 0.25, r: 0.05 },
};
const LABELS = ['print-paper', 'print-paper', 'print-ink', 'print-gold', 'sleeve-white'];

function lathe(points: [number, number][]): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    14,
  );
}

/** Bottle bodies with their necks, standing on y = 0. */
function bottleGeometry(shape: Shape): THREE.BufferGeometry {
  switch (shape) {
    case 'tall':
      return lathe([[0, 0], [0.04, 0], [0.042, 0.006], [0.042, 0.24], [0.03, 0.27], [0.014, 0.29], [0.014, 0.32], [0, 0.32]]);
    case 'round':
      return lathe([[0, 0], [0.05, 0], [0.065, 0.055], [0.06, 0.125], [0.034, 0.175], [0.015, 0.19], [0.015, 0.23], [0, 0.23]]);
    case 'wine':
      return lathe([[0, 0], [0.042, 0], [0.044, 0.01], [0.044, 0.19], [0.03, 0.245], [0.016, 0.285], [0.016, 0.32], [0, 0.32]]);
    case 'squat':
      return lathe([[0, 0], [0.05, 0], [0.051, 0.008], [0.05, 0.165], [0.038, 0.195], [0.018, 0.205], [0.018, 0.23], [0, 0.23]]);
    case 'square': {
      const body = new THREE.BoxGeometry(0.085, 0.19, 0.085).translate(0, 0.095, 0);
      const shoulder = new THREE.CylinderGeometry(0.02, 0.042, 0.03, 12).translate(0, 0.205, 0);
      const neck = new THREE.CylinderGeometry(0.016, 0.016, 0.05, 10).translate(0, 0.245, 0);
      return mergeGeometries([body, shoulder, neck])!;
    }
  }
}

function rnd(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A lit neon tube: a soft halo, the coloured glass, and a hot white core. */
function tube(ctx: CanvasRenderingContext2D, path: Path2D, colour: string, width: number): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = alpha(colour, 1);
  ctx.shadowBlur = width * 3;
  ctx.strokeStyle = alpha(colour, 0.35);
  ctx.lineWidth = width * 2;
  ctx.stroke(path);
  ctx.shadowBlur = width;
  ctx.strokeStyle = alpha(colour, 1);
  ctx.lineWidth = width;
  ctx.stroke(path);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = alpha('club-neon-core', 0.9);
  ctx.lineWidth = width * 0.32;
  ctx.stroke(path);
  ctx.restore();
}

/** The BAR sign, bent from tubes: letters in pink, a border in ice blue. */
function neonSign(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 400;
  const ctx = c.getContext('2d')!;
  const top = 78;
  const bot = 322;
  const mid = 196;

  const letters = new Path2D();
  // B
  let x = 170;
  letters.moveTo(x, bot);
  letters.lineTo(x, top);
  letters.lineTo(x + 105, top);
  letters.arc(x + 105, (top + mid) / 2, (mid - top) / 2, -Math.PI / 2, Math.PI / 2);
  letters.lineTo(x, mid);
  letters.moveTo(x + 105, mid);
  letters.lineTo(x + 118, mid);
  letters.arc(x + 118, (mid + bot) / 2, (bot - mid) / 2, -Math.PI / 2, Math.PI / 2);
  letters.lineTo(x, bot);
  // A
  x = 512;
  letters.moveTo(x - 108, bot);
  letters.lineTo(x, top);
  letters.lineTo(x + 108, bot);
  const t = (236 - top) / (bot - top);
  letters.moveTo(x - 108 * (1 - t), 236);
  letters.lineTo(x + 108 * (1 - t), 236);
  // R
  x = 704;
  letters.moveTo(x, bot);
  letters.lineTo(x, top);
  letters.lineTo(x + 100, top);
  letters.arc(x + 100, (top + 206) / 2, (206 - top) / 2, -Math.PI / 2, Math.PI / 2);
  letters.lineTo(x, 206);
  letters.moveTo(x + 72, 206);
  letters.lineTo(x + 158, bot);

  const border = new Path2D();
  border.roundRect(70, 34, 884, 332, 46);

  tube(ctx, border, 'club-neon-trim', 11);
  tube(ctx, letters, 'club-neon-bar', 22);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Backlight for one bay: a wash of blue that's brightest just above each shelf. */
function backlight(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 256, 0, 0);
  // one band per shelf, light rising from the shelf below
  const bands = SHELVES.length;
  for (let i = 0; i < bands; i++) {
    const a = i / bands;
    const b = (i + 1) / bands;
    g.addColorStop(a, alpha('club-shelf-neon', 1));
    g.addColorStop(a + (b - a) * 0.55, alpha('club-shelf-neon', 0.35));
    g.addColorStop(Math.min(1, b - 0.002), alpha('club-shelf-neon', 0.2));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Bar {
  readonly group = new THREE.Group();
  private signMat: THREE.MeshBasicMaterial;
  private signLight: THREE.PointLight;
  private backMat: THREE.MeshBasicMaterial;
  private stripMats: THREE.MeshStandardMaterial[] = [];

  constructor() {
    const g = this.group;
    const std = (token: string, roughness = 0.8, metalness = 0.1) => new THREE.MeshStandardMaterial({ color: hex(token), roughness, metalness });
    const glow = (token: string, intensity: number) =>
      new THREE.MeshStandardMaterial({ color: hex('club-fixture'), emissive: new THREE.Color(hex(token)), emissiveIntensity: intensity, roughness: 0.5 });
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = g) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const wood = std('club-bar', 0.55);
    const brass = std('club-brass', 0.3, 0.85);
    const chrome = std('tt-chrome', 0.18, 0.95);
    const stone = std('graphite-500', 0.2, 0.7);

    // ---- the counter
    box(COUNTER.w, COUNTER.h, COUNTER.d, wood, 0, COUNTER.h / 2, 0);
    box(COUNTER.w + 0.3, 0.06, COUNTER.d + 0.15, stone, 0, COUNTER.h + 0.02, 0);
    // vertical panelling down the front
    for (let i = 0; i <= 14; i++) box(0.04, COUNTER.h - 0.2, 0.02, std('club-bar', 0.4, 0.2), -COUNTER.w / 2 + 0.1 + i * ((COUNTER.w - 0.2) / 14), COUNTER.h / 2 - 0.02, -COUNTER.d / 2 - 0.01);
    // a warm glow strip under the lip, and one at the kick plate
    box(COUNTER.w, 0.03, 0.03, glow('club-bar-glow', 2), 0, COUNTER.h - 0.08, -COUNTER.d / 2 - 0.03);
    box(COUNTER.w, 0.02, 0.02, glow('club-bar-glow', 1.2), 0, 0.06, -COUNTER.d / 2 - 0.02);
    // brass foot rail on brackets
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, COUNTER.w - 0.2, 12), brass);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 0.2, -COUNTER.d / 2 - 0.15);
    g.add(rail);
    for (let i = 0; i < 6; i++) box(0.03, 0.03, 0.16, brass, -COUNTER.w / 2 + 0.3 + i * ((COUNTER.w - 0.6) / 5), 0.2, -COUNTER.d / 2 - 0.08);
    // beer taps in the middle of the counter
    for (let i = 0; i < 4; i++) {
      const tx = -0.36 + i * 0.24;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.32, 10), chrome);
      post.position.set(tx, COUNTER.h + 0.2, 0.08);
      g.add(post);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.1, 8), chrome);
      spout.rotation.x = Math.PI / 2;
      spout.position.set(tx, COUNTER.h + 0.3, 0.03);
      g.add(spout);
      box(0.03, 0.12, 0.03, std(['print-red', 'print-gold', 'print-ink', 'club-neon-trim'][i], 0.4), tx, COUNTER.h + 0.42, 0.08);
    }
    box(1.1, 0.03, 0.14, chrome, 0, COUNTER.h + 0.06, 0.05); // drip tray

    // ---- stools along the front
    const seatGeo = new THREE.CylinderGeometry(0.19, 0.17, 0.08, 20);
    const poleGeo = new THREE.CylinderGeometry(0.025, 0.025, SEAT_H - 0.05, 10);
    const baseGeo = new THREE.CylinderGeometry(0.21, 0.23, 0.03, 20);
    const ringGeo = new THREE.TorusGeometry(0.16, 0.012, 8, 24);
    const leather = std('club-leather', 0.45, 0.05);
    for (let i = 0; i < STOOLS; i++) {
      const s = new THREE.Group();
      s.position.set(-3 + i, 0, -COUNTER.d / 2 - 0.45);
      const base = new THREE.Mesh(baseGeo, chrome);
      base.position.y = 0.015;
      const pole = new THREE.Mesh(poleGeo, chrome);
      pole.position.y = (SEAT_H - 0.05) / 2;
      const ring = new THREE.Mesh(ringGeo, brass);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.3;
      const seat = new THREE.Mesh(seatGeo, leather);
      seat.position.y = SEAT_H;
      s.add(base, pole, ring, seat);
      s.rotation.y = (i * 0.37) % 0.5; // not quite lined up: people have been sitting on them
      g.add(s);
    }

    // ---- the back bar: a low counter, then glass shelves in three lit bays
    box(COUNTER.w + 0.8, 0.95, 0.4, wood, 0, 0.475, BACK - 0.2);
    box(COUNTER.w + 0.9, 0.04, 0.44, stone, 0, 0.97, BACK - 0.22);
    const top = SHELVES[SHELVES.length - 1] + 0.5;
    const darkWood = std('club-bar', 0.7);
    for (const px of [-3.85, -1.3, 1.3, 3.85]) box(0.2, top - 0.99, 0.34, darkWood, px, (top + 0.99) / 2, SHELF_Z);
    box(7.9, 0.16, 0.36, darkWood, 0, top + 0.08, SHELF_Z);

    this.backMat = new THREE.MeshBasicMaterial({ map: backlight(), toneMapped: false });
    const glass = new THREE.MeshStandardMaterial({ color: hex('club-gin'), roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35 });
    const shelfLo = SHELVES[0] - 0.42;
    for (const bay of BAYS) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(bay.w, top - shelfLo), this.backMat);
      panel.position.set(bay.x, (top + shelfLo) / 2, BACK - 0.03);
      panel.rotation.y = Math.PI;
      g.add(panel);
      SHELVES.forEach((y, k) => {
        box(bay.w, 0.02, 0.3, glass, bay.x, y, SHELF_Z);
        // neon under each shelf's front edge; gold on the top shelf of the centre bay
        const premium = bay.x === 0 && k === SHELVES.length - 1;
        const strip = glow(premium ? 'print-gold' : 'club-shelf-neon', 2.6);
        this.stripMats.push(strip);
        box(bay.w, 0.014, 0.014, strip, bay.x, y - 0.018, SHELF_Z - 0.15);
      });
    }

    // ---- bottles: one instanced mesh per shape, coloured by what's in them
    const rand = rnd(77);
    const shapes = Object.keys(BOTTLES) as Shape[];
    const slots: { shape: Shape; x: number; y: number; z: number; ry: number }[] = [];
    const shelfBottles = (bay: { x: number; w: number }, y: number, premium: boolean) => {
      let bx = bay.x - bay.w / 2 + 0.08;
      while (bx < bay.x + bay.w / 2 - 0.08) {
        // the top shelf is cognac and old whisky, set out with room to breathe
        const shape = premium ? (rand() < 0.5 ? 'round' : 'square') : shapes[Math.floor(rand() * shapes.length)];
        const r = BOTTLES[shape].r;
        bx += r;
        if (bx > bay.x + bay.w / 2 - 0.06) break;
        slots.push({ shape, x: bx, y: y + 0.012, z: SHELF_Z + (rand() - 0.5) * 0.06, ry: (rand() - 0.5) * 0.4 });
        bx += r + (premium ? 0.07 : 0.02 + rand() * 0.03) + (rand() < 0.08 ? 0.12 : 0);
      }
    };
    for (const bay of BAYS) SHELVES.forEach((y, k) => shelfBottles(bay, y, bay.x === 0 && k === SHELVES.length - 1));
    // a few working bottles on the back counter
    for (const bx of [-3.3, -3.18, -2.1, 1.9, 2.02, 3.25]) slots.push({ shape: shapes[Math.floor(rand() * shapes.length)], x: bx, y: 0.99, z: BACK - 0.25, ry: rand() });

    const liquorMat = new THREE.MeshStandardMaterial({ roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.88 });
    const capMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.7 });
    const labelMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
    const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.019, 0.019, 0.035, 10), capMat, slots.length);
    const labels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.004), labelMat, slots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
    for (const shape of shapes) {
      const mine = slots.filter((s) => s.shape === shape);
      if (!mine.length) continue;
      const mesh = new THREE.InstancedMesh(bottleGeometry(shape), liquorMat, mine.length);
      mine.forEach((s, i) => {
        const k = 0.9 + rand() * 0.2;
        q.setFromAxisAngle(up, s.ry);
        m.compose(pos.set(s.x, s.y, s.z), q, scl.set(1, k, 1));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c.setHex(hex(pick(BOTTLES[shape].liquor))));
        const n = slots.indexOf(s);
        const h = BOTTLES[shape].h * k;
        m.compose(pos.set(s.x, s.y + h - 0.012, s.z), q, scl.set(1, 1, 1));
        caps.setMatrixAt(n, m);
        caps.setColorAt(n, c.setHex(hex(pick(BOTTLES[shape].caps))));
        // label on the side facing the room
        const r = BOTTLES[shape].r + 0.003;
        const lh = shape === 'round' ? 0.05 : 0.08;
        m.compose(pos.set(s.x - Math.sin(s.ry) * r, s.y + h * 0.4, s.z - Math.cos(s.ry) * r), q, scl.set(r * 1.3, lh, 1));
        labels.setMatrixAt(n, m);
        labels.setColorAt(n, c.setHex(hex(pick(LABELS))));
      });
      g.add(mesh);
    }
    g.add(caps, labels);

    // cool light off the shelves onto the bartender's back and the counter
    const shelfLight = new THREE.PointLight(hex('club-shelf-neon'), 2.2, 5, 1.5);
    shelfLight.position.set(0, 2.3, 0.6);
    g.add(shelfLight);
    const warm = new THREE.PointLight(hex('club-bar-glow'), 2.5, 6, 1.5);
    warm.position.set(0, 2.0, -0.6);
    g.add(warm);

    // ---- the BAR sign, hung from the ceiling over the counter
    const sign = new THREE.Group();
    sign.position.set(0, 3.55, -0.2);
    g.add(sign);
    this.signMat = new THREE.MeshBasicMaterial({ map: neonSign(), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.33), this.signMat);
    face.rotation.y = Math.PI; // facing the dance floor
    face.renderOrder = 2;
    sign.add(face);
    // mounting rails, transformer and the cables up to the ceiling
    const black = std('black', 0.6, 0.3);
    box(3.0, 0.03, 0.04, black, 0, 0.6, 0.03, sign);
    box(3.0, 0.03, 0.04, black, 0, -0.6, 0.03, sign);
    box(0.3, 0.12, 0.12, black, 0, 0.72, 0.06, sign);
    const cableLen = 6 - (sign.position.y + 0.6);
    for (const cx of [-1.35, 1.35]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, cableLen, 4), black);
      cable.position.set(cx, 0.6 + cableLen / 2, 0.03);
      sign.add(cable);
    }
    this.signLight = new THREE.PointLight(hex('club-neon-bar'), 5, 7, 1.6);
    this.signLight.position.set(0, -0.3, -0.5);
    sign.add(this.signLight);
  }

  /** Neon buzz: the sign drops out now and then; the shelves breathe. */
  update(time: number): void {
    const burst = time % 11.3;
    let k = 1;
    if (burst < 0.45) k = Math.sin(time * 83) > 0.2 ? 1 : 0.18;
    else if (burst > 6 && burst < 6.12) k = 0.35;
    k *= 1 + 0.03 * Math.sin(time * 120); // the hum
    this.signMat.color.setScalar(1.7 * k);
    this.signLight.intensity = 5 * k;
    const breathe = 0.85 + 0.15 * Math.sin(time * 0.5);
    this.backMat.color.setScalar(breathe);
    for (const s of this.stripMats) s.emissiveIntensity = 2.6 * breathe;
  }
}
