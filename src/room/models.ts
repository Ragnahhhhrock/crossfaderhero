import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Deck } from '../audio/deck';
import type { Mixer } from '../audio/mixer';
import { HOT_CUE_COLORS } from '../ui/waveforms';
import { wooferTexture } from './textures';
import type { DeckId } from '../types';

/** What a click on a 3D control does. */
export type Action =
  | { kind: 'play'; deck: DeckId }
  | { kind: 'cue'; deck: DeckId }
  | { kind: 'hot'; deck: DeckId; index: number }
  | { kind: 'loop'; deck: DeckId }
  | { kind: 'sync'; deck: DeckId };

const SECONDS_PER_REV = 1.8;

const bodyMat = () => new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.45, metalness: 0.35 });
const topMat = () => new THREE.MeshStandardMaterial({ color: 0x26292e, roughness: 0.6, metalness: 0.25 });
const rubber = () => new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.85, metalness: 0 });

function led(color: number | string, intensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x15171a, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.5 });
}

function clickable<T extends THREE.Object3D>(o: T, action: Action, label: string): T {
  o.userData.action = action;
  o.userData.label = label;
  return o;
}

export interface CdjModel {
  group: THREE.Group;
  update: (deck: Deck, now: number) => void;
}

/** A club-style media player. Front edge (towards the DJ) faces +z. */
export function buildCdj(id: DeckId, accent: string): CdjModel {
  const W = 0.32;
  const D = 0.42;
  const H = 0.11;
  const top = H;
  const group = new THREE.Group();
  group.name = `cdj-${id}`;

  const body = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 4, 0.012), bodyMat());
  body.position.y = H / 2;
  body.castShadow = body.receiveShadow = true;
  group.add(body);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(W - 0.012, 0.002, D - 0.012), topMat());
  plate.position.y = top + 0.001;
  group.add(plate);

  // screen: tilted panel at the back
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 512;
  screenCanvas.height = 300;
  const screenCtx = screenCanvas.getContext('2d')!;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const housing = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.13, 0.03, 3, 0.006), bodyMat());
  housing.position.set(0, top + 0.06, -0.15);
  housing.rotation.x = -0.55;
  group.add(housing);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.105),
    new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }),
  );
  screen.position.set(0, 0, 0.0155);
  housing.add(screen);

  // hot cue pads under the screen
  const hotMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 8; i++) {
    const m = led(HOT_CUE_COLORS[i]);
    hotMats.push(m);
    const pad = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.008, 0.02, 2, 0.003), m);
    pad.position.set(-0.1225 + i * 0.035, top + 0.004, -0.06);
    group.add(clickable(pad, { kind: 'hot', deck: id, index: i }, `Hot cue ${String.fromCharCode(65 + i)}`));
  }

  // jog wheel
  const jogBase = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.108, 0.01, 64), rubber());
  jogBase.position.set(0.01, top + 0.005, 0.07);
  group.add(jogBase);
  const ringMat = led(accent, 0.15);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.0035, 8, 64), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0.01, top + 0.011, 0.07);
  group.add(ring);
  const platter = new THREE.Group();
  platter.position.set(0.01, top + 0.012, 0.07);
  group.add(platter);
  const platterDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.095, 0.095, 0.006, 64),
    new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.3, metalness: 0.8 }),
  );
  platter.add(platterDisc);
  const grooves = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.09, 64, 6), new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.9, side: THREE.DoubleSide }));
  grooves.rotation.x = -Math.PI / 2;
  grooves.position.y = 0.0035;
  platter.add(grooves);
  const markerMat = led(accent, 1.2);
  const marker = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.002, 0.03), markerMat);
  marker.position.set(0, 0.0045, -0.065);
  platter.add(marker);
  const centre = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 32), new THREE.MeshStandardMaterial({ color: 0x0b0d10, emissive: new THREE.Color(accent), emissiveIntensity: 0.05 }));
  centre.position.y = 0.004;
  platter.add(centre);

  // play / cue
  const btn = (z: number, color: string, kind: 'play' | 'cue') => {
    const m = led(color, 0.1);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.025, 0.012, 32), m);
    b.position.set(-0.115, top + 0.006, z);
    group.add(clickable(b, { kind, deck: id }, kind === 'play' ? 'Play / pause' : 'Cue'));
    return m;
  };
  const cueMat = btn(0.11, '#ffb020', 'cue');
  const playMat = btn(0.17, '#43e08c', 'play');

  // tempo fader
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.002, 0.15), new THREE.MeshBasicMaterial({ color: 0x050607 }));
  slot.position.set(0.135, top + 0.002, 0.075);
  group.add(slot);
  const tempoCap = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.014, 0.016, 2, 0.003), new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.4, metalness: 0.5 }));
  tempoCap.position.set(0.135, top + 0.008, 0.075);
  group.add(tempoCap);

  // sync + loop buttons
  const syncMat = led(accent, 0.05);
  const sync = new THREE.Mesh(new RoundedBoxGeometry(0.026, 0.008, 0.014, 2, 0.003), syncMat);
  sync.position.set(-0.115, top + 0.004, 0.035);
  group.add(clickable(sync, { kind: 'sync', deck: id }, 'Sync'));
  const loopMat = led('#ffc400', 0.05);
  const loopBtn = new THREE.Mesh(new RoundedBoxGeometry(0.026, 0.008, 0.014, 2, 0.003), loopMat);
  loopBtn.position.set(-0.115, top + 0.004, 0.012);
  group.add(clickable(loopBtn, { kind: 'loop', deck: id }, '4-beat loop'));

  let lastDraw = 0;
  let lastKey = '';

  function drawScreen(deck: Deck) {
    const g = screenCtx;
    const w = 512;
    const h = 300;
    g.fillStyle = '#071014';
    g.fillRect(0, 0, w, h);
    g.fillStyle = accent;
    g.fillRect(0, 0, 44, 44);
    g.fillStyle = '#111';
    g.font = 'bold 32px "Chakra Petch", sans-serif';
    g.textAlign = 'center';
    g.fillText(id, 22, 33);
    g.textAlign = 'left';
    const a = deck.analysis;
    if (deck.loading) {
      g.fillStyle = '#a3a7ad';
      g.font = '30px "Chakra Petch", sans-serif';
      g.fillText('Loading…', 60, 34);
    } else if (!deck.track || !a) {
      g.fillStyle = '#6c7178';
      g.font = '28px "Chakra Petch", sans-serif';
      g.fillText('No track', 60, 34);
      g.font = '22px "Chakra Petch", sans-serif';
      g.fillText('Step up to the decks to load music', 20, 150);
    } else {
      g.fillStyle = '#ece8df';
      g.font = '600 28px "Chakra Petch", sans-serif';
      g.fillText(deck.track.meta.title.slice(0, 28), 60, 30);
      g.fillStyle = '#a3a7ad';
      g.font = '22px "Chakra Petch", sans-serif';
      g.fillText((deck.track.meta.artist || '').slice(0, 34), 60, 58);
      const pos = deck.position;
      const t = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
      g.font = '46px "Share Tech Mono", monospace';
      g.fillStyle = deck.playing && deck.duration - pos < 30 ? '#ff5d5d' : '#ece8df';
      g.fillText(t(pos), 16, 128);
      g.textAlign = 'right';
      g.fillStyle = '#ece8df';
      g.fillText(deck.bpm.toFixed(2), 496, 128);
      g.font = '22px "Share Tech Mono", monospace';
      g.fillStyle = '#a3a7ad';
      g.fillText(`${deck.tempo >= 0 ? '+' : ''}${(deck.tempo * 100).toFixed(2)}%   ${a.camelot}`, 496, 160);
      g.textAlign = 'left';
      g.fillText(`-${t(Math.max(0, deck.duration - pos))}`, 16, 160);
      // overview waveform
      const wf = a.waveform;
      const bins = wf.length / 3;
      const y0 = 240;
      for (let x = 0; x < w - 32; x += 2) {
        const b = Math.floor((x / (w - 32)) * bins);
        const v = Math.max(wf[b * 3], wf[b * 3 + 1]) / 255;
        g.fillStyle = x / (w - 32) < pos / deck.duration ? '#2b4f7a' : '#2f6bff';
        g.fillRect(16 + x, y0 - v * 40, 2, v * 80);
      }
      g.fillStyle = '#fff';
      g.fillRect(16 + (pos / deck.duration) * (w - 32) - 1, y0 - 44, 3, 88);
    }
    screenTex.needsUpdate = true;
  }

  function update(deck: Deck, now: number) {
    platter.rotation.y = -((deck.position / SECONDS_PER_REV) * Math.PI * 2);
    ringMat.emissiveIntensity = deck.playing ? 1.4 : 0.15;
    markerMat.emissiveIntensity = deck.loaded ? 1.4 : 0.2;
    playMat.emissiveIntensity = deck.playing ? 1.6 : deck.loaded ? 0.25 + 0.25 * Math.sin(now / 250) ** 2 : 0.05;
    cueMat.emissiveIntensity = deck.loaded ? (deck.playing ? 0.3 : 1.3) : 0.05;
    loopMat.emissiveIntensity = deck.loop?.active ? 1.4 : 0.05;
    syncMat.emissiveIntensity = deck.loaded ? 0.3 : 0.03;
    hotMats.forEach((m, i) => (m.emissiveIntensity = deck.hotCues[i] !== null ? 1.2 : 0.04));
    const f = deck.tempo / (deck.range / 100); // -1..1, + = faster = towards the DJ
    tempoCap.position.z = 0.075 + f * 0.065;
    const key = `${deck.version}|${deck.loading}`;
    if (now - lastDraw > (deck.playing ? 100 : 400) || key !== lastKey) {
      lastDraw = now;
      lastKey = key;
      drawScreen(deck);
    }
  }

  return { group, update };
}

export interface MixerModel {
  group: THREE.Group;
  update: (m: Mixer) => void;
  /** Columns: channel A, master L, master R, channel B; segments bottom to top. */
  meterMats: THREE.MeshStandardMaterial[][];
}

/** A two-channel club mixer. Front edge faces +z. */
export function buildMixer(): MixerModel {
  const W = 0.27;
  const D = 0.4;
  const H = 0.105;
  const top = H;
  const group = new THREE.Group();
  group.name = 'mixer';
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 4, 0.012), bodyMat());
  body.position.y = H / 2;
  body.castShadow = body.receiveShadow = true;
  group.add(body);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(W - 0.012, 0.002, D - 0.012), topMat());
  plate.position.y = top + 0.001;
  group.add(plate);

  const knobGeo = new THREE.CylinderGeometry(0.011, 0.012, 0.016, 24);
  const knobMat = new THREE.MeshStandardMaterial({ color: 0x33373e, roughness: 0.6, metalness: 0.2 });
  const tickMat = new THREE.MeshBasicMaterial({ color: 0xece8df });
  const knob = (x: number, z: number) => {
    const k = new THREE.Group();
    k.position.set(x, top + 0.008, z);
    k.add(new THREE.Mesh(knobGeo, knobMat));
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.0172, 0.009), tickMat);
    tick.position.z = -0.0065;
    k.add(tick);
    group.add(k);
    return k;
  };
  const chX = { A: -0.06, B: 0.06 } as const;
  const knobs = {
    A: { trim: knob(chX.A, -0.165), hi: knob(chX.A, -0.12), mid: knob(chX.A, -0.08), low: knob(chX.A, -0.04), filter: knob(chX.A, 0.0) },
    B: { trim: knob(chX.B, -0.165), hi: knob(chX.B, -0.12), mid: knob(chX.B, -0.08), low: knob(chX.B, -0.04), filter: knob(chX.B, 0.0) },
  };
  const master = knob(0.115, -0.165);

  const capMat = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.4, metalness: 0.5 });
  const fader = (x: number) => {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.002, 0.08), new THREE.MeshBasicMaterial({ color: 0x050607 }));
    slot.position.set(x, top + 0.002, 0.08);
    group.add(slot);
    const cap = new THREE.Mesh(new RoundedBoxGeometry(0.024, 0.016, 0.013, 2, 0.003), capMat);
    cap.position.set(x, top + 0.009, 0.08);
    group.add(cap);
    return cap;
  };
  const faders = { A: fader(chX.A), B: fader(chX.B) };
  const xslot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.002, 0.005), new THREE.MeshBasicMaterial({ color: 0x050607 }));
  xslot.position.set(0, top + 0.002, 0.17);
  group.add(xslot);
  const xcap = new THREE.Mesh(new RoundedBoxGeometry(0.013, 0.016, 0.024, 2, 0.003), capMat);
  xcap.position.set(0, top + 0.009, 0.17);
  group.add(xcap);

  // cue buttons
  const cueMats = { A: led('#ffb020'), B: led('#ffb020') };
  for (const id of ['A', 'B'] as const) {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.007, 0.012, 2, 0.003), cueMats[id]);
    b.position.set(chX[id], top + 0.004, 0.03);
    group.add(b);
  }

  // LED level meters: channel A, master L/R, channel B
  const segs = 10;
  const meterCols = [-0.025, -0.006, 0.006, 0.025];
  const meterMats: THREE.MeshStandardMaterial[][] = meterCols.map((x) => {
    const mats: THREE.MeshStandardMaterial[] = [];
    for (let i = 0; i < segs; i++) {
      const color = i >= 8 ? '#ff5d5d' : i >= 6 ? '#ffb020' : '#43e08c';
      const m = led(color, 0.02);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.002, 0.008), m);
      seg.position.set(x, top + 0.0025, 0.02 - i * 0.011);
      group.add(seg);
      mats.push(m);
    }
    return mats;
  });

  const angle = (v: number, min = -1, max = 1) => -(((v - min) / (max - min)) * 270 - 135) * (Math.PI / 180);

  function update(m: Mixer) {
    for (const id of ['A', 'B'] as const) {
      const s = m.state[id];
      const k = knobs[id];
      k.trim.rotation.y = angle(s.trim);
      k.hi.rotation.y = angle(s.hi);
      k.mid.rotation.y = angle(s.mid);
      k.low.rotation.y = angle(s.low);
      k.filter.rotation.y = angle(s.filter);
      faders[id].position.z = 0.115 - s.fader * 0.07;
      cueMats[id].emissiveIntensity = s.cue ? 1.4 : 0.04;
    }
    master.rotation.y = angle(m.masterLevel, 0, 1);
    xcap.position.x = (m.crossfader - 0.5) * 0.09;
  }

  return { group, update, meterMats };
}

export interface SpeakerModel {
  group: THREE.Group;
  cone: THREE.Object3D;
  /** Where sound comes out, in group space. */
  mouth: THREE.Vector3;
}

/** A studio monitor: front faces +z. */
export function buildSpeaker(): SpeakerModel {
  const W = 0.22;
  const H = 0.34;
  const D = 0.26;
  const group = new THREE.Group();
  const cab = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 4, 0.015), new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.7 }));
  cab.position.y = H / 2;
  cab.castShadow = true;
  group.add(cab);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.02, H - 0.02), new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.9 }));
  face.position.set(0, H / 2, D / 2 + 0.001);
  group.add(face);
  const tex = wooferTexture();
  const cone = new THREE.Mesh(new THREE.CircleGeometry(0.08, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  cone.position.set(0, 0.12, D / 2 + 0.004);
  group.add(cone);
  const surround = new THREE.Mesh(new THREE.TorusGeometry(0.083, 0.006, 8, 48), new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.6 }));
  surround.position.copy(cone.position);
  group.add(surround);
  const tweeter = new THREE.Mesh(new THREE.SphereGeometry(0.02, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.3, metalness: 0.6 }));
  tweeter.rotation.x = Math.PI / 2;
  tweeter.position.set(0, 0.265, D / 2 + 0.002);
  group.add(tweeter);
  const power = new THREE.Mesh(new THREE.CircleGeometry(0.004, 12), new THREE.MeshBasicMaterial({ color: 0x5cc8ff }));
  power.position.set(0.085, 0.02, D / 2 + 0.002);
  group.add(power);
  return { group, cone, mouth: new THREE.Vector3(0, 0.18, D / 2) };
}
