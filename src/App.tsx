import { useEffect, useRef, useState } from 'react';
import { startAnalytics } from './analytics/events';
import { track } from './analytics/ga';
import { engine } from './audio/engine';
import { useLibrary } from './state/library';
import { useToasts } from './state/toasts';
import type { DeckId } from './types';
import { Browser } from './ui/Browser';
import { DeckPanel } from './ui/DeckPanel';
import { MixerPanel } from './ui/MixerPanel';
import { PhaseMeter, ScrollingWaveform } from './ui/waveforms';
import { setUiPaused, usePlayer, usePolled } from './ui/hooks';
import { RoomView } from './room/RoomView';
import type { Mode } from './room/Room';
import { startCoach } from './career/coach';
import { useCareer } from './career/store';
import { CareerChip, Coach, LessonsModal, Welcome } from './ui/Career';
import { TurntablePanel } from './ui/TurntablePanel';
import { Crates } from './ui/Crates';
import { GearPicker } from './ui/GearPicker';
import { initSetup, useSetup } from './state/setup';
import type { Turntable } from './audio/turntable';

interface DeckKeys {
  cue: string;
  play: string;
  hot: string[];
  slower: string;
  faster: string;
  nudgeBack: string;
  nudgeFwd: string;
  loop: string;
}

const KEYS: Record<DeckId, DeckKeys> = {
  A: { cue: 'z', play: 'x', hot: ['1', '2', '3', '4'], slower: 'q', faster: 'w', nudgeBack: 'a', nudgeFwd: 's', loop: 'e' },
  B: { cue: 'm', play: ',', hot: ['7', '8', '9', '0'], slower: 'o', faster: 'p', nudgeBack: 'k', nudgeFwd: 'l', loop: 'i' },
};

function useKeyboard(toggleHelp: () => void, deckKeysOn: boolean) {
  const on = useRef(deckKeysOn);
  on.current = deckKeysOn;
  useEffect(() => {
    const held = new Set<string>();
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      // number keys with shift produce symbols; use the physical digit instead
      const digit = /^Digit(\d)$/.exec(e.code)?.[1];
      const key = digit ?? k;
      if (key === '?' || (e.shiftKey && e.code === 'Slash')) return toggleHelp();
      if (k === 'escape' || !on.current) return;
      const m = engine.mixer;
      if (k === 'arrowleft') return void (e.preventDefault(), m.setCrossfader(m.crossfader - 0.05));
      if (k === 'arrowright') return void (e.preventDefault(), m.setCrossfader(m.crossfader + 0.05));
      if (k === 'arrowdown') return void (e.preventDefault(), m.setCrossfader(0.5));
      for (const id of ['A', 'B'] as DeckId[]) {
        const map = KEYS[id];
        if (engine.player(id).kind === 'turntable') {
          const tt = engine.player(id) as Turntable;
          if (e.repeat && key !== map.slower && key !== map.faster) {
            if ([map.cue, map.nudgeBack, map.nudgeFwd].includes(key)) e.preventDefault();
            continue;
          }
          const step = tt.range === 8 ? 0.0005 : 0.001;
          if (key === map.cue) {
            held.add(key);
            tt.grab();
          } else if (key === map.play) tt.toggleStart();
          else if (key === map.hot[0]) tt.toggleNeedle();
          else if (key === map.slower) tt.setPitch(tt.pitch - step);
          else if (key === map.faster) tt.setPitch(tt.pitch + step);
          else if (key === map.nudgeBack) tt.setNudge(-0.5);
          else if (key === map.nudgeFwd) tt.setNudge(0.5);
          else if (key === map.loop) tt.setRpm(tt.rpm === 33 ? 45 : 33);
          else continue;
          engine.resume();
          e.preventDefault();
          return;
        }
        const d = engine.decks[id];
        if (e.repeat && key !== map.slower && key !== map.faster) {
          if ([map.cue, map.nudgeBack, map.nudgeFwd].includes(key)) e.preventDefault();
          continue;
        }
        if (key === map.cue) {
          held.add(key);
          d.cueDown();
        } else if (key === map.play) d.togglePlay();
        else if (map.hot.includes(key)) {
          const i = map.hot.indexOf(key);
          if (e.shiftKey) d.deleteHotCue(i);
          else d.hotCue(i);
        } else if (key === map.slower) d.setTempo(d.tempo - (d.range === 6 ? 0.0002 : 0.0005));
        else if (key === map.faster) d.setTempo(d.tempo + (d.range === 6 ? 0.0002 : 0.0005));
        else if (key === map.nudgeBack) d.setNudge(-0.04);
        else if (key === map.nudgeFwd) d.setNudge(0.04);
        else if (key === map.loop) d.autoLoop(4);
        else continue;
        engine.resume();
        e.preventDefault();
        return;
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      for (const id of ['A', 'B'] as DeckId[]) {
        const map = KEYS[id];
        const p = engine.player(id);
        if (p.kind === 'turntable') {
          const tt = p as Turntable;
          if (k === map.cue && held.has(k)) {
            held.delete(k);
            tt.release();
          }
          if (k === map.nudgeBack || k === map.nudgeFwd) tt.setNudge(0);
          continue;
        }
        const d = engine.decks[id];
        if (k === map.cue && held.has(k)) {
          held.delete(k);
          d.cueUp();
        }
        if (k === map.nudgeBack || k === map.nudgeFwd) d.setNudge(0);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [toggleHelp]);
}

function Help({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const row = (what: string, a: string, b: string) => (
    <tr key={what}>
      <th scope="row">{what}</th>
      <td><kbd>{a}</kbd></td>
      <td><kbd>{b}</kbd></td>
    </tr>
  );
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="help-title">Keys and tips</h2>
        <p>
          In the room: <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or arrows to walk, <kbd>Shift</kbd> to hurry, drag to look around.
          Click Play, Cue, Sync, Loop or the hot-cue pads on the gear itself. Walk up to the desk and press <kbd>E</kbd> to step up to the decks;
          <kbd>Esc</kbd> steps back.
        </p>
        <h3>At the decks</h3>
        <table className="keys">
          <thead>
            <tr><th /><th scope="col">Deck A</th><th scope="col">Deck B</th></tr>
          </thead>
          <tbody>
            {row('Cue (hold to preview)', 'Z', 'M')}
            {row('Play / pause', 'X', ',')}
            {row('Hot cues A–D', '1 2 3 4', '7 8 9 0')}
            {row('Delete hot cue', 'Shift + 1–4', 'Shift + 7–0')}
            {row('Tempo slower / faster', 'Q / W', 'O / P')}
            {row('Nudge back / forward (hold)', 'A / S', 'K / L')}
            {row('4-beat loop on / off', 'E', 'I')}
          </tbody>
        </table>
        <p>Crossfader: <kbd>←</kbd> <kbd>→</kbd>, <kbd>↓</kbd> to centre. Knobs and faders: drag, scroll or arrow keys; double-click resets; hold Shift for fine control.</p>
        <h3>Turntables</h3>
        <p>
          Pull a record from the <strong>Record crates</strong> and put it on a turntable. Press <strong>Start</strong> to spin the platter,
          then drag the tonearm onto the record (or press <strong>Drop</strong>) to lower the needle — the lighter bands in the grooves are
          quiet passages and breaks. Hold the record to stop it under your hand and drag it round to scratch; let go and the slipmat
          carries it on. Drag the platter edge to nudge it into time.
        </p>
        <table className="keys">
          <thead>
            <tr><th /><th scope="col">Turntable A</th><th scope="col">Turntable B</th></tr>
          </thead>
          <tbody>
            {row('Hand on the record (hold)', 'Z', 'M')}
            {row('Start / Stop', 'X', ',')}
            {row('Cue lever: drop / lift the needle', '1', '7')}
            {row('Pitch down / up', 'Q / W', 'O / P')}
            {row('Drag / push the platter (hold)', 'A / S', 'K / L')}
            {row('33 / 45 RPM', 'E', 'I')}
          </tbody>
        </table>
        <h3>Vinyl mode on the CDJs</h3>
        <p>Press Vinyl on a CDJ, then hold the jog wheel to grab the record and drag it back and forth to scratch.</p>
        <h3>How to beatmatch</h3>
        <ol>
          <li>Play deck A with its fader up. Load the next track on deck B with B's fader down.</li>
          <li>Set B's tempo fader until both BPM readouts match.</li>
          <li>Start B on a downbeat and watch the phase meter. Nudge with the jog wheel until it turns green.</li>
          <li>Bring B in with the fader or crossfader, swapping the low EQ so the basslines don't clash.</li>
        </ol>
        <p className="note">Turn on Split cue to hear the cued channel in your left ear and the master in your right. Open Lessons in the top bar for guided, step-by-step tutorials.</p>
        <button className="primary" onClick={onClose} autoFocus>Done</button>
      </div>
    </div>
  );
}

/** Each side of the booth shows whatever its mixer channel is switched to. */
function SidePanel({ id }: { id: DeckId }) {
  const p = usePlayer(id);
  return p.kind === 'turntable' ? <TurntablePanel id={id} /> : <DeckPanel id={id} />;
}

function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} className={`toast ${t.tone}`} onClick={() => dismiss(t.id)}>
          {t.text}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [help, setHelp] = useState(false);
  const [lessonsOpen, setLessonsOpen] = useState(false);
  const onboarded = useCareer((s) => s.onboarded);
  const gear = useSetup((s) => s.gear);
  const [gearOpen, setGearOpen] = useState(false);
  const modal = help || lessonsOpen || !onboarded || gear === null || gearOpen;
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<Mode>('room');
  setUiPaused(mode === 'room');
  const [usbOpen, setUsbOpenRaw] = useState(false);
  const [crateOpen, setCrateOpenRaw] = useState(false);
  // one drawer at a time
  const setUsbOpen = (v: boolean | ((o: boolean) => boolean)) => {
    setUsbOpenRaw((o) => {
      const n = typeof v === 'function' ? v(o) : v;
      if (n) setCrateOpenRaw(false);
      return n;
    });
  };
  const setCrateOpen = (v: boolean | ((o: boolean) => boolean)) => {
    setCrateOpenRaw((o) => {
      const n = typeof v === 'function' ? v(o) : v;
      if (n) setUsbOpenRaw(false);
      return n;
    });
  };
  const drawerOpen = usbOpen || crateOpen;
  const [boothCentre, setBoothCentre] = useState(0.3);
  const gap = useRef<HTMLDivElement>(null);
  const suspended = usePolled(() => engine.ctx.state !== 'running');
  const nothingLoaded = usePolled(
    () => !engine.decks.A.loaded && !engine.decks.B.loaded && !engine.turntables.A.loaded && !engine.turntables.B.loaded,
  );
  useKeyboard(() => setHelp((h) => !h), mode === 'booth' && !modal && !drawerOpen);

  useEffect(() => {
    startAnalytics();
    void useLibrary.getState().init();
    initSetup();
    startCoach();
    const unlock = () => engine.resume();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // analytics: stepping up to / back from the decks
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) return void (firstMode.current = false);
    track('view_change', { view: mode });
  }, [mode]);

  // open the USB browser (or the crates, on an all-vinyl desk) on the first visit to the decks
  useEffect(() => {
    if (mode === 'booth' && nothingLoaded) {
      if (gear === 'vinyl') setCrateOpen(true);
      else setUsbOpen(true);
    }
    if (mode === 'room') {
      setUsbOpen(false);
      setCrateOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // the 3D view frames the gear in the gap above the controls
  useEffect(() => {
    const el = gap.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBoothCentre((r.top + r.height / 2) / window.innerHeight);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Escape closes a drawer before it steps back from the decks
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawerOpen && !modal) {
        e.stopImmediatePropagation();
        setUsbOpen(false);
        setCrateOpen(false);
      }
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen, modal]);

  return (
    <div className={`app mode-${mode}`}>
      <RoomView
        mode={mode}
        onModeChange={setMode}
        boothCentre={boothCentre}
        blockKeys={modal || drawerOpen}
        gear={gear ?? 'cdj'}
        onOpenCrate={() => {
          setMode('booth');
          setCrateOpen(true);
        }}
      />

      <header className="topbar">
        <div className="brand">
          <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden>
            <circle cx="20" cy="32" r="13" fill="none" stroke="var(--deck-a)" strokeWidth="5" />
            <circle cx="44" cy="32" r="13" fill="none" stroke="var(--deck-b)" strokeWidth="5" />
            <rect x="25" y="28" width="14" height="8" rx="2" fill="var(--text)" />
          </svg>
          <span className="wordmark">Crossfader Hero</span>
          <span className="venue">Your bedroom</span>
        </div>
        <div className="topbar-right">
          <CareerChip onOpen={() => setLessonsOpen(true)} />
          {suspended && (
            <button className="tiny warn" onClick={() => engine.resume()}>
              Turn on sound
            </button>
          )}
          {mode === 'booth' && (
            <>
              <div className="zoom" role="group" aria-label="Waveform zoom">
                <button className="tiny" onClick={() => setZoom((z) => Math.max(0.5, z / 1.5))} aria-label="Zoom out">−</button>
                <button className="tiny" onClick={() => setZoom((z) => Math.min(4, z * 1.5))} aria-label="Zoom in">+</button>
              </div>
              {gear !== 'vinyl' && (
                <button className={`tiny ${usbOpen ? 'on' : ''}`} onClick={() => setUsbOpen((o) => !o)} aria-expanded={usbOpen}>
                  USB browser
                </button>
              )}
              {gear !== 'cdj' && gear !== null && (
                <button className={`tiny ${crateOpen ? 'on' : ''}`} onClick={() => setCrateOpen((o) => !o)} aria-expanded={crateOpen}>
                  Record crates
                </button>
              )}
            </>
          )}
          <button className="tiny" onClick={() => setGearOpen(true)} title="CDJs, turntables or both">
            Gear
          </button>
          <button className="tiny" onClick={() => setHelp(true)}>
            Keys &amp; tips
          </button>
          {mode === 'booth' ? (
            <button className="tiny" onClick={() => setMode('room')} title="Esc">
              Step back
            </button>
          ) : (
            <button className="tiny" onClick={() => setMode('booth')} title="E, when you're at the desk">
              Go to the decks
            </button>
          )}
        </div>
      </header>

      <div className="booth-overlay" aria-hidden={mode !== 'booth'}>
        <div className="booth-gap" ref={gap} />
        <div className="waves">
          <div className="wave-row wave-a">
            <span className="wave-tag">A</span>
            <ScrollingWaveform id="A" zoom={zoom} />
          </div>
          <PhaseMeter />
          <div className="wave-row wave-b">
            <span className="wave-tag">B</span>
            <ScrollingWaveform id="B" zoom={zoom} />
          </div>
        </div>

        <main className="booth">
          <SidePanel id="A" />
          <MixerPanel />
          <SidePanel id="B" />
        </main>

        <div className={`usb-drawer ${usbOpen ? 'open' : ''}`} aria-hidden={!usbOpen}>
          <Browser />
          <button className="tiny drawer-close" onClick={() => setUsbOpen(false)}>Close</button>
        </div>
        <div className={`usb-drawer crate-drawer ${crateOpen ? 'open' : ''}`} aria-hidden={!crateOpen}>
          <Crates />
          <button className="tiny drawer-close" onClick={() => setCrateOpen(false)}>Close</button>
        </div>
      </div>

      <Coach onOpenLessons={() => setLessonsOpen(true)} />
      <Toasts />
      {help && <Help onClose={() => setHelp(false)} />}
      {lessonsOpen && <LessonsModal onClose={() => setLessonsOpen(false)} />}
      {gear === null ? <GearPicker /> : <Welcome />}
      {gearOpen && gear !== null && <GearPicker onClose={() => setGearOpen(false)} />}
      <div className="small-screen">Crossfader Hero needs a screen at least 1100 px wide. Open it on a laptop or desktop.</div>
    </div>
  );
}
