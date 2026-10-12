import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { engine } from '../audio/engine';
import { barBeat } from '../audio/grid';
import { HOT_CUES } from '../audio/deck';
import type { DeckId } from '../types';
import { toast } from '../state/toasts';
import { Fader } from './controls';
import { formatTime, useAnimationFrame, useDeck, usePolled } from './hooks';
import { hotCueVar, OverviewWaveform } from './waveforms';

const SECONDS_PER_REV = 1.8; // a 33⅓ rpm platter

function JogWheel({ id }: { id: DeckId }) {
  const deck = useDeck(id);
  const platter = useRef<HTMLDivElement>(null);
  const drag = useRef<{ angle: number; t: number } | null>(null);
  const settle = useRef<number>(0);
  const scratchVel = useRef(0);

  useAnimationFrame(() => {
    const el = platter.current;
    if (el) el.style.transform = `rotate(${((deck.position / SECONDS_PER_REV) * 360) % 360}deg)`;
  });

  const angleOf = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };

  const turn = (deg: number, dtMs: number) => {
    if (deck.scratching) {
      // hand on the record: audio follows the platter, forwards or backwards
      const v = ((deg / 360) * SECONDS_PER_REV) / (Math.max(dtMs, 8) / 1000);
      scratchVel.current = scratchVel.current * 0.4 + v * 0.6;
      deck.scratchMove(scratchVel.current);
      clearTimeout(settle.current);
      settle.current = window.setTimeout(() => {
        scratchVel.current = 0;
        deck.scratchMove(0);
      }, 45);
    } else if (deck.playing) {
      const revPerSec = deg / 360 / Math.max(dtMs, 8) * 1000;
      deck.setNudge(Math.max(-0.25, Math.min(0.25, revPerSec * 0.12)));
      clearTimeout(settle.current);
      settle.current = window.setTimeout(() => deck.setNudge(0), 70);
    } else {
      deck.scrub((deg / 360) * SECONDS_PER_REV);
    }
  };

  return (
    <div
      className={`jog ${deck.playing ? 'is-playing' : ''} ${deck.vinyl ? 'vinyl' : ''} ${deck.scratching ? 'scratching' : ''}`}
      role="group"
      aria-label={
        deck.vinyl
          ? `Deck ${id} jog wheel, vinyl mode: hold and drag to scratch`
          : `Deck ${id} jog wheel: drag to nudge while playing, or to search while paused`
      }
      onPointerDown={(e) => {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        drag.current = { angle: angleOf(e), t: performance.now() };
        if (deck.vinyl && deck.loaded) {
          scratchVel.current = 0;
          deck.scratchStart();
        }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const a = angleOf(e);
        let d = a - drag.current.angle;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        const now = performance.now();
        turn(d, now - drag.current.t);
        drag.current = { angle: a, t: now };
      }}
      onPointerUp={() => {
        drag.current = null;
        clearTimeout(settle.current);
        if (deck.scratching) deck.scratchEnd();
        deck.setNudge(0);
      }}
      onPointerCancel={() => {
        drag.current = null;
        if (deck.scratching) deck.scratchEnd();
        deck.setNudge(0);
      }}
      onWheel={(e) => turn(-Math.sign(e.deltaY) * 6, 16)}
    >
      <div className="jog-ring" />
      <div className="jog-platter" ref={platter}>
        <div className="jog-marker" />
      </div>
      <div className="jog-centre">
        {deck.track?.artworkUrl ? <img src={deck.track.artworkUrl} alt="" /> : <span>{id}</span>}
      </div>
    </div>
  );
}

function Readouts({ id }: { id: DeckId }) {
  const deck = useDeck(id);
  const elapsed = usePolled(() => formatTime(deck.position));
  const remain = usePolled(() => `-${formatTime(deck.duration - deck.position)}`);
  const bb = usePolled(() => {
    const g = deck.grid;
    if (!g) return '';
    const { bar, beat } = barBeat(g, deck.position);
    return `${bar}.${beat}`;
  });
  const warn = usePolled(() => deck.playing && deck.duration - deck.position < 30);
  const bpm = deck.bpm;
  const t = deck.tempo * 100;
  return (
    <div className="readouts">
      <div className={`time ${warn ? 'warn' : ''}`}>
        <span className="big">{elapsed}</span>
        <span>{remain}</span>
      </div>
      <div className="barbeat" title="Bar.beat">
        {bb}
      </div>
      <div className="bpm">
        <span className="big">{bpm ? bpm.toFixed(2) : '--.--'}</span>
        <span>
          {t >= 0 ? '+' : ''}
          {t.toFixed(2)}% <small>±{deck.range}</small>
        </span>
      </div>
      <div className="key" title={deck.analysis?.key}>
        {deck.analysis?.camelot ?? '--'}
      </div>
    </div>
  );
}

export function DeckPanel({ id }: { id: DeckId }) {
  const deck = useDeck(id);
  const [gridOpen, setGridOpen] = useState(false);
  const track = deck.track;
  const other = engine.other(id);
  const accent = id === 'A' ? 'var(--deck-a)' : 'var(--deck-b)';
  const loopSizes = [0.5, 1, 2, 4, 8, 16];
  const fmtBeats = (b: number) => (b < 1 ? `1/${Math.round(1 / b)}` : String(b));

  return (
    <section className={`deck deck-${id.toLowerCase()}`} style={{ '--accent': accent } as CSSProperties} aria-label={`Deck ${id}`}>
      <div className="screen">
        <div className="screen-head">
          <span className="deck-badge">{id}</span>
          <div className="track-text">
            {deck.loading ? (
              <span className="title muted">Loading…</span>
            ) : track ? (
              <>
                <span className="title">{track.meta.title}</span>
                <span className="artist">{track.meta.artist || 'Unknown artist'}</span>
              </>
            ) : (
              <span className="title muted">No track — load one from the browser below</span>
            )}
          </div>
          {track && (
            <button className="tiny" onClick={() => setGridOpen((v) => !v)} aria-expanded={gridOpen} title="Fix the beat grid">
              Grid
            </button>
          )}
        </div>
        {gridOpen && track && (
          <div className="grid-tools" role="group" aria-label="Beat grid adjust">
            <span>Beat grid</span>
            <button className="tiny" onClick={() => engine.adjustGrid(id, { bpmFactor: 0.5 })}>÷2 BPM</button>
            <button className="tiny" onClick={() => engine.adjustGrid(id, { bpmFactor: 2 })}>×2 BPM</button>
            <button className="tiny" onClick={() => engine.adjustGrid(id, { shift: -0.005 })}>◂ 5 ms</button>
            <button className="tiny" onClick={() => engine.adjustGrid(id, { shift: 0.005 })}>5 ms ▸</button>
          </div>
        )}
        <Readouts id={id} />
        <OverviewWaveform id={id} />
      </div>

      <div className="hotcues" role="group" aria-label="Hot cues">
        {Array.from({ length: HOT_CUES }, (_, i) => {
          const set = deck.hotCues[i] !== null;
          return (
            <button
              key={i}
              className={`hotcue ${set ? 'set' : ''}`}
              style={{ '--hc': hotCueVar(i) } as CSSProperties}
              disabled={!deck.loaded}
              onClick={(e) => (e.shiftKey ? deck.deleteHotCue(i) : deck.hotCue(i))}
              onContextMenu={(e) => {
                e.preventDefault();
                deck.deleteHotCue(i);
              }}
              aria-label={set ? `Hot cue ${String.fromCharCode(65 + i)}` : `Set hot cue ${String.fromCharCode(65 + i)}`}
              title={set ? `Hot cue ${String.fromCharCode(65 + i)} — click to jump, shift-click or right-click to delete` : `Set hot cue ${String.fromCharCode(65 + i)}`}
            >
              {String.fromCharCode(65 + i)}
            </button>
          );
        })}
      </div>

      <div className="loops" role="group" aria-label="Loops and beat jump">
        {loopSizes.map((b) => (
          <button
            key={b}
            className={`tiny loop ${deck.loop?.active && deck.loop.beats === b ? 'on' : ''}`}
            disabled={!deck.loaded}
            onClick={() => deck.autoLoop(b)}
            title={`${fmtBeats(b)}-beat loop`}
            aria-label={`${fmtBeats(b)}-beat loop`}
          >
            {fmtBeats(b)}
          </button>
        ))}
        <span className="sep" />
        <button className="tiny" disabled={!deck.loop?.active} onClick={() => deck.resizeLoop(0.5)} title="Halve loop">½×</button>
        <button className="tiny" disabled={!deck.loop?.active} onClick={() => deck.resizeLoop(2)} title="Double loop">2×</button>
        <button className="tiny wide" disabled={!deck.loop} onClick={() => (deck.loop?.active ? deck.exitLoop() : deck.reloop())}>
          {deck.loop?.active ? 'Exit' : 'Reloop'}
        </button>
        <span className="sep" />
        <button className="tiny" disabled={!deck.loaded} onClick={() => deck.beatJump(-deck.loopSize)} title={`Jump back ${fmtBeats(deck.loopSize)} beats`} aria-label={`Jump back ${fmtBeats(deck.loopSize)} beats`}>
          ◂◂
        </button>
        <button className="tiny" disabled={!deck.loaded} onClick={() => deck.beatJump(deck.loopSize)} title={`Jump forward ${fmtBeats(deck.loopSize)} beats`} aria-label={`Jump forward ${fmtBeats(deck.loopSize)} beats`}>
          ▸▸
        </button>
      </div>

      <div className="deck-body">
        <div className="transport">
          <div className="small-buttons">
            <button
              className="tiny sync"
              disabled={!deck.loaded || !other.loaded}
              onClick={() => {
                if (!deck.syncTo(other)) toast(`Deck ${id} can't reach ${other.bpm.toFixed(1)} BPM within ±16%.`, 'warn');
              }}
              title="Match the other deck's tempo (and phase, if both are playing)"
            >
              Sync
            </button>
            <button
              className={`tiny ${deck.quantizeOn ? 'on' : ''}`}
              onClick={() => deck.toggleQuantize()}
              aria-pressed={deck.quantizeOn}
              title="Quantize: snap cues, loops and jumps to the beat"
            >
              Quantize
            </button>
            <button
              className={`tiny ${deck.vinyl ? 'on' : ''}`}
              onClick={() => deck.toggleVinyl()}
              aria-pressed={deck.vinyl}
              title="Vinyl mode: hold the jog wheel to grab the record and scratch"
            >
              Vinyl
            </button>
          </div>
          <button
            className="cue-btn"
            disabled={!deck.loaded}
            onPointerDown={(e) => {
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              deck.cueDown();
            }}
            onPointerUp={() => deck.cueUp()}
            onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), deck.cueDown())}
            onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && deck.cueUp()}
            title="Cue: sets the cue point when paused, returns to it when playing; hold at the cue point to preview"
          >
            Cue
          </button>
          <button className={`play-btn ${deck.playing ? 'on' : ''}`} disabled={!deck.loaded} onClick={() => deck.togglePlay()} aria-pressed={deck.playing}>
            {deck.playing ? 'Pause' : 'Play'}
          </button>
        </div>

        <JogWheel id={id} />

        <div className="tempo">
          <button className="tiny" onClick={() => deck.cycleRange()} title="Tempo range">±{deck.range}%</button>
          <Fader
            label={`Deck ${id} tempo`}
            value={0.5 - deck.tempo / (deck.range / 100) / 2}
            onChange={(v) => deck.setTempoFraction((0.5 - v) * 2)}
            length={150}
            defaultValue={0.5}
            className="tempo-fader"
            valueText={`${(deck.tempo * 100).toFixed(2)}%`}
          >
            <div className="tempo-centre" />
          </Fader>
          <button className="tiny" onClick={() => deck.resetTempo()} title="Tempo back to 0%">Reset</button>
        </div>
      </div>
    </section>
  );
}
