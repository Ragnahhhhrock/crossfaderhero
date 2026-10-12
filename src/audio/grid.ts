/** Beat-grid maths. All positions are in track seconds (at 0% tempo). */

export interface Grid {
  bpm: number;
  firstBeat: number;
  downbeat: number;
}

export const beatLength = (g: Grid) => 60 / g.bpm;

/** Fractional beat index at a position (beat 0 = firstBeat). */
export const beatAt = (g: Grid, pos: number) => (pos - g.firstBeat) / beatLength(g);

export const beatTime = (g: Grid, beat: number) => g.firstBeat + beat * beatLength(g);

/** Snap to the nearest beat. */
export const quantize = (g: Grid, pos: number) => beatTime(g, Math.round(beatAt(g, pos)));

/** 0..1 position inside the current beat. */
export function beatPhase(g: Grid, pos: number): number {
  const b = beatAt(g, pos);
  return b - Math.floor(b);
}

/** 0..3 — which beat of the bar the position is in. */
export function beatInBar(g: Grid, pos: number): number {
  const b = Math.floor(beatAt(g, pos));
  return (((b - g.downbeat) % 4) + 4) % 4;
}

/** Bar number (1-based) and beat (1..4), like a CDJ's "bar.beat" readout. */
export function barBeat(g: Grid, pos: number): { bar: number; beat: number } {
  const b = Math.floor(beatAt(g, pos)) - g.downbeat;
  return { bar: Math.floor(b / 4) + 1, beat: (((b % 4) + 4) % 4) + 1 };
}

/**
 * Phase offset between two decks in beats, in (-0.5, 0.5]. Positive = `a` is ahead.
 * Both decks must be playing at the same effective tempo for this to be meaningful.
 */
export function phaseOffset(a: Grid, posA: number, b: Grid, posB: number): number {
  let d = beatPhase(a, posA) - beatPhase(b, posB);
  if (d > 0.5) d -= 1;
  if (d <= -0.5) d += 1;
  return d;
}
