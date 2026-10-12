import { create } from 'zustand';
import { engine } from '../audio/engine';
import { onAction } from '../audio/actions';
import { beatInBar, beatLength, phaseOffset } from '../audio/grid';
import type { Deck } from '../audio/deck';
import { toast } from '../state/toasts';
import type { DeckId } from '../types';
import { LESSONS, lessonById } from './lessons';
import { emptyCounters, MIX_REP, MixMonitor, tierFor, xfOpen, type DeckSnap, type Snap } from './rules';
import { useCareer } from './store';

/** Live coach state for the UI. */
interface CoachUi {
  /** 0..1 progress through the current step's hold time. */
  progress: number;
  /** Lesson just finished, for the "lesson complete" card. */
  finished: string | null;
  dismissFinished: () => void;
}

export const useCoach = create<CoachUi>((set) => ({
  progress: 0,
  finished: null,
  dismissFinished: () => set({ finished: null }),
}));

function deckSnap(d: Deck): DeckSnap {
  const g = d.grid;
  return {
    loaded: d.loaded,
    playing: d.playing || d.scratching,
    trackKey: d.track?.key ?? null,
    bpm: d.bpm,
    camelot: d.analysis?.camelot ?? null,
    position: d.position,
    beatInBar: g ? beatInBar(g, d.position) : -1,
    hotCuesSet: d.hotCues.filter((c) => c !== null).length,
    hotCueBeat: d.hotCues.map((c) => {
      if (c === null || !g) return -1;
      // allow a few ms of slop when quantize is off
      const snapped = c + beatLength(g) * 0.02;
      return beatInBar(g, snapped);
    }),
    loopActive: !!d.loop?.active,
    vinyl: d.vinyl,
    scratching: d.scratching,
  };
}

export function snapshot(): Snap {
  const { A, B } = engine.decks;
  const m = engine.mixer;
  const ga = A.grid;
  const gb = B.grid;
  const playingBoth = A.playing && B.playing && !A.scratching && !B.scratching;
  const phaseMs = playingBoth && ga && gb ? (phaseOffset(ga, A.position, gb, B.position) * beatLength(ga) * 1000) / A.rate : null;
  const pick = <K extends 'fader' | 'low' | 'filter' | 'cue'>(k: K) => ({ A: m.state.A[k], B: m.state.B[k] });
  return {
    A: deckSnap(A),
    B: deckSnap(B),
    mix: {
      fader: pick('fader'),
      low: pick('low'),
      filter: pick('filter'),
      cue: pick('cue'),
      onAir: { A: m.onAir('A'), B: m.onAir('B') },
      crossfader: m.crossfader,
      curve: m.curve,
      cueMode: m.cueMode,
    },
    phaseMs,
    tempoDiff: A.loaded && B.loaded ? Math.abs(A.bpm - B.bpm) : Infinity,
  };
}

let started = false;

/** Start watching the gear: runs lessons and scores practice mixes. Call once. */
export function startCoach() {
  if (started) return;
  started = true;

  let counters = emptyCounters();
  let holdFor = 0;
  let stepKey = '';
  const monitor = new MixMonitor();
  let lastOpen = xfOpen(engine.mixer.crossfader, engine.mixer.curve);

  const resetStep = () => {
    counters = emptyCounters();
    holdFor = 0;
    useCoach.setState({ progress: 0 });
  };

  onAction((a) => {
    const c = counters;
    switch (a.type) {
      case 'cueSet': c.cueSets++; break;
      case 'cuePreview': c.cuePreviews++; break;
      case 'cueReturn': c.cueReturns++; break;
      case 'hotCueSet': c.hotCueSets++; break;
      case 'hotCueJump': c.hotCueJumps[a.deck as DeckId]++; break;
      case 'loopSet': c.loopsSet++; break;
      case 'loopHalve': c.loopHalves++; break;
      case 'loopDouble': c.loopDoubles++; break;
      case 'loopExit': c.loopExits++; break;
      case 'beatJump': c.beatJumps++; break;
      case 'sync':
        c.syncs++;
        monitor.noteSync();
        break;
      case 'scratchFlip': c.scratchFlips++; break;
      case 'crossfader': {
        const open = xfOpen(engine.mixer.crossfader, engine.mixer.curve);
        if (open[0] !== lastOpen[0] || open[1] !== lastOpen[1]) {
          c.xfCuts++;
          if (engine.decks.A.scratching || engine.decks.B.scratching) c.scratchCuts++;
        }
        lastOpen = open;
        break;
      }
    }
  });

  // promotions
  useCareer.subscribe((s, prev) => {
    const now = tierFor(s.rep);
    const before = tierFor(prev.rep);
    if (now.id > before.id) {
      const fresh = LESSONS.filter((l) => l.tier > before.id && l.tier <= now.id).map((l) => l.title);
      toast(`Promoted: ${now.name}! New lessons unlocked — ${fresh.join(', ')}.`);
    }
  });

  let last = performance.now();
  const tick = (t: number) => {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    const s = snapshot();
    const career = useCareer.getState();

    // practice mixes count everywhere, in and out of lessons
    const mix = monitor.update(s, dt);
    if (mix === 'trainwreck') {
      counters.trainwrecks++;
      toast('Trainwreck! The beats drifted apart during the blend.', 'warn');
    } else if (mix) {
      counters.mixes++;
      if (!mix.synced) counters.manualMixes++;
      const rep = mix.synced ? MIX_REP.synced : MIX_REP.manual;
      career.noteMix();
      career.addRep(rep);
      toast(mix.synced ? `Clean mix (with Sync): +${rep} rep` : `Clean mix by hand: +${rep} rep`);
    }

    // lessons
    const lesson = career.active ? lessonById(career.active) : null;
    const key = lesson ? `${lesson.id}:${career.step}` : '';
    if (key !== stepKey) {
      stepKey = key;
      resetStep();
    }
    const step = lesson?.steps[career.step];
    if (lesson && step) {
      if (step.restartOn?.(s, counters)) {
        resetStep();
        if (step.restartMessage) toast(step.restartMessage, 'warn');
      } else if (step.done(s, counters)) {
        holdFor += dt;
        const need = step.hold ?? 0;
        const p = need ? Math.min(1, holdFor / need) : 1;
        if (Math.abs(p - useCoach.getState().progress) > 0.02 || p === 1) useCoach.setState({ progress: p });
        if (holdFor >= need) {
          const wasLast = career.step === lesson.steps.length - 1;
          const first = !career.completed.includes(lesson.id);
          career.advance();
          if (wasLast) {
            useCoach.setState({ finished: lesson.id });
            toast(first ? `Lesson complete: ${lesson.title} (+${lesson.rep} rep)` : `Lesson complete: ${lesson.title}`);
          }
        }
      } else if (holdFor > 0) {
        holdFor = 0;
        useCoach.setState({ progress: 0 });
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
