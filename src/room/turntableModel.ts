import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Turntable } from '../audio/turntable';
import { grooveRadius } from '../audio/platter';
import { hex, shade } from '../design/tokens';
import { recordCanvas, RECORD_R } from '../library/sleeve';
import type { DeckId } from '../types';
import type { Action } from './models';

/*
 * A direct-drive battle turntable, in the proportions of the classic club deck
 * (fictional make). Front edge (towards the DJ) faces +z; origin at the bottom centre.
 * Plan coordinates match ui/TurntablePanel: platter left of centre, arm at the back right.
 */
export const TT = { w: 0.453, d: 0.353, h: 0.1 };
const CENTRE = { x: 0.18 - TT.w / 2, z: 0.178 - TT.d / 2 };
const PIVOT = { x: 0.392 - TT.w / 2, z: 0.098 - TT.d / 2 };
const ARM_L = 0.232;
const PLATTER_R = 0.166;
const ARM_REST = (96 * Math.PI) / 180;

function armAngleFor(r: number): number {
  const dx = CENTRE.x - PIVOT.x;
  const dz = CENTRE.z - PIVOT.z;
  const d = Math.hypot(dx, dz);
  const cos = (ARM_L * ARM_L + d * d - r * r) / (2 * ARM_L * d);
  return Math.atan2(dz, dx) - Math.acos(Math.max(-1, Math.min(1, cos)));
}

function clickable<T extends THREE.Object3D>(o: T, action: Action, label: string): T {
  o.userData.action = action;
  o.userData.label = label;
  return o;
}

function led(colorToken: string, intensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: hex('graphite-750'), emissive: new THREE.Color(hex(colorToken)), emissiveIntensity: intensity, roughness: 0.5 });
}

/** Strobe dots around the platter's edge. */
function strobeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = shade('tt-chrome', 0.6);
  g.fillRect(0, 0, 1024, 32);
  g.fillStyle = shade('tt-chrome', 1.05);
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 90 + row * 2; i++) {
      const x = (i / (90 + row * 2)) * 1024;
      g.fillRect(x, 4 + row * 9, 5, 5);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export interface TurntableModel {
  group: THREE.Group;
  update: (tt: Turntable, now: number) => void;
}

export function buildTurntable(id: DeckId, accent: 'deck-a' | 'deck-b'): TurntableModel {
  const group = new THREE.Group();
  group.name = `turntable-${id}`;
  const top = TT.h;

  const plinthMat = new THREE.MeshStandardMaterial({ color: hex('tt-plinth'), roughness: 0.42, metalness: 0.45 });
  const chrome = new THREE.MeshStandardMaterial({ color: hex('tt-chrome'), roughness: 0.22, metalness: 0.9 });
  const rubber = new THREE.MeshStandardMaterial({ color: hex('gear-rubber'), roughness: 0.9 });

  const plinth = new THREE.Mesh(new RoundedBoxGeometry(TT.w, TT.h - 0.012, TT.d, 4, 0.01), plinthMat);
  plinth.position.y = 0.012 + (TT.h - 0.012) / 2;
  plinth.castShadow = plinth.receiveShadow = true;
  group.add(plinth);
  for (const fx of [-1, 1])
    for (const fz of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.014, 24), rubber);
      foot.position.set(fx * (TT.w / 2 - 0.045), 0.007, fz * (TT.d / 2 - 0.045));
      group.add(foot);
    }

  // platter (with strobe dots on its edge) and slipmat turn together
  const platter = new THREE.Group();
  platter.position.set(CENTRE.x, top, CENTRE.z);
  group.add(platter);
  const strobe = strobeTexture();
  const platterMesh = new THREE.Mesh(new THREE.CylinderGeometry(PLATTER_R, PLATTER_R, 0.018, 96, 1, true), new THREE.MeshStandardMaterial({ map: strobe, roughness: 0.3, metalness: 0.85 }));
  platterMesh.position.y = 0.009;
  platter.add(platterMesh);
  const platterTop = new THREE.Mesh(new THREE.CircleGeometry(PLATTER_R, 96), chrome);
  platterTop.rotation.x = -Math.PI / 2;
  platterTop.position.y = 0.018;
  platter.add(platterTop);
  const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.003, 96), new THREE.MeshStandardMaterial({ color: hex('slipmat'), roughness: 1 }));
  mat.position.y = 0.0195;
  platter.add(mat);
  const matMark = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.008), new THREE.MeshBasicMaterial({ color: hex('ink-500') }));
  matMark.rotation.x = -Math.PI / 2;
  matMark.position.set(0, 0.0212, -0.1);
  platter.add(matMark);

  // the record turns on its own (it slips on the mat when you hold it)
  const record = new THREE.Group();
  record.position.set(CENTRE.x, top + 0.0215, CENTRE.z);
  record.visible = false;
  group.add(record);
  const recCanvas = document.createElement('canvas');
  recCanvas.width = recCanvas.height = 4;
  const recTex = new THREE.CanvasTexture(recCanvas);
  recTex.colorSpace = THREE.SRGBColorSpace;
  recTex.anisotropy = 8;
  const recordTop = new THREE.Mesh(new THREE.CircleGeometry(RECORD_R, 96), new THREE.MeshStandardMaterial({ map: recTex, roughness: 0.32, metalness: 0.15 }));
  recordTop.rotation.x = -Math.PI / 2;
  recordTop.position.y = 0.0011;
  record.add(recordTop);
  const recordEdge = new THREE.Mesh(new THREE.CylinderGeometry(RECORD_R, RECORD_R, 0.002, 96, 1, true), new THREE.MeshStandardMaterial({ color: hex('vinyl-black'), roughness: 0.4 }));
  record.add(recordEdge);

  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.03, 12), chrome);
  spindle.position.set(CENTRE.x, top + 0.02, CENTRE.z);
  group.add(spindle);

  // strobe light, front left of the platter
  const strobeLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.01, 16), led('tt-strobe', 1.4));
  strobeLamp.position.set(CENTRE.x - 0.135, top + 0.005, CENTRE.z + 0.135);
  group.add(strobeLamp);

  // tonearm: base, arm tube, counterweight, headshell
  const armBase = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.02, 32), chrome);
  armBase.position.set(PIVOT.x, top + 0.01, PIVOT.z);
  group.add(armBase);
  const arm = new THREE.Group();
  arm.position.set(PIVOT.x, top + 0.045, PIVOT.z);
  group.add(arm);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 12), chrome);
  pillar.position.set(PIVOT.x, top + 0.03, PIVOT.z);
  group.add(pillar);
  const armTilt = new THREE.Group();
  arm.add(armTilt);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, ARM_L - 0.02, 12), chrome);
  tube.rotation.z = Math.PI / 2;
  tube.position.x = (ARM_L - 0.02) / 2;
  armTilt.add(tube);
  const weight = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.032, 24), new THREE.MeshStandardMaterial({ color: hex('graphite-400'), roughness: 0.4, metalness: 0.7 }));
  weight.rotation.z = Math.PI / 2;
  weight.position.x = -0.05;
  armTilt.add(weight);
  const shell = new THREE.Mesh(new RoundedBoxGeometry(0.034, 0.008, 0.018, 2, 0.002), new THREE.MeshStandardMaterial({ color: hex('graphite-900'), roughness: 0.5 }));
  shell.position.set(ARM_L - 0.008, -0.012, 0);
  shell.rotation.y = -0.35;
  armTilt.add(shell);
  const stylusLed = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.004, 0.006), led('play', 0));
  stylusLed.position.set(ARM_L - 0.002, -0.009, 0);
  armTilt.add(stylusLed);
  const lift = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.002, 0.004), chrome);
  lift.position.set(ARM_L + 0.006, -0.008, 0.01);
  armTilt.add(lift);
  // arm rest
  const rest = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.035, 8), new THREE.MeshStandardMaterial({ color: hex('graphite-500') }));
  rest.position.set(PIVOT.x + Math.cos(ARM_REST) * (ARM_L - 0.06), top + 0.0175, PIVOT.z + Math.sin(ARM_REST) * (ARM_L - 0.06));
  group.add(rest);
  clickable(armTilt, { kind: 'needle', deck: id }, 'Tonearm — drop or lift the needle');

  // Start/Stop, 33/45, power, pitch fader
  const startMat = led(accent, 0.05);
  const start = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.01, 0.034, 2, 0.003), startMat);
  start.position.set(-TT.w / 2 + 0.05, top + 0.004, TT.d / 2 - 0.035);
  group.add(clickable(start, { kind: 'ttStart', deck: id }, 'Start / Stop'));
  const rpmMats = { 33: led('cue', 0), 45: led('cue', 0) };
  for (const [i, rpm] of [33, 45].entries()) {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.008, 0.014, 2, 0.002), rpmMats[rpm as 33 | 45]);
    b.position.set(-TT.w / 2 + 0.095 + i * 0.028, top + 0.003, TT.d / 2 - 0.03);
    group.add(clickable(b, { kind: 'rpm', deck: id, rpm: rpm as 33 | 45 }, `${rpm} RPM`));
  }
  const power = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.012, 24), new THREE.MeshStandardMaterial({ color: hex('graphite-500'), roughness: 0.6 }));
  power.position.set(-TT.w / 2 + 0.03, top + 0.004, TT.d / 2 - 0.085);
  group.add(power);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.002, 0.12), new THREE.MeshBasicMaterial({ color: hex('graphite-1000') }));
  slot.position.set(TT.w / 2 - 0.04, top + 0.001, TT.d / 2 - 0.095);
  group.add(slot);
  const pitchCap = new THREE.Mesh(new RoundedBoxGeometry(0.028, 0.014, 0.014, 2, 0.003), new THREE.MeshStandardMaterial({ color: hex('graphite-400'), roughness: 0.4, metalness: 0.5 }));
  pitchCap.position.set(TT.w / 2 - 0.04, top + 0.007, TT.d / 2 - 0.095);
  group.add(pitchCap);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.002, 0.012), led(accent, 0.8));
  badge.position.set(TT.w / 2 - 0.035, top + 0.001, -TT.d / 2 + 0.03);
  group.add(badge);

  let recordKey = '';
  let armAngle = ARM_REST;
  let armDrop = 0;

  function update(tt: Turntable, now: number) {
    platter.rotation.y = -tt.platterAngleRevs * Math.PI * 2;
    // strobe dots: stand still at exactly 33⅓ / 45 with the pitch at 0
    strobe.offset.x = -((tt.ctx.currentTime * (tt.rpm === 45 ? 1.35 : 1)) / 1.8);

    const key = tt.track ? `${tt.track.key}|${tt.analysis?.bpm}` : '';
    if (key !== recordKey) {
      recordKey = key;
      record.visible = !!tt.track;
      if (tt.track) {
        const c = recordCanvas(tt.track, tt.analysis, 1024, () => (recTex.needsUpdate = true));
        recTex.image = c;
        recTex.needsUpdate = true;
      }
    }
    record.rotation.y = -tt.recordRevs * Math.PI * 2;

    const target = tt.loaded && tt.armOnRecord ? armAngleFor(grooveRadius(tt.position, tt.duration)) : ARM_REST;
    armAngle += (target - armAngle) * 0.25;
    arm.rotation.y = -armAngle;
    const drop = tt.needleDown ? 1 : 0;
    armDrop += (drop - armDrop) * 0.2;
    armTilt.rotation.z = -0.06 * armDrop + 0.03;
    (stylusLed.material as THREE.MeshStandardMaterial).emissiveIntensity = tt.needleDown ? 1.2 : 0;

    startMat.emissiveIntensity = tt.motor && tt.power ? 1.2 : 0.05;
    rpmMats[33].emissiveIntensity = tt.rpm === 33 ? 1.3 : 0.03;
    rpmMats[45].emissiveIntensity = tt.rpm === 45 ? 1.3 : 0.03;
    (strobeLamp.material as THREE.MeshStandardMaterial).emissiveIntensity = tt.power ? 1.4 + Math.sin(now / 900) * 0.05 : 0.05;
    pitchCap.position.z = TT.d / 2 - 0.095 + (tt.pitch / (tt.range / 100)) * 0.05;
  }

  return { group, update };
}
