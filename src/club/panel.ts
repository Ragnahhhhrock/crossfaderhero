import { hue } from '../design/tokens';
import type { Club } from './Club';
import {
  CAPACITY,
  DEFAULTS,
  PALETTES,
  saveSettings,
  type CameraView,
  type ClubSettings,
  type ExtraScreens,
  type LaserColour,
  type LaserPattern,
  type LightMode,
  type Palette,
  type ScreenMode,
  type StrobeRate,
} from './settings';

type Key = keyof ClubSettings;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** The club's control desk: a side panel on desktop, a bottom sheet on phones. */
export function buildPanel(root: HTMLElement, club: Club, initial: ClubSettings): { panel: HTMLElement; setOpen: (open: boolean) => void } {
  let state = { ...initial };
  const syncs: (() => void)[] = [];
  const set = <K extends Key>(k: K, v: ClubSettings[K]) => {
    state = { ...state, [k]: v };
    club.apply(state);
    saveSettings(state);
    syncs.forEach((f) => f());
  };
  const setMany = (patch: Partial<ClubSettings>) => {
    state = { ...state, ...patch };
    club.apply(state);
    saveSettings(state);
    syncs.forEach((f) => f());
  };

  const panel = el('aside', 'club-panel');
  panel.setAttribute('aria-label', 'Club controls');
  root.appendChild(panel);

  // ---------- header: the always-visible transport row
  const head = el('div', 'club-head');
  const grab = el('button', 'club-grab');
  grab.setAttribute('aria-label', 'Show or hide the controls');
  grab.append(el('span', 'club-grab-bar'));
  grab.onclick = () => panel.classList.toggle('collapsed');
  head.append(grab);

  const transport = el('div', 'club-transport');
  const play = el('button', 'club-btn club-play');
  play.onclick = () => set('playing', !state.playing);
  syncs.push(() => {
    play.textContent = state.playing ? 'Pause' : 'Play';
    play.classList.toggle('on', state.playing);
  });
  const bpm = el('div', 'club-bpm');
  const bpmVal = el('span', 'club-lcd');
  const bpmUnit = el('span', 'club-unit', 'BPM');
  bpm.append(bpmVal, bpmUnit);
  const drop = el('button', 'club-btn club-drop', 'Drop');
  drop.onclick = () => {
    if (!state.playing) set('playing', true);
    club.drop();
  };
  let liveNote: HTMLElement | null = null;
  const tick = () => {
    const p = club.phase;
    // the readout shows whatever the room is following: your mix, or the light desk's tempo
    bpmVal.textContent = club.clock.live ? club.clock.bpm.toFixed(1) : String(state.bpm);
    bpm.classList.toggle('live', club.clock.live);
    bpmUnit.textContent = club.clock.live ? `BPM · deck ${club.clock.deck} · ${club.clock.music}` : `BPM · ${club.clock.music}`;
    if (liveNote) liveNote.textContent = club.clock.live ? 'Following your mix: the lights and crowd lock to the deck on air.' : 'No deck on air: the lights run at this tempo.';
    drop.textContent = p === 'build' ? 'Building…' : p === 'drop' ? 'Drop!' : 'Drop';
    drop.classList.toggle('live', p !== 'none');
    requestAnimationFrame(tick);
  };
  tick();
  transport.append(play, bpm, drop);
  head.append(transport);

  const masters = el('div', 'club-masters');
  const allOn = el('button', 'club-btn small', 'All on');
  allOn.onclick = () =>
    setMany({ lights: true, scanners: true, lasers: true, smoke: true, screen: true, dancers: true, floorLeds: true, houseLights: false, playing: true });
  const blackout = el('button', 'club-btn small', 'Blackout');
  blackout.onclick = () => setMany({ lights: false, scanners: false, lasers: false, strobes: false, screen: false, floorLeds: false, houseLights: false });
  const reset = el('button', 'club-btn small', 'Reset');
  reset.onclick = () => setMany({ ...DEFAULTS });
  masters.append(allOn, blackout, reset);
  head.append(masters);
  panel.append(head);

  const body = el('div', 'club-body');
  panel.append(body);

  // ---------- control builders
  const section = (title: string, toggleKey?: Key, note?: string) => {
    const sec = el('section', 'club-sec');
    const h = el('div', 'club-sec-head');
    h.append(el('h2', '', title));
    if (toggleKey) h.append(toggle(toggleKey, title));
    sec.append(h);
    if (note) sec.append(el('p', 'club-note', note));
    if (toggleKey) syncs.push(() => sec.classList.toggle('off', !state[toggleKey]));
    body.append(sec);
    return sec;
  };

  function toggle(k: Key, label: string): HTMLButtonElement {
    const b = el('button', 'club-switch');
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-label', label);
    b.append(el('span', 'club-switch-led'));
    b.onclick = () => set(k, !state[k] as never);
    syncs.push(() => {
      b.setAttribute('aria-checked', String(!!state[k]));
      b.classList.toggle('on', !!state[k]);
    });
    return b;
  }

  const row = (parent: HTMLElement, label: string, ...kids: HTMLElement[]) => {
    const r = el('div', 'club-row');
    r.append(el('span', 'club-label', label), ...kids);
    parent.append(r);
    return r;
  };

  const toggleRow = (parent: HTMLElement, label: string, k: Key) => row(parent, label, toggle(k, label));

  const slider = (parent: HTMLElement, label: string, k: Key, min: number, max: number, step: number, fmt: (v: number) => string) => {
    const wrap = el('div', 'club-slider');
    const input = el('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.setAttribute('aria-label', label);
    const out = el('span', 'club-lcd');
    input.oninput = () => set(k, Number(input.value) as never);
    syncs.push(() => {
      input.value = String(state[k]);
      out.textContent = fmt(state[k] as number);
      input.style.setProperty('--fill', `${(((state[k] as number) - min) / (max - min)) * 100}%`);
    });
    wrap.append(input, out);
    row(parent, label, wrap);
  };

  const segmented = <V extends string | number>(parent: HTMLElement, label: string, k: Key, options: [V, string][], cols?: number) => {
    const seg = el('div', 'club-seg');
    if (cols) seg.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    else seg.style.gridTemplateColumns = `repeat(${options.length}, 1fr)`;
    for (const [v, text] of options) {
      const b = el('button', '', text);
      b.onclick = () => set(k, v as never);
      syncs.push(() => b.classList.toggle('on', state[k] === v));
      seg.append(b);
    }
    const r = row(parent, label, seg);
    r.classList.add('stack');
  };

  // ---------- the show
  const show = section('Show');
  slider(show, 'Tempo', 'bpm', 90, 180, 1, (v) => `${v}`);
  liveNote = el('p', 'club-note');
  show.append(liveNote);

  const crowd = section('Crowd');
  slider(crowd, 'People', 'crowd', 0, CAPACITY, 1, (v) => `${v}/${CAPACITY}`);
  toggleRow(crowd, 'Podium dancers', 'dancers');

  const lights = section('Lighting', 'lights');
  segmented<LightMode>(lights, 'Type', 'lightMode', [
    ['wash', 'Wash'],
    ['chase', 'Chase'],
    ['pulse', 'Pulse'],
    ['movers', 'Movers'],
  ]);
  const sw = el('div', 'club-swatches');
  const palettes: [Palette, string][] = [
    ['club', 'Club'],
    ['sunset', 'Sunset'],
    ['ice', 'Ice'],
    ['jungle', 'Jungle'],
    ['rainbow', 'Rainbow'],
  ];
  for (const [p, name] of palettes) {
    const b = el('button', 'club-swatch');
    b.title = name;
    b.setAttribute('aria-label', `${name} colours`);
    b.style.background =
      p === 'rainbow'
        ? `conic-gradient(${[0, 0.17, 0.33, 0.5, 0.67, 0.83, 1].map((h) => hue(h, 1, 0.55)).join(', ')})`
        : `linear-gradient(135deg, ${PALETTES[p].map((t) => `var(--${t})`).join(', ')})`;
    b.onclick = () => set('palette', p);
    syncs.push(() => b.classList.toggle('on', state.palette === p));
    sw.append(b);
  }
  row(lights, 'Colours', sw).classList.add('stack');
  slider(lights, 'Intensity', 'intensity', 0.1, 1, 0.05, (v) => `${Math.round(v * 100)}%`);

  const scan = section('Scanners', 'scanners');
  slider(scan, 'Speed', 'scannerSpeed', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);

  const strobe = section('Strobes', 'strobes', 'Fast flashing light. Leave off if flashing lights affect you.');
  segmented<StrobeRate>(strobe, 'Rate', 'strobeRate', [
    [1, 'Every beat'],
    [2, '8ths'],
    [4, '16ths'],
  ]);

  const laser = section('Lasers', 'lasers');
  segmented<LaserColour>(laser, 'Colour', 'laserColour', [
    ['green', 'Green'],
    ['red', 'Red'],
    ['blue', 'Blue'],
    ['rgb', 'RGB'],
  ]);
  segmented<LaserPattern>(laser, 'Pattern', 'laserPattern', [
    ['fan', 'Fan'],
    ['sweep', 'Sweep'],
    ['tunnel', 'Tunnel'],
  ]);

  const smoke = section('Smoke', 'smoke');
  slider(smoke, 'Density', 'smokeDensity', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);

  const screen = section('Screen', 'screen');
  segmented<ScreenMode>(
    screen,
    'Visuals',
    'screenMode',
    [
      ['tunnel', 'Tunnel'],
      ['spectrum', 'Spectrum'],
      ['kaleido', 'Kaleido'],
      ['plasma', 'Plasma'],
      ['grid', 'Retro grid'],
      ['logo', 'Club CFH'],
      ['name', 'DJ name'],
    ],
    3,
  );
  slider(screen, 'Speed', 'screenSpeed', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
  toggleRow(screen, 'Side screens', 'extraScreens');
  segmented<ExtraScreens>(screen, 'Side screens show', 'extraMode', [
    ['mix', 'Their own'],
    ['follow', 'Same as main'],
  ]);

  const room = section('Venue');
  toggleRow(room, 'LED dance floor', 'floorLeds');
  toggleRow(room, 'House lights', 'houseLights');

  const cam = section('Camera');
  const views = el('div', 'club-seg');
  views.style.gridTemplateColumns = 'repeat(4, 1fr)';
  for (const [v, text] of [
    ['floor', 'Floor'],
    ['booth', 'DJ booth'],
    ['balcony', 'Back'],
    ['side', 'Side'],
  ] as [CameraView, string][]) {
    const b = el('button', '', text);
    b.onclick = () => {
      set('autoOrbit', false);
      club.setView(v);
    };
    views.append(b);
  }
  row(cam, 'View', views).classList.add('stack');
  toggleRow(cam, 'Auto orbit', 'autoOrbit');
  toggleRow(cam, 'Glow', 'glow');
  cam.append(el('p', 'club-note', 'Drag to look around, pinch or scroll to zoom.'));

  // phones start with the sheet folded down so the club is visible
  if (window.matchMedia('(max-width: 720px)').matches) panel.classList.add('collapsed');

  syncs.forEach((f) => f());
  return { panel, setOpen: (open: boolean) => panel.classList.toggle('desk-open', open) };
}
