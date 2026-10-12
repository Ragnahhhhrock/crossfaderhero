import { useEffect, useMemo, useRef } from 'react';
import { engine } from '../audio/engine';
import { beatAt, beatLength, beatTime } from '../audio/grid';
import type { Analysis, DeckId } from '../types';
import { useAnimationFrame, useCanvasSize, useDeck } from './hooks';

export const HOT_CUE_COLORS = ['#3ddc84', '#2fb8ff', '#ff5d8f', '#ffcc33', '#b48cff', '#ff8a1f', '#5ee0d0', '#f2f2f2'];
const LOW = '#2f6bff';
const MID = '#f0a43a';
const HIGH = '#f6f1e7';
const LOOP = 'rgba(255, 196, 0, 0.16)';
const CUE = '#ffb020';

/** Rekordbox-style three-band column: low at the back, highs in front. */
function drawColumns(
  g: CanvasRenderingContext2D,
  a: Analysis,
  t0: number,
  secPerPx: number,
  width: number,
  mid: number,
  amp: number,
  xStart = 0,
) {
  const w = a.waveform;
  const bins = w.length / 3;
  const bps = a.binsPerSecond;
  const paths = [new Path2D(), new Path2D(), new Path2D()];
  for (let x = xStart; x < width; x++) {
    const ta = t0 + (x - xStart) * secPerPx;
    const tb = ta + secPerPx;
    let b0 = Math.floor(ta * bps);
    let b1 = Math.max(b0 + 1, Math.floor(tb * bps));
    if (b1 <= 0 || b0 >= bins) continue;
    b0 = Math.max(0, b0);
    b1 = Math.min(bins, b1);
    let l = 0;
    let m = 0;
    let h = 0;
    for (let b = b0; b < b1; b++) {
      if (w[b * 3] > l) l = w[b * 3];
      if (w[b * 3 + 1] > m) m = w[b * 3 + 1];
      if (w[b * 3 + 2] > h) h = w[b * 3 + 2];
    }
    const hl = (l / 255) * amp;
    const hm = (m / 255) * amp * 0.85;
    const hh = (h / 255) * amp * 0.6;
    paths[0].rect(x, mid - hl, 1, hl * 2);
    paths[1].rect(x, mid - hm, 1, hm * 2);
    paths[2].rect(x, mid - hh, 1, hh * 2);
  }
  g.fillStyle = LOW;
  g.fill(paths[0]);
  g.fillStyle = MID;
  g.fill(paths[1]);
  g.fillStyle = HIGH;
  g.fill(paths[2]);
}

const PX_PER_SEC = 120; // real-time seconds

/** Scrolling waveform with the playhead in the centre, scaled by tempo so beatmatched decks line up. */
export function ScrollingWaveform({ id, zoom }: { id: DeckId; zoom: number }) {
  const deck = useDeck(id);
  const [ref, w, h] = useCanvasSize();
  const accent = id === 'A' ? '#5cc8ff' : '#ffa040';

  useAnimationFrame(() => {
    const c = ref.current;
    if (!c || !w) return;
    const g = c.getContext('2d')!;
    const dpr = c.width / w;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const a = deck.analysis;
    const grid = deck.grid;
    const mid = h / 2;
    if (!a || !grid) {
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(0, mid, w, 1);
      return;
    }
    const pos = deck.position;
    const secPerPx = deck.rate / (PX_PER_SEC * zoom);
    const t0 = pos - (w / 2) * secPerPx;
    const t1 = pos + (w / 2) * secPerPx;
    const X = (t: number) => (t - t0) / secPerPx;

    // loop
    if (deck.loop) {
      g.fillStyle = deck.loop.active ? LOOP : 'rgba(255,196,0,0.06)';
      g.fillRect(X(deck.loop.start), 0, X(deck.loop.end) - X(deck.loop.start), h);
    }

    // beat grid
    const firstVisible = Math.ceil(beatAt(grid, t0));
    const lastVisible = Math.floor(beatAt(grid, t1));
    for (let b = firstVisible; b <= lastVisible; b++) {
      const x = Math.round(X(beatTime(grid, b))) + 0.5;
      const down = (((b - grid.downbeat) % 4) + 4) % 4 === 0;
      g.fillStyle = down ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.14)';
      g.fillRect(x, 0, 1, down ? h : 6);
      if (!down) g.fillRect(x, h - 6, 1, 6);
    }

    drawColumns(g, a, t0, secPerPx, w, mid, h / 2 - 6);

    // memory cue + hot cues
    const marker = (t: number, color: string, label?: string) => {
      const x = X(t);
      if (x < -10 || x > w + 10) return;
      g.fillStyle = color;
      g.fillRect(Math.round(x), 0, 1.5, h);
      g.beginPath();
      g.moveTo(x - 5, 0);
      g.lineTo(x + 5, 0);
      g.lineTo(x, 7);
      g.fill();
      if (label) {
        g.font = '600 10px "Chakra Petch", sans-serif';
        g.fillText(label, x + 4, h - 4);
      }
    };
    marker(deck.cuePoint, CUE);
    deck.hotCues.forEach((t, i) => t !== null && marker(t, HOT_CUE_COLORS[i], String.fromCharCode(65 + i)));

    // playhead
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(w / 2 - 2, 0, 4, h);
    g.fillStyle = accent;
    g.fillRect(w / 2 - 1, 0, 2, h);
  });

  return <canvas ref={ref} className="scroll-wave" aria-label={`Deck ${id} waveform`} />;
}

/** Whole-track overview; click or drag to needle-search. */
export function OverviewWaveform({ id }: { id: DeckId }) {
  const deck = useDeck(id);
  const [ref, w, h] = useCanvasSize();
  const image = useRef<HTMLCanvasElement | null>(null);
  const a = deck.analysis;
  const dragging = useRef(false);

  // pre-render the static waveform when the track or size changes
  useEffect(() => {
    if (!a || !w || !h) {
      image.current = null;
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const off = document.createElement('canvas');
    off.width = Math.round(w * dpr);
    off.height = Math.round(h * dpr);
    const g = off.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawColumns(g, a, 0, a.duration / w, w, h / 2, h / 2 - 1);
    image.current = off;
  }, [a, w, h]);

  useAnimationFrame(() => {
    const c = ref.current;
    if (!c || !w) return;
    const g = c.getContext('2d')!;
    const dpr = c.width / w;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    if (!image.current || !a) return;
    g.drawImage(image.current, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const X = (t: number) => (t / a.duration) * w;
    const px = X(deck.position);
    g.fillStyle = 'rgba(10,12,14,0.55)';
    g.fillRect(0, 0, px, h);
    if (deck.loop) {
      g.fillStyle = 'rgba(255,196,0,0.35)';
      g.fillRect(X(deck.loop.start), 0, Math.max(2, X(deck.loop.end) - X(deck.loop.start)), h);
    }
    g.fillStyle = CUE;
    g.fillRect(X(deck.cuePoint), 0, 1.5, h);
    deck.hotCues.forEach((t, i) => {
      if (t === null) return;
      g.fillStyle = HOT_CUE_COLORS[i];
      g.fillRect(X(t) - 1, 0, 3, 4);
    });
    g.fillStyle = '#ffffff';
    g.fillRect(px - 1, 0, 2, h);
  });

  const seekFrom = (clientX: number) => {
    const c = ref.current;
    if (!c || !a) return;
    const r = c.getBoundingClientRect();
    deck.seek(((clientX - r.left) / r.width) * a.duration);
  };

  return (
    <canvas
      ref={ref}
      className="overview-wave"
      aria-label={`Deck ${id} track overview — click to jump`}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        dragging.current = true;
        seekFrom(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && !deck.playing && seekFrom(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
    />
  );
}

/**
 * Phase meter: where each deck sits in its bar, and how far apart their beats are.
 * Green when the kicks land within ~10 ms of each other.
 */
export function PhaseMeter() {
  const ref = useRef<HTMLCanvasElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const segsA = useRef<HTMLDivElement>(null);
  const segsB = useRef<HTMLDivElement>(null);

  const decks = useMemo(() => engine.decks, []);
  useAnimationFrame(() => {
    const A = decks.A;
    const B = decks.B;
    const update = (el: HTMLDivElement | null, d: typeof A) => {
      if (!el) return;
      const g = d.grid;
      const beat = g ? Math.floor(beatAt(g, d.position)) : -1;
      const inBar = g ? (((beat - g.downbeat) % 4) + 4) % 4 : -1;
      for (let i = 0; i < 4; i++) el.children[i]?.classList.toggle('on', i === inBar);
    };
    update(segsA.current, A);
    update(segsB.current, B);

    const c = ref.current;
    const lab = label.current;
    if (!c || !lab) return;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(W / 2 - 1, 0, 2, H);
    const ga = A.grid;
    const gb = B.grid;
    if (!ga || !gb || !A.playing || !B.playing) {
      lab.textContent = A.loaded && B.loaded ? 'Play both decks' : '';
      lab.className = 'phase-text';
      return;
    }
    // offset in milliseconds of real time between nearest beats
    const pa = beatAt(ga, A.position);
    const pb = beatAt(gb, B.position);
    let d = (pa - Math.floor(pa)) - (pb - Math.floor(pb));
    if (d > 0.5) d -= 1;
    if (d <= -0.5) d += 1;
    const ms = (d * beatLength(ga) * 1000) / A.rate;
    const tempoDiff = A.bpm - B.bpm;
    const x = W / 2 + Math.max(-1, Math.min(1, d * 2)) * (W / 2 - 4);
    const good = Math.abs(ms) < 10 && Math.abs(tempoDiff) < 0.05;
    g.fillStyle = good ? '#3ddc84' : Math.abs(ms) < 30 ? '#ffcc33' : '#ff5d5d';
    g.fillRect(Math.min(W / 2, x), H / 2 - 3, Math.abs(x - W / 2) || 2, 6);
    const lead = ms > 0 ? 'A ahead' : 'B ahead';
    lab.textContent =
      Math.abs(tempoDiff) >= 0.05
        ? `Tempo off ${Math.abs(tempoDiff).toFixed(2)} BPM`
        : Math.abs(ms) < 1
          ? 'In phase'
          : `${lead} ${Math.abs(ms).toFixed(0)} ms`;
    lab.className = `phase-text ${good ? 'good' : ''}`;
  });

  return (
    <div className="phase-meter" aria-live="off">
      <div className="bar-segs deck-a" ref={segsA} aria-hidden>
        <i /><i /><i /><i />
      </div>
      <div className="phase-centre">
        <canvas ref={ref} width={240} height={14} className="phase-canvas" aria-hidden />
        <span ref={label} className="phase-text" />
      </div>
      <div className="bar-segs deck-b" ref={segsB} aria-hidden>
        <i /><i /><i /><i />
      </div>
    </div>
  );
}
