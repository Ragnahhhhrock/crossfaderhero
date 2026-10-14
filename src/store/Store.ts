import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { engine } from '../audio/engine';
import { Figures } from '../club/people';
import { alpha, font, hex, hue, token } from '../design/tokens';
import { paletteFor } from '../library/sleeve';
import { floorTexture } from '../room/textures';
import { buildTurntable, type TurntableModel } from '../room/turntableModel';
import type { Track } from '../types';
import { shopSleeve } from './art';
import { counterBoombox, decorateFront, decorateWalls } from './decor';
import type { Bin } from './stock';

/*
 * The record shop. The entrance wall is at z = 0 and the shop runs back
 * towards −z; x runs left–right. The front of the shop (counter on the right,
 * listening station on the left) is fixed; rows of bins fill the floor behind
 * it and the room grows to fit however many bins the player's music needs.
 */

export type StoreTarget = { kind: 'bin'; bin: Bin } | { kind: 'station' } | { kind: 'counter' };
export type StoreViewMode = 'walk' | 'station' | 'counter';

export interface StoreHandlers {
  onFocus: (t: StoreTarget | null) => void;
  onActivate: (t: StoreTarget) => void;
}

const W = 12;
const H = 3.2;
const BIN = { len: 1.25, depth: 0.44, rim: 0.84, tray: 0.22, gap: 0.13 };
const COLS = 7;
const ROW_PITCH = 2.15;
const FRONT = 5.6; // z of the first row of bins (distance from the entrance wall)
const EYE = 1.68;
const RADIUS = 0.3;

const STATION = new THREE.Vector3(-4.2, 0, -1.9);
const COUNTER = new THREE.Vector3(3.9, 0, -1.9);
const COUNTER_SIZE = { w: 2.7, d: 0.8, h: 1.04 };
const TABLE = { w: 1.2, d: 0.8, h: 0.76 };

interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Part of the front of the shop, which survives restocking. */
  fixed?: boolean;
}

const VIEWS: Record<Exclude<StoreViewMode, 'walk'>, Pose> = {
  // looking down onto the turntable from a stool's height, a little above the bottom panel
  station: { x: STATION.x - 0.02, y: 1.36, z: STATION.z + 0.78, yaw: 0, pitch: -0.98 },
  counter: { x: COUNTER.x - 0.4, y: 1.62, z: COUNTER.z + 2.15, yaw: 0.1, pitch: -0.22 },
};

const DOOR = { x: -1.2, w: 1.1 };

const START: Pose = { x: 0.6, y: EYE, z: -1.3, yaw: 0, pitch: -0.05 };

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The label on the front of a bin: genre, filing range and how many records. */
function binLabel(bin: Bin | null, i: number): THREE.CanvasTexture {
  return canvasTex(1024, 180, (g) => {
    const tab = bin ? hue((i * 47) % 360, 0.55, 0.52) : token('graphite-600');
    g.fillStyle = token('print-paper');
    g.fillRect(0, 0, 1024, 180);
    g.fillStyle = tab;
    g.fillRect(0, 0, 40, 180);
    g.fillRect(984, 0, 40, 180);
    g.fillStyle = token('print-ink');
    g.textBaseline = 'middle';
    if (!bin) {
      g.font = font('ui', 70, 700);
      g.fillText('Empty bin', 80, 92);
      return;
    }
    g.font = font('ui', 84, 700);
    let name = bin.genre.toUpperCase();
    while (g.measureText(name).width > 640 && name.length > 3) name = `${name.slice(0, -2)}…`;
    g.fillText(name, 80, 66);
    g.font = font('lcd', 48);
    g.fillStyle = alpha('print-ink', 0.7);
    g.fillText(`${bin.parts > 1 ? `${bin.range}  ·  ` : ''}${bin.tracks.length} records`, 80, 140);
    if (bin.parts > 1) {
      g.textAlign = 'right';
      g.font = font('ui', 96, 700);
      g.fillStyle = tab;
      g.fillText(bin.range, 950, 90);
    }
  });
}

function neonSign(): THREE.CanvasTexture {
  return canvasTex(1024, 256, (g) => {
    g.clearRect(0, 0, 1024, 256);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = token('hot-pink');
    g.shadowBlur = 28;
    g.fillStyle = token('hot-pink');
    g.font = font('ui', 112, 700);
    g.fillText('CROSSFADER', 512, 92);
    g.shadowColor = token('hot-teal');
    g.fillStyle = token('hot-teal');
    g.font = font('ui', 96, 700);
    g.fillText('RECORDS', 512, 196);
    g.shadowBlur = 0;
    g.strokeStyle = alpha('hot-pink', 0.9);
    g.lineWidth = 6;
    g.strokeRect(14, 14, 996, 228);
  });
}

function signTex(lines: string[], colour: string): THREE.CanvasTexture {
  return canvasTex(512, 256, (g) => {
    g.fillStyle = token('print-ink');
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = colour;
    g.lineWidth = 8;
    g.strokeRect(10, 10, 492, 236);
    g.fillStyle = colour;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((l, i) => {
      g.font = font('ui', i === 0 ? 74 : 44, 700);
      g.fillText(l, 256, 80 + i * 84);
    });
  });
}

const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
};

/** The 3D record shop. It reads state from the audio engine; nothing here owns app state. */
export class Store {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly handlers: StoreHandlers;
  /** Everything that depends on the bins (shell, bins, wall display); rebuilt when the stock changes. */
  private dyn = new THREE.Group();
  private clerk!: Figures;
  private turntable!: TurntableModel;
  private boxes: Box[] = [];
  private binSpots: { bin: Bin; x: number; z: number }[] = [];
  private pickables: THREE.Object3D[] = [];
  private bounds = { x0: -W / 2 + 0.45, x1: W / 2 - 0.45, z0: -10, z1: -0.45 };
  private raycaster = new THREE.Raycaster();

  private walk: Pose = { ...START };
  private cur: Pose = { ...START };
  private view: StoreViewMode = 'walk';
  private speakers: { gain: GainNode; pan: StereoPannerNode } | null = null;
  private blocked = false;
  private keys = new Set<string>();
  private focus: StoreTarget | null = null;
  private focusId = '';
  private last = 0;
  private width = 1;
  private height = 1;
  private down: { x: number; y: number; t: number; moved: boolean } | null = null;
  private disposers: (() => void)[] = [];
  private textures: THREE.Texture[] = [];
  private stockToken = 0;

  constructor(canvas: HTMLCanvasElement, handlers: StoreHandlers) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.03, 40);
    this.camera.rotation.order = 'YXZ';
    this.scene.background = new THREE.Color(hex('graphite-950'));
    this.scene.fog = new THREE.Fog(hex('graphite-950'), 14, 34);
    this.scene.add(this.dyn);
    this.buildFixtures();
    this.setBins([]);
    this.bindInput();
    this.applyCamera();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  // ------------------------------------------------------------------ API
  /** The shop speakers by the listening station: their level and pan follow where you stand. */
  setSpeakers(s: { gain: GainNode; pan: StereoPannerNode } | null) {
    this.speakers = s;
  }

  setView(v: StoreViewMode) {
    if (v === this.view) return;
    this.view = v;
    this.keys.clear();
    if (v !== 'walk') this.setFocus(null);
  }

  /** An overlay is open: stop walking and looking. */
  setBlocked(b: boolean) {
    this.blocked = b;
    if (b) this.keys.clear();
  }

  /** (Re)stock the shelves. */
  setBins(bins: Bin[]) {
    this.stockToken++;
    const old = this.dyn.children.slice();
    for (const c of old) {
      this.dyn.remove(c);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          const map = (x as THREE.MeshStandardMaterial).map;
          map?.dispose();
          x.dispose();
        }
      });
    }
    this.boxes = this.boxes.filter((b) => b.fixed);
    this.binSpots = [];
    this.pickables = this.pickables.filter((o) => o.userData.fixed);
    this.buildShell(bins);
  }

  /** The player's focus target after the last frame (for tests and the UI). */
  get target(): StoreTarget | null {
    return this.focus;
  }

  resize() {
    const p = this.canvas.parentElement;
    this.width = Math.max(1, p?.clientWidth ?? window.innerWidth);
    this.height = Math.max(1, p?.clientHeight ?? window.innerHeight);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  /** Jump the walking camera (used by screenshots). */
  teleport(x: number, z: number, yaw = 0, pitch = -0.05) {
    this.walk = { x, y: EYE, z, yaw, pitch };
    if (this.view === 'walk') this.cur = { ...this.walk };
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    for (const d of this.disposers) d();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- scene
  /** The front of the shop: the listening station, the counter and the clerk. These never move. */
  private buildFixtures() {
    const s = this.scene;
    const fixed = (o: THREE.Object3D) => {
      o.userData.fixed = true;
      return o;
    };
    const wood = new THREE.MeshStandardMaterial({ color: hex('room-desk'), roughness: 0.6 });
    const crate = new THREE.MeshStandardMaterial({ color: hex('room-crate'), roughness: 0.8 });
    const metal = new THREE.MeshStandardMaterial({ color: hex('graphite-700'), roughness: 0.4, metalness: 0.6 });
    const black = new THREE.MeshStandardMaterial({ color: hex('graphite-900'), roughness: 0.5 });

    // ---- listening station: a table, a turntable, speakers and headphones
    const st = new THREE.Group();
    st.position.set(STATION.x, 0, STATION.z);
    st.add(box(TABLE.w, 0.05, TABLE.d, wood, 0, TABLE.h - 0.025, 0));
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) st.add(box(0.06, TABLE.h - 0.05, 0.06, metal, lx * (TABLE.w / 2 - 0.07), (TABLE.h - 0.05) / 2, lz * (TABLE.d / 2 - 0.07)));
    this.turntable = buildTurntable('A', 'deck-a');
    this.turntable.group.position.set(-0.05, TABLE.h, 0.02);
    st.add(this.turntable.group);
    for (const sx of [-1, 1]) {
      const spk = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.3, 0.2, 3, 0.02), black);
      spk.position.set(sx * 0.5 + (sx > 0 ? 0.1 : -0.02), TABLE.h + 0.15, -0.18);
      st.add(spk);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 20), new THREE.MeshStandardMaterial({ color: hex('gear-cone'), roughness: 0.7 }));
      cone.rotation.x = Math.PI / 2;
      cone.position.set(spk.position.x, TABLE.h + 0.13, -0.08);
      st.add(cone);
    }
    // headphones hung on a little stand
    const stand = box(0.025, 0.28, 0.025, metal, 0.5, TABLE.h + 0.14, 0.2);
    st.add(stand);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 8, 20, Math.PI), black);
    band.position.set(0.5, TABLE.h + 0.33, 0.2);
    st.add(band);
    for (const sx of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16), black);
      cup.rotation.z = Math.PI / 2;
      cup.position.set(0.5 + sx * 0.08, TABLE.h + 0.31, 0.2);
      st.add(cup);
    }
    const stationSign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshBasicMaterial({ map: signTex(['LISTEN', 'try before you buy'], token('hot-teal')) }));
    stationSign.position.set(0, 1.85, -0.38);
    st.add(stationSign);
    st.userData.target = { kind: 'station' } satisfies StoreTarget;
    st.traverse((o) => (o.userData.fixed = true));
    s.add(fixed(st));
    this.pickables.push(st);
    this.boxes.push({ x0: STATION.x - TABLE.w / 2 - RADIUS, x1: STATION.x + TABLE.w / 2 + RADIUS, z0: STATION.z - TABLE.d / 2 - RADIUS, z1: STATION.z + TABLE.d / 2 + RADIUS, fixed: true });

    // ---- counter with a till, a card reader and a stack of paper bags; the clerk stands behind it
    const ct = new THREE.Group();
    ct.position.set(COUNTER.x, 0, COUNTER.z);
    ct.add(box(COUNTER_SIZE.w, COUNTER_SIZE.h - 0.05, COUNTER_SIZE.d, crate, 0, (COUNTER_SIZE.h - 0.05) / 2, 0));
    ct.add(box(COUNTER_SIZE.w + 0.08, 0.05, COUNTER_SIZE.d + 0.08, wood, 0, COUNTER_SIZE.h - 0.025, 0));
    const till = box(0.36, 0.1, 0.32, black, -0.5, COUNTER_SIZE.h + 0.05, -0.1);
    ct.add(till);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.14), new THREE.MeshStandardMaterial({ color: hex('black'), emissive: new THREE.Color(hex('lcd-bg')), emissiveIntensity: 1.2 }));
    screen.position.set(-0.5, COUNTER_SIZE.h + 0.22, -0.1);
    screen.rotation.x = -0.3;
    ct.add(screen);
    ct.add(box(0.03, 0.14, 0.03, metal, -0.5, COUNTER_SIZE.h + 0.15, -0.14));
    for (let i = 0; i < 4; i++) ct.add(box(0.26, 0.012, 0.18, new THREE.MeshStandardMaterial({ color: hex('print-paper'), roughness: 1 }), 0.55, COUNTER_SIZE.h + 0.006 + i * 0.012, -0.05));
    const reader = box(0.09, 0.02, 0.14, black, 0.1, COUNTER_SIZE.h + 0.01, 0.2);
    ct.add(reader);
    const radio = counterBoombox();
    radio.position.set(-1.05, COUNTER_SIZE.h, 0.05);
    ct.add(radio);
    const counterSign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshBasicMaterial({ map: signTex(['PAY HERE', 'cash or card'], token('print-sun')) }));
    counterSign.position.set(0.8, 2.0, -0.2);
    ct.add(counterSign);
    ct.userData.target = { kind: 'counter' } satisfies StoreTarget;
    ct.traverse((o) => (o.userData.fixed = true));
    s.add(fixed(ct));
    this.pickables.push(ct);
    this.boxes.push({ x0: COUNTER.x - COUNTER_SIZE.w / 2 - RADIUS, x1: COUNTER.x + COUNTER_SIZE.w / 2 + RADIUS, z0: COUNTER.z - COUNTER_SIZE.d / 2 - RADIUS - 0.7, z1: COUNTER.z + COUNTER_SIZE.d / 2 + RADIUS, fixed: true });

    this.clerk = new Figures([{ x: COUNTER.x + 0.2, y: 0, z: COUNTER.z - 0.75, yaw: 0, scale: 1, style: 'clerk', phase: 0, r: 0.3 }], 41, 'staff');
    this.clerk.group.userData.target = { kind: 'counter' } satisfies StoreTarget;
    s.add(this.clerk.group);

    // ---- posters, the events board, the vintage-audio shelves and the display case by the door
    const front = new THREE.Group();
    for (const b of decorateFront(front, { W, D: 0 }, DOOR)) this.boxes.push({ ...b, fixed: true });
    s.add(front);

    // ---- lights for the front of the shop
    const warm = new THREE.PointLight(hex('room-lamp'), 9, 11, 1.6);
    warm.position.set(0, H - 0.9, -2.5);
    s.add(warm);
    const spot = new THREE.SpotLight(hex('room-lamp-hot'), 16, 5, 0.7, 0.6, 1.4);
    spot.position.set(STATION.x, H - 0.2, STATION.z + 0.9);
    spot.target.position.set(STATION.x, TABLE.h, STATION.z);
    s.add(spot, spot.target);
    const spot2 = new THREE.SpotLight(hex('room-lamp-hot'), 14, 5.5, 0.7, 0.6, 1.4);
    spot2.position.set(COUNTER.x, H - 0.2, COUNTER.z + 0.8);
    spot2.target.position.set(COUNTER.x, COUNTER_SIZE.h, COUNTER.z);
    s.add(spot2, spot2.target);
  }

  /** Floor, walls, ceiling, the rows of bins and the wall of new arrivals, for the current stock. */
  private buildShell(bins: Bin[]) {
    const g = this.dyn;
    const spots = bins.length ? bins : (Array.from({ length: COLS * 2 }, () => null) as (Bin | null)[]);
    const rows = Math.ceil(spots.length / COLS);
    const D = FRONT + (rows - 1) * ROW_PITCH + 3.2;
    this.bounds = { x0: -W / 2 + 0.45, x1: W / 2 - 0.45, z0: -D + 0.5, z1: -0.45 };

    // ---- shell
    const floorTex = floorTexture();
    floorTex.repeat.set(W / 1.25, D / 1.25);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -D / 2);
    g.add(floor);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: hex('graphite-850'), roughness: 1 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, H, -D / 2);
    g.add(ceiling);
    const wallMat = new THREE.MeshStandardMaterial({ color: hex('room-wall'), roughness: 0.95 });
    const accent = new THREE.MeshStandardMaterial({ color: hex('room-wall-accent'), roughness: 0.95 });
    const wall = (width: number, mat: THREE.Material, x: number, z: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(width, H), mat);
      m.position.set(x, H / 2, z);
      m.rotation.y = ry;
      g.add(m);
    };
    wall(W, wallMat, 0, 0, Math.PI); // entrance wall, facing in
    wall(W, accent, 0, -D, 0); // back wall
    wall(D, wallMat, -W / 2, -D / 2, Math.PI / 2);
    wall(D, wallMat, W / 2, -D / 2, -Math.PI / 2);
    const trim = new THREE.MeshStandardMaterial({ color: hex('room-trim'), roughness: 0.6 });
    for (const [len, x, z, ry] of [[W, 0, -0.01, 0], [W, 0, -D + 0.01, 0], [D, -W / 2 + 0.01, -D / 2, Math.PI / 2], [D, W / 2 - 0.01, -D / 2, Math.PI / 2]] as const) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.02), trim);
      m.position.set(x, 0.05, z);
      m.rotation.y = ry;
      g.add(m);
    }
    // the shop door: a glass-panelled door in the entrance wall, with an OPEN sign
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.3), new THREE.MeshStandardMaterial({ color: hex('room-sky-low'), emissive: new THREE.Color(hex('room-sky-top')), emissiveIntensity: 0.6, roughness: 0.2 }));
    door.position.set(DOOR.x, 1.15, -0.012);
    door.rotation.y = Math.PI;
    g.add(door);
    const open = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.23), new THREE.MeshBasicMaterial({ map: signTex(['OPEN'], token('hot-teal')) }));
    open.position.set(DOOR.x, 1.55, -0.02);
    open.rotation.y = Math.PI;
    g.add(open);

    // ceiling light panels and lights down the shop
    const tube = new THREE.MeshStandardMaterial({ color: hex('white'), emissive: new THREE.Color(hex('room-lamp')), emissiveIntensity: 1.6 });
    for (let z = -1.5; z > -D; z -= 2.6) for (const x of [-3.6, 0, 3.6]) g.add(box(1.4, 0.04, 0.12, tube, x, H - 0.03, z));
    // a handful of warm lights down the middle (every light costs every pixel, so not one per row)
    const nLights = Math.min(5, Math.max(1, Math.round((D - FRONT) / 3.6)));
    for (let i = 0; i < nLights; i++) {
      const l = new THREE.PointLight(hex('room-lamp'), 10, 10, 1.6);
      l.position.set(0, H - 1.0, -FRONT - 0.4 - (i * (D - FRONT - 1.4)) / Math.max(1, nLights - 1 || 1));
      g.add(l);
    }
    g.add(new THREE.HemisphereLight(hex('room-fill-sky'), hex('room-fill-ground'), 0.9));

    // neon on the back wall; posters, line-ups and framed memorabilia round the walls
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: neonSign(), transparent: true }));
    neon.position.set(0, 2.45, -D + 0.02);
    g.add(neon);
    const span = Math.min(6, D - 4);
    const display = bins.length ? { z0: -FRONT + 1.2, z1: -FRONT + 1.2 - span } : null;
    for (const b of decorateWalls(g, { W, D }, display)) this.boxes.push(b);

    // ---- bins
    const trayMat = new THREE.MeshStandardMaterial({ color: hex('room-crate'), roughness: 0.8 });
    const legMat = new THREE.MeshStandardMaterial({ color: hex('graphite-800'), roughness: 0.5, metalness: 0.4 });
    const sleeveMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const sleeveGeo = new THREE.BoxGeometry(0.0105, 0.31, 0.31);
    const tmp = new THREE.Object3D();
    const colour = new THREE.Color();
    spots.forEach((bin, i) => {
      const row = Math.floor(i / COLS);
      const inRow = Math.min(COLS, spots.length - row * COLS);
      const col = i % COLS;
      const x = (col - (inRow - 1) / 2) * (BIN.len + BIN.gap);
      const z = -FRONT - row * ROW_PITCH;
      const bg = new THREE.Group();
      bg.position.set(x, 0, z);
      bg.add(box(BIN.len, BIN.tray, BIN.depth, trayMat, 0, BIN.rim - BIN.tray / 2, 0));
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bg.add(box(0.04, BIN.rim - BIN.tray, 0.04, legMat, lx * (BIN.len / 2 - 0.06), (BIN.rim - BIN.tray) / 2, lz * (BIN.depth / 2 - 0.05)));
      // the label on the shopper's side, and one on the far side
      const labelTex = binLabel(bin, i);
      this.textures.push(labelTex);
      const labelMat = new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.8 });
      const label = new THREE.Mesh(new THREE.PlaneGeometry(BIN.len - 0.06, 0.17), labelMat);
      label.position.set(0, BIN.rim - BIN.tray / 2, BIN.depth / 2 + 0.002);
      bg.add(label);
      const back = label.clone();
      back.position.z = -BIN.depth / 2 - 0.002;
      back.rotation.y = Math.PI;
      bg.add(back);
      if (bin) {
        // the records, standing in the bin, leaning towards you
        const n = bin.tracks.length;
        const step = Math.min(0.0118, (BIN.len - 0.1) / Math.max(n, 1));
        const im = new THREE.InstancedMesh(sleeveGeo, sleeveMat, n);
        for (let k = 0; k < n; k++) {
          tmp.position.set(-BIN.len / 2 + 0.05 + k * step, BIN.rim - BIN.tray + 0.155, 0.01);
          tmp.rotation.set(0, 0, 0);
          tmp.rotation.z = -0.06 + ((k * 7) % 5) * 0.004;
          tmp.updateMatrix();
          im.setMatrixAt(k, tmp.matrix);
          const [bgTok, , accentTok] = paletteFor(bin.tracks[k]);
          colour.set(token(k % 3 === 0 ? accentTok : bgTok)).multiplyScalar(0.8 + ((k * 13) % 7) * 0.05);
          im.setColorAt(k, colour);
        }
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        bg.add(im);
        // a click anywhere on the bin digs it
        bg.userData.target = { kind: 'bin', bin } satisfies StoreTarget;
        this.pickables.push(bg);
        this.binSpots.push({ bin, x, z });
      }
      g.add(bg);
      this.boxes.push({ x0: x - BIN.len / 2 - RADIUS, x1: x + BIN.len / 2 + RADIUS, z0: z - BIN.depth / 2 - RADIUS, z1: z + BIN.depth / 2 + RADIUS });
    });

    this.wallDisplay(bins, D);
  }

  /** A display wall of new arrivals on the east side, with real covers where the files have them. */
  private wallDisplay(bins: Bin[], D: number) {
    const all: Track[] = bins.flatMap((b) => b.tracks);
    if (!all.length) return;
    // records with cover art first, a few from each genre
    const withArt = all.filter((t) => t.artworkUrl);
    const picks = (withArt.length >= 12 ? withArt : [...withArt, ...all.filter((t) => !t.artworkUrl)]).slice(0, 12);
    const token0 = this.stockToken;
    const shelfMat = new THREE.MeshStandardMaterial({ color: hex('room-crate'), roughness: 0.8 });
    const z0 = -FRONT + 1.2; // keep in step with the display gap in buildShell
    const span = Math.min(6, D - 4);
    const per = Math.max(1, Math.floor(span / 0.4));
    for (let r = 0; r < 2; r++) {
      const shelf = box(span, 0.03, 0.12, shelfMat, 0, 0, 0);
      shelf.position.set(W / 2 - 0.07, 1.25 + r * 0.55, z0 - span / 2);
      shelf.rotation.y = Math.PI / 2;
      this.dyn.add(shelf);
    }
    picks.forEach((t, i) => {
      const r = Math.floor(i / per);
      if (r > 1) return;
      const c = i % per;
      const mat = new THREE.MeshStandardMaterial({ color: hex('graphite-700'), roughness: 0.7 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.31), mat);
      m.position.set(W / 2 - 0.1, 1.25 + r * 0.55 + 0.165, z0 - 0.25 - c * 0.4);
      m.rotation.set(-0.12, -Math.PI / 2, 0, 'YXZ');
      this.dyn.add(m);
      void shopSleeve(t, 256).then((url) => {
        if (token0 !== this.stockToken) return;
        new THREE.TextureLoader().load(url, (tex) => {
          if (token0 !== this.stockToken) return tex.dispose();
          tex.colorSpace = THREE.SRGBColorSpace;
          mat.map = tex;
          mat.color.set(hex('white'));
          mat.needsUpdate = true;
        });
      });
    });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: signTex(['NEW IN'], token('hot-pink')) }));
    label.position.set(W / 2 - 0.03, 2.25, z0 - span / 2);
    label.rotation.y = -Math.PI / 2;
    this.dyn.add(label);
  }

  // ---------------------------------------------------------------- input
  private bindInput() {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey || this.blocked) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        this.keys.add(k);
        if (k.startsWith('arrow')) e.preventDefault();
      } else if ((k === 'e' || k === 'enter') && !e.repeat && this.view === 'walk' && (e.target as HTMLElement).tagName !== 'BUTTON') {
        // look again at what's in reach right now, in case a slow frame hasn't caught up
        this.updateFocus();
        if (!this.focus) return;
        e.preventDefault();
        this.handlers.onActivate(this.focus);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    const onBlur = () => this.keys.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    const c = this.canvas;
    const onDown = (e: PointerEvent) => {
      this.down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
      c.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const d = this.down;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
      if (this.blocked || this.view !== 'walk') return;
      this.walk.yaw -= (e.movementX || 0) * 0.0032;
      this.walk.pitch = Math.max(-1.2, Math.min(1.1, this.walk.pitch - (e.movementY || 0) * 0.0032));
    };
    const onUp = (e: PointerEvent) => {
      const d = this.down;
      this.down = null;
      c.releasePointerCapture?.(e.pointerId);
      if (!d || d.moved || this.blocked || this.view !== 'walk' || performance.now() - d.t > 450) return;
      const t = this.pick(e.clientX, e.clientY);
      if (t) this.handlers.onActivate(t);
    };
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    const ro = new ResizeObserver(() => this.resize());
    if (c.parentElement) ro.observe(c.parentElement);
    this.resize();
    this.disposers.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      c.removeEventListener('pointerdown', onDown);
      c.removeEventListener('pointermove', onMove);
      c.removeEventListener('pointerup', onUp);
      ro.disconnect();
    });
  }

  /** What's under the pointer, if it's close enough to reach. */
  private pick(cx: number, cy: number): StoreTarget | null {
    const r = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.camera);
    const hits = this.raycaster.intersectObjects([...this.pickables, this.clerk.group], true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        const t = o.userData.target as StoreTarget | undefined;
        if (t) return h.distance <= 3.4 ? t : null;
        o = o.parent;
      }
    }
    return null;
  }

  private setFocus(t: StoreTarget | null) {
    const id = !t ? '' : t.kind === 'bin' ? `bin:${t.bin.id}` : t.kind;
    if (id === this.focusId) return;
    this.focusId = id;
    this.focus = t;
    this.handlers.onFocus(t);
  }

  // ----------------------------------------------------------------- loop
  private frame(ms: number) {
    const dt = Math.min(0.05, this.last ? (ms - this.last) / 1000 : 0.016);
    this.last = ms;
    if (this.view === 'walk' && !this.blocked) this.move(dt);
    this.updateFocus();

    // glide the camera
    const target = this.view === 'walk' ? this.walk : VIEWS[this.view];
    const k = this.view === 'walk' && Math.abs(this.cur.x - this.walk.x) + Math.abs(this.cur.z - this.walk.z) < 0.02 ? 1 : 1 - Math.exp(-dt * 6);
    const c = this.cur;
    c.x += (target.x - c.x) * k;
    c.y += (target.y - c.y) * k;
    c.z += (target.z - c.z) * k;
    c.yaw += wrap(target.yaw - c.yaw) * k;
    c.pitch += (target.pitch - c.pitch) * k;
    this.applyCamera();

    const t = ms / 1000;
    this.clerk.update(0, 0.5, t, 100);
    this.turntable.update(engine.turntables.A, ms);
    this.mixSpeakers();
    this.renderer.render(this.scene, this.camera);
  }

  private move(dt: number) {
    const k = this.keys;
    const fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const side = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
    const turn = (k.has('arrowleft') ? 1 : 0) - (k.has('arrowright') ? 1 : 0);
    const p = this.walk;
    p.yaw += turn * 1.8 * dt;
    if (!fwd && !side) return;
    const speed = (k.has('shift') ? 3.6 : 1.9) * dt;
    const len = Math.hypot(fwd, side) || 1;
    const sx = Math.sin(p.yaw);
    const cz = Math.cos(p.yaw);
    // forward is −z rotated by yaw
    let nx = p.x + ((-sx * fwd + cz * side) / len) * speed;
    let nz = p.z + ((-cz * fwd - sx * side) / len) * speed;
    nx = Math.max(this.bounds.x0, Math.min(this.bounds.x1, nx));
    nz = Math.max(this.bounds.z0, Math.min(this.bounds.z1, nz));
    // slide along furniture: try each axis on its own
    if (!this.blockedAt(nx, p.z)) p.x = nx;
    if (!this.blockedAt(p.x, nz)) p.z = nz;
  }

  private blockedAt(x: number, z: number): boolean {
    return this.boxes.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
  }

  private updateFocus() {
    if (this.view !== 'walk' || this.blocked) return this.setFocus(this.view === 'walk' ? this.focus : null);
    const { x, z } = this.walk;
    let best: StoreTarget | null = null;
    let bestD = Infinity;
    const consider = (t: StoreTarget, d: number, reach: number) => {
      if (d < reach && d < bestD) {
        best = t;
        bestD = d;
      }
    };
    for (const s of this.binSpots) {
      const dx = Math.max(Math.abs(x - s.x) - BIN.len / 2, 0);
      const dz = Math.max(Math.abs(z - s.z) - BIN.depth / 2, 0);
      consider({ kind: 'bin', bin: s.bin }, Math.hypot(dx, dz), 0.85);
    }
    consider({ kind: 'station' }, Math.hypot(x - STATION.x, z - STATION.z) - 0.5, 1.45);
    consider({ kind: 'counter' }, Math.hypot(Math.max(Math.abs(x - COUNTER.x) - COUNTER_SIZE.w / 2, 0), z - COUNTER.z - COUNTER_SIZE.d / 2), 1.5);
    this.setFocus(best);
  }

  /** Quieter the further you wander from the station (never silent), panned to where it is. */
  private mixSpeakers() {
    const sp = this.speakers;
    if (!sp) return;
    const c = this.cur;
    const dx = STATION.x - c.x;
    const dz = STATION.z - c.z;
    const d = Math.hypot(dx, dz);
    const level = d < 1.2 ? 1 : Math.max(0.22, 1 / (1 + (d - 1.2) * 0.45));
    // angle of the station relative to where you're facing (forward is −z rotated by yaw)
    const rel = Math.atan2(-dx, -dz) - c.yaw;
    const pan = d < 1.2 ? 0 : -Math.sin(rel) * Math.min(1, (d - 1.2) / 2) * 0.7;
    const now = engine.ctx.currentTime;
    sp.gain.gain.setTargetAtTime(level, now, 0.08);
    sp.pan.pan.setTargetAtTime(pan, now, 0.08);
  }

  private applyCamera() {
    const c = this.cur;
    this.camera.position.set(c.x, c.y, c.z);
    this.camera.rotation.set(c.pitch, c.yaw, 0);
  }
}
