import * as THREE from 'three';
import { hex } from '../design/tokens';
import { MUSICS, type Music } from './music';

/** How a figure moves. The crowd's own style flavours whatever the music asks for. */
export type Style = 'bounce' | 'pump' | 'handsUp' | 'sway' | 'dancer' | 'dj' | 'bartender' | 'clerk';

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

/** Who's dancing: the crowd dresses once; podium dancers change outfit with the music. */
export type FigureKind = 'crowd' | 'dancers' | 'dj' | 'staff';

/** A pose for one frame: offsets and joint angles in radians. */
interface Pose {
  lift: number; // whole figure leaves the floor (jumps)
  dip: number; // knees bend, metres
  shift: number; // side step, metres
  yaw: number;
  lean: number; // forwards (+) / back
  roll: number; // hips and shoulders tilt side to side
  armL: [number, number]; // [raise forward/up, swing out]
  armR: [number, number];
  nod: number;
}

export type Cut = 'short' | 'long' | 'afro' | 'bun' | 'ponytail' | 'mohawk' | 'buzz' | 'bald';
export type Hat = 'none' | 'cap' | 'beanie' | 'bucket';
export type Sleeves = 'long' | 'short' | 'none';
export type Facial = 'none' | 'stubble' | 'moustache' | 'goatee' | 'beard';

/** The person: face, build, hair, ink and metal. Never changes. */
export interface Look {
  skin: string;
  hair: string;
  cut: Cut;
  legH: number;
  torsoW: number;
  torsoH: number;
  torsoD: number;
  headS: number;
  armS: number;
  eyeGap: number;
  eyeS: number;
  noseS: [number, number];
  mouthW: number;
  brows: boolean;
  browTilt: number;
  facial: Facial;
  glasses: boolean;
  /** Ear L, ear R, nose, eyebrow, lip. */
  studs: [boolean, boolean, boolean, boolean, boolean];
  metal: string;
  /** Tattoo coverage down each arm, 0 = none, ~1 = full sleeve. */
  tatL: number;
  tatR: number;
  ink: string;
  /** How hard they go, 0.6..1.3. */
  vigour: number;
  /** Hoops instead of studs in the ears. */
  hoops?: boolean;
  /** Limb thickness, 1 = average. */
  bulk?: number;
}

/** What they're wearing. */
export interface Outfit {
  top: string;
  topW: number;
  sleeves: Sleeves;
  legs: string;
  shorts: boolean;
  baggy: boolean;
  shoes: string;
  hat: Hat;
  hatC: string;
  shades: boolean;
  /** A hoodie's hood behind the neck. */
  hood?: boolean;
  boots?: boolean;
}

const SKINS = ['club-skin-1', 'club-skin-2', 'club-skin-3', 'club-skin-4', 'club-skin-5', 'club-skin-6', 'club-skin-7', 'club-skin-8', 'club-skin-9', 'club-skin-10'];
const HAIR_NATURAL = ['club-hair-1', 'club-hair-1', 'club-hair-1', 'club-hair-2', 'club-hair-2', 'club-hair-3', 'club-hair-4', 'club-hair-5'];
const HAIR_DYED = ['club-hair-6', 'club-hair-7', 'club-hair-8', 'club-hair-9', 'club-hair-10', 'print-red'];
const CUTS: Cut[] = ['short', 'short', 'short', 'long', 'long', 'long', 'afro', 'bun', 'buzz', 'buzz', 'bald', 'mohawk'];
const INKS = ['club-ink', 'club-ink', 'club-ink', 'club-ink-red'];

/** Each style's wardrobe. */
interface Wardrobe {
  tops: string[];
  topW: [number, number];
  sleeves: Sleeves[];
  legs: string[];
  shorts: number;
  baggy: number;
  shoes: string[];
  hats: Hat[];
  hatCs: string[];
  shades: number;
}

const WARDROBE: Record<Music, Wardrobe> = {
  house: {
    tops: ['hot-teal', 'print-sun', 'deck-a', 'sleeve-white', 'print-magenta', 'print-plum-light'],
    topW: [1, 1.08],
    sleeves: ['short', 'short', 'none'],
    legs: ['club-denim', 'club-khaki', 'print-ink'],
    shorts: 0.45,
    baggy: 0.3,
    shoes: ['sleeve-white', 'sleeve-white', 'print-ink'],
    hats: ['none', 'none', 'bucket', 'bucket', 'cap'],
    hatCs: ['print-ink', 'sleeve-white', 'hot-teal', 'print-sun'],
    shades: 0.15,
  },
  techno: {
    tops: ['print-ink', 'print-ink', 'graphite-600', 'graphite-800', 'graphite-500'],
    topW: [0.96, 1.04],
    sleeves: ['none', 'none', 'long', 'short'],
    legs: ['print-ink', 'print-ink', 'graphite-600'],
    shorts: 0.12,
    baggy: 0.2,
    shoes: ['print-ink'],
    hats: ['none', 'none', 'none', 'beanie'],
    hatCs: ['print-ink', 'graphite-600'],
    shades: 0.45,
  },
  trance: {
    tops: ['hot-pink', 'hot-yellow', 'play', 'deck-a', 'print-violet', 'hot-teal'],
    topW: [0.95, 1.02],
    sleeves: ['none', 'none', 'short'],
    legs: ['print-ink', 'hot-pink', 'deck-b', 'print-violet'],
    shorts: 0.6,
    baggy: 0.1,
    shoes: ['sleeve-white', 'hot-pink', 'print-ink'],
    hats: ['none'],
    hatCs: ['print-ink'],
    shades: 0.2,
  },
  dnb: {
    tops: ['graphite-600', 'print-ink', 'deck-b', 'print-red', 'graphite-500'],
    topW: [1.05, 1.15],
    sleeves: ['long', 'long', 'short'],
    legs: ['graphite-500', 'print-ink', 'graphite-600'],
    shorts: 0.1,
    baggy: 0.75,
    shoes: ['sleeve-white', 'print-ink'],
    hats: ['cap', 'cap', 'none', 'beanie'],
    hatCs: ['print-ink', 'graphite-600', 'deck-b'],
    shades: 0.1,
  },
  hiphop: {
    tops: ['sleeve-white', 'print-red', 'print-sun', 'deck-a', 'graphite-600', 'print-ink'],
    topW: [1.15, 1.28],
    sleeves: ['short', 'short', 'long'],
    legs: ['club-denim', 'print-ink', 'club-khaki'],
    shorts: 0.1,
    baggy: 0.9,
    shoes: ['sleeve-white', 'sleeve-white', 'print-red', 'print-ink'],
    hats: ['cap', 'cap', 'none', 'beanie', 'bucket'],
    hatCs: ['print-ink', 'print-red', 'sleeve-white', 'deck-b'],
    shades: 0.2,
  },
  disco: {
    tops: ['print-gold', 'tt-chrome', 'print-magenta', 'print-violet', 'hot-pink'],
    topW: [0.98, 1.05],
    sleeves: ['long', 'none', 'short'],
    legs: ['sleeve-white', 'print-ink', 'print-gold', 'print-plum'],
    shorts: 0.25,
    baggy: 0.7,
    shoes: ['print-gold', 'print-ink', 'sleeve-white'],
    hats: ['none'],
    hatCs: ['print-ink'],
    shades: 0.15,
  },
  chill: {
    tops: ['print-rose', 'club-khaki', 'sleeve-white', 'print-plum-light', 'hot-teal', 'print-paper'],
    topW: [1.02, 1.12],
    sleeves: ['short', 'short', 'long'],
    legs: ['club-khaki', 'club-denim', 'print-paper'],
    shorts: 0.35,
    baggy: 0.5,
    shoes: ['print-paper', 'club-bar', 'sleeve-white'],
    hats: ['none', 'none', 'bucket', 'beanie'],
    hatCs: ['club-khaki', 'print-paper', 'print-rose'],
    shades: 0.25,
  },
};

const LEG_H = 0.85;
const ARM_L = 0.62;
const TAU = Math.PI * 2;

type PartName =
  | 'legL' | 'legR' | 'shortL' | 'shortR' | 'shoeL' | 'shoeR' | 'torso'
  | 'armL' | 'armR' | 'sleeveL' | 'sleeveR' | 'tatL' | 'tatR'
  | 'head' | 'eyes' | 'brows' | 'nose' | 'mouth' | 'beard' | 'tache' | 'goatee' | 'glasses' | 'studs' | 'hoops' | 'hood'
  | 'hair' | 'hairBack' | 'hairPuff' | 'mohawk' | 'hatCrown' | 'hatBrim';

/** Parts drawn more than once per person (left/right eyes, five piercings). */
const COPIES: Partial<Record<PartName, number>> = { eyes: 2, brows: 2, studs: 5, hoops: 2 };

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const out = new THREE.Matrix4();
const loc = new THREE.Matrix4();
const rootM = new THREE.Matrix4();
const upperM = new THREE.Matrix4();
const headM = new THREE.Matrix4();
const armM = new THREE.Matrix4();
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

const between = (rand: () => number, a: number, b: number) => a + (b - a) * rand();

function makeLook(rand: () => number): Look {
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  const pierced = rand() < 0.38;
  const inked = rand();
  const ear = pierced && rand() < 0.8;
  const tat = () => (rand() < 0.35 ? between(rand, 0.85, 1) : between(rand, 0.18, 0.5));
  return {
    skin: pick(SKINS),
    hair: rand() < 0.2 ? pick(HAIR_DYED) : pick(HAIR_NATURAL),
    cut: pick(CUTS),
    legH: between(rand, 0.76, 0.93),
    torsoW: between(rand, 0.31, 0.46),
    torsoH: between(rand, 0.54, 0.66),
    torsoD: between(rand, 0.19, 0.27),
    headS: between(rand, 0.9, 1.1),
    armS: between(rand, 0.92, 1.06),
    eyeGap: between(rand, 0.033, 0.046),
    eyeS: between(rand, 0.8, 1.2),
    noseS: [between(rand, 0.75, 1.35), between(rand, 0.8, 1.3)],
    mouthW: between(rand, 0.7, 1.3),
    brows: rand() < 0.9,
    browTilt: between(rand, -0.25, 0.25),
    facial: ((f) => (f < 0.1 ? 'beard' : f < 0.16 ? 'stubble' : f < 0.2 ? 'goatee' : f < 0.22 ? 'moustache' : 'none'))(rand()),
    glasses: rand() < 0.14,
    studs: [ear, ear && rand() < 0.75, pierced && rand() < 0.4, pierced && rand() < 0.2, pierced && rand() < 0.2],
    metal: rand() < 0.75 ? 'tt-chrome' : 'print-gold',
    tatL: inked < 0.18 || inked > 0.9 ? tat() : 0,
    tatR: inked > 0.7 ? tat() : 0,
    ink: pick(INKS),
    vigour: between(rand, 0.6, 1.3),
  };
}

function makeOutfit(rand: () => number, music: Music, dancer: boolean): Outfit {
  const w = WARDROBE[music];
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  return {
    top: pick(w.tops),
    topW: between(rand, ...w.topW),
    sleeves: dancer ? (rand() < 0.75 ? 'none' : pick(w.sleeves)) : pick(w.sleeves),
    legs: pick(w.legs),
    shorts: rand() < (dancer ? Math.max(0.55, w.shorts) : w.shorts),
    baggy: !dancer && rand() < w.baggy,
    shoes: pick(w.shoes),
    hat: pick(w.hats),
    hatC: pick(w.hatCs),
    shades: rand() < w.shades,
  };
}

/**
 * A set of low-poly people drawn as instanced meshes (one draw call per body
 * part however many people there are), animated to the beat. Everyone gets
 * their own face, build, hair, clothes, ink and piercings; how they dance
 * follows the tempo and the style of what's playing.
 */
export class Figures {
  readonly group = new THREE.Group();
  readonly people: Person[];
  private parts: Record<PartName, THREE.InstancedMesh>;
  private looks: Look[];
  private outfits: Outfit[];
  private visibleCount: number;
  private kind: FigureKind;
  private seed: number;
  private music: Music = 'house';
  private prevMusic: Music = 'house';
  private blendStart = -10;
  private pending: Music = 'house';
  private pendingSince = 0;

  constructor(people: Person[], seed: number, kind: FigureKind = 'crowd') {
    this.people = people;
    this.kind = kind;
    this.seed = seed;
    this.visibleCount = people.length;
    const n = people.length;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 });
    const shiny = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.4 });
    const skin = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0 });
    const metal = new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.9, emissive: hex('tt-chrome'), emissiveIntensity: 0.25 });
    const lens = new THREE.MeshStandardMaterial({ roughness: 0.15, metalness: 0.6 });
    const mk = (name: PartName, geo: THREE.BufferGeometry, material = mat) => {
      const im = new THREE.InstancedMesh(geo, material, n * (COPIES[name] ?? 1));
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      this.group.add(im);
      return im;
    };
    const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
    const legGeo = box(0.13, LEG_H, 0.15).translate(0, LEG_H / 2, 0);
    const armGeo = box(0.085, ARM_L, 0.085).translate(0, -ARM_L / 2 + 0.03, 0);
    const clothes = kind === 'dancers' ? shiny : mat;
    this.parts = {
      legL: mk('legL', legGeo),
      legR: mk('legR', legGeo),
      shortL: mk('shortL', box(0.155, 0.34, 0.175), clothes),
      shortR: mk('shortR', box(0.155, 0.34, 0.175), clothes),
      shoeL: mk('shoeL', box(0.13, 0.08, 0.25)),
      shoeR: mk('shoeR', box(0.13, 0.08, 0.25)),
      torso: mk('torso', box(1, 1, 1).translate(0, 0.5, 0), clothes),
      armL: mk('armL', armGeo),
      armR: mk('armR', armGeo),
      sleeveL: mk('sleeveL', box(0.1, 0.22, 0.1).translate(0, -0.08, 0), clothes),
      sleeveR: mk('sleeveR', box(0.1, 0.22, 0.1).translate(0, -0.08, 0), clothes),
      tatL: mk('tatL', box(0.089, 1, 0.089), skin),
      tatR: mk('tatR', box(0.089, 1, 0.089), skin),
      head: mk('head', new THREE.SphereGeometry(0.11, 14, 10), skin),
      eyes: mk('eyes', new THREE.SphereGeometry(0.016, 8, 6), lens),
      brows: mk('brows', box(0.036, 0.009, 0.012)),
      nose: mk('nose', box(0.024, 0.04, 0.03), skin),
      mouth: mk('mouth', box(0.042, 0.01, 0.012), skin),
      beard: mk('beard', new THREE.SphereGeometry(0.115, 12, 8, 0, Math.PI, Math.PI * 0.56, Math.PI * 0.4)),
      tache: mk('tache', box(0.07, 0.016, 0.02)),
      goatee: mk('goatee', box(0.045, 0.05, 0.035)),
      glasses: mk('glasses', box(0.118, 0.032, 0.012), lens),
      studs: mk('studs', new THREE.SphereGeometry(0.0095, 6, 4), metal),
      hoops: mk('hoops', new THREE.TorusGeometry(0.018, 0.004, 6, 14), metal),
      hood: mk('hood', box(0.24, 0.09, 0.09), clothes),
      hair: mk('hair', new THREE.SphereGeometry(0.118, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)),
      hairBack: mk('hairBack', box(0.21, 0.24, 0.06)),
      hairPuff: mk('hairPuff', new THREE.SphereGeometry(0.12, 12, 10)),
      mohawk: mk('mohawk', box(0.035, 0.08, 0.22)),
      hatCrown: mk('hatCrown', new THREE.SphereGeometry(0.127, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)),
      hatBrim: mk('hatBrim', new THREE.CylinderGeometry(0.13, 0.13, 0.012, 18)),
    };

    const rand = rnd(seed);
    this.looks = people.map(() => makeLook(rand));
    // the crowd came dressed for all sorts of nights
    this.outfits = people.map(() => makeOutfit(rand, MUSICS[Math.floor(rand() * MUSICS.length)], false));
    if (kind === 'dancers') this.dress();
    // bar staff wear black
    if (kind === 'staff')
      this.outfits = people.map(() => ({
        top: 'print-ink', topW: 1, sleeves: 'short', legs: 'print-ink', shorts: false, baggy: false,
        shoes: 'print-ink', hat: people[0]?.style === 'clerk' ? 'beanie' : 'none', hatC: 'print-plum', shades: false,
      }));
    people.forEach((_, i) => this.paint(i));
  }

  /** Show the first n people (they're sorted front-of-floor first). */
  setCount(n: number): void {
    this.visibleCount = Math.max(0, Math.min(this.people.length, Math.round(n)));
    for (const [name, p] of Object.entries(this.parts)) p.count = this.visibleCount * (COPIES[name as PartName] ?? 1);
  }

  /** Dress one person as someone in particular: the player's own DJ. */
  restyle(i: number, look: Look, outfit: Outfit): void {
    this.looks[i] = look;
    this.outfits[i] = outfit;
    this.paint(i);
  }

  /** What's playing. Changes settle after a moment so a quick cut doesn't make everyone flinch. */
  setMusic(m: Music, time: number): void {
    if (m !== this.pending) {
      this.pending = m;
      this.pendingSince = time;
    }
    if (m === this.music || time - this.pendingSince < 1.5) return;
    this.prevMusic = this.music;
    this.music = m;
    this.blendStart = time;
    if (this.kind === 'dancers') {
      this.dress();
      this.people.forEach((_, i) => this.paint(i));
    }
  }

  /** Podium dancers: a fresh outfit for this style, different for each of them. */
  private dress(): void {
    const k = MUSICS.indexOf(this.music);
    this.outfits = this.people.map((_, i) => makeOutfit(rnd(this.seed * 7919 + i * 131 + k * 1009), this.music, true));
  }

  private paint(i: number): void {
    const L = this.looks[i];
    const O = this.outfits[i];
    const c = new THREE.Color();
    const set = (name: PartName, token: string, k = 0) => this.parts[name].setColorAt(i * (COPIES[name] ?? 1) + k, c.setHex(hex(token)));
    const legs = O.shorts ? L.skin : O.legs;
    set('legL', legs);
    set('legR', legs);
    set('shortL', O.legs);
    set('shortR', O.legs);
    set('shoeL', O.shoes);
    set('shoeR', O.shoes);
    set('torso', O.top);
    const arm = O.sleeves === 'long' ? O.top : L.skin;
    set('armL', arm);
    set('armR', arm);
    set('sleeveL', O.top);
    set('sleeveR', O.top);
    set('tatL', L.ink);
    set('tatR', L.ink);
    set('head', L.skin);
    set('eyes', 'print-ink', 0);
    set('eyes', 'print-ink', 1);
    set('brows', L.hair === 'club-hair-6' ? 'club-hair-3' : L.hair, 0);
    set('brows', L.hair === 'club-hair-6' ? 'club-hair-3' : L.hair, 1);
    set('nose', L.skin);
    set('mouth', 'club-lip');
    const stubble = L.facial === 'stubble';
    this.parts.beard.setColorAt(i, stubble ? c.setHex(hex(L.hair)).lerp(new THREE.Color(hex(L.skin)), 0.55) : c.setHex(hex(L.hair)));
    set('tache', L.hair);
    set('goatee', L.hair);
    set('hood', O.top);
    set('hoops', L.metal, 0);
    set('hoops', L.metal, 1);
    set('glasses', O.shades ? 'print-ink' : 'graphite-500');
    for (let k = 0; k < 5; k++) set('studs', L.metal, k);
    for (const h of ['hair', 'hairBack', 'hairPuff', 'mohawk'] as const) set(h, L.hair);
    set('hatCrown', O.hatC);
    set('hatBrim', O.hatC);
    for (const p of Object.values(this.parts)) if (p.instanceColor) p.instanceColor.needsUpdate = true;
  }

  /**
   * @param beats  continuous beat count (1 per beat)
   * @param energy 0 = chilled, 1 = normal, 1.6 = the drop
   * @param bpm    the tempo: fast music goes half-time, slow music gets bigger, looser moves
   */
  update(beats: number, energy: number, time: number, bpm = 128): void {
    const blend = Math.min(1, (time - this.blendStart) / 2.5);
    for (let i = 0; i < this.visibleCount; i++) {
      const p = this.people[i];
      const L = this.looks[i];
      const b = beats + p.phase;
      const pose = poseFor(p, L, this.music, b, energy, time, bpm);
      if (blend < 1) mixPose(pose, poseFor(p, L, this.prevMusic, b, energy, time, bpm), 1 - smooth(blend));
      this.place(i, p, pose);
    }
    for (const part of Object.values(this.parts)) part.instanceMatrix.needsUpdate = true;
  }

  private put(name: PartName, i: number, m: THREE.Matrix4, k = 0): void {
    this.parts[name].setMatrixAt(i * (COPIES[name] ?? 1) + k, m);
  }

  /** parent × a local transform, into the shared scratch matrix. */
  private at(parent: THREE.Matrix4, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0): THREE.Matrix4 {
    loc.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s.set(sx, sy, sz));
    return out.multiplyMatrices(parent, loc);
  }

  private place(i: number, p: Person, pose: Pose): void {
    const L = this.looks[i];
    const O = this.outfits[i];
    const cosY = Math.cos(p.yaw);
    const sinY = Math.sin(p.yaw);
    // root: position on the floor (plus any side step), facing, size
    rootM.compose(
      v.set(p.x + cosY * pose.shift, p.y + pose.lift, p.z - sinY * pose.shift),
      q.setFromEuler(e.set(0, p.yaw + pose.yaw, 0)),
      s.setScalar(p.scale),
    );
    const legTop = L.legH - pose.dip;
    const legScale = legTop / LEG_H;
    const hipX = L.torsoW * 0.24;
    const bulk = L.bulk ?? 1;
    const legW = (O.baggy ? 1.3 : 1) * bulk;
    // hips sway: legs tilt from planted feet, the body rides on top
    const tilt = pose.roll * 0.5;
    const hipShift = -legTop * Math.sin(tilt);
    for (const [side, leg, short, shoe] of [
      [-1, 'legL', 'shortL', 'shoeL'],
      [1, 'legR', 'shortR', 'shoeR'],
    ] as const) {
      // legs lean into the hip sway
      const x = side * hipX;
      this.put(leg, i, this.at(rootM, x, 0, 0, legW, legScale, legW, 0, 0, tilt));
      const h = legTop - 0.16;
      this.put(short, i, O.shorts ? this.at(rootM, x - h * Math.sin(tilt), h * Math.cos(tilt), 0, 1, 1, 1, 0, 0, tilt) : ZERO);
      this.put(shoe, i, O.boots ? this.at(rootM, x, 0.075, 0.03, 1.08, 1.9, 0.92) : this.at(rootM, x, 0.04, 0.04));
    }

    // upper body: dips with the knees, leans and rolls with the groove
    loc.compose(v.set(hipShift, legTop * Math.cos(tilt), 0), q.setFromEuler(e.set(pose.lean, 0, pose.roll)), s.set(1, 1, 1));
    upperM.multiplyMatrices(rootM, loc);
    const torsoW = L.torsoW * O.topW;
    const torsoD = L.torsoD * (O.topW > 1.1 ? 1.12 : 1);
    this.put('torso', i, this.at(upperM, 0, 0, 0, torsoW, L.torsoH, torsoD));
    this.put('hood', i, O.hood ? this.at(upperM, 0, L.torsoH - 0.02, -torsoD / 2 - 0.02, torsoW / 0.4, 1, 1) : ZERO);

    for (const [side, arm, sleeve, tat, a, cover] of [
      [-1, 'armL', 'sleeveL', 'tatL', pose.armL, L.tatL],
      [1, 'armR', 'sleeveR', 'tatR', pose.armR, L.tatR],
    ] as const) {
      // shoulder joint: raise forwards/up around x, swing out around z
      loc.compose(v.set(side * (torsoW / 2 + 0.04), L.torsoH - 0.05, 0), q.setFromEuler(e.set(-a[0], 0, side * a[1], 'XZY')), s.set(bulk, L.armS, bulk));
      armM.multiplyMatrices(upperM, loc);
      this.put(arm, i, armM);
      this.put(sleeve, i, O.sleeves === 'short' ? this.at(armM, 0, 0, 0, O.topW, 1, O.topW) : ZERO);
      if (cover > 0 && O.sleeves !== 'long') {
        const top = O.sleeves === 'short' ? 0.2 : 0.04;
        const len = Math.min(cover * 0.58, 0.58 - top);
        this.put(tat, i, len > 0.04 ? this.at(armM, 0, -top - len / 2, 0, 1, len, 1) : ZERO);
      } else this.put(tat, i, ZERO);
    }

    // head and face
    loc.compose(v.set(0, L.torsoH + 0.13 * L.headS + 0.02, 0), q.setFromEuler(e.set(pose.nod, 0, -pose.roll * 0.6)), s.setScalar(L.headS));
    headM.multiplyMatrices(upperM, loc);
    this.put('head', i, headM);
    for (const k of [0, 1]) {
      const side = k ? 1 : -1;
      this.put('eyes', i, this.at(headM, side * L.eyeGap, 0.012, 0.094, L.eyeS, L.eyeS, L.eyeS), k);
      this.put('brows', i, L.brows ? this.at(headM, side * L.eyeGap, 0.044, 0.097, 1, 1, 1, 0, 0, -side * L.browTilt) : ZERO, k);
    }
    this.put('nose', i, this.at(headM, 0, -0.012, 0.104, L.noseS[0], L.noseS[1], 1));
    this.put('mouth', i, this.at(headM, 0, -0.05, 0.094, L.mouthW, 1, 1));
    const fh = L.facial;
    this.put('beard', i, fh === 'beard' ? headM : fh === 'stubble' ? this.at(headM, 0, 0, 0, 1.002, 1.002, 1.002) : ZERO);
    this.put('tache', i, fh === 'moustache' || fh === 'goatee' ? this.at(headM, 0, -0.033, 0.1, 1, 1, 1) : ZERO);
    this.put('goatee', i, fh === 'goatee' ? this.at(headM, 0, -0.083, 0.074) : ZERO);
    this.put('glasses', i, L.glasses || O.shades ? this.at(headM, 0, 0.013, 0.106) : ZERO);
    const stud = [
      [-0.108, -0.025, 0],
      [0.108, -0.025, 0],
      [0.017, -0.022, 0.112],
      [L.eyeGap + 0.02, 0.05, 0.094],
      [0.014, -0.058, 0.092],
    ];
    stud.forEach(([x, y, z], k) => this.put('studs', i, L.studs[k] && !(k < 2 && L.hoops) ? this.at(headM, x, y, z) : ZERO, k));
    for (const k of [0, 1]) this.put('hoops', i, L.studs[k] && L.hoops ? this.at(headM, k ? 0.111 : -0.111, -0.045, 0, 1, 1, 1, 0, Math.PI / 2) : ZERO, k);

    // hair, then any hat over it
    const cut = L.cut;
    const capped = cut !== 'bald' && cut !== 'mohawk';
    this.put('hair', i, capped ? this.at(headM, 0, 0.025, -0.012, cut === 'buzz' ? 0.96 : 1, cut === 'buzz' ? 0.94 : 1, cut === 'buzz' ? 0.96 : 1) : ZERO);
    this.put('hairBack', i, cut === 'long' ? this.at(headM, 0, -0.075, -0.07) : ZERO);
    this.put(
      'hairPuff',
      i,
      cut === 'afro' && O.hat === 'none'
        ? this.at(headM, 0, 0.035, -0.015, 1.25, 1.15, 1.25)
        : cut === 'bun'
          ? this.at(headM, 0, 0.1, -0.08, 0.4, 0.4, 0.4)
          : cut === 'ponytail'
            ? this.at(headM, 0, -0.04, -0.13, 0.3, 0.62, 0.3, 0.35)
            : ZERO,
    );
    this.put('mohawk', i, cut === 'mohawk' && O.hat === 'none' ? this.at(headM, 0, 0.1, -0.01) : ZERO);
    const hat = O.hat;
    this.put(
      'hatCrown',
      i,
      hat === 'none' ? ZERO : hat === 'beanie' ? this.at(headM, 0, 0.02, -0.006, 1, 1.3, 1) : this.at(headM, 0, 0.03, -0.004, 1.02, hat === 'bucket' ? 0.9 : 0.85, 1.02),
    );
    this.put(
      'hatBrim',
      i,
      hat === 'cap' ? this.at(headM, 0, 0.035, 0.085, 0.72, 1, 0.82) : hat === 'bucket' ? this.at(headM, 0, 0.032, -0.004, 1.42, 1, 1.42, 0.08) : ZERO,
    );
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function mixPose(a: Pose, b: Pose, t: number): void {
  const lerp = (x: number, y: number) => x + (y - x) * t;
  a.lift = lerp(a.lift, b.lift);
  a.dip = lerp(a.dip, b.dip);
  a.shift = lerp(a.shift, b.shift);
  a.yaw = lerp(a.yaw, b.yaw);
  a.lean = lerp(a.lean, b.lean);
  a.roll = lerp(a.roll, b.roll);
  a.nod = lerp(a.nod, b.nod);
  a.armL = [lerp(a.armL[0], b.armL[0]), lerp(a.armL[1], b.armL[1])];
  a.armR = [lerp(a.armR[0], b.armR[0]), lerp(a.armR[1], b.armR[1])];
}

/** Arms: [raise, out]. */
const arms = (pose: Pose, l: [number, number], r: [number, number]) => {
  pose.armL = l;
  pose.armR = r;
};

function poseFor(p: Person, L: Look, music: Music, beats: number, energy: number, time: number, bpm: number): Pose {
  const pose: Pose = { lift: 0, dip: 0, shift: 0, yaw: 0, lean: 0, roll: 0, armL: [0.15, 0.08], armR: [0.15, 0.08], nod: 0 };
  const en = Math.max(0, energy);
  const tempo = bpm > 0 ? bpm : 128;
  // fast music (drum & bass, hardcore) gets danced half-time; slow music gets bigger, looser moves
  const b = tempo >= 150 ? beats / 2 : beats;
  const amp = THREE.MathUtils.clamp(124 / (tempo >= 150 ? tempo / 2 : tempo), 0.8, 1.3);
  const ph = ((b % 1) + 1) % 1;
  const hit = Math.pow(1 - ph, tempo > 130 ? 4 : 2.5); // sharper on fast music
  const bounce = Math.abs(Math.sin(b * Math.PI));
  const two = Math.sin(b * Math.PI); // one cycle per two beats
  const bar = (((beats / 4) % 1) + 1) % 1;
  const take = p.r < 0.5 ? 0 : 1; // each person's own take on the move

  if (p.style === 'bartender') {
    // shake a cocktail, pour it, then wipe down the counter; nodding along the whole time
    const cycle = (time + p.r * 20) % 14;
    pose.nod = 0.07 * bounce;
    pose.roll = 0.04 * two;
    pose.shift = Math.sin(time * 0.11 + p.r * 6) * 1.1;
    if (cycle < 3) {
      const sh = 0.16 * Math.sin(time * 22);
      pose.lean = -0.04;
      arms(pose, [2.35 + sh, -0.3], [2.25 + sh, 0.05]);
    } else if (cycle < 5) {
      pose.lean = 0.14;
      pose.nod = 0.25;
      arms(pose, [1.35, 0.08], [1.75 + 0.1 * Math.sin(time * 1.5), 0.05]);
    } else {
      const w = time * 2.2;
      pose.lean = 0.22;
      arms(pose, [1.25 + 0.08 * Math.sin(w * 2), 0.15 + 0.25 * Math.sin(w)], [0.3, 0.1]);
    }
    return pose;
  }

  if (p.style === 'clerk') {
    // behind the till: a slow nod to the shop's tunes, now and then scanning a sleeve or bagging a record
    const cycle = (time + p.r * 20) % 16;
    pose.nod = 0.05 * Math.sin(time * 1.3 + p.r * 5);
    pose.roll = 0.025 * Math.sin(time * 0.6);
    pose.lean = 0.06;
    if (cycle < 3.5) arms(pose, [1.15 + 0.05 * Math.sin(time * 3), 0.1], [0.95, 0.12]);
    else if (cycle < 6) {
      pose.lean = 0.12;
      pose.nod = 0.12;
      arms(pose, [1.3 + 0.1 * Math.sin(time * 2), 0.14], [1.2 + 0.06 * Math.sin(time * 2.4), 0.1]);
    } else arms(pose, [0.2, 0.1], [0.45 + 0.05 * Math.sin(time * 0.8), 0.15]);
    return pose;
  }

  if (p.style === 'dj') {
    pose.nod = 0.22 * bounce * (music === 'hiphop' ? 1.4 : 1);
    pose.dip = 0.03 * bounce;
    pose.lean = 0.12;
    arms(pose, [1.05 + 0.08 * Math.sin(time * 1.7), 0.22], [1.05 + 0.1 * Math.sin(time * 2.3 + 1), 0.22]);
    // hand in the air for the last beat of every 4th bar, both on the drop
    if ((beats / 16) % 1 > 0.94) pose.armR = [2.95, 0.2];
    if (en > 1.2 && bar < 0.25) pose.armL = [2.95, 0.2];
    return pose;
  }

  const dancer = p.style === 'dancer';
  // how into it they are: podium dancers give it everything, the back of the room less so
  const g = (dancer ? 1.35 : p.style === 'sway' ? 0.55 : 0.75 + 0.35 * L.vigour) * amp * Math.min(1.3, 0.35 + en * 0.75);

  // too quiet to dance properly: everyone just sways
  if (energy < 0.25) music = 'chill';

  switch (music) {
    case 'house': {
      // jacking: the torso rocks on every beat, feet shuffle side to side
      pose.lean = 0.16 * bounce * g - 0.04;
      pose.dip = 0.06 * bounce * g;
      pose.shift = 0.07 * two * g;
      pose.yaw = 0.18 * Math.sin(b * Math.PI * 0.5 + p.r * TAU);
      pose.roll = 0.05 * two * g;
      pose.nod = 0.12 * bounce;
      if (take) arms(pose, [0.6 + 0.4 * bounce, 0.3 + 0.2 * two], [1.4 + 1.2 * Math.max(0, Math.sin(b * Math.PI * 0.5)), 0.25]);
      else arms(pose, [0.5 + 0.35 * bounce, 0.18], [0.5 + 0.35 * bounce, 0.18]);
      break;
    }
    case 'techno': {
      // the stomp: hard knees on the kick, heads down, fists low
      pose.dip = 0.12 * hit * g;
      pose.nod = 0.32 * hit * g;
      pose.lean = 0.12 + 0.06 * hit;
      pose.yaw = 0.08 * Math.sin(b * Math.PI * 0.25 + p.r * TAU);
      const alt = Math.floor(b) % 2 === 0;
      if (take) arms(pose, [1.25 + 0.35 * hit, 0.05], [1.25 + 0.35 * hit, 0.05]);
      else arms(pose, [0.7 + (alt ? 0.7 * hit : 0), 0.12], [0.7 + (alt ? 0 : 0.7 * hit), 0.12]);
      break;
    }
    case 'trance': {
      // hands in the air, waving, up on the toes
      const wave = Math.sin(b * Math.PI * 0.5 + p.r * 2);
      pose.lift = 0.05 * bounce * g;
      pose.dip = 0.04 * bounce;
      pose.lean = -0.1;
      pose.yaw = 0.15 * wave;
      pose.nod = -0.15;
      if (take) arms(pose, [2.75 + 0.15 * wave, 0.3 + 0.35 * wave], [2.75 - 0.15 * wave, 0.3 - 0.35 * wave]);
      else arms(pose, [2.95, 0.2], [1.3 + 0.5 * bounce, 0.35]);
      break;
    }
    case 'dnb': {
      // half-time bounce under a fast skank: arms swing on the real beat
      const sk = Math.sin(beats * Math.PI);
      pose.dip = 0.09 * bounce * g;
      pose.lean = 0.18;
      pose.yaw = 0.3 * sk * g;
      pose.nod = 0.18 * bounce;
      pose.shift = 0.04 * sk * g;
      if (take) arms(pose, [0.5 + 1.0 * Math.max(0, sk), 0.15], [0.5 + 1.0 * Math.max(0, -sk), 0.15]);
      else arms(pose, [2.4 + 0.5 * hit, 0.15], [0.6 + 0.6 * Math.abs(sk), 0.2]);
      break;
    }
    case 'hiphop': {
      // step-touch with a heavy head nod and one hand riding the beat
      pose.nod = 0.3 * bounce * g;
      pose.dip = 0.08 * bounce * g;
      pose.shift = 0.11 * two * g;
      pose.roll = 0.08 * two * g;
      pose.lean = 0.05;
      pose.yaw = 0.12 * two;
      if (take) arms(pose, [1.1 + 0.15 * bounce, -0.35], [1.1 + 0.15 * bounce, -0.35]);
      else arms(pose, [0.4 + 0.1 * bounce, 0.25], [1.5 + 0.45 * hit, 0.45]);
      break;
    }
    case 'disco': {
      // the point: up to the ceiling, down to the floor, every two beats
      const side = Math.floor(b / 2) % 2 === 0;
      pose.roll = 0.13 * two * g;
      pose.shift = 0.06 * two * g;
      pose.dip = 0.04 * bounce;
      pose.yaw = 0.2 * two;
      if (take) {
        const up: [number, number] = [2.7, 0.6];
        const down: [number, number] = [0.35, 0.55];
        arms(pose, side ? up : down, side ? down : up);
      } else {
        const roll = Math.sin(b * TAU);
        arms(pose, [1.35 + 0.3 * roll, 0.1], [1.35 - 0.3 * roll, 0.1]);
      }
      break;
    }
    case 'chill': {
      const sw = Math.sin(b * Math.PI * 0.5 + p.r * TAU);
      pose.yaw = sw * 0.22;
      pose.roll = sw * 0.06;
      pose.dip = 0.03 * bounce;
      pose.nod = 0.05 * bounce;
      arms(pose, [0.35, 0.2 + 0.1 * sw], [0.35, 0.2 - 0.1 * sw]);
      break;
    }
  }

  if (dancer) {
    // podium dancers turn to work the room, and throw both arms up at the end of big bars
    pose.yaw += Math.sin(time * 0.3 + p.r * 6) * 0.6;
    if (bar > 0.75 && en > 1.2) arms(pose, [3.0, 0.35], [3.0, 0.35]);
  } else if (energy > 1.2 && p.r > 0.35) {
    // the drop: more of the crowd puts their hands up
    if (p.r > 0.7 || p.style === 'handsUp') arms(pose, [2.9, 0.25 + 0.3 * two], [2.9, 0.25 - 0.3 * two]);
    else pose.armR = [2.4 + 0.55 * hit * en, 0.15];
  }
  // big moments: the floor jumps
  if (energy > 1.2) pose.lift = Math.max(pose.lift, 0.22 * Math.max(0, Math.sin(ph * Math.PI)) * (0.6 + 0.4 * p.r));
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
        scale: 0.88 + rand() * 0.22,
        style: styles[Math.floor(rand() * styles.length)],
        phase: (rand() - 0.5) * 0.12,
        r: rand(),
      });
    }
  // front of the floor fills first, a bit of shuffle so it isn't row by row
  slots.sort((a, b) => a.z + a.r * 1.2 - (b.z + b.r * 1.2));
  return slots.slice(0, n);
}
