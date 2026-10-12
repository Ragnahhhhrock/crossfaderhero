import { fft } from './fft';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Krumhansl–Kessler key profiles
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Camelot wheel numbers indexed by tonic pitch class
const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

export interface KeyResult {
  key: string;
  camelot: string;
  tonic: number;
  minor: boolean;
}

export function camelotFor(tonic: number, minor: boolean): string {
  return minor ? `${CAMELOT_MINOR[tonic]}A` : `${CAMELOT_MAJOR[tonic]}B`;
}

/** Distance on the Camelot wheel: 0 = same, 1 = compatible neighbour, larger = clash. */
export function camelotDistance(a: string, b: string): number {
  const pa = /^(\d+)([AB])$/.exec(a);
  const pb = /^(\d+)([AB])$/.exec(b);
  if (!pa || !pb) return 6;
  const na = Number(pa[1]);
  const nb = Number(pb[1]);
  const ring = Math.min((na - nb + 12) % 12, (nb - na + 12) % 12);
  return ring + (pa[2] === pb[2] ? 0 : 1);
}

function correlate(chroma: number[], profile: number[], shift: number): number {
  let mx = 0;
  let my = 0;
  for (let i = 0; i < 12; i++) {
    mx += chroma[i];
    my += profile[i];
  }
  mx /= 12;
  my /= 12;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < 12; i++) {
    const x = chroma[(i + shift) % 12] - mx;
    const y = profile[i] - my;
    num += x * y;
    dx += x * x;
    dy += y * y;
  }
  return num / Math.sqrt(dx * dy || 1);
}

/** Estimate the musical key of a mono signal. */
export function detectKey(x: Float32Array, sr: number): KeyResult {
  // Downsample by averaging to roughly 11 kHz.
  const factor = Math.max(1, Math.round(sr / 11025));
  const dsr = sr / factor;
  const n = Math.floor(x.length / factor);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < factor; j++) s += x[i * factor + j];
    y[i] = s / factor;
  }

  const N = 8192;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));

  // Precompute bin -> pitch class for 50 Hz..2.5 kHz
  const binPc = new Int8Array(N / 2).fill(-1);
  for (let k = 1; k < N / 2; k++) {
    const f = (k * dsr) / N;
    if (f < 50 || f > 2500) continue;
    const midi = 69 + 12 * Math.log2(f / 440);
    binPc[k] = ((Math.round(midi) % 12) + 12) % 12;
  }

  const chroma = new Array(12).fill(0);
  const hop = N; // no overlap is plenty for a whole-track key
  for (let start = 0; start + N <= n; start += hop) {
    for (let i = 0; i < N; i++) {
      re[i] = y[start + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    const frame = new Array(12).fill(0);
    let total = 0;
    for (let k = 1; k < N / 2; k++) {
      const pc = binPc[k];
      if (pc < 0) continue;
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      frame[pc] += m;
      total += m;
    }
    if (total <= 1e-9) continue;
    for (let i = 0; i < 12; i++) chroma[i] += frame[i] / total;
  }

  let best = { score: -Infinity, tonic: 0, minor: false };
  for (let t = 0; t < 12; t++) {
    const sMaj = correlate(chroma, MAJOR, t);
    if (sMaj > best.score) best = { score: sMaj, tonic: t, minor: false };
    const sMin = correlate(chroma, MINOR, t);
    if (sMin > best.score) best = { score: sMin, tonic: t, minor: true };
  }
  return {
    key: `${NOTES[best.tonic]} ${best.minor ? 'minor' : 'major'}`,
    camelot: camelotFor(best.tonic, best.minor),
    tonic: best.tonic,
    minor: best.minor,
  };
}
