import { useEffect, useRef, type CSSProperties, type PointerEvent } from 'react';
import { GROOVE_OUTER, grooveRadius, positionAtRadius, SECONDS_PER_REV } from '../audio/platter';
import { RECORD_R, recordCanvas } from '../library/sleeve';
import type { Turntable } from '../audio/turntable';
import type { DeckId } from '../types';
import { alpha, font, shade, token } from '../design/tokens';
import { Fader, Knob } from './controls';
import { formatTime, useAnimationFrame, useCanvasSize, usePolled, useTurntable } from './hooks';
import { OverviewWaveform } from './waveforms';

/*
 * Plan view of a direct-drive turntable, in metres. x to the right, y towards the DJ.
 * Proportions follow the classic battle deck: platter left of centre, arm at the back right.
 */
const PLINTH = { w: 0.453, d: 0.353 };
const CENTRE = { x: 0.18, y: 0.178 };
const PLATTER_R = 0.166;
const SLIPMAT_R = 0.15;
const PIVOT = { x: 0.392, y: 0.098 };
const ARM_L = 0.232; // pivot to stylus
const ARM_REST = (96 * Math.PI) / 180;

/** Arm angle (radians, from the pivot) that puts the stylus `r` metres from the spindle. */
export function armAngleFor(r: number): number {
  const dx = CENTRE.x - PIVOT.x;
  const dy = CENTRE.y - PIVOT.y;
  const d = Math.hypot(dx, dy);
  const cos = (ARM_L * ARM_L + d * d - r * r) / (2 * ARM_L * d);
  return Math.atan2(dy, dx) - Math.acos(Math.max(-1, Math.min(1, cos)));
}

function stylusAt(angle: number) {
  return { x: PIVOT.x + ARM_L * Math.cos(angle), y: PIVOT.y + ARM_L * Math.sin(angle) };
}

const ARM_OUTERMOST = armAngleFor(RECORD_R + 0.004);
const ARM_INNERMOST = armAngleFor(0.055);

/** Where the arm is drawn: on its rest, or over the groove the needle is in. */
function armAngle(tt: Turntable): number {
  if (!tt.loaded || !tt.armOnRecord) return ARM_REST;
  return armAngleFor(grooveRadius(tt.position, tt.duration));
}

type Grip = { kind: 'record'; start: number; turned: number; last: number } | { kind: 'rim'; last: number; t: number } | { kind: 'arm'; angle: number };

function PlatterView({ tt }: { tt: Turntable }) {
  const [ref, w, h] = useCanvasSize();
  const record = useRef<HTMLCanvasElement | null>(null);
  const recordKey = useRef('');
  const grip = useRef<Grip | null>(null);
  const settle = useRef(0);

  // press the record image when a new one goes on
  useEffect(() => {
    const key = tt.track ? `${tt.track.key}|${tt.analysis?.bpm}` : '';
    if (key === recordKey.current) return;
    recordKey.current = key;
    record.current = tt.track ? recordCanvas(tt.track, tt.analysis, 640) : null;
  });

  const scale = w / PLINTH.w; // px per metre
  const toPx = (x: number, y: number) => [x * scale, y * scale] as const;

  useAnimationFrame((now) => {
    const c = ref.current;
    if (!c || !w) return;
    const g = c.getContext('2d')!;
    const dpr = c.width / w;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const k = scale;
    const [cx, cy] = toPx(CENTRE.x, CENTRE.y);

    // plinth
    g.fillStyle = token('tt-plinth');
    g.beginPath();
    g.roundRect(0, 0, w, h, 10);
    g.fill();
    g.strokeStyle = alpha('white', 0.06);
    g.lineWidth = 1;
    g.stroke();

    // platter edge with strobe dots, lit red from the front-left
    const platterA = tt.platterAngleRevs * Math.PI * 2;
    const nominal = (tt.ctx.currentTime * (tt.rpm === 45 ? 1.35 : 1)) / SECONDS_PER_REV;
    const strobeA = (tt.platterAngleRevs - nominal) * Math.PI * 2;
    g.fillStyle = shade('tt-chrome', 0.55);
    g.beginPath();
    g.arc(cx, cy, PLATTER_R * k, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 90; i++) {
      const a = strobeA + (i / 90) * Math.PI * 2;
      const lit = Math.max(0, Math.cos(a - (Math.PI * 3) / 4));
      g.fillStyle = lit > 0.2 ? alpha('tt-strobe', 0.25 + lit * 0.7) : shade('tt-chrome', 0.85);
      g.beginPath();
      g.arc(cx + Math.cos(a) * (PLATTER_R - 0.006) * k, cy + Math.sin(a) * (PLATTER_R - 0.006) * k, 0.0022 * k, 0, Math.PI * 2);
      g.fill();
    }
    // strobe light
    g.fillStyle = token('tt-strobe');
    g.beginPath();
    g.arc(cx - (PLATTER_R + 0.012) * k * 0.72, cy + (PLATTER_R + 0.012) * k * 0.72, 0.006 * k, 0, Math.PI * 2);
    g.fill();

    // slipmat (turns with the platter)
    g.save();
    g.translate(cx, cy);
    g.rotate(platterA);
    g.fillStyle = token('slipmat');
    g.beginPath();
    g.arc(0, 0, SLIPMAT_R * k, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = alpha('ink-500', 0.5);
    g.font = font('ui', Math.max(8, 0.014 * k), 700);
    g.textAlign = 'center';
    g.fillText('CROSSFADER HERO', 0, -0.1 * k);
    g.restore();

    // the record (turns with the record, which can slip on the mat)
    if (tt.loaded && record.current) {
      const rr = RECORD_R * k;
      g.save();
      g.translate(cx, cy);
      g.rotate(tt.recordRevs * Math.PI * 2);
      g.drawImage(record.current, -rr, -rr, rr * 2, rr * 2);
      g.restore();
      if (tt.held) {
        g.strokeStyle = alpha('cue', 0.6);
        g.lineWidth = 2;
        g.beginPath();
        g.arc(cx, cy, rr + 1, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // spindle
    g.fillStyle = token('tt-chrome');
    g.beginPath();
    g.arc(cx, cy, 0.0045 * k, 0, Math.PI * 2);
    g.fill();

    // tonearm
    const gr = grip.current;
    const ang = gr?.kind === 'arm' ? gr.angle : armAngle(tt);
    const lifted = !tt.needleDown || gr?.kind === 'arm';
    const [px, py] = toPx(PIVOT.x, PIVOT.y);
    const tip = stylusAt(ang);
    const [sx, sy] = toPx(tip.x, tip.y);
    const lift = lifted ? 4 : 1.5;
    // rest post
    const rest = stylusAt(ARM_REST);
    g.fillStyle = shade('tt-plinth', 1.8);
    g.beginPath();
    g.arc(...toPx(rest.x - 0.012, rest.y - 0.03), 0.007 * k, 0, Math.PI * 2);
    g.fill();
    // shadow, arm tube, counterweight, headshell
    const armLine = (dx: number, dy: number, color: string, width: number) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(px + dx - Math.cos(ang) * 0.045 * k, py + dy - Math.sin(ang) * 0.045 * k);
      g.lineTo(sx + dx - Math.cos(ang) * 0.02 * k, sy + dy - Math.sin(ang) * 0.02 * k);
      g.stroke();
    };
    armLine(lift, lift * 1.4, alpha('black', 0.45), 0.008 * k);
    g.fillStyle = shade('tt-chrome', 0.7);
    g.beginPath();
    g.arc(px, py, 0.022 * k, 0, Math.PI * 2);
    g.fill();
    armLine(0, 0, token('tt-chrome'), 0.007 * k);
    g.fillStyle = shade('tt-chrome', 0.45);
    g.beginPath();
    g.arc(px - Math.cos(ang) * 0.05 * k, py - Math.sin(ang) * 0.05 * k, 0.014 * k, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.translate(sx, sy);
    g.rotate(ang + 0.35);
    g.fillStyle = shade('tt-plinth', 2.4);
    g.fillRect(-0.028 * k, -0.009 * k, 0.034 * k, 0.018 * k);
    g.fillStyle = token(tt.needleDown ? 'play' : 'cue');
    g.fillRect(-0.004 * k, -0.004 * k, 0.008 * k, 0.008 * k);
    // finger lift
    g.fillStyle = token('tt-chrome');
    g.fillRect(-0.034 * k, 0.006 * k, 0.012 * k, 0.004 * k);
    g.restore();

    // target light glow when the needle's up and the arm is over the record
    if (!tt.needleDown && tt.armOnRecord && Math.sin(now / 200) > -0.2) {
      g.fillStyle = alpha('cue', 0.25);
      g.beginPath();
      g.arc(sx, sy, 0.012 * k, 0, Math.PI * 2);
      g.fill();
    }
  });

  const local = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  const angleAt = (p: { x: number; y: number }) => Math.atan2(p.y - CENTRE.y, p.x - CENTRE.x);
  const unwrap = (d: number) => (d > Math.PI ? d - Math.PI * 2 : d < -Math.PI ? d + Math.PI * 2 : d);

  const onDown = (e: PointerEvent) => {
    if (!scale) return;
    const p = local(e);
    const tip = stylusAt(armAngle(tt));
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const dist = Math.hypot(p.x - CENTRE.x, p.y - CENTRE.y);
    if (Math.hypot(p.x - tip.x, p.y - tip.y) < 0.03 || (Math.hypot(p.x - PIVOT.x, p.y - PIVOT.y) < ARM_L + 0.02 && dist > RECORD_R + 0.01)) {
      // pick up the arm by its finger lift
      grip.current = { kind: 'arm', angle: armAngle(tt) };
      if (tt.needleDown) tt.liftNeedle();
    } else if (dist <= RECORD_R && tt.loaded) {
      const a = angleAt(p);
      grip.current = { kind: 'record', start: a, turned: 0, last: a };
      tt.grab();
    } else if (dist <= PLATTER_R + 0.01) {
      grip.current = { kind: 'rim', last: angleAt(p), t: performance.now() };
    }
  };

  const onMove = (e: PointerEvent) => {
    const gr = grip.current;
    if (!gr) return;
    const p = local(e);
    if (gr.kind === 'record') {
      const a = angleAt(p);
      gr.turned += unwrap(a - gr.last);
      gr.last = a;
      tt.handTo((gr.turned / (Math.PI * 2)) * SECONDS_PER_REV);
    } else if (gr.kind === 'rim') {
      const a = angleAt(p);
      const now = performance.now();
      const revPerSec = unwrap(a - gr.last) / (Math.PI * 2) / Math.max(0.008, (now - gr.t) / 1000);
      gr.last = a;
      gr.t = now;
      tt.setNudge(revPerSec * 0.6);
      clearTimeout(settle.current);
      settle.current = window.setTimeout(() => tt.setNudge(0), 90);
    } else {
      const a = Math.atan2(p.y - PIVOT.y, p.x - PIVOT.x);
      gr.angle = Math.max(ARM_REST, Math.min(ARM_INNERMOST, a));
      if (tt.loaded && gr.angle >= ARM_OUTERMOST) {
        const tip = stylusAt(gr.angle);
        tt.moveNeedle(positionAtRadius(Math.min(GROOVE_OUTER, Math.hypot(tip.x - CENTRE.x, tip.y - CENTRE.y)), tt.duration));
      }
    }
  };

  const onUp = () => {
    const gr = grip.current;
    grip.current = null;
    if (!gr) return;
    if (gr.kind === 'record') tt.release();
    else if (gr.kind === 'rim') {
      clearTimeout(settle.current);
      tt.setNudge(0);
    } else if (tt.loaded && gr.angle >= ARM_OUTERMOST) {
      // let go over the record: the needle drops into the groove
      const tip = stylusAt(gr.angle);
      const r = Math.hypot(tip.x - CENTRE.x, tip.y - CENTRE.y);
      tt.dropNeedle(positionAtRadius(Math.min(GROOVE_OUTER, r), tt.duration));
    } else tt.parkArm();
  };

  return (
    <canvas
      ref={ref}
      className="tt-canvas"
      data-tip="Drag the tonearm onto the record to drop the needle. Hold the record to stop it and drag to scratch; drag the platter edge to nudge."
      role="application"
      aria-label={`Turntable ${tt.id}: hold the record to scratch, drag the platter edge to nudge, drag the tonearm to drop the needle`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onWheel={(e) => {
        tt.setNudge(-Math.sign(e.deltaY) * 0.6);
        clearTimeout(settle.current);
        settle.current = window.setTimeout(() => tt.setNudge(0), 120);
      }}
      style={{ cursor: 'grab' }}
    />
  );
}

function Readouts({ tt }: { tt: Turntable }) {
  const elapsed = usePolled(() => formatTime(tt.position));
  const remain = usePolled(() => `-${formatTime(tt.duration - tt.position)}`);
  const speed = usePolled(() => Math.round(tt.speed * 100));
  const t = tt.pitch * 100;
  if (!tt.assist) {
    return (
      <div className="readouts tt-readouts by-ear">
        <span>{tt.rpm} RPM</span>
        <span>Pitch {t >= 0 ? '+' : ''}{t.toFixed(1)}%</span>
        <span className="muted">Assist off — no BPM or time, just your ears</span>
      </div>
    );
  }
  return (
    <div className="readouts tt-readouts">
      <div className="time">
        <span className="big">{elapsed}</span>
        <span>{remain}</span>
      </div>
      <div className="rpm" title="Platter speed">
        {tt.rpm}
        <small> RPM</small>
        {Math.abs(speed - Math.round(tt.target * 100)) > 2 && tt.loaded ? <small className="slip"> {speed}%</small> : null}
      </div>
      <div className="bpm">
        <span className="big">{tt.bpm ? tt.bpm.toFixed(2) : '--.--'}</span>
        <span>
          {t >= 0 ? '+' : ''}
          {t.toFixed(2)}% <small>±{tt.range}</small>
        </span>
      </div>
      <div className="key" title={tt.analysis?.key}>
        {tt.analysis?.camelot ?? '--'}
      </div>
    </div>
  );
}

/** A turntable at the decks: platter, record, tonearm, Start/Stop, 33/45 and the pitch fader. */
export function TurntablePanel({ id }: { id: DeckId }) {
  const tt = useTurntable(id);
  const accent = id === 'A' ? 'var(--deck-a)' : 'var(--deck-b)';
  const track = tt.track;

  return (
    <section className={`deck turntable deck-${id.toLowerCase()}`} style={{ '--accent': accent } as CSSProperties} aria-label={`Turntable ${id}`}>
      <div className="screen">
        <div className="screen-head">
          <span className="deck-badge">{id}</span>
          <div className="track-text">
            {tt.loading ? (
              <span className="title muted">Putting the record on…</span>
            ) : track ? (
              <>
                <span className="title">{track.meta.title}</span>
                <span className="artist">{track.meta.artist || 'Unknown artist'}</span>
              </>
            ) : (
              <span className="title muted">No record — pull one from the crate</span>
            )}
          </div>
          <button className={`tiny ${tt.assist ? 'on' : ''}`} aria-pressed={tt.assist} onClick={() => tt.toggleAssist()} title="Show BPM, time and waveforms. Off is the real-vinyl experience.">
            Assist
          </button>
          {track && (
            <button className="tiny" onClick={() => tt.eject()} disabled={tt.playing} title="Take the record off (stop it or lift the needle first)">
              Off
            </button>
          )}
        </div>
        <Readouts tt={tt} />
        {tt.assist && <OverviewWaveform id={id} />}
      </div>

      <div className="deck-body tt-body">
        <div className="transport tt-transport">
          <button className={`tt-start ${tt.motor ? 'on' : ''}`} onClick={() => tt.toggleStart()} aria-pressed={tt.motor} title="Start / Stop the platter">
            Start
            <br />
            Stop
          </button>
          <div className="rpm-buttons" role="group" aria-label="Speed">
            <button className={`tiny ${tt.rpm === 33 ? 'on' : ''}`} aria-pressed={tt.rpm === 33} onClick={() => tt.setRpm(33)} title="33⅓ RPM — most 12-inch records">33</button>
            <button className={`tiny ${tt.rpm === 45 ? 'on' : ''}`} aria-pressed={tt.rpm === 45} onClick={() => tt.setRpm(45)} title="45 RPM — 7-inch singles, or a quick pitch-up">45</button>
          </div>
          <button
            className={`tiny needle ${tt.needleDown ? 'on' : ''}`}
            disabled={!tt.loaded}
            onClick={() => tt.toggleNeedle()}
            title="Cue lever: lift or lower the needle. With the arm on its rest, this drops it at the start of the record."
          >
            {tt.needleDown ? 'Lift' : 'Drop'}
          </button>
          <div className="tt-knobs">
            <Knob label="Start" tip="Start time: how long the platter takes to get up to speed." size={28} value={tt.startTime} min={0.1} max={3} defaultValue={0.7} bipolar={false} onChange={(v) => tt.setStartTime(v)} format={(v) => `${v.toFixed(1)} s`} />
            <Knob label="Brake" tip="Brake time: how long the platter takes to stop — turn up for a slow wind-down." size={28} value={tt.brakeTime} min={0.1} max={4} defaultValue={0.6} bipolar={false} onChange={(v) => tt.setBrakeTime(v)} format={(v) => `${v.toFixed(1)} s`} />
          </div>
          <button className={`tiny ${tt.power ? '' : 'warn'}`} onClick={() => tt.togglePower()} aria-pressed={!tt.power} title="Power: switch off for the slow power-down effect">
            {tt.power ? 'Power' : 'Power off'}
          </button>
        </div>

        <PlatterView tt={tt} />

        <div className="tempo">
          <button className="tiny" onClick={() => tt.cycleRange()} title="Pitch range">±{tt.range}%</button>
          <Fader
            label={`Turntable ${id} pitch`}
            tip={`Pitch: slide to speed the record up or down until it matches the other deck. Keys: ${id === 'A' ? 'Q / W' : 'O / P'}.`}
            value={0.5 - tt.pitch / (tt.range / 100) / 2}
            onChange={(v) => tt.setPitchFraction((0.5 - v) * 2)}
            length={150}
            defaultValue={0.5}
            className="tempo-fader"
            valueText={`${(tt.pitch * 100).toFixed(2)}%`}
          >
            <div className="tempo-centre" />
          </Fader>
          <button className="tiny" onClick={() => tt.resetPitch()} title="Pitch back to 0%">Reset</button>
        </div>
      </div>
    </section>
  );
}
