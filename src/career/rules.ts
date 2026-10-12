import { crossfaderGains, type CrossfaderCurve, type CueMode } from '../audio/mixer';
import type { DeckId } from '../types';

/** Career tiers. Reputation (rep) earned from lessons and clean mixes moves you up. */
export interface Tier {
  id: number;
  name: string;
  venue: string;
  rep: number;
}

export const TIERS: Tier[] = [
  { id: 0, name: 'Bedroom DJ', venue: 'Your bedroom', rep: 0 },
  { id: 1, name: 'House-party DJ', venue: 'House parties', rep: 150 },
  { id: 2, name: 'Bar resident', venue: 'The corner bar', rep: 400 },
  { id: 3, name: 'Club DJ', venue: 'The club', rep: 800 },
  { id: 4, name: 'Festival headliner', venue: 'Festival main stage', rep: 1500 },
];

export function tierFor(rep: number): Tier {
  let t = TIERS[0];
  for (const x of TIERS) if (rep >= x.rep) t = x;
  return t;
}

export function nextTier(rep: number): Tier | null {
  return TIERS.find((t) => t.rep > rep) ?? null;
}

/** Rep for a practice mix: blended in phase, then finished on the new track. */
export const MIX_REP = { manual: 20, synced: 8 };

// ---------- per-frame snapshot of the gear ----------

export interface DeckSnap {
  loaded: boolean;
  playing: boolean;
  trackKey: string | null;
  bpm: number;
  camelot: string | null;
  position: number;
  /** 0..3, beat of the bar the playhead is in (-1 if no grid). */
  beatInBar: number;
  hotCuesSet: number;
  /** For each hot cue: beat of the bar it sits on (-1 = unset or no grid). */
  hotCueBeat: number[];
  loopActive: boolean;
  vinyl: boolean;
  scratching: boolean;
}

export interface MixSnap {
  fader: Record<DeckId, number>;
  low: Record<DeckId, number>;
  filter: Record<DeckId, number>;
  cue: Record<DeckId, boolean>;
  onAir: Record<DeckId, boolean>;
  crossfader: number;
  curve: CrossfaderCurve;
  cueMode: CueMode;
}

export interface Snap {
  A: DeckSnap;
  B: DeckSnap;
  mix: MixSnap;
  /** Beat offset between decks in ms (null unless both play with grids). */
  phaseMs: number | null;
  /** Absolute BPM difference (Infinity unless both loaded). */
  tempoDiff: number;
}

export const inPhase = (s: Snap, ms = 10) =>
  s.A.playing && s.B.playing && s.phaseMs !== null && Math.abs(s.phaseMs) < ms && s.tempoDiff < 0.05;

/** Counters of actions taken since the current step started. */
export interface Counters {
  cueSets: number;
  cuePreviews: number;
  cueReturns: number;
  hotCueSets: number;
  hotCueJumps: Record<DeckId, number>;
  loopsSet: number;
  loopHalves: number;
  loopDoubles: number;
  loopExits: number;
  beatJumps: number;
  syncs: number;
  scratchFlips: number;
  /** Times the crossfader opened or closed a channel. */
  xfCuts: number;
  /** Crossfader cuts made while a record was being scratched. */
  scratchCuts: number;
  manualMixes: number;
  mixes: number;
  trainwrecks: number;
}

export const emptyCounters = (): Counters => ({
  cueSets: 0,
  cuePreviews: 0,
  cueReturns: 0,
  hotCueSets: 0,
  hotCueJumps: { A: 0, B: 0 },
  loopsSet: 0,
  loopHalves: 0,
  loopDoubles: 0,
  loopExits: 0,
  beatJumps: 0,
  syncs: 0,
  scratchFlips: 0,
  xfCuts: 0,
  scratchCuts: 0,
  manualMixes: 0,
  mixes: 0,
  trainwrecks: 0,
});

/** Which channels the crossfader lets through right now. */
export function xfOpen(x: number, curve: CrossfaderCurve): [boolean, boolean] {
  const [a, b] = crossfaderGains(x, curve);
  return [a > 0.3, b > 0.3];
}

/** Camelot wheel: same code, ±1 on the same letter, or the same number on the other letter. */
export function camelotCompatible(a: string | null, b: string | null): boolean {
  const pa = a && /^(\d{1,2})([AB])$/.exec(a);
  const pb = b && /^(\d{1,2})([AB])$/.exec(b);
  if (!pa || !pb) return false;
  const na = Number(pa[1]);
  const nb = Number(pb[1]);
  if (pa[2] === pb[2]) {
    const d = (((na - nb) % 12) + 12) % 12;
    return d === 0 || d === 1 || d === 11;
  }
  return na === nb;
}

/**
 * Practice-mix detector. Feed it a snapshot every frame; it reports a clean
 * mix when two decks were blended in phase for long enough and one then
 * leaves the air with the other still playing.
 */
export class MixMonitor {
  blend = 0; // seconds both on air and in phase
  drift = 0; // seconds both on air and out of phase
  /** Sync pressed since the last finished mix. */
  synced = false;

  noteSync() {
    this.synced = true;
  }

  update(s: Snap, dt: number): { clean: true; synced: boolean } | 'trainwreck' | null {
    // scratching over a beat isn't a blend
    if (s.A.scratching || s.B.scratching) return null;
    const both = s.mix.onAir.A && s.mix.onAir.B && s.A.playing && s.B.playing;
    if (both) {
      if (inPhase(s, 20)) this.blend += dt;
      else this.drift += dt;
      if (this.drift > 2) {
        this.blend = 0;
        this.drift = 0;
        this.synced = false;
        return 'trainwreck';
      }
      return null;
    }
    const oneLeft = (s.mix.onAir.A && s.A.playing) !== (s.mix.onAir.B && s.B.playing);
    const result = this.blend >= 8 && oneLeft ? ({ clean: true, synced: this.synced } as const) : null;
    if (result) this.synced = false;
    this.blend = 0;
    this.drift = 0;
    return result;
  }
}
