import { ANALYSIS_VERSION, type Analysis } from '../types';
import { detectBeatGrid, onsetEnvelope, rangeForGenre } from './bpm';
import { detectKey } from './key';
import { buildWaveform } from './waveform';

/** Full analysis of a mono signal. Pure — runs in the worker and in tests. */
export function analyzeMono(x: Float32Array, sr: number, genre?: string): Analysis {
  const env = onsetEnvelope(x, sr);
  const grid = detectBeatGrid(env, rangeForGenre(genre));
  const key = detectKey(x, sr);
  const waveform = buildWaveform(x, sr, 100);
  return {
    version: ANALYSIS_VERSION,
    duration: x.length / sr,
    bpm: grid.bpm,
    firstBeat: grid.firstBeat,
    downbeat: grid.downbeat,
    key: key.key,
    camelot: key.camelot,
    waveform,
    binsPerSecond: 100,
  };
}
