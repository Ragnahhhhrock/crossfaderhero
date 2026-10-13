import type { Analysis, DeckId, Track } from '../types';
import type { Grid } from './grid';

/**
 * What every music source on a mixer channel has in common — a CDJ or a
 * turntable. Waveforms, the phase meter, the coach and the 3D room read
 * through this so they work with whichever is plugged into the channel.
 */
export interface Player {
  readonly id: DeckId;
  readonly kind: 'cdj' | 'turntable';
  readonly output: GainNode;
  track: Track | null;
  analysis: Analysis | null;
  loading: boolean;
  readonly loaded: boolean;
  readonly playing: boolean;
  /** Hand on the record (turntable, or a CDJ in vinyl mode). */
  readonly scratching: boolean;
  readonly position: number;
  readonly duration: number;
  /** Current BPM including tempo/pitch. */
  readonly bpm: number;
  /** Playback speed relative to the original (1 = 0 %). */
  readonly rate: number;
  readonly grid: Grid | null;
  version: number;
  subscribe: (fn: () => void) => () => void;
  getVersion: () => number;
}
