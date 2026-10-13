import * as THREE from 'three';
import { hex } from '../design/tokens';

/** How a figure moves. */
export type Style = 'bounce' | 'pump' | 'handsUp' | 'sway' | 'dancer' | 'dj';

export interface Person {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  style: Style;
  phase: number;
  /** Per-person randomness 0..1 so the crowd isn't in lock-step. */
  r: number;
}

/** A pose for one frame: offsets and joint angles in radians. */
interface Pose {
  lift: number; // whole figure leaves the floor (jumps)
  dip: number; // knees bend, metres
  yaw: number;
  lean: number;
  armL: [number, number]; // [raise forward/up, swing out]
  armR: [number, number];
  nod: number;
}

const SKINS = ['club-skin-1', 'club-skin-2', 'club-skin-3', 'club-skin-4', 'club-skin-5'];
const HAIR = ['club-hair-1', 'club-hair-1', 'club-hair-2', 'club-hair-3'];
const TOPS = ['print-ink', 'graphite-600', 'ink-100', 'print-red', 'print-magenta', 'deck-a', 'hot-teal', 'print-violet', 'print-sun', 'print-plum-light', 'sleeve-white', 'hot-pink'];
const LEGS = ['print-ink', 'club-denim', 'club-denim', 'graphite-500', 'club-khaki', 'print-ink'];
const DANCER_TOPS = ['hot-yellow', 'hot-pink', 'deck-a', 'play'];

const LEG_H = 0.85;
const SHOULDER_Y = 1.42;
const ARM_L = 0.62;

const tmp = new THREE.Matrix4();
const m = new THREE.Matrix4();
const v = new THREE.Vector3();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const s = new THREE.Vector3();

function rnd(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0; // mulberry32
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A set of low-poly people drawn as instanced meshes (one draw call per body
 * part however many people there are), animated to the beat.
 */
export class Figures {
  readonly group = new THREE.Group();
  readonly people: Person[];
  private parts: Record<'legL' | 'legR' | 'torso' | 'head' | 'hair' | 'armL' | 'armR', THREE.InstancedMesh>;
  private visibleCount: number;

  constructor(people: Person[], seed: number, dancerOutfits = false) {
    this.people = people;
    this.visibleCount = people.length;
    const n = people.length;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 });
    const shiny = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.4 });
    const mk = (geo: THREE.BufferGeometry, material = mat) => {
      const im = new THREE.InstancedMesh(geo, material, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      this.group.add(im);
      return im;
    };
    const legGeo = new THREE.BoxGeometry(0.13, LEG_H, 0.15).translate(0, LEG_H / 2, 0);
    const armGeo = new THREE.BoxGeometry(0.085, ARM_L, 0.085).translate(0, -ARM_L / 2 + 0.03, 0);
    this.parts = {
      legL: mk(legGeo),
      legR: mk(legGeo),
      torso: mk(new THREE.BoxGeometry(0.38, 0.6, 0.22), dancerOutfits ? shiny : mat),
      head: mk(new THREE.SphereGeometry(0.11, 12, 10)),
      hair: mk(new THREE.SphereGeometry(0.118, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)),
      armL: mk(armGeo),
      armR: mk(armGeo),
    };

    const rand = rnd(seed);
    const c = new THREE.Color();
    const pick = (list: string[]) => list[Math.floor(rand() * list.length)];
    people.forEach((_, i) => {
      const skin = hex(pick(SKINS));
      const top = hex(dancerOutfits ? DANCER_TOPS[i % DANCER_TOPS.length] : pick(TOPS));
      const legs = hex(dancerOutfits ? 'print-ink' : pick(LEGS));
      this.parts.head.setColorAt(i, c.setHex(skin));
      this.parts.hair.setColorAt(i, c.setHex(hex(pick(HAIR))));
      this.parts.torso.setColorAt(i, c.setHex(top));
      // short sleeves half the time: arms show skin
      const sleeve = dancerOutfits || rand() < 0.5 ? skin : top;
      this.parts.armL.setColorAt(i, c.setHex(sleeve));
      this.parts.armR.setColorAt(i, c.setHex(sleeve));
      this.parts.legL.setColorAt(i, c.setHex(dancerOutfits ? skin : legs));
      this.parts.legR.setColorAt(i, c.setHex(dancerOutfits ? skin : legs));
    });
    for (const p of Object.values(this.parts)) if (p.instanceColor) p.instanceColor.needsUpdate = true;
  }

  /** Show the first n people (they're sorted front-of-floor first). */
  setCount(n: number): void {
    this.visibleCount = Math.max(0, Math.min(this.people.length, Math.round(n)));
    for (const p of Object.values(this.parts)) p.count = this.visibleCount;
  }

  /**
   * @param beats  continuous beat count (1 per beat)
   * @param energy 0 = chilled, 1 = normal, 1.6 = the drop
   */
  update(beats: number, energy: number, time: number): void {
    for (let i = 0; i < this.visibleCount; i++) {
      const p = this.people[i];
      const pose = poseFor(p, beats + p.phase, energy, time);
      this.place(i, p, pose);
    }
    for (const part of Object.values(this.parts)) part.instanceMatrix.needsUpdate = true;
  }

  private place(i: number, p: Person, pose: Pose): void {
    // root: position on the floor, facing, size
    const root = new THREE.Matrix4().compose(
      v.set(p.x, p.y + pose.lift, p.z),
      q.setFromEuler(e.set(0, p.yaw + pose.yaw, 0)),
      s.setScalar(p.scale),
    );
    const legScale = (LEG_H - pose.dip) / LEG_H;
    for (const [part, x] of [
      [this.parts.legL, -0.095],
      [this.parts.legR, 0.095],
    ] as const) {
      m.compose(v.set(x, 0, 0), q.identity(), s.set(1, legScale, 1));
      part.setMatrixAt(i, tmp.multiplyMatrices(root, m));
    }
    // upper body: dips with the knees, leans with the groove
    const upper = new THREE.Matrix4().compose(v.set(0, LEG_H - pose.dip, 0), q.setFromEuler(e.set(pose.lean, 0, 0)), s.set(1, 1, 1));
    const body = new THREE.Matrix4().multiplyMatrices(root, upper);
    m.makeTranslation(0, 0.3, 0);
    this.parts.torso.setMatrixAt(i, tmp.multiplyMatrices(body, m));
    const head = new THREE.Matrix4().compose(v.set(0, 0.75, 0), q.setFromEuler(e.set(pose.nod, 0, 0)), s.set(1, 1, 1));
    const headM = new THREE.Matrix4().multiplyMatrices(body, head);
    this.parts.head.setMatrixAt(i, headM);
    m.makeTranslation(0, 0.025, -0.012);
    this.parts.hair.setMatrixAt(i, tmp.multiplyMatrices(headM, m));
    for (const [part, side, arm] of [
      [this.parts.armL, -1, pose.armL],
      [this.parts.armR, 1, pose.armR],
    ] as const) {
      // shoulder joint: raise forwards/up around x, swing out around z
      m.compose(v.set(side * 0.235, SHOULDER_Y - LEG_H, 0), q.setFromEuler(e.set(-arm[0], 0, side * arm[1], 'XZY')), s.set(1, 1, 1));
      part.setMatrixAt(i, tmp.multiplyMatrices(body, m));
    }
  }
}

const TAU = Math.PI * 2;

function poseFor(p: Person, beats: number, energy: number, time: number): Pose {
  const ph = beats % 1; // position within the beat
  const hit = Math.pow(1 - ph, 3); // spikes on each beat, decays
  const bounce = Math.abs(Math.sin(beats * Math.PI)); // 1 bounce per beat
  const bar = (beats / 4) % 1;
  const pose: Pose = { lift: 0, dip: 0, yaw: 0, lean: 0, armL: [0.15, 0.08], armR: [0.15, 0.08], nod: 0 };
  const en = Math.max(0, energy);
  // at high energy more of the crowd puts their hands up
  let style = p.style;
  if (energy > 1.2 && p.r > 0.35 && style !== 'dancer' && style !== 'dj') style = p.r > 0.7 ? 'handsUp' : 'pump';
  if (energy < 0.25 && style !== 'dj') style = 'sway';

  switch (style) {
    case 'bounce':
      pose.dip = 0.07 * bounce * en;
      pose.nod = 0.15 * bounce * en;
      pose.armL = [0.5 + 0.3 * bounce, 0.15];
      pose.armR = [0.5 + 0.3 * bounce, 0.15];
      break;
    case 'pump':
      pose.dip = 0.06 * bounce * en;
      pose.nod = 0.12 * bounce;
      pose.armR = [2.4 + 0.55 * hit * en, 0.15];
      pose.armL = [0.4 + 0.2 * bounce, 0.1];
      if (p.r > 0.85) pose.armL = [2.4 + 0.55 * hit * en, 0.15];
      break;
    case 'handsUp': {
      const sw = Math.sin(beats * Math.PI * 0.5) * 0.35;
      pose.dip = 0.05 * bounce * en;
      pose.armL = [2.9, 0.25 + sw];
      pose.armR = [2.9, 0.25 - sw];
      pose.lean = -0.08;
      break;
    }
    case 'sway': {
      const sw = Math.sin(beats * Math.PI * 0.5 + p.r * TAU);
      pose.yaw = sw * 0.25;
      pose.dip = 0.03 * bounce;
      pose.armL = [0.35, 0.2 + 0.1 * sw];
      pose.armR = [0.35, 0.2 - 0.1 * sw];
      pose.nod = 0.05 * bounce;
      break;
    }
    case 'dancer': {
      const sw = Math.sin(beats * Math.PI);
      const wave = beats * Math.PI * 0.5;
      pose.yaw = sw * 0.45 + Math.sin(time * 0.3 + p.r * 6) * 0.6;
      pose.dip = 0.1 * bounce;
      pose.lean = 0.05 * Math.sin(wave);
      pose.armL = [1.6 + 1.3 * Math.sin(wave), 0.4 + 0.5 * Math.max(0, Math.cos(wave))];
      pose.armR = [1.6 - 1.3 * Math.sin(wave), 0.4 + 0.5 * Math.max(0, -Math.cos(wave))];
      if (bar > 0.75 && en > 1.2) {
        pose.armL = [3.0, 0.35];
        pose.armR = [3.0, 0.35];
      }
      break;
    }
    case 'dj':
      pose.nod = 0.22 * bounce;
      pose.dip = 0.03 * bounce;
      pose.lean = 0.12;
      pose.armL = [1.05 + 0.08 * Math.sin(time * 1.7), 0.22];
      pose.armR = [1.05 + 0.1 * Math.sin(time * 2.3 + 1), 0.22];
      // hand in the air for the last beat of every 4th bar, both on the drop
      if ((beats / 16) % 1 > 0.94) pose.armR = [2.95, 0.2];
      if (en > 1.2 && bar < 0.25) pose.armL = [2.95, 0.2];
      break;
  }
  // big moments: the floor jumps
  if (energy > 1.2 && p.style !== 'dj') pose.lift = 0.22 * Math.max(0, Math.sin(ph * Math.PI)) * (0.6 + 0.4 * p.r);
  return pose;
}

/**
 * Slots for a crowd on the dance floor: a jittered grid, front rows (nearest
 * the stage) first so a small crowd still packs the front.
 */
export function crowdSlots(n: number, area: { x0: number; x1: number; z0: number; z1: number }, stage: THREE.Vector3, seed: number): Person[] {
  const rand = rnd(seed);
  const cols = 9;
  const rows = Math.ceil(n / cols) + 1;
  const dx = (area.x1 - area.x0) / cols;
  const dz = (area.z1 - area.z0) / rows;
  const slots: Person[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = area.x0 + (c + 0.5) * dx + (rand() - 0.5) * dx * 0.55;
      const z = area.z0 + (r + 0.5) * dz + (rand() - 0.5) * dz * 0.55;
      const styles: Style[] = ['bounce', 'bounce', 'pump', 'handsUp', 'sway', 'bounce'];
      const yawToStage = Math.atan2(stage.x - x, stage.z - z);
      slots.push({
        x,
        y: 0,
        z,
        yaw: yawToStage + (rand() - 0.5) * 0.5,
        scale: 0.9 + rand() * 0.18,
        style: styles[Math.floor(rand() * styles.length)],
        phase: (rand() - 0.5) * 0.12,
        r: rand(),
      });
    }
  // front of the floor fills first, a bit of shuffle so it isn't row by row
  slots.sort((a, b) => a.z + a.r * 1.2 - (b.z + b.r * 1.2));
  return slots.slice(0, n);
}
