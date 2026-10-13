import { useRef } from 'react';
import { engine } from '../audio/engine';
import { eqDb, peakDb, trimDb } from '../audio/mixer';
import type { DeckId } from '../types';
import { Fader, Knob } from './controls';
import { useAnimationFrame, useMixer } from './hooks';
import { useSetup } from '../state/setup';

const SEGMENTS = 15;
// dB thresholds per segment, bottom to top; the top two are the red clip zone
const LEVELS = [-30, -24, -20, -17, -14, -11, -9, -7, -5, -3, -2, -1, 0, 1.5, 3];

/** Segmented LED meter that reads an analyser each frame, with a 1.2 s clip hold. */
function Meter({ analyser, label }: { analyser: AnalyserNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const peak = useRef(-120);
  const clipUntil = useRef(0);
  useAnimationFrame((t) => {
    const el = ref.current;
    if (!el) return;
    const db = peakDb(analyser);
    peak.current = Math.max(db, peak.current - 1.2); // fall-off
    if (db > 0) clipUntil.current = t + 1200;
    const clip = t < clipUntil.current;
    for (let i = 0; i < SEGMENTS; i++) {
      const seg = el.children[SEGMENTS - 1 - i] as HTMLElement;
      seg.classList.toggle('lit', peak.current >= LEVELS[i]);
    }
    el.classList.toggle('clipping', clip);
  });
  return (
    <div className="meter" ref={ref} role="img" aria-label={`${label} level`}>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <i key={i} className={i < 2 ? 'red' : i < 5 ? 'amber' : ''} />
      ))}
    </div>
  );
}

function Channel({ id }: { id: DeckId }) {
  const m = useMixer();
  const s = m.state[id];
  const ch = m.channels[id];
  const tone = id === 'A' ? 'var(--deck-a)' : 'var(--deck-b)';
  const db = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
  const gear = useSetup((st) => st.gear);
  return (
    <div className={`channel channel-${id.toLowerCase()}`} aria-label={`Channel ${id}`} role="group">
      {gear === 'both' ? (
        <div className="input-select" role="radiogroup" aria-label={`Channel ${id} input`}>
          <button role="radio" aria-checked={s.input === 'cd'} className={`tiny ${s.input === 'cd' ? 'on' : ''}`} onClick={() => m.setInput(id, 'cd')} title={`CDJ ${id}`}>CD</button>
          <button role="radio" aria-checked={s.input === 'phono'} className={`tiny ${s.input === 'phono' ? 'on' : ''}`} onClick={() => m.setInput(id, 'phono')} title={`Turntable ${id}`}>Phono</button>
        </div>
      ) : (
        <span className="ch-label">{id}</span>
      )}
      <div className="knobs-2">
        <Knob label="Trim" size={34} value={s.trim} onChange={(v) => m.set(id, { trim: v })} format={(v) => db(trimDb(v))} tone={tone} />
        <Knob label="Hi" size={34} value={s.hi} onChange={(v) => m.set(id, { hi: v })} format={(v) => db(eqDb(v))} tone={tone} />
        <Knob
          label="Filter"
          size={34}
          value={s.filter}
          onChange={(v) => m.set(id, { filter: v })}
          format={(v) => (Math.abs(v) < 0.03 ? 'Off' : v < 0 ? 'Low-pass' : 'High-pass')}
          tone="var(--filter)"
        />
        <Knob label="Mid" size={34} value={s.mid} onChange={(v) => m.set(id, { mid: v })} format={(v) => db(eqDb(v))} tone={tone} />
        <span />
        <Knob label="Low" size={34} value={s.low} onChange={(v) => m.set(id, { low: v })} format={(v) => db(eqDb(v))} tone={tone} />
      </div>
      <button className={`tiny ch-cue ${s.cue ? 'on' : ''}`} aria-pressed={s.cue} onClick={() => m.set(id, { cue: !s.cue })} title="Send to headphones (split cue)">
        Cue
      </button>
      <div className="fader-and-meter">
        <Meter analyser={ch.meter} label={`Channel ${id}`} />
        <Fader label={`Channel ${id} fader`} value={s.fader} onChange={(v) => m.set(id, { fader: v })} length={130} />
      </div>
    </div>
  );
}

export function MixerPanel() {
  const m = useMixer();
  return (
    <section className="mixer" aria-label="Mixer">
      <div className="mixer-channels">
        <Channel id="A" />
        <div className="master-strip" role="group" aria-label="Master">
          <span className="ch-label">Master</span>
          <Knob label="Level" value={m.masterLevel} min={0} max={1} defaultValue={0.8} bipolar={false} onChange={(v) => m.setMaster(v)} />
          <div className="master-meters">
            <Meter analyser={m.masterMeterL} label="Master left" />
            <Meter analyser={m.masterMeterR} label="Master right" />
          </div>
          <div className="phones" role="group" aria-label="Headphones">
            <button
              className={`tiny ${m.cueMode === 'split' ? 'on' : ''}`}
              aria-pressed={m.cueMode === 'split'}
              onClick={() => m.setCueMode(m.cueMode === 'split' ? 'off' : 'split')}
              title="Split cue: headphones get the cued channel in the left ear and the master in the right"
            >
              Split cue
            </button>
            <Knob label="Phones" value={m.cueLevel} min={0} max={1} defaultValue={0.8} bipolar={false} size={32} onChange={(v) => m.setCueLevel(v)} />
          </div>
        </div>
        <Channel id="B" />
      </div>
      <div className="xfader-row">
        <span className="xf-end">A</span>
        <Fader
          label="Crossfader"
          orientation="horizontal"
          value={m.crossfader}
          onChange={(v) => engine.mixer.setCrossfader(v)}
          length={200}
          defaultValue={0.5}
          className="crossfader"
        />
        <span className="xf-end">B</span>
        <button
          className="tiny"
          onClick={() => m.setCurve(m.curve === 'smooth' ? 'sharp' : 'smooth')}
          title="Crossfader curve: smooth for blends, sharp for cuts and scratching"
        >
          {m.curve === 'smooth' ? 'Smooth' : 'Sharp'}
        </button>
        <button
          className={`tiny ${m.reverse ? 'on' : ''}`}
          aria-pressed={m.reverse}
          onClick={() => m.setReverse(!m.reverse)}
          title="Reverse (hamster): flips the crossfader so channel A is on the right — a battle DJ favourite"
        >
          Rev
        </button>
      </div>
    </section>
  );
}
