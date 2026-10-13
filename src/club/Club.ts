import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { alpha, hex } from '../design/tokens';
import { buildCdj, buildMixer, buildSpeaker, type CdjModel, type MixerModel, type SpeakerModel } from '../room/models';
import { buildTurntable, TT, type TurntableModel } from '../room/turntableModel';
import { engine } from '../audio/engine';
import { peakDb } from '../audio/mixer';
import { beatAt } from '../audio/grid';
import type { Gear } from '../state/setup';
import type { DeckId } from '../types';
import { CAPACITY, PALETTES, type CameraView, type ClubSettings } from './settings';
import { crowdSlots, Figures, type Person } from './people';
import { LedWall } from './screen';

// The venue, in metres. Stage at the north end (−z), bar at the south end.
const V = { w: 14, d: 18, h: 6 };
const STAGE = { x: 5.5, z0: -9, z1: -5, h: 1.0 };
const FLOOR = { x0: -4.5, x1: 4.5, z0: -4.2, z1: 3 }; // ~65 m², 50 people with room to dance
const TRUSS_Y = 5.35;
const BOOTH_Z = -6.3;

export type ClubMode = 'room' | 'booth';

/** Where you stand when you jump on the decks: behind them, looking over the gear at the crowd. */
const BOOTH_POSE = { pos: new THREE.Vector3(0, 2.86, BOOTH_Z - 0.95), target: new THREE.Vector3(0, 1.6, BOOTH_Z + 4.1) };
/** With the decks hidden: same spot, eyes up and out over the crowd. */
const ROOM_LOOK_TARGET = new THREE.Vector3(0, 2.1, 5);

/** What the club's clock is following right now. */
export interface ClubClock {
  /** true while a deck is playing on air: lights and crowd follow your mix. */
  live: boolean;
  bpm: number;
  /** Which deck is leading, while live. */
  deck: DeckId | null;
}

const VIEWS: Record<CameraView, { pos: THREE.Vector3; target: THREE.Vector3 }> = {
  floor: { pos: new THREE.Vector3(1.4, 1.7, 5.8), target: new THREE.Vector3(0, 2.6, -6) },
  booth: { pos: new THREE.Vector3(1.25, 3.05, -8.55), target: new THREE.Vector3(-0.3, 1.5, 1.5) },
  balcony: { pos: new THREE.Vector3(0, 5.3, 8.6), target: new THREE.Vector3(0, 1.4, -3) },
  side: { pos: new THREE.Vector3(6.4, 3.4, 1.5), target: new THREE.Vector3(-1, 2, -3.5) },
};

/** A volumetric-looking light beam: an open cone, brightest at the source and facing the camera. */
function beamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0 }, uSoft: { value: 1.4 } },
    vertexShader: /* glsl */ `
      varying float vT;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vT = position.z;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uSoft;
      varying float vT;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), uSoft);
        float fall = pow(1.0 - clamp(vT, 0.0, 1.0), 1.3);
        gl_FragColor = vec4(uColor, uOpacity * edge * fall);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** Unit-length open cone pointing along +z from the origin; scale it by the throw distance. */
function beamGeometry(spread: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(spread, 1, 24, 6, true);
  g.translate(0, -0.5, 0);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** A soft round texture for floor spots and smoke puffs. */
function softDot(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  const css = (a: number) => alpha('white', a);
  g.addColorStop(0, css(1));
  g.addColorStop(0.4, css(0.55));
  g.addColorStop(1, css(0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Beam {
  pivot: THREE.Object3D;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  spot?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  spread: number;
}

interface Fixture {
  lens: THREE.MeshStandardMaterial;
  beams: Beam[];
  head?: THREE.Object3D;
}

export class Club {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private settings: ClubSettings;

  private beats = 0;
  private lastT = 0;
  private dropAt = -Infinity;
  private camMove: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; start: number } | null = null;

  private ambient = new THREE.HemisphereLight(hex('room-fill-sky'), hex('club-floor'), 0.05);
  private house: THREE.Group = new THREE.Group();
  private floorLights: THREE.PointLight[] = [];
  private strobeLight = new THREE.PointLight(hex('white'), 0, 0, 0);
  private screenLight = new THREE.PointLight(hex('white'), 0, 14, 1.6);
  private fog = new THREE.FogExp2(hex('graphite-1000'), 0.02);

  private movers: Fixture[] = [];
  private pars: Fixture[] = [];
  private scanners: Fixture[] = [];
  private lasers: { origin: THREE.Object3D; beams: Beam[] }[] = [];
  private strobes: THREE.MeshStandardMaterial[] = [];
  private ledStrips: THREE.MeshStandardMaterial[] = [];
  private podiumRings: THREE.MeshStandardMaterial[] = [];
  private podiums = new THREE.Group();
  private tiles!: THREE.InstancedMesh;
  private tileCount = 0;
  private smoke!: THREE.Points;
  private smokeVel: Float32Array = new Float32Array();
  private wall = new LedWall();
  private wallMesh!: THREE.Mesh;
  private speakers: SpeakerModel[] = [];

  private boothGear = new THREE.Group();
  private cdjModels: { A: CdjModel; B: CdjModel } | null = null;
  private ttModels: { A: TurntableModel; B: TurntableModel } | null = null;
  private mixerModel!: MixerModel;
  private gear: Gear = 'cdj';

  /** 'booth' once you've jumped on the decks. */
  mode: ClubMode = 'room';
  /** You've been on the decks: the resident DJ has handed over and the crowd follows your music. */
  private takenOver = false;
  private orbitReturn: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private viewCentre = 0.5;
  private boothCentre = 0.3;
  /** Decks hidden: look up at the room from behind the booth, drag to look around. */
  private lookAround = false;
  private look = { yaw: 0, pitch: 0, yawTo: 0, pitchTo: 0 };
  private centreMove: { from: number; to: number } | null = null;
  private width = 1;
  private height = 1;
  readonly clock: ClubClock = { live: false, bpm: 128, deck: null };
  private bassAvg = 0;
  private quietBeats = 0;
  private lastBeats = 0;

  private crowd: Figures;
  private dancers: Figures;
  private dj: Figures;
  private dot = softDot();
  private tmpColor = new THREE.Color();

  constructor(container: HTMLElement, settings: ClubSettings, gear: Gear = 'cdj') {
    this.gear = gear;
    this.settings = settings;
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    container.appendChild(r.domElement);
    this.renderer = r;

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 80);
    this.camera.position.copy(VIEWS.floor.pos);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.target.copy(VIEWS.floor.target);
    this.controls.enableDamping = true;
    this.controls.maxDistance = 20;
    this.controls.minDistance = 0.8;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.controls.autoRotateSpeed = 0.6;
    this.controls.addEventListener('start', () => (this.camMove = null));
    this.bindLookDrag(r.domElement);

    this.scene.background = new THREE.Color(hex('graphite-1000'));
    this.scene.fog = this.fog;
    this.scene.add(this.ambient);

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.62);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.buildShell();
    this.buildStage();
    this.buildRig();
    this.buildFloor();
    this.buildPodiums();
    this.buildSmoke();

    const stageFront = new THREE.Vector3(0, 0, STAGE.z1);
    this.crowd = new Figures(crowdSlots(CAPACITY, FLOOR, stageFront, 7), 11);
    this.scene.add(this.crowd.group);
    const dancerSpots: Person[] = this.podiumSpots().map((p, i) => ({
      x: p.x,
      y: 1.1,
      z: p.z,
      yaw: Math.atan2(-p.x, 0.5 - p.z),
      scale: 1,
      style: 'dancer',
      phase: i * 0.25,
      r: i / 4,
    }));
    this.dancers = new Figures(dancerSpots, 3, true);
    this.podiums.add(this.dancers.group);
    this.dj = new Figures([{ x: 0, y: STAGE.h, z: BOOTH_Z - 0.75, yaw: 0, scale: 1.02, style: 'dj', phase: 0, r: 0.5 }], 21);
    this.scene.add(this.dj.group);

    this.apply(settings);
    const ro = new ResizeObserver(() => this.resize(container));
    ro.observe(container);
    this.resize(container);
    r.setAnimationLoop((t) => this.frame(t / 1000));
  }

  apply(s: ClubSettings): void {
    const viewChanged = s.autoOrbit !== this.settings.autoOrbit;
    this.settings = s;
    this.crowd.setCount(s.crowd);
    this.podiums.visible = s.dancers;
    this.controls.autoRotate = s.autoOrbit && this.mode === 'room';
    if (viewChanged && s.autoOrbit) this.controls.target.set(0, 1.8, -1.5);
  }

  /** Two-bar build, then eight bars of everything. */
  drop(): void {
    const nextBar = Math.ceil(this.beats / 4) * 4;
    this.dropAt = nextBar + 8;
  }

  /** 'build' while the drop is coming, 'drop' while it lasts. */
  get phase(): 'none' | 'build' | 'drop' {
    if (this.beats >= this.dropAt - 8 && this.beats < this.dropAt) return 'build';
    if (this.beats >= this.dropAt && this.beats < this.dropAt + 32) return 'drop';
    return 'none';
  }

  setView(v: CameraView): void {
    if (this.mode === 'booth') return;
    this.controls.autoRotate = false;
    this.camMove = {
      from: this.camera.position.clone(),
      to: VIEWS[v].pos.clone(),
      tFrom: this.controls.target.clone(),
      tTo: VIEWS[v].target.clone(),
      start: performance.now() / 1000,
    };
  }

  // ---------------------------------------------------------------- building

  private std(token: string, roughness = 0.8, metalness = 0.1): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color: hex(token), roughness, metalness });
  }

  private glow(token: string, intensity = 1): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color: hex('club-fixture'), emissive: new THREE.Color(hex(token)), emissiveIntensity: intensity, roughness: 0.5 });
  }

  private box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.scene): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  private buildShell(): void {
    const floorMat = this.std('club-floor', 0.35, 0.2); // polished concrete catches the lights
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(V.w, V.d), floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(V.w, V.d), this.std('black', 1));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = V.h;
    this.scene.add(ceil);
    const wallMat = this.std('club-wall', 0.95);
    this.box(0.2, V.h, V.d, wallMat, -V.w / 2 - 0.1, V.h / 2, 0);
    this.box(0.2, V.h, V.d, wallMat, V.w / 2 + 0.1, V.h / 2, 0);
    this.box(V.w, V.h, 0.2, wallMat, 0, V.h / 2, -V.d / 2 - 0.1);
    this.box(V.w, V.h, 0.2, wallMat, 0, V.h / 2, V.d / 2 + 0.1);

    // acoustic panels and LED strips along both side walls
    const panelMat = this.std('club-panel', 1);
    for (const side of [-1, 1]) {
      for (let z = -4; z <= 7; z += 1.6) this.box(0.08, 1.8, 1.4, panelMat, side * (V.w / 2 - 0.04), 2.4, z);
      for (const y of [1.1, 3.7]) {
        const strip = this.glow('print-violet', 1.5);
        this.ledStrips.push(strip);
        this.box(0.04, 0.04, V.d - 4, strip, side * (V.w / 2 - 0.06), y, 2);
      }
    }

    // the bar at the back
    const bar = new THREE.Group();
    bar.position.set(0, 0, V.d / 2 - 1.3);
    this.box(7, 1.08, 0.7, this.std('club-bar', 0.6), 0, 0.54, 0, bar);
    this.box(7.3, 0.06, 0.85, this.std('graphite-500', 0.2, 0.7), 0, 1.1, 0, bar);
    const barGlow = this.glow('club-bar-glow', 2);
    this.box(7, 0.03, 0.03, barGlow, 0, 1.0, -0.37, bar);
    this.box(8, 0.04, 0.35, this.glow('club-bar-glow', 1.2), 0, 2.0, 1.05, bar); // back shelf
    // bottles on the shelf
    const bottleGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.3, 8);
    const bottleMats = ['play', 'deck-b', 'deck-a', 'print-red'].map((t) => new THREE.MeshStandardMaterial({ color: hex(t), roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.8 }));
    for (let i = 0; i < 26; i++) {
      const b = new THREE.Mesh(bottleGeo, bottleMats[i % 4]);
      b.position.set(-3.7 + i * 0.3, 2.17, 1.05);
      bar.add(b);
    }
    const barLight = new THREE.PointLight(hex('club-bar-glow'), 3, 6, 1.5);
    barLight.position.set(0, 2.2, 0.2);
    bar.add(barLight);
    this.scene.add(bar);

    // exit sign over the back door
    this.box(0.5, 0.18, 0.06, this.glow('play', 2), V.w / 2 - 1.2, 2.6, V.d / 2 - 0.05);

    // house lights: plain white downlights for setting up
    for (const x of [-4, 0, 4])
      for (const z of [-6, -1, 4]) {
        const l = new THREE.PointLight(hex('room-lamp'), 0, 12, 1.2);
        l.position.set(x, V.h - 0.3, z);
        this.house.add(l);
      }
    this.house.visible = false;
    this.scene.add(this.house);

    for (const [x, z] of [
      [-2.8, -2.5],
      [2.8, -2.5],
      [-2.8, 1.8],
      [2.8, 1.8],
    ]) {
      const l = new THREE.PointLight(hex('white'), 0, 11, 1.4);
      l.position.set(x, 4.2, z);
      this.floorLights.push(l);
      this.scene.add(l);
    }
    this.strobeLight.position.set(0, 4.8, -2);
    this.scene.add(this.strobeLight);
    this.screenLight.position.set(0, 3.2, -7.2);
    this.scene.add(this.screenLight);
  }

  private buildStage(): void {
    const w = STAGE.x * 2;
    const d = STAGE.z1 - STAGE.z0;
    const stage = this.box(w, STAGE.h, d, this.std('club-stage', 0.5, 0.2), 0, STAGE.h / 2, (STAGE.z0 + STAGE.z1) / 2);
    stage.name = 'stage';
    const lip = this.glow('deck-a', 2);
    this.ledStrips.push(lip);
    this.box(w, 0.04, 0.04, lip, 0, STAGE.h - 0.05, STAGE.z1 + 0.01);
    this.box(w, 0.04, 0.04, this.std('club-stage-edge'), 0, STAGE.h + 0.02, STAGE.z1 - 0.02);
    // steps at the side
    for (let i = 0; i < 3; i++) this.box(1, (STAGE.h / 3) * (i + 1), 0.35, this.std('club-stage-edge'), STAGE.x - 0.6, ((STAGE.h / 3) * (i + 1)) / 2, STAGE.z1 + 0.9 - i * 0.35);

    // LED wall behind the DJ
    const sw = 8.4;
    const sh = 4.2;
    const frame = this.box(sw + 0.3, sh + 0.3, 0.2, this.std('black', 0.6), 0, 3.5, STAGE.z0 + 0.15);
    frame.name = 'screen-frame';
    this.wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: this.wall.texture, toneMapped: false }));
    this.wallMesh.position.set(0, 3.5, STAGE.z0 + 0.26);
    this.scene.add(this.wallMesh);

    // DJ booth: a table with a lit facade, the decks on top facing the DJ
    const booth = new THREE.Group();
    booth.position.set(0, STAGE.h, BOOTH_Z);
    this.scene.add(booth);
    this.box(2.6, 1.0, 0.85, this.std('graphite-750', 0.5, 0.3), 0, 0.5, 0, booth);
    const facade = this.glow('print-magenta', 1.4);
    this.ledStrips.push(facade);
    this.box(2.4, 0.06, 0.02, facade, 0, 0.75, 0.43, booth);
    this.box(2.4, 0.06, 0.02, facade, 0, 0.25, 0.43, booth);
    this.boothGear.position.set(0, 1.0, 0);
    this.boothGear.rotation.y = Math.PI; // the gear's front edge faces the DJ, behind the booth
    booth.add(this.boothGear);
    this.buildGear();
    const lamp = new THREE.PointLight(hex('room-lamp-hot'), 1.2, 2.5, 1.5);
    lamp.position.set(0, 1.7, -0.3);
    booth.add(lamp);

    // PA stacks either side of the stage
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const spk = buildSpeaker();
        spk.group.scale.setScalar(4.6);
        spk.group.position.set(side * 6.1, STAGE.h + i * 1.56, STAGE.z1 - 0.9);
        spk.group.rotation.y = -side * 0.18;
        this.scene.add(spk.group);
        this.speakers.push(spk);
      }
    }
    // the mixer's left and right outputs come out of the top cabinets
    this.scene.updateMatrixWorld(true);
    this.speakers
      .filter((_, i) => i % 2 === 1)
      .forEach((spk, i) => {
        const mouth = spk.mouth.clone();
        spk.group.localToWorld(mouth);
        const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(spk.group.quaternion);
        engine.mixer.placeSpeaker(i as 0 | 1, mouth, facing);
      });
    // a club PA carries: it stays loud right across the room
    for (const p of engine.mixer.speakers) {
      p.refDistance = 5;
      p.rolloffFactor = 0.45;
      p.coneOuterGain = 0.6;
    }
  }

  /** CDJs, turntables or both on the booth, laid out like the bedroom desk. */
  private buildGear(): void {
    const g = this.boothGear;
    for (const c of [...g.children]) g.remove(c);
    this.mixerModel = buildMixer();
    g.add(this.mixerModel.group);
    this.cdjModels = null;
    this.ttModels = null;
    const cdjX = 0.305;
    if (this.gear !== 'vinyl') {
      this.cdjModels = { A: buildCdj('A', 'deck-a'), B: buildCdj('B', 'deck-b') };
      this.cdjModels.A.group.position.x = -cdjX;
      this.cdjModels.B.group.position.x = cdjX;
      g.add(this.cdjModels.A.group, this.cdjModels.B.group);
    }
    if (this.gear !== 'cdj') {
      const inner = this.gear === 'both' ? cdjX + 0.16 : 0.135;
      const ttX = inner + 0.02 + TT.w / 2;
      this.ttModels = { A: buildTurntable('A', 'deck-a'), B: buildTurntable('B', 'deck-b') };
      this.ttModels.A.group.position.set(-ttX, 0, 0.02);
      this.ttModels.B.group.position.set(ttX, 0, 0.02);
      g.add(this.ttModels.A.group, this.ttModels.B.group);
    }
    if (!this.takenOver) {
      // the resident DJ is mid-set
      this.cdjModels?.A.showcase();
      this.cdjModels?.B.showcase();
      this.mixerModel.meterMats.forEach((col) => col.forEach((m, i) => (m.emissiveIntensity = i < 7 ? 1.5 : 0)));
    }
  }

  setGear(gear: Gear): void {
    if (gear === this.gear) return;
    this.gear = gear;
    this.buildGear();
  }

  // ---------------------------------------------------------------- the decks

  /** Jump on the decks: the resident DJ steps aside and the camera drops in behind the gear. */
  stepUp(): void {
    if (this.mode === 'booth') return;
    this.mode = 'booth';
    if (!this.takenOver) {
      this.takenOver = true;
      this.dj.group.visible = false;
    }
    this.orbitReturn = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
    this.controls.enabled = false;
    this.controls.autoRotate = false;
    this.moveCamera(BOOTH_POSE.pos, this.lookAround ? ROOM_LOOK_TARGET : BOOTH_POSE.target);
    this.centreMove = { from: this.viewCentre, to: this.lookAround ? 0.5 : this.boothCentre };
  }

  /** Hide or show the decks while you're on them: look up at the room, or back down at the gear. */
  setLookAround(on: boolean): void {
    if (on === this.lookAround) return;
    this.lookAround = on;
    this.look = { yaw: 0, pitch: 0, yawTo: 0, pitchTo: 0 };
    if (this.mode !== 'booth') return;
    this.moveCamera(BOOTH_POSE.pos, on ? ROOM_LOOK_TARGET : BOOTH_POSE.target);
    this.centreMove = { from: this.viewCentre, to: on ? 0.5 : this.boothCentre };
  }

  /** Drag to turn your head while the decks are hidden. */
  private bindLookDrag(el: HTMLElement): void {
    let last: { x: number; y: number } | null = null;
    el.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'booth' || !this.lookAround) return;
      last = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!last) return;
      const L = this.look;
      L.yawTo = THREE.MathUtils.clamp(L.yawTo - (e.clientX - last.x) * 0.004, -1.4, 1.4);
      L.pitchTo = THREE.MathUtils.clamp(L.pitchTo + (e.clientY - last.y) * 0.003, -0.5, 0.6);
      last = { x: e.clientX, y: e.clientY };
    });
    const end = () => (last = null);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /** Back onto the floor, where you were. */
  stepBack(): void {
    if (this.mode === 'room') return;
    this.mode = 'room';
    this.controls.enabled = true;
    const back = this.orbitReturn ?? { pos: VIEWS.floor.pos, target: VIEWS.floor.target };
    this.moveCamera(back.pos, back.target);
    this.centreMove = { from: this.viewCentre, to: 0.5 };
    this.controls.autoRotate = this.settings.autoOrbit;
  }

  /** Where the booth controls leave room to see the gear (fraction of the screen height). */
  setBoothCentre(fraction: number): void {
    this.boothCentre = fraction;
    if (this.mode === 'booth' && !this.camMove && !this.lookAround) {
      this.viewCentre = fraction;
      this.applyViewCentre();
    }
  }

  private moveCamera(pos: THREE.Vector3, target: THREE.Vector3): void {
    this.camMove = { from: this.camera.position.clone(), to: pos.clone(), tFrom: this.controls.target.clone(), tTo: target.clone(), start: performance.now() / 1000 };
  }

  /** Shift the projection so the camera's centre lands at `viewCentre` on screen (as in the bedroom). */
  private applyViewCentre(): void {
    const W = this.width;
    const H = this.height;
    const baseFov = W / H < 0.8 ? 75 : 62; // a wider lens on phones held upright
    const yc = this.viewCentre * H;
    let Hv = H;
    if (Math.abs(yc - H / 2) < 0.5) this.camera.clearViewOffset();
    else if (yc < H / 2) {
      Hv = 2 * (H - yc);
      this.camera.setViewOffset(W, Hv, 0, Hv - H, W, H);
    } else {
      Hv = 2 * yc;
      this.camera.setViewOffset(W, Hv, 0, 0, W, H);
    }
    this.camera.aspect = W / Hv;
    this.camera.fov = (2 * Math.atan(Math.tan((baseFov * Math.PI) / 360) * (Hv / H)) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
  }

  /** The on-air deck that's leading the room, if any is audible. */
  private musicSource(): { beat: number; bpm: number; deck: DeckId } | null {
    const mx = engine.mixer;
    if (engine.ctx.state !== 'running') return null;
    let best: { beat: number; bpm: number; deck: DeckId } | null = null;
    let bestLevel = -Infinity;
    for (const id of ['A', 'B'] as DeckId[]) {
      const p = engine.player(id);
      const g = p.grid;
      if (!p.loaded || !p.playing || !g || !mx.onAir(id)) continue;
      const level = peakDb(mx.channels[id].meter);
      if (level > bestLevel) {
        bestLevel = level;
        best = { beat: beatAt(g, p.position) - g.downbeat, bpm: p.bpm, deck: id };
      }
    }
    if (!best || peakDb(mx.masterMeterL) < -48) return null;
    return best;
  }

  private makeBeam(parent: THREE.Object3D, spread: number, withSpot: boolean): Beam {
    const pivot = new THREE.Object3D();
    parent.add(pivot);
    const mesh = new THREE.Mesh(beamGeometry(spread), beamMaterial());
    mesh.frustumCulled = false;
    pivot.add(mesh);
    let spot: Beam['spot'];
    if (withSpot) {
      spot = new THREE.Mesh(
        new THREE.CircleGeometry(1, 24),
        new THREE.MeshBasicMaterial({ map: this.dot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      );
      spot.rotation.x = -Math.PI / 2;
      this.scene.add(spot);
    }
    return { pivot, mesh, spot, spread };
  }

  private fixtureBody(x: number, y: number, z: number, size = 0.28): { group: THREE.Group; lens: THREE.MeshStandardMaterial } {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const body = new THREE.Mesh(new RoundedBoxGeometry(size, size * 1.1, size, 3, 0.03), this.std('club-fixture', 0.5, 0.4));
    group.add(body);
    const lens = this.glow('white', 0);
    const l = new THREE.Mesh(new THREE.CircleGeometry(size * 0.38, 20), lens);
    l.rotation.x = Math.PI / 2;
    l.position.y = -size * 0.56;
    group.add(l);
    this.scene.add(group);
    return { group, lens };
  }

  private buildTruss(z: number, width: number): void {
    const mat = this.std('club-truss', 0.35, 0.8);
    const tube = new THREE.CylinderGeometry(0.025, 0.025, width, 8).rotateZ(Math.PI / 2);
    for (const [dy, dz] of [
      [0.15, 0.15],
      [0.15, -0.15],
      [-0.15, 0.15],
      [-0.15, -0.15],
    ]) {
      const m = new THREE.Mesh(tube, mat);
      m.position.set(0, TRUSS_Y + dy, z + dz);
      this.scene.add(m);
    }
    const n = Math.round(width / 0.3);
    const diag = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), mat, n * 2);
    const mm = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const x = -width / 2 + (i + 0.5) * 0.3;
      const dir = i % 2 ? 1 : -1;
      for (const k of [0, 1]) {
        mm.makeRotationZ(dir * Math.PI / 4).setPosition(x, TRUSS_Y, z + (k ? 0.15 : -0.15));
        diag.setMatrixAt(i * 2 + k, mm);
      }
    }
    this.scene.add(diag);
    // chain hoists
    for (const x of [-width / 2 + 0.4, width / 2 - 0.4]) this.box(0.02, V.h - TRUSS_Y - 0.15, 0.02, mat, x, (V.h + TRUSS_Y + 0.15) / 2, z);
  }

  private buildRig(): void {
    const frontZ = STAGE.z1 + 0.3;
    const midZ = 0.6;
    this.buildTruss(frontZ, 12);
    this.buildTruss(midZ, 12);
    this.buildTruss(STAGE.z0 + 1.2, 11);

    // moving heads: six over the stage front, four over the floor
    const moverXs: [number, number][] = [
      ...[-5, -3, -1, 1, 3, 5].map((x) => [x, frontZ] as [number, number]),
      ...[-4.5, -1.5, 1.5, 4.5].map((x) => [x, midZ] as [number, number]),
    ];
    for (const [x, z] of moverXs) {
      const { group, lens } = this.fixtureBody(x, TRUSS_Y - 0.42, z, 0.3);
      const yoke = this.box(0.04, 0.3, 0.36, this.std('club-fixture'), 0, 0.2, 0, group);
      yoke.name = 'yoke';
      this.movers.push({ lens, head: group, beams: [this.makeBeam(group, 0.075, true)] });
    }

    // par cans: the back truss lights the DJ and the wall, the front truss washes the floor
    for (let i = 0; i < 8; i++) {
      const x = -5.25 + i * 1.5;
      const back = i % 2 === 0;
      const z = back ? STAGE.z0 + 1.2 : frontZ;
      const { group, lens } = this.fixtureBody(x, TRUSS_Y - 0.3, z, 0.22);
      const beam = this.makeBeam(group, 0.24, false);
      beam.pivot.lookAt(new THREE.Vector3(x * 0.4, back ? STAGE.h : 0, back ? BOOTH_Z + 1 : FLOOR.z0 + 3));
      this.pars.push({ lens, beams: [beam] });
    }

    // scanners on the side walls, three-dot gobo each
    for (const [x, z] of [
      [-6.6, -3],
      [6.6, -3],
      [-6.6, 2.5],
      [6.6, 2.5],
    ]) {
      const { group, lens } = this.fixtureBody(x, 4.6, z, 0.24);
      group.rotation.z = Math.sign(x) * 0.4;
      const beams = [0, 1, 2].map(() => this.makeBeam(this.scene, 0.022, true));
      beams.forEach((b) => b.pivot.position.copy(group.position));
      this.scanners.push({ lens, beams });
    }

    // lasers: one on the stage lip, one on each PA stack
    for (const [x, y, z] of [
      [0, STAGE.h + 0.12, STAGE.z1 - 0.2],
      [-6.1, STAGE.h + 3.2, STAGE.z1 - 0.9],
      [6.1, STAGE.h + 3.2, STAGE.z1 - 0.9],
    ]) {
      const origin = new THREE.Object3D();
      origin.position.set(x, y, z);
      this.scene.add(origin);
      this.box(0.3, 0.12, 0.25, this.std('club-fixture', 0.4, 0.5), x, y - 0.08, z);
      const beams = Array.from({ length: 9 }, () => {
        const b = this.makeBeam(origin, 0.0007, false);
        b.mesh.material.uniforms.uSoft.value = 0.15;
        b.pivot.scale.setScalar(26);
        return b;
      });
      this.lasers.push({ origin, beams });
    }

    // strobes: four on the front truss, two on the back
    for (const [x, z] of [
      [-4, frontZ],
      [-2, frontZ],
      [2, frontZ],
      [4, frontZ],
      [-3, STAGE.z0 + 1.2],
      [3, STAGE.z0 + 1.2],
    ]) {
      const mat = this.glow('white', 0);
      this.strobes.push(mat);
      const g = new THREE.Group();
      g.position.set(x, TRUSS_Y - 0.28, z);
      this.box(0.5, 0.2, 0.14, this.std('club-fixture'), 0, 0, 0, g);
      this.box(0.44, 0.14, 0.02, mat, 0, 0, 0.075, g);
      g.rotation.x = 0.5;
      this.scene.add(g);
    }
  }

  private buildFloor(): void {
    const cols = 9;
    const rows = 7;
    const tw = (FLOOR.x1 - FLOOR.x0) / cols;
    const td = (FLOOR.z1 - FLOOR.z0) / rows;
    this.tileCount = cols * rows;
    this.tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(tw - 0.04, 0.05, td - 0.04), new THREE.MeshBasicMaterial({ toneMapped: false }), this.tileCount);
    const m = new THREE.Matrix4();
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        m.makeTranslation(FLOOR.x0 + (c + 0.5) * tw, 0.025, FLOOR.z0 + (r + 0.5) * td);
        this.tiles.setMatrixAt(r * cols + c, m);
        this.tiles.setColorAt(r * cols + c, this.tmpColor.setHex(hex('club-tile-off')));
      }
    this.tiles.userData = { cols, rows };
    this.scene.add(this.tiles);
  }

  private podiumSpots(): { x: number; z: number }[] {
    return [
      { x: -5.7, z: -2.6 },
      { x: 5.7, z: -2.6 },
      { x: -5.7, z: 1.8 },
      { x: 5.7, z: 1.8 },
    ];
  }

  private buildPodiums(): void {
    for (const { x, z } of this.podiumSpots()) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 1.1, 32), this.std('graphite-600', 0.3, 0.6));
      p.position.set(x, 0.55, z);
      this.podiums.add(p);
      const ring = this.glow('hot-pink', 2);
      this.podiumRings.push(ring);
      for (const y of [1.08, 0.04]) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(y > 1 ? 0.55 : 0.6, 0.02, 8, 48), ring);
        r.rotation.x = Math.PI / 2;
        r.position.set(x, y, z);
        this.podiums.add(r);
      }
      const up = new THREE.PointLight(hex('hot-pink'), 1.5, 3, 1.5);
      up.position.set(x, 1.3, z);
      up.userData.podium = true;
      this.podiums.add(up);
    }
    this.scene.add(this.podiums);
  }

  private buildSmoke(): void {
    const n = 260;
    const pos = new Float32Array(n * 3);
    this.smokeVel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = Math.random() * 3.2;
      pos[i * 3 + 2] = -7 + Math.random() * 13;
      this.smokeVel[i * 3] = (Math.random() - 0.5) * 0.12;
      this.smokeVel[i * 3 + 1] = 0.02 + Math.random() * 0.05;
      this.smokeVel[i * 3 + 2] = 0.05 + Math.random() * 0.12;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.smoke = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 2.6,
        map: this.dot,
        color: hex('club-haze'),
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.smoke.frustumCulled = false;
    this.scene.add(this.smoke);
  }

  // ---------------------------------------------------------------- per frame

  private resize(el: HTMLElement): void {
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.bloom.resolution.set(w / 2, h / 2);
    this.applyViewCentre();
  }

  /** Light colour for fixture i at this moment. */
  private colour(i: number, out: THREE.Color, beats: number): THREE.Color {
    const s = this.settings;
    if (s.palette === 'rainbow') return out.setHSL((beats * 0.03 + i * 0.13) % 1, 1, 0.55);
    const list = PALETTES[s.palette];
    // the palette steps round one fixture per bar
    return out.setHex(hex(list[(i + Math.floor(beats / 4)) % list.length]));
  }

  private baseHue(beats: number): number {
    const s = this.settings;
    if (s.palette === 'rainbow') return beats * 0.02;
    const c = new THREE.Color(hex(PALETTES[s.palette][Math.floor(beats / 8) % 3]));
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    return hsl.h;
  }

  /** Point a beam at a world position and size its floor spot. */
  private aim(b: Beam, target: THREE.Vector3, colour: THREE.Color, opacity: number): void {
    const from = new THREE.Vector3();
    b.pivot.getWorldPosition(from);
    b.pivot.lookAt(target);
    const len = from.distanceTo(target);
    b.mesh.scale.setScalar(len);
    b.mesh.material.uniforms.uColor.value.copy(colour);
    b.mesh.material.uniforms.uOpacity.value = opacity;
    b.mesh.visible = opacity > 0.001;
    if (b.spot) {
      b.spot.position.set(target.x, target.y + 0.06, target.z);
      b.spot.scale.setScalar(Math.max(0.15, len * b.spread * 1.15));
      b.spot.material.color.copy(colour).multiplyScalar(Math.min(1.4, opacity * 2.2));
      b.spot.visible = b.mesh.visible;
    }
  }

  private floorHeightAt(x: number, z: number): number {
    return Math.abs(x) < STAGE.x && z < STAGE.z1 ? STAGE.h : 0;
  }

  private frame(time: number): void {
    // behind the decks the club is a backdrop to the controls: 30 fps is plenty
    if (this.mode === 'booth' && !this.camMove && time - this.lastT < 0.03) return;
    const dt = Math.min(0.1, time - (this.lastT || time));
    this.lastT = time;
    const s = { ...this.settings };
    const mx = engine.mixer;

    // the clock: your mix when a deck is on air, otherwise the light desk's own tempo
    const src = this.takenOver ? this.musicSource() : null;
    this.clock.live = !!src;
    this.clock.deck = src?.deck ?? null;
    if (src) {
      this.beats = src.beat;
      this.clock.bpm = src.bpm;
      s.playing = true;
    } else {
      this.beats += s.playing ? (dt * s.bpm) / 60 : dt * 0.25;
      this.clock.bpm = s.bpm;
    }
    const beats = this.beats;
    const ph = ((beats % 1) + 1) % 1;
    const bass = this.takenOver ? mx.bassLevel() : 0;
    this.bassAvg += (bass - this.bassAvg) * Math.min(1, dt * 3);
    // with your music the light hits follow the kick drum, not just the grid
    const kick = s.playing ? Math.pow(1 - ph, 3) * (src ? 0.35 + 0.65 * Math.min(1, bass * 1.6) : 1) : 0;

    // a real drop: the bass comes back after at least two bars without it
    if (src) {
      const step = Math.max(0, beats - this.lastBeats);
      if (this.bassAvg < 0.12) this.quietBeats += Math.min(step, 1);
      else if (bass > 0.45 && this.quietBeats >= 8 && this.phase === 'none') {
        this.dropAt = Math.floor(beats);
        this.quietBeats = 0;
      } else if (this.bassAvg > 0.3) this.quietBeats = 0;
    }
    this.lastBeats = beats;
    const phase = s.playing ? this.phase : 'none';
    const build = phase === 'build' ? (beats - (this.dropAt - 8)) / 8 : 0;
    const dropping = phase === 'drop';

    // the crowd's mood follows the show, and once you're DJing, your music
    let energy = s.playing ? 0.55 + (s.lights ? 0.2 : 0) + (s.lasers ? 0.1 : 0) + (s.strobes ? 0.1 : 0) + (s.screen ? 0.05 : 0) : 0.1;
    if (this.takenOver) energy = src ? THREE.MathUtils.clamp(0.3 + this.bassAvg * 1.5, 0.25, 1.3) : 0.12;
    if (phase === 'build') energy = 0.2;
    if (dropping) energy = 1.6;
    this.crowd.update(beats, energy, time);
    this.dancers.update(beats, Math.max(this.takenOver && !src ? 0.12 : 1, energy), time);
    if (this.dj.group.visible) this.dj.update(beats, s.playing ? energy : 0.1, time);

    // the booth gear mirrors the decks once they're yours
    if (this.takenOver) {
      const now = performance.now();
      this.cdjModels?.A.update(engine.decks.A, now);
      this.cdjModels?.B.update(engine.decks.B, now);
      this.ttModels?.A.update(engine.turntables.A, now);
      this.ttModels?.B.update(engine.turntables.B, now);
      this.mixerModel.update(mx);
      const levels = [peakDb(mx.channels.A.meter), peakDb(mx.masterMeterL), peakDb(mx.masterMeterR), peakDb(mx.channels.B.meter)];
      this.mixerModel.meterMats.forEach((col, ci) => {
        const lit = Math.round(((levels[ci] + 30) / 33) * col.length);
        col.forEach((m, i) => (m.emissiveIntensity = i < lit ? 1.6 : 0.03));
      });
    }

    const haze = s.smoke ? 0.35 + s.smokeDensity * 0.9 : 0.18;
    const I = s.intensity * (phase === 'build' ? 0.35 + 0.65 * build : 1) * (dropping ? 1.25 : 1);
    const c = this.tmpColor;

    // house lights and ambience
    this.house.visible = s.houseLights;
    this.house.children.forEach((l) => ((l as THREE.PointLight).intensity = s.houseLights ? 6 : 0));
    this.ambient.intensity = s.houseLights ? 0.5 : 0.05;
    this.fog.density = s.smoke ? 0.012 + s.smokeDensity * 0.04 : 0.008;

    // ---- wash, chase and pulse on the pars and the floor lights
    const lightsOn = s.lights || dropping;
    const moverMode = s.lightMode === 'movers' || dropping;
    this.pars.forEach((f, i) => {
      let level = 0;
      if (lightsOn) {
        if (s.lightMode === 'wash') level = 0.75 + 0.25 * Math.sin(beats * 0.4 + i);
        else if (s.lightMode === 'chase') level = Math.floor(beats * 2) % this.pars.length === i ? 1 : 0.06;
        else if (s.lightMode === 'pulse') level = 0.15 + 0.85 * kick;
        else level = 0.35 + 0.3 * kick;
        if (dropping) level = Math.floor(beats * 4) % 2 === i % 2 ? 1 : 0.2;
      }
      level *= I;
      this.colour(i, c, beats);
      f.lens.emissive.copy(c);
      f.lens.emissiveIntensity = level * 3;
      const b = f.beams[0];
      b.mesh.material.uniforms.uColor.value.copy(c);
      b.mesh.material.uniforms.uOpacity.value = level * 0.16 * haze;
      b.mesh.scale.setScalar(6);
      b.mesh.visible = level > 0.01;
    });
    this.floorLights.forEach((l, i) => {
      this.colour(i, c, beats);
      l.color.copy(c);
      let level = 0;
      if (lightsOn) level = s.lightMode === 'pulse' ? 0.3 + 0.7 * kick : s.lightMode === 'chase' ? (Math.floor(beats) % 4 === i ? 1 : 0.25) : 0.75;
      l.intensity = level * I * 9;
    });

    // ---- moving heads
    const pattern = Math.floor(beats / 32) % 3;
    this.movers.forEach((f, i) => {
      const on = lightsOn && moverMode;
      const base = f.head!.position;
      const t = new THREE.Vector3();
      const k = i / this.movers.length;
      if (pattern === 0 || dropping) {
        // sweep the crowd left to right, staggered
        t.set(Math.sin(beats * Math.PI * 0.125 + k * 3) * 5, 0, -0.5 + Math.cos(beats * Math.PI * 0.0625 + k * 5) * 3);
      } else if (pattern === 1) {
        // fan out from the stage and breathe on the bar
        t.set(base.x * (1.2 + 0.6 * Math.sin(beats * Math.PI * 0.25)), 0, base.z + 3 + Math.sin(beats * Math.PI * 0.5 + i) * 1.5);
      } else {
        // ballyhoo: everyone circles
        const a = beats * Math.PI * 0.25 + k * Math.PI * 2;
        t.set(base.x * 0.5 + Math.cos(a) * 2.2, 0, -0.6 + Math.sin(a) * 2.6);
      }
      t.y = this.floorHeightAt(t.x, t.z);
      this.colour(i, c, beats);
      if (dropping && Math.floor(beats) % 2) c.setHex(hex('white'));
      const level = on ? I * (s.lightMode === 'movers' ? 0.85 + 0.15 * kick : 1) : 0;
      this.aim(f.beams[0], t, c, level * 0.28 * haze);
      f.lens.emissive.copy(c);
      f.lens.emissiveIntensity = level * 4;
    });

    // ---- scanners: fast, tight beams that throw dots across the floor
    this.scanners.forEach((f, i) => {
      const on = s.scanners;
      const sp = (0.6 + s.scannerSpeed * 2.2) * (s.playing ? 1 : 0.1);
      const tt = time * sp;
      const mirror = i % 2 ? -1 : 1;
      this.colour(i + 1, c, beats * 2);
      f.beams.forEach((b, j) => {
        const a = tt * (1 + j * 0.12) + j * 2.1;
        const x = mirror * (Math.sin(a * 1.3) * 3.8);
        const z = -0.6 + Math.sin(a * 2.1 + i) * 3.2;
        const target = new THREE.Vector3(x, 0, z);
        // gobo chop on the off-beat
        const chop = Math.floor(beats * 4 + j) % 4 === 3 ? 0.15 : 1;
        this.aim(b, target, c, on ? 0.5 * haze * chop * s.intensity : 0);
      });
      f.lens.emissive.copy(c);
      f.lens.emissiveIntensity = on ? 3 : 0;
    });

    // ---- lasers
    const lasersOn = s.lasers || dropping;
    const lp = dropping ? 'tunnel' : s.laserPattern;
    this.lasers.forEach((L, li) => {
      L.beams.forEach((b, j) => {
        const n = L.beams.length;
        const k = j / (n - 1) - 0.5; // −0.5..0.5 across the fan
        let yaw = 0;
        let pitch = 0;
        const side = li === 0 ? 0 : li === 1 ? -1 : 1;
        if (lp === 'fan') {
          yaw = k * 1.5 + Math.sin(beats * Math.PI * 0.25) * 0.25 - side * 0.35;
          pitch = 0.2 + 0.06 * Math.sin(beats * Math.PI * 0.5) + (li ? -0.32 : 0);
        } else if (lp === 'sweep') {
          yaw = Math.sin(beats * Math.PI * 0.125 + j * 0.06) * 0.9 - side * 0.3;
          pitch = k * 0.35 + (li ? -0.1 : 0.24);
        } else {
          const a = beats * Math.PI * 0.5 + (j / n) * Math.PI * 2;
          yaw = Math.cos(a) * 0.32 - side * 0.35;
          pitch = Math.sin(a) * 0.14 + (li ? -0.08 : 0.26);
        }
        b.pivot.rotation.set(-pitch, yaw, 0, 'YXZ');
        b.pivot.scale.setScalar(26);
        if (s.laserColour === 'rgb') c.setHSL((j / n + beats * 0.05) % 1, 1, 0.5);
        else c.setHex(hex(`club-laser-${s.laserColour}`));
        // lasers punch out on the beat in the build, strobe-chop in the drop
        let on = lasersOn ? 1 : 0;
        if (phase === 'build') on *= ph < 0.25 ? 1 : 0;
        if (dropping) on *= Math.floor(beats * 4) % 2 ? 1 : 0.3;
        b.mesh.material.uniforms.uColor.value.copy(c);
        b.mesh.material.uniforms.uOpacity.value = on * (0.16 + haze * 0.22);
        b.mesh.visible = on > 0;
      });
    });

    // ---- strobes
    let strobe = 0;
    const strobeOn = s.strobes || dropping || (phase === 'build' && build > 0.5);
    if (strobeOn && s.playing) {
      const rate = phase === 'build' ? 4 : dropping ? (Math.floor(beats / 4) % 2 ? 4 : 1) : s.strobeRate;
      const period = 60 / s.bpm / rate;
      const dur = Math.min(0.5, 0.04 / period);
      strobe = (beats * rate) % 1 < dur ? 1 : 0;
    }
    this.strobes.forEach((m) => (m.emissiveIntensity = strobe * 8));
    this.strobeLight.intensity = strobe * 60;

    // ---- LED wall
    const hueNow = this.baseHue(beats);
    if (s.screen) {
      this.wall.draw(s.screenMode, beats, time, s.screenSpeed, hueNow, energy);
      this.screenLight.color.copy(this.wall.spill);
      this.screenLight.intensity = 10;
    } else {
      this.wall.off();
      this.screenLight.intensity = 0;
    }

    // ---- LED dance floor
    const { cols, rows } = this.tiles.userData as { cols: number; rows: number };
    const floorMode = Math.floor(beats / 16) % 3;
    for (let r = 0; r < rows; r++)
      for (let col = 0; col < cols; col++) {
        const i = r * cols + col;
        if (!s.floorLeds) {
          this.tiles.setColorAt(i, c.setHex(hex('club-tile-off')));
          continue;
        }
        let v = 0;
        if (floorMode === 0) v = (r + col + Math.floor(beats)) % 2 ? 0.08 : 0.3 + 0.7 * kick; // checker on the beat
        else if (floorMode === 1) {
          const d = Math.hypot(col - (cols - 1) / 2, r - (rows - 1) / 2);
          v = Math.max(0.05, 1 - Math.abs(d - ph * 6) * 0.9); // ripple from the centre
        } else v = Math.floor(beats * 2) % cols === col ? 1 : 0.07; // column sweep
        if (dropping) v = Math.max(v, kick);
        if (s.palette === 'rainbow') c.setHSL((beats * 0.02 + (r + col) * 0.04) % 1, 1, 0.5);
        else c.setHex(hex(PALETTES[s.palette][(r + col + Math.floor(beats / 2)) % 3]));
        c.multiplyScalar(v * (0.35 + 0.65 * s.intensity));
        this.tiles.setColorAt(i, c);
      }
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;

    // ---- LED strips, podium rings
    this.colour(0, c, beats);
    for (const m of this.ledStrips) {
      m.emissive.copy(c);
      m.emissiveIntensity = (lightsOn ? 1 + 1.5 * kick : 0.4) * (0.4 + 0.6 * s.intensity);
    }
    this.colour(2, c, beats);
    for (const m of this.podiumRings) {
      m.emissive.copy(c);
      m.emissiveIntensity = 1 + 2 * kick;
    }
    this.podiums.children.forEach((o) => {
      if (o.userData.podium) (o as THREE.PointLight).color.copy(c);
    });

    // ---- speaker cones pump with the kick
    const push = this.takenOver ? bass * bass : kick;
    for (const spk of this.speakers) spk.cone.position.z = 0.134 + push * 0.01;

    // ---- smoke drifts off the stage and across the floor
    this.smoke.visible = s.smoke;
    if (s.smoke) {
      const mat = this.smoke.material as THREE.PointsMaterial;
      mat.opacity = 0.025 + s.smokeDensity * 0.09;
      const p = this.smoke.geometry.attributes.position as THREE.BufferAttribute;
      const a = p.array as Float32Array;
      for (let i = 0; i < a.length; i += 3) {
        a[i] += this.smokeVel[i] * dt;
        a[i + 1] += this.smokeVel[i + 1] * dt * 0.4;
        a[i + 2] += this.smokeVel[i + 2] * dt;
        if (a[i + 2] > 7 || a[i + 1] > 4.5) {
          a[i] = (Math.random() - 0.5) * 10;
          a[i + 1] = STAGE.h * 0.5 + Math.random() * 0.8;
          a[i + 2] = -6 + Math.random() * 2;
        }
      }
      p.needsUpdate = true;
    }

    // ---- camera
    if (this.camMove) {
      const k = Math.min(1, (performance.now() / 1000 - this.camMove.start) / 1.1);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.camera.position.lerpVectors(this.camMove.from, this.camMove.to, e);
      this.controls.target.lerpVectors(this.camMove.tFrom, this.camMove.tTo, e);
      if (this.centreMove) {
        this.viewCentre = this.centreMove.from + (this.centreMove.to - this.centreMove.from) * e;
        this.applyViewCentre();
      }
      if (k >= 1) {
        this.camMove = null;
        this.centreMove = null;
      }
    }
    if (this.mode === 'booth' && this.lookAround && !this.camMove) {
      const L = this.look;
      L.yaw += (L.yawTo - L.yaw) * 0.15;
      L.pitch += (L.pitchTo - L.pitch) * 0.15;
      const dir = ROOM_LOOK_TARGET.clone().sub(this.camera.position);
      const sph = new THREE.Spherical().setFromVector3(dir);
      sph.theta += L.yaw;
      sph.phi = THREE.MathUtils.clamp(sph.phi - L.pitch, 0.25, Math.PI - 0.25);
      this.controls.target.copy(this.camera.position).add(new THREE.Vector3().setFromSpherical(sph));
    }
    if (this.mode === 'booth') this.camera.lookAt(this.controls.target);
    else this.controls.update();
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    if (this.takenOver) mx.setListener(this.camera.position, fwd); // your ears follow the camera
    const p = this.camera.position;
    p.x = THREE.MathUtils.clamp(p.x, -V.w / 2 + 0.3, V.w / 2 - 0.3);
    p.y = THREE.MathUtils.clamp(p.y, 0.4, V.h - 0.3);
    p.z = THREE.MathUtils.clamp(p.z, -V.d / 2 + 0.6, V.d / 2 - 0.3);

    if (s.glow) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
