import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { engine } from '../audio/engine';
import { useSetup, type Gear } from '../state/setup';
import { useTips } from '../state/tips';

/* ---------------------------------------------------------------------------
 * Hover tips: any control with a `title` or `data-tip` gets a styled tip after
 * a short hover. Native titles are moved into data-tip so the browser's own
 * tooltip doesn't show as well.
 * ------------------------------------------------------------------------- */

const DELAY_MS = 450;

function tipText(el: HTMLElement | SVGElement): string | undefined {
  const t = el.getAttribute('title');
  if (t !== null) {
    if (t) {
      el.dataset.tip = t;
      el.dataset.tipFromTitle = '';
    }
    el.removeAttribute('title');
  }
  return el.dataset.tip || undefined;
}

/** Give titles back to the browser when hover tips are switched off. */
function restoreTitles() {
  document.querySelectorAll<HTMLElement>('[data-tip-from-title]').forEach((el) => {
    if (el.dataset.tip) el.setAttribute('title', el.dataset.tip);
    delete el.dataset.tip;
    delete el.dataset.tipFromTitle;
  });
}

export function TipLayer() {
  const on = useTips((s) => s.hoverTips);
  const touring = useTips((s) => s.touring);
  const [tip, setTip] = useState<{ text: string; rect: DOMRect } | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!on || touring) {
      setTip(null);
      if (!on) restoreTitles();
      return;
    }
    let timer = 0;
    let current: Element | null = null;
    const hide = () => {
      clearTimeout(timer);
      current = null;
      setTip(null);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.buttons) return;
      const el = (e.target as Element).closest?.('[data-tip],[title]') as HTMLElement | SVGElement | null;
      if (el === current) return;
      clearTimeout(timer);
      setTip(null);
      current = el;
      if (!el || !el.closest('.app') || el.closest('.modal')) return;
      const text = tipText(el);
      if (!text) return;
      timer = window.setTimeout(() => {
        if (el.isConnected) setTip({ text, rect: el.getBoundingClientRect() });
      }, DELAY_MS);
    };
    const out = (e: PointerEvent) => {
      if (!e.relatedTarget) hide();
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('wheel', hide, { capture: true, passive: true });
    window.addEventListener('keydown', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('wheel', hide, true);
      window.removeEventListener('keydown', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, [on, touring]);

  // place above the control, or below if there's no room; keep it on screen
  useLayoutEffect(() => {
    const b = bubble.current;
    if (!tip || !b) return setPos(null);
    const { width, height } = b.getBoundingClientRect();
    const r = tip.rect;
    const gap = 8;
    let top = r.top - height - gap;
    if (top < 52) top = r.bottom + gap;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.left + r.width / 2 - width / 2));
    setPos({ left, top });
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={bubble}
      className="tip-bubble"
      role="tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0, visibility: 'hidden' }}
    >
      {tip.text}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The booth tour: a spotlight walks through the decks and mixer, one control
 * at a time, then explains how a mix earns rep.
 * ------------------------------------------------------------------------- */

interface Ctx {
  gear: Gear;
  /** What sits on the left side of the booth right now. */
  left: 'cdj' | 'turntable';
  club: boolean;
}

interface Step {
  /** CSS selector; several matches are framed together. None = a centred card. */
  sel?: string;
  title: string;
  body: ReactNode;
  keys?: ReactNode;
  show?: (c: Ctx) => boolean;
}

const K = ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>;

const STEPS: Step[] = [
  {
    title: 'Welcome to the booth',
    body: (
      <p>
        Two decks on the outside, the mixer in the middle. This quick tour shows what each control does and how to land your
        first mix. It takes about a minute.
      </p>
    ),
    keys: <>
      <K>→</K> next · <K>←</K> back · <K>Esc</K> skip
    </>,
  },
  {
    sel: '[data-tour="usb"]',
    title: 'Load your music',
    body: (
      <p>
        Open the <strong>USB browser</strong> and add a folder of MP3s from your computer. Each track is analysed for BPM and
        key — press <strong>A</strong> or <strong>B</strong> next to a track to load it onto that deck.
      </p>
    ),
    show: (c) => c.gear !== 'vinyl',
  },
  {
    sel: '[data-tour="crates"]',
    title: 'Pull a record',
    body: <p>Open the <strong>Record crates</strong>, pick a sleeve and put the record on turntable A or B.</p>,
    show: (c) => c.gear !== 'cdj',
  },
  {
    sel: '.booth .deck-a .screen',
    title: 'The deck screen',
    body: (
      <p>
        Track name, time left (it flashes in the last 30 seconds), BPM and tempo %, bar.beat and musical key. The waveform at
        the bottom is the whole track — click it to jump.
      </p>
    ),
  },
  // CDJ
  {
    sel: '.booth .deck-a:not(.turntable) .transport',
    title: 'Play, Cue and Sync',
    body: (
      <p>
        <strong>Play</strong> starts the track. <strong>Cue</strong> marks a start point while paused and snaps back to it while
        playing — hold it to preview. <strong>Sync</strong> matches the other deck's tempo; beatmatching by hand earns more rep.
      </p>
    ),
    keys: <>
      Deck A: <K>X</K> play · <K>Z</K> cue &nbsp; Deck B: <K>,</K> play · <K>M</K> cue
    </>,
    show: (c) => c.left === 'cdj',
  },
  {
    sel: '.booth .deck-a .jog',
    title: 'Jog wheel',
    body: (
      <p>
        Spin it while the track plays to push it ahead or pull it back into time. While paused it scrubs through the track. Turn
        on <strong>Vinyl</strong> and hold it to grab the record and scratch.
      </p>
    ),
    keys: <>
      Nudge: <K>A</K> <K>S</K> (deck A) · <K>K</K> <K>L</K> (deck B)
    </>,
    show: (c) => c.left === 'cdj',
  },
  {
    sel: '.booth .deck-a:not(.turntable) .tempo',
    title: 'Tempo fader',
    body: (
      <p>
        Slide it to speed the track up or slow it down until its BPM matches the other deck. The <strong>±%</strong> button
        changes the range; <strong>Reset</strong> puts it back to 0.
      </p>
    ),
    keys: <>
      <K>Q</K> <K>W</K> (deck A) · <K>O</K> <K>P</K> (deck B)
    </>,
    show: (c) => c.left === 'cdj',
  },
  {
    sel: '.booth .deck-a .hotcues, .booth .deck-a .loops',
    title: 'Hot cues and loops',
    body: (
      <p>
        Tap an empty pad to mark a spot, tap it again to jump straight there (right-click deletes). The loop buttons repeat ½ to
        16 beats — great for stretching an intro while you line up the next track.
      </p>
    ),
    keys: <>
      Hot cues <K>1</K>–<K>4</K> / <K>7</K>–<K>0</K> · 4-beat loop <K>E</K> / <K>I</K>
    </>,
    show: (c) => c.left === 'cdj',
  },
  // turntable
  {
    sel: '.booth .deck-a.turntable .tt-canvas',
    title: 'The record',
    body: (
      <p>
        Drag the tonearm onto the record to drop the needle — the lighter bands are breaks. Hold the record to stop it, drag it
        back and forth to scratch, and drag the platter's edge to nudge it into time.
      </p>
    ),
    keys: <>
      Hand on record <K>Z</K> / <K>M</K> · nudge <K>A</K> <K>S</K> / <K>K</K> <K>L</K>
    </>,
    show: (c) => c.left === 'turntable',
  },
  {
    sel: '.booth .deck-a.turntable .tt-transport',
    title: 'Start / Stop and the cue lever',
    body: (
      <p>
        <strong>Start</strong> spins the platter, <strong>Drop</strong> lowers the needle, and <strong>33 / 45</strong> sets the
        speed. Start and Brake set how fast the platter gets up to speed and stops.
      </p>
    ),
    keys: <>
      Start <K>X</K> / <K>,</K> · needle <K>1</K> / <K>7</K>
    </>,
    show: (c) => c.left === 'turntable',
  },
  {
    sel: '.booth .deck-a.turntable .tempo',
    title: 'Pitch fader',
    body: <p>Slide it to speed the record up or slow it down until it matches the other deck.</p>,
    keys: <>
      <K>Q</K> <K>W</K> (A) · <K>O</K> <K>P</K> (B)
    </>,
    show: (c) => c.left === 'turntable',
  },
  {
    sel: '.booth-overlay .waves',
    title: 'Waveforms and phase meter',
    body: (
      <p>
        Both tracks scroll past the centre line. The strip between them shows how far apart the beats are —{' '}
        <strong>green means the kicks land together</strong>. Use + and − in the top bar to zoom.
      </p>
    ),
  },
  {
    sel: '.booth .channel-a',
    title: 'Channel strip',
    body: (
      <p>
        <strong>Trim</strong> sets the input level — keep the meter out of the red. <strong>Hi / Mid / Low</strong> shape the
        sound; swap the lows when mixing so two basslines don't clash. <strong>Filter</strong> sweeps low- or high-pass. The
        fader at the bottom is the channel's volume.
      </p>
    ),
  },
  {
    sel: '.booth .xfader-row',
    title: 'Crossfader',
    body: (
      <p>
        Blends from deck A on the left to deck B on the right. <strong>Smooth</strong> suits long blends; <strong>Sharp</strong>{' '}
        is for cuts and scratching.
      </p>
    ),
    keys: <>
      <K>←</K> <K>→</K> · <K>↓</K> centre
    </>,
  },
  {
    sel: '.booth .phones, .booth .ch-cue',
    title: 'Headphones',
    body: (
      <p>
        Press a channel's <strong>Cue</strong> to hear it in your headphones before the crowd does. <strong>Split cue</strong>{' '}
        puts the cued track in your left ear and the master in your right.
      </p>
    ),
  },
  {
    sel: '[data-tour="lights"]',
    title: 'Light desk',
    body: <p>Run the lights, lasers, smoke and LED wall. Press <K>H</K> to hide the decks for a clear look at the room.</p>,
    show: (c) => c.club,
  },
  {
    sel: '.career-chip',
    title: 'Your career',
    body: (
      <p>
        Earn rep with lessons and clean mixes to climb from your bedroom to the main stage. Click here for guided lessons —
        advanced ones unlock as you go.
      </p>
    ),
  },
  {
    sel: '[data-tour="help"]',
    title: 'Keys & tips',
    body: (
      <p>
        Every keyboard shortcut and a beatmatching cheat sheet live here. You can replay this tour from there too. Hover over any
        control for a quick tip.
      </p>
    ),
    keys: <>
      <K>?</K> opens it
    </>,
  },
  {
    title: 'Your first mix',
    body: (
      <ol>
        <li>Load a track on each deck. Play A with its channel fader up; keep B's fader down.</li>
        <li>Move B's tempo fader until both BPMs match.</li>
        <li>Cue B in your headphones, start it on a downbeat and nudge it until the phase meter goes green.</li>
        <li>Bring B in with its fader or the crossfader and swap the lows. A clean mix earns rep.</li>
      </ol>
    ),
  },
];

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function frameOf(sel: string): Box | null {
  const els = [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  if (!els.length) return null;
  const l = Math.min(...els.map((r) => r.left));
  const t = Math.min(...els.map((r) => r.top));
  const r = Math.max(...els.map((r) => r.right));
  const b = Math.max(...els.map((r) => r.bottom));
  const pad = 6;
  return { left: l - pad, top: t - pad, width: r - l + pad * 2, height: b - t + pad * 2 };
}

const CARD_W = 340;

function placeCard(f: Box | null, h: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!f) return { left: (vw - CARD_W) / 2, top: Math.max(60, (vh - h) / 2) };
  const gap = 14;
  const clampX = (x: number) => Math.max(12, Math.min(vw - CARD_W - 12, x));
  const clampY = (y: number) => Math.max(56, Math.min(vh - h - 12, y));
  const cx = f.left + f.width / 2 - CARD_W / 2;
  if (f.top + f.height + gap + h < vh) return { left: clampX(cx), top: f.top + f.height + gap };
  if (f.top - gap - h > 52) return { left: clampX(cx), top: f.top - gap - h };
  if (f.left + f.width + gap + CARD_W < vw) return { left: f.left + f.width + gap, top: clampY(f.top) };
  if (f.left - gap - CARD_W > 0) return { left: f.left - gap - CARD_W, top: clampY(f.top) };
  return { left: clampX(cx), top: clampY(f.top + f.height / 2 - h / 2) };
}

export function Tour({ club, onBegin, onFinish }: { club: boolean; onBegin: () => void; onFinish: () => void }) {
  const touring = useTips((s) => s.touring);
  const end = useTips((s) => s.endTour);
  const hoverTips = useTips((s) => s.hoverTips);
  const setHoverTips = useTips((s) => s.setHoverTips);
  const gear = useSetup((s) => s.gear) ?? 'cdj';
  const [i, setI] = useState(0);
  const [frame, setFrame] = useState<Box | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(220);

  const steps = useMemo(() => {
    if (!touring) return [];
    const ctx: Ctx = { gear, left: engine.player('A').kind === 'turntable' ? 'turntable' : 'cdj', club };
    return STEPS.filter((s) => !s.show || s.show(ctx));
  }, [touring, gear, club]);
  const step = steps[i];

  useEffect(() => {
    if (!touring) return;
    setI(0);
    onBegin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touring]);

  const finish = () => {
    end();
    onFinish();
  };

  // follow the target every frame: the booth slides in, panels resize
  useEffect(() => {
    if (!step) return;
    let raf = 0;
    let last = '';
    const tick = () => {
      const f = step.sel ? frameOf(step.sel) : null;
      const key = f ? `${Math.round(f.left)},${Math.round(f.top)},${Math.round(f.width)},${Math.round(f.height)}` : '';
      if (key !== last) {
        last = key;
        setFrame(f);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [step]);

  useLayoutEffect(() => {
    if (card.current) setCardH(card.current.getBoundingClientRect().height);
  }, [i, step]);

  useEffect(() => {
    if (!touring) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') setI((n) => Math.min(n + 1, steps.length - 1));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
      else if (e.key === 'Escape') finish();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touring, steps.length]);

  if (!touring || !step) return null;
  const last = i === steps.length - 1;
  const at = placeCard(frame, cardH);

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {frame ? (
        <div className="tour-spot" style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }} />
      ) : (
        <div className="tour-scrim" />
      )}
      <div ref={card} className="tour-card" style={{ left: at.left, top: at.top, width: CARD_W }}>
        <div className="tour-kicker">
          Booth tour · {i + 1} of {steps.length}
        </div>
        <h3 id="tour-title">{step.title}</h3>
        <div className="tour-body">{step.body}</div>
        {step.keys && <p className="tour-keys">{step.keys}</p>}
        {last && (
          <label className="switch tour-switch">
            <input type="checkbox" checked={hoverTips} onChange={(e) => setHoverTips(e.target.checked)} />
            <span>Show tips when I hover over a control</span>
          </label>
        )}
        <div className="tour-dots" aria-hidden>
          {steps.map((_, n) => (
            <i key={n} className={n < i ? 'done' : n === i ? 'now' : ''} />
          ))}
        </div>
        <div className="tour-actions">
          {!last && (
            <button className="tiny" onClick={finish}>
              Skip tour
            </button>
          )}
          <span className="tour-grow" />
          {i > 0 && (
            <button className="tiny" onClick={() => setI(i - 1)}>
              Back
            </button>
          )}
          <button className="primary" autoFocus onClick={() => (last ? finish() : setI(i + 1))}>
            {last ? "Let's mix" : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
