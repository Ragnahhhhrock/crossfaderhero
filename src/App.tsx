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
import { setUiPaused, usePolled } from './ui/hooks';
import { RoomView } from './room/RoomView';
import type { Mode } from './room/Room';
import { startCoach } from './career/coach';
import { useCareer } from './career/store';
import { CareerChip, Coach, LessonsModal, Welcome } from './ui/Career';

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
        const d = engine.decks[id];
        const map = KEYS[id];
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
        <h3>Vinyl mode</h3>
        <p>Press Vinyl on a deck, then hold the jog wheel to grab the record and drag it back and forth to scratch.</p>
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
  const modal = help || lessonsOpen || !onboarded;
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<Mode>('room');
  setUiPaused(mode === 'room');
  const [usbOpen, setUsbOpen] = useState(false);
  const [boothCentre, setBoothCentre] = useState(0.3);
  const gap = useRef<HTMLDivElement>(null);
  const suspended = usePolled(() => engine.ctx.state !== 'running');
  const nothingLoaded = usePolled(() => !engine.decks.A.loaded && !engine.decks.B.loaded);
  useKeyboard(() => setHelp((h) => !h), mode === 'booth' && !modal && !usbOpen);

  useEffect(() => {
    startAnalytics();
    void useLibrary.getState().init();
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

  // open the USB browser on the first visit to the decks
  useEffect(() => {
    if (mode === 'booth' && nothingLoaded) setUsbOpen(true);
    if (mode === 'room') setUsbOpen(false);
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

  // Escape closes the USB drawer before it steps back from the decks
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && usbOpen && !modal) {
        e.stopImmediatePropagation();
        setUsbOpen(false);
      }
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [usbOpen, modal]);

  return (
    <div className={`app mode-${mode}`}>
      <RoomView mode={mode} onModeChange={setMode} boothCentre={boothCentre} blockKeys={modal || usbOpen} />

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
              <button className={`tiny ${usbOpen ? 'on' : ''}`} onClick={() => setUsbOpen((o) => !o)} aria-expanded={usbOpen}>
                USB browser
              </button>
            </>
          )}
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
          <DeckPanel id="A" />
          <MixerPanel />
          <DeckPanel id="B" />
        </main>

        <div className={`usb-drawer ${usbOpen ? 'open' : ''}`} aria-hidden={!usbOpen}>
          <Browser />
          <button className="tiny drawer-close" onClick={() => setUsbOpen(false)}>Close</button>
        </div>
      </div>

      <Coach onOpenLessons={() => setLessonsOpen(true)} />
      <Toasts />
      {help && <Help onClose={() => setHelp(false)} />}
      {lessonsOpen && <LessonsModal onClose={() => setLessonsOpen(false)} />}
      <Welcome />
      <div className="small-screen">Crossfader Hero needs a screen at least 1100 px wide. Open it on a laptop or desktop.</div>
    </div>
  );
}
