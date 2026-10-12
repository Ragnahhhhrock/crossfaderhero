import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { engine } from '../audio/engine';
import { peakDb } from '../audio/mixer';
import { hex } from '../design/tokens';
import { buildCdj, buildMixer, buildSpeaker, type Action, type CdjModel, type MixerModel, type SpeakerModel } from './models';
import { floorTexture, nightTexture, posterTexture, rugTexture } from './textures';

export type Mode = 'room' | 'booth';

interface Pose {
  pos: THREE.Vector3;
  yaw: number;
  pitch: number;
}

// Room is 6 m wide (x) by 5 m deep (z), desk against the north wall (−z).
const ROOM = { w: 6, d: 5, h: 2.6 };
const DESK = { w: 2.0, d: 0.7, h: 0.88, z: -2.5 + 0.35 };
const EYE = 1.65;
const DJ_SPOT = new THREE.Vector3(0, 1.6, -1.32);
const BOOTH_POSE: Pose = { pos: new THREE.Vector3(0, 1.74, -0.72), yaw: 0, pitch: -0.5 };
const START_POSE: Pose = { pos: new THREE.Vector3(0.6, EYE, 1.7), yaw: 0.18, pitch: -0.12 };
const REACH = 2.1; // metres you can reach to press a button on the gear

/**
 * The bedroom: a desk with two media players, a mixer and a pair of monitors.
 * Everything visual mirrors the live audio engine; nothing here owns state the
 * engine doesn't already have.
 */
export class Room {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private cdjs!: { A: CdjModel; B: CdjModel };
  private mixer!: MixerModel;
  private speakers: SpeakerModel[] = [];
  private clickables: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private ledLight!: THREE.PointLight;

  mode: Mode = 'room';
  /** Marketing render: fixed camera, gear lit as if mid-set, engine ignored. */
  private showcase = false;
  private pose: Pose = { pos: START_POSE.pos.clone(), yaw: START_POSE.yaw, pitch: START_POSE.pitch };
  private walkPose: Pose = { pos: START_POSE.pos.clone(), yaw: START_POSE.yaw, pitch: START_POSE.pitch };
  private transition: { from: Pose; to: Pose; fromCentre: number; toCentre: number; t: number } | null = null;
  /** Vertical position of the view centre, as a fraction of the screen height (0.5 = middle). */
  private viewCentre = 0.5;
  private boothCentre = 0.3;
  readonly keys = new Set<string>();
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.03, 30);
    this.camera.rotation.order = 'YXZ';
    this.scene.background = new THREE.Color(hex('graphite-900'));
    this.build();
    this.applyPose();
  }

  // ---------------------------------------------------------------- scene
  private build() {
    const s = this.scene;
    const { w, d, h } = ROOM;

    // floor, ceiling, walls
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.75 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: hex('room-ceiling'), roughness: 1 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = h;
    s.add(ceiling);
    const wallMat = new THREE.MeshStandardMaterial({ color: hex('room-wall'), roughness: 0.95 });
    const accentWall = new THREE.MeshStandardMaterial({ color: hex('room-wall-accent'), roughness: 0.95 });
    const wall = (width: number, mat: THREE.Material, x: number, z: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(width, h), mat);
      m.position.set(x, h / 2, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      s.add(m);
      return m;
    };
    wall(w, accentWall, 0, -d / 2, 0); // north, behind the desk
    wall(w, wallMat, 0, d / 2, Math.PI); // south
    wall(d, wallMat, -w / 2, 0, Math.PI / 2); // west
    wall(d, wallMat, w / 2, 0, -Math.PI / 2); // east
    // skirting boards
    const skirtMat = new THREE.MeshStandardMaterial({ color: hex('room-trim'), roughness: 0.6 });
    const skirt = (len: number, x: number, z: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.09, 0.015), skirtMat);
      m.position.set(x, 0.045, z);
      m.rotation.y = ry;
      s.add(m);
    };
    skirt(w, 0, -d / 2 + 0.008, 0);
    skirt(w, 0, d / 2 - 0.008, 0);
    skirt(d, -w / 2 + 0.008, 0, Math.PI / 2);
    skirt(d, w / 2 - 0.008, 0, Math.PI / 2);

    // rug
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.7), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.004, 0.2);
    rug.receiveShadow = true;
    s.add(rug);

    // window on the west wall
    const win = new THREE.Group();
    win.position.set(-w / 2 + 0.01, 1.5, -0.3);
    win.rotation.y = Math.PI / 2;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.0), new THREE.MeshBasicMaterial({ map: nightTexture() }));
    win.add(glass);
    const frameMat = new THREE.MeshStandardMaterial({ color: hex('room-trim'), roughness: 0.5 });
    for (const [fw, fh, fx, fy] of [[1.42, 0.06, 0, 0.53], [1.42, 0.08, 0, -0.53], [0.06, 1.1, -0.68, 0], [0.06, 1.1, 0.68, 0], [0.03, 1.0, 0, 0]] as const) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.05), frameMat);
      f.position.set(fx, fy, 0.02);
      win.add(f);
    }
    s.add(win);

    // door on the south wall
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.86, 2.05, 0.04), new THREE.MeshStandardMaterial({ color: hex('room-trim'), roughness: 0.55 }));
    door.position.set(1.9, 1.025, d / 2 - 0.02);
    s.add(door);
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshStandardMaterial({ color: hex('room-brass'), metalness: 0.9, roughness: 0.3 }));
    handle.position.set(1.57, 1.0, d / 2 - 0.05);
    s.add(handle);

    // posters
    const poster = (kind: 0 | 1 | 2, x: number, y: number, z: number, ry: number, scale = 1) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5 * scale, 0.707 * scale), new THREE.MeshStandardMaterial({ map: posterTexture(kind), roughness: 0.8 }));
      p.position.set(x, y, z);
      p.rotation.y = ry;
      s.add(p);
    };
    poster(0, -0.55, 1.78, -d / 2 + 0.005, 0, 0.95);
    poster(1, 0.55, 1.78, -d / 2 + 0.005, 0, 0.95);
    poster(2, w / 2 - 0.005, 1.6, -0.4, -Math.PI / 2, 1.1);

    // desk
    const deskWood = new THREE.MeshStandardMaterial({ color: hex('room-desk'), roughness: 0.55, metalness: 0.05 });
    const deskTop = new THREE.Mesh(new RoundedBoxGeometry(DESK.w, 0.04, DESK.d, 2, 0.008), deskWood);
    deskTop.position.set(0, DESK.h - 0.02, DESK.z);
    deskTop.castShadow = deskTop.receiveShadow = true;
    s.add(deskTop);
    const legMat = new THREE.MeshStandardMaterial({ color: hex('room-metal'), roughness: 0.4, metalness: 0.7 });
    for (const lx of [-DESK.w / 2 + 0.05, DESK.w / 2 - 0.05])
      for (const lz of [DESK.z - DESK.d / 2 + 0.05, DESK.z + DESK.d / 2 - 0.05]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, DESK.h - 0.04, 0.04), legMat);
        leg.position.set(lx, (DESK.h - 0.04) / 2, lz);
        leg.castShadow = true;
        s.add(leg);
      }
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(DESK.w - 0.12, 0.025, DESK.d - 0.1), deskWood);
    shelf.position.set(0, 0.25, DESK.z);
    shelf.receiveShadow = true;
    s.add(shelf);

    // LED strip along the back of the desk, washing the wall
    const strip = new THREE.Mesh(new THREE.BoxGeometry(DESK.w - 0.1, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: hex('room-led') }));
    strip.position.set(0, DESK.h + 0.006, -ROOM.d / 2 + 0.02);
    s.add(strip);
    this.ledLight = new THREE.PointLight(hex('room-led'), 0.9, 3, 1.8);
    this.ledLight.position.set(0, DESK.h + 0.25, -ROOM.d / 2 + 0.15);
    s.add(this.ledLight);

    // the gear
    const gearY = DESK.h;
    const gearZ = DESK.z + 0.06;
    this.cdjs = { A: buildCdj('A', 'deck-a'), B: buildCdj('B', 'deck-b') };
    this.cdjs.A.group.position.set(-0.305, gearY, gearZ);
    this.cdjs.B.group.position.set(0.305, gearY, gearZ);
    this.mixer = buildMixer();
    this.mixer.group.position.set(0, gearY, gearZ);
    s.add(this.cdjs.A.group, this.cdjs.B.group, this.mixer.group);

    // monitors on foam pads, toed in towards the DJ
    for (const side of [-1, 1] as const) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.27), new THREE.MeshStandardMaterial({ color: hex('gear-cabinet'), roughness: 1 }));
      const x = side * 0.8;
      const z = DESK.z - 0.08;
      pad.position.set(x, gearY + 0.025, z);
      s.add(pad);
      const sp = buildSpeaker();
      sp.group.position.set(x, gearY + 0.05, z);
      sp.group.rotation.y = Math.atan2(DJ_SPOT.x - x, DJ_SPOT.z - z) * 0.85;
      pad.rotation.y = sp.group.rotation.y;
      s.add(sp.group);
      this.speakers.push(sp);
    }
    this.scene.updateMatrixWorld(true);
    this.speakers.forEach((sp, i) => {
      const mouth = sp.mouth.clone();
      sp.group.localToWorld(mouth);
      const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(sp.group.quaternion);
      engine.mixer.placeSpeaker(i as 0 | 1, mouth, facing);
    });

    // a crate of records beside the desk
    const crate = new THREE.Group();
    crate.position.set(1.35, 0, -2.15);
    crate.rotation.y = -0.3;
    const crateMat = new THREE.MeshStandardMaterial({ color: hex('room-crate'), roughness: 0.8 });
    for (const [bw, bh, bd, bx, by, bz] of [[0.36, 0.02, 0.36, 0, 0.01, 0], [0.36, 0.3, 0.02, 0, 0.15, -0.17], [0.36, 0.3, 0.02, 0, 0.15, 0.17], [0.02, 0.3, 0.36, -0.17, 0.15, 0], [0.02, 0.3, 0.36, 0.17, 0.15, 0]] as const) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), crateMat);
      b.position.set(bx, by, bz);
      b.castShadow = true;
      crate.add(b);
    }
    const sleeveColours = ['print-red', 'print-ink', 'print-paper', 'wave-low', 'print-sun', 'play', 'print-violet', 'print-magenta'].map(hex);
    for (let i = 0; i < 14; i++) {
      const sl = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.31, 0.006), new THREE.MeshStandardMaterial({ color: sleeveColours[i % sleeveColours.length], roughness: 0.7 }));
      sl.position.set(0, 0.17, -0.14 + i * 0.02);
      sl.rotation.x = -0.12 + (i % 3) * 0.04;
      crate.add(sl);
    }
    s.add(crate);

    // lights: warm ceiling pendant + soft sky fill
    s.add(new THREE.HemisphereLight(hex('room-fill-sky'), hex('room-fill-ground'), 0.55));
    const pendant = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 0.13, 24, 1, true), new THREE.MeshStandardMaterial({ color: hex('graphite-700'), side: THREE.DoubleSide, roughness: 0.5 }));
    pendant.position.set(0, h - 0.33, -0.4);
    s.add(pendant);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.27), new THREE.MeshBasicMaterial({ color: hex('graphite-900') }));
    cord.position.set(0, h - 0.135, -0.4);
    s.add(cord);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), new THREE.MeshBasicMaterial({ color: hex('room-lamp-hot') }));
    bulb.position.set(0, h - 0.37, -0.4);
    s.add(bulb);
    const warm = new THREE.PointLight(hex('room-lamp'), 9, 9, 1.5);
    warm.position.set(0, h - 0.42, -0.4);
    warm.castShadow = true;
    warm.shadow.mapSize.set(1024, 1024);
    warm.shadow.bias = -0.002;
    warm.shadow.radius = 4;
    s.add(warm);
    // desk lamp glow over the gear
    const task = new THREE.SpotLight(hex('room-lamp-hot'), 6, 3, 0.7, 0.6, 1.4);
    task.position.set(0, 2.0, -1.6);
    task.target.position.set(0, DESK.h, DESK.z);
    s.add(task, task.target);

    // things you can click
    this.scene.traverse((o) => o.userData.action && this.clickables.push(o));
  }

  // ---------------------------------------------------------------- view
  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.applyViewCentre();
  }

  /** Where the booth controls leave room to see the gear (fraction of height). */
  setBoothCentre(fraction: number) {
    this.boothCentre = fraction;
    if (this.mode === 'booth' && !this.transition) {
      this.viewCentre = fraction;
      this.applyViewCentre();
    }
  }

  /** Shift the projection so the camera's centre lands at `viewCentre` on screen. */
  private applyViewCentre() {
    const W = this.width;
    const H = this.height;
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
    // the projection covers the larger virtual frame; keep on-screen scale constant
    this.camera.aspect = W / Hv;
    this.camera.fov = (2 * Math.atan(Math.tan((62 * Math.PI) / 360) * (Hv / H)) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
  }

  private applyPose() {
    this.camera.position.copy(this.pose.pos);
    this.camera.rotation.set(this.pose.pitch, this.pose.yaw * -1, 0);
  }

  look(dx: number, dy: number) {
    if (this.mode !== 'room' || this.transition) return;
    this.pose.yaw += dx * 0.0032;
    this.pose.pitch = Math.max(-1.3, Math.min(1.2, this.pose.pitch - dy * 0.0032));
  }

  /** Distance from the player to the front of the desk. */
  distanceToDesk(): number {
    const p = this.pose.pos;
    const dx = Math.max(0, Math.abs(p.x) - DESK.w / 2);
    const dz = Math.max(0, p.z - (DESK.z + DESK.d / 2));
    return Math.hypot(dx, dz);
  }

  canStepUp(): boolean {
    return this.mode === 'room' && !this.transition && this.distanceToDesk() < 1.4;
  }

  stepUp() {
    if (this.mode === 'booth') return;
    this.walkPose = { pos: this.pose.pos.clone(), yaw: this.pose.yaw, pitch: this.pose.pitch };
    this.startTransition({ pos: BOOTH_POSE.pos.clone(), yaw: BOOTH_POSE.yaw, pitch: BOOTH_POSE.pitch }, this.boothCentre);
    this.mode = 'booth';
  }

  stepBack() {
    if (this.mode === 'room') return;
    // land half a metre back from the desk, facing it
    const back: Pose = { pos: new THREE.Vector3(0, EYE, -0.75), yaw: 0, pitch: -0.25 };
    if (this.walkPose.pos.z < 0.2 && this.walkPose.pos.z > -1.2) back.pos.x = THREE.MathUtils.clamp(this.walkPose.pos.x, -1, 1);
    this.startTransition(back, 0.5);
    this.mode = 'room';
  }

  private startTransition(to: Pose, toCentre: number) {
    // take the shortest way round
    let yaw = this.pose.yaw;
    while (to.yaw - yaw > Math.PI) yaw += Math.PI * 2;
    while (yaw - to.yaw > Math.PI) yaw -= Math.PI * 2;
    this.transition = { from: { pos: this.pose.pos.clone(), yaw, pitch: this.pose.pitch }, to, fromCentre: this.viewCentre, toCentre, t: 0 };
  }

  /** Mid-transition (render every frame so it's smooth). */
  get busy(): boolean {
    return !!this.transition;
  }

  // ---------------------------------------------------------------- input
  /** The control under a screen point, if it's within reach. */
  pick(clientX: number, clientY: number, rect: DOMRect): { action: Action; label: string } | null {
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.scene.children, true)[0];
    if (!hit || hit.distance > REACH) return null;
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.userData.action) o = o.parent;
    return o ? { action: o.userData.action as Action, label: o.userData.label as string } : null;
  }

  // ---------------------------------------------------------------- frame
  private moveDir = new THREE.Vector3();

  update(dt: number, now: number) {
    dt = Math.min(dt, 0.1);
    if (this.transition) {
      const tr = this.transition;
      tr.t = Math.min(1, tr.t + dt / 0.85);
      const e = tr.t < 0.5 ? 4 * tr.t ** 3 : 1 - (-2 * tr.t + 2) ** 3 / 2;
      this.pose.pos.lerpVectors(tr.from.pos, tr.to.pos, e);
      this.pose.yaw = tr.from.yaw + (tr.to.yaw - tr.from.yaw) * e;
      this.pose.pitch = tr.from.pitch + (tr.to.pitch - tr.from.pitch) * e;
      this.viewCentre = tr.fromCentre + (tr.toCentre - tr.fromCentre) * e;
      this.applyViewCentre();
      if (tr.t >= 1) this.transition = null;
    } else if (this.mode === 'room') {
      this.walk(dt);
    }
    this.applyPose();

    if (this.showcase) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // the gear follows the engine
    this.cdjs.A.update(engine.decks.A, now);
    this.cdjs.B.update(engine.decks.B, now);
    const mx = engine.mixer;
    this.mixer.update(mx);
    const levels = [peakDb(mx.channels.A.meter), peakDb(mx.masterMeterL), peakDb(mx.masterMeterR), peakDb(mx.channels.B.meter)];
    this.mixer.meterMats.forEach((col, c) => {
      const lit = Math.round(((levels[c] + 30) / 33) * col.length);
      col.forEach((m, i) => (m.emissiveIntensity = i < lit ? 1.6 : 0.03));
    });
    const bass = mx.bassLevel();
    for (const sp of this.speakers) {
      const push = bass * bass;
      sp.cone.position.z = 0.134 + push * 0.012;
      sp.cone.scale.setScalar(1 - push * 0.04);
    }
    this.ledLight.intensity = 0.9 + bass * 1.8;

    // the listener's ears follow the camera
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    mx.setListener(this.camera.position, fwd);

    this.renderer.render(this.scene, this.camera);
  }

  private walk(dt: number) {
    const k = this.keys;
    const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const r = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    if (!f && !r) return;
    const speed = (k.has('shift') ? 3.4 : 2.0) * dt;
    const yaw = this.pose.yaw;
    // forward is −z at yaw 0; positive yaw turns right
    this.moveDir.set(Math.sin(yaw) * f + Math.cos(yaw) * r, 0, -Math.cos(yaw) * f + Math.sin(yaw) * r);
    if (this.moveDir.lengthSq() > 1) this.moveDir.normalize();
    const next = this.pose.pos.clone().addScaledVector(this.moveDir, speed);
    // walls
    const m = 0.3;
    next.x = THREE.MathUtils.clamp(next.x, -ROOM.w / 2 + m, ROOM.w / 2 - m);
    next.z = THREE.MathUtils.clamp(next.z, -ROOM.d / 2 + m, ROOM.d / 2 - m);
    // desk + speakers + crate block a box in front of the north wall
    const deskFront = DESK.z + DESK.d / 2 + 0.28;
    if (Math.abs(next.x) < DESK.w / 2 + 0.25 && next.z < deskFront) {
      if (this.pose.pos.z >= deskFront) next.z = deskFront;
      else next.x = Math.sign(next.x || 1) * (DESK.w / 2 + 0.25);
    }
    if (next.x > 1.05 && next.x < 1.7 && next.z < -1.75) next.z = -1.75;
    this.pose.pos.copy(next);
  }

  /** Frame the setup for a marketing image: camera at `from` looking at `to`. */
  startShowcase(from = new THREE.Vector3(-0.3, 1.44, -0.9), to = new THREE.Vector3(-0.56, 0.98, -2.2)) {
    this.showcase = true;
    this.renderer.toneMappingExposure = 1.3;
    const d = to.clone().sub(from);
    this.pose.pos.copy(from);
    this.pose.yaw = Math.atan2(d.x, -d.z);
    this.pose.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    this.applyPose();
    this.cdjs.A.showcase();
    this.cdjs.B.showcase();
    this.mixer.update({ ...engine.mixer, state: { A: { ...engine.mixer.state.A, fader: 0.85, low: -0.4 }, B: { ...engine.mixer.state.B, fader: 0.7, hi: 0.3 } }, crossfader: 0.42 } as typeof engine.mixer);
    this.mixer.meterMats.forEach((col, c) => col.forEach((m, i) => (m.emissiveIntensity = i < [7, 8, 8, 6][c] ? 1.6 : 0.03)));
    this.ledLight.intensity = 2.4;
  }

  dispose() {
    this.renderer.dispose();
  }
}
