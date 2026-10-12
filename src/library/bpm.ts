/**
 * Tempo, beat grid and downbeat detection for (mostly) constant-tempo dance music.
 *
 * 1. Build an onset-strength envelope from low-band and full-band frame energy.
 * 2. Coarse tempo from a harmonic comb over the envelope's autocorrelation.
 * 3. Pick the octave (x0.5 / x1 / x2) inside the preferred range.
 * 4. Fine tempo + phase by measuring the envelope's phase-coherent energy at the
 *    beat frequency across the whole track (a single DFT bin per candidate).
 */

export const HOP = 256;

export interface BeatGrid {
  bpm: number;
  firstBeat: number; // seconds
  downbeat: number; // 0..3
  confidence: number; // 0..1-ish
}

export interface OnsetEnvelope {
  odf: Float32Array; // combined onset strength
  low: Float32Array; // low-band onset strength (kicks)
  fps: number;
}

export function onsetEnvelope(x: Float32Array, sr: number): OnsetEnvelope {
  const frames = Math.floor(x.length / HOP);
  const eLow = new Float32Array(frames);
  const eAll = new Float32Array(frames);
  // one-pole low-pass at ~150 Hz for the kick band
  const a = Math.exp((-2 * Math.PI * 150) / sr);
  let lp = 0;
  for (let f = 0; f < frames; f++) {
    let sl = 0;
    let sa = 0;
    const base = f * HOP;
    for (let i = 0; i < HOP; i++) {
      const v = x[base + i];
      lp = (1 - a) * v + a * lp;
      sl += lp * lp;
      sa += v * v;
    }
    eLow[f] = Math.log1p(1000 * (sl / HOP));
    eAll[f] = Math.log1p(1000 * (sa / HOP));
  }
  smooth3(eLow);
  smooth3(eAll);
  const odf = new Float32Array(frames);
  const low = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    const dl = Math.max(0, eLow[f] - eLow[f - 1]);
    const da = Math.max(0, eAll[f] - eAll[f - 1]);
    low[f] = dl;
    odf[f] = dl + 0.6 * da;
  }
  const fps = sr / HOP;
  subtractLocalMean(odf, Math.round(fps * 0.4));
  subtractLocalMean(low, Math.round(fps * 0.4));
  return { odf, low, fps };
}

/** Symmetric [1 2 1]/4 smoothing — removes ripple from low tones beating against the frame size. */
function smooth3(v: Float32Array): void {
  let prev = v[0];
  for (let i = 1; i < v.length - 1; i++) {
    const cur = v[i];
    v[i] = 0.25 * prev + 0.5 * cur + 0.25 * v[i + 1];
    prev = cur;
  }
}

function subtractLocalMean(v: Float32Array, radius: number): void {
  const n = v.length;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + v[i];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(n, i + radius + 1);
    const mean = (prefix[hi] - prefix[lo]) / (hi - lo);
    out[i] = Math.max(0, v[i] - mean);
  }
  v.set(out);
}

function autocorr(odf: Float32Array, maxLag: number): Float64Array {
  // Use at most ~90 s from the middle of the track for the coarse pass.
  const n = odf.length;
  const span = Math.min(n, 15500);
  const start = Math.max(0, Math.floor((n - span) / 2));
  const ac = new Float64Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let s = 0;
    const end = start + span - lag;
    for (let t = start; t < end; t++) s += odf[t] * odf[t + lag];
    ac[lag] = s / Math.max(1, end - start);
  }
  return ac;
}

function acAt(ac: Float64Array, lag: number): number {
  const i = Math.floor(lag);
  if (i < 1 || i + 1 >= ac.length) return 0;
  const f = lag - i;
  return ac[i] * (1 - f) + ac[i + 1] * f;
}

/** Magnitude and phase of the envelope at a given beat period (in frames). */
function beatFrequencyBin(odf: Float32Array, periodFrames: number): { mag: number; phase: number } {
  const w = (2 * Math.PI) / periodFrames;
  let re = 0;
  let im = 0;
  // incremental rotation for speed
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  let c = 1;
  let s = 0;
  for (let t = 0; t < odf.length; t++) {
    const v = odf[t];
    if (v !== 0) {
      re += v * c;
      im -= v * s;
    }
    const nc = c * cw - s * sw;
    s = c * sw + s * cw;
    c = nc;
    if ((t & 4095) === 4095) {
      // renormalise to stop drift
      const m = Math.hypot(c, s);
      c /= m;
      s /= m;
    }
  }
  return { mag: Math.hypot(re, im), phase: Math.atan2(im, re) };
}

export interface BpmOptions {
  minBpm?: number;
  maxBpm?: number;
}

/** Tempo range hint from a genre tag — the same trick DJ software uses to fix half/double-time errors. */
export function rangeForGenre(genre: string | undefined): BpmOptions {
  const g = (genre ?? '').toLowerCase();
  if (/drum\s*(&|and|n|'n')?\s*bass|\bdnb\b|\bd&b\b|jungle|neurofunk|liquid funk/.test(g)) return { minBpm: 155, maxBpm: 185 };
  if (/gabber|hardcore|hardstyle|frenchcore|speedcore|uptempo|happy hardcore/.test(g)) return { minBpm: 140, maxBpm: 240 };
  if (/dubstep|riddim|grime|footwork|juke/.test(g)) return { minBpm: 130, maxBpm: 165 };
  if (/hip.?hop|rap|r&b|rnb|reggaeton|dancehall|trap|downtempo|lo-?fi/.test(g)) return { minBpm: 65, maxBpm: 125 };
  return {};
}

export function detectBeatGrid(env: OnsetEnvelope, opts: BpmOptions = {}): BeatGrid {
  const { odf, low, fps } = env;
  const minBpm = opts.minBpm ?? 75;
  const maxBpm = opts.maxBpm ?? 200;
  if (odf.length < fps * 4) return { bpm: 120, firstBeat: 0, downbeat: 0, confidence: 0 };

  const maxLag = Math.ceil((fps * 60) / 50) * 4 + 2;
  const ac = autocorr(odf, Math.min(maxLag, odf.length - 1));

  // Coarse: harmonic comb score for 55..220 BPM in 0.25 steps.
  const score = (bpm: number) => {
    const L = (fps * 60) / bpm;
    return acAt(ac, L) + acAt(ac, 2 * L) / 2 + acAt(ac, 3 * L) / 3 + acAt(ac, 4 * L) / 4;
  };
  let best = 120;
  let bestScore = -Infinity;
  for (let b = 55; b <= 220; b += 0.25) {
    const s = score(b);
    if (s > bestScore) {
      bestScore = s;
      best = b;
    }
  }

  // Octave choice inside the preferred range. The autocorrelation comb handles
  // syncopation well but can't tell 95 from 190 for a straight kick; phase-coherent
  // energy can (at half the true tempo alternate beats cancel), so it breaks ties.
  const prior = (b: number) => Math.exp(-0.5 * Math.pow(Math.log2(b / 128) / 0.9, 2));
  const coherent = (bpm: number) => {
    let m = 0;
    for (let d = -0.6; d <= 0.6; d += 0.1) m = Math.max(m, beatFrequencyBin(odf, (fps * 60) / (bpm + d)).mag);
    return m;
  };
  const cands: { b: number; comb: number; coh: number }[] = [];
  for (const m of [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1, 4 / 3, 3 / 2, 2, 3, 4]) {
    const b = best * m;
    if (b < minBpm || b > maxBpm) continue;
    // a local search around the multiple, because the comb peak is broad
    let lb = b;
    let ls = -Infinity;
    for (let d = -1.5; d <= 1.5; d += 0.25) {
      const s = score(b + d);
      if (s > ls) {
        ls = s;
        lb = b + d;
      }
    }
    cands.push({ b: lb, comb: ls, coh: coherent(lb) });
  }
  const maxCoh = Math.max(1e-9, ...cands.map((c) => c.coh));
  let coarse = best;
  let coarseScore = -Infinity;
  for (const c of cands) {
    const weighted = c.comb * prior(c.b) * (0.5 + 0.5 * (c.coh / maxCoh));
    if (weighted > coarseScore) {
      coarseScore = weighted;
      coarse = c.b;
    }
  }
  if (!Number.isFinite(coarseScore)) coarse = Math.min(maxBpm, Math.max(minBpm, best));

  // Fine: phase-coherent energy at the beat frequency across the whole track.
  let fine = coarse;
  let fineMag = -Infinity;
  let finePhase = 0;
  const probe = (bpm: number) => {
    const r = beatFrequencyBin(odf, (fps * 60) / bpm);
    if (r.mag > fineMag) {
      fineMag = r.mag;
      fine = bpm;
      finePhase = r.phase;
    }
  };
  for (let b = coarse - 1.5; b <= coarse + 1.5; b += 0.05) probe(b);
  const c1 = fine;
  for (let b = c1 - 0.06; b <= c1 + 0.06; b += 0.005) probe(b);

  // Most dance tracks sit on an integer (or half) BPM — snap when very close.
  let bpm = Math.round(fine * 100) / 100;
  const nearestInt = Math.round(fine);
  if (Math.abs(fine - nearestInt) < 0.04) bpm = nearestInt;
  const snapped = beatFrequencyBin(odf, (fps * 60) / bpm);
  const phase = bpm === fine ? finePhase : snapped.phase;

  // Beat phase. The DFT phase is a good first guess but onset tails pull it late,
  // so refine by folding the envelope over one period and taking the sharpest peak.
  const P = (fps * 60) / bpm;
  let guess = (-phase / (2 * Math.PI)) * P;
  guess = ((guess % P) + P) % P;
  const BINS = 96;
  const hist = new Float64Array(BINS);
  for (let t = 0; t < odf.length; t++) {
    const v = odf[t];
    if (v === 0) continue;
    const pos = ((t % P) / P) * BINS;
    const b0 = Math.floor(pos);
    const fr = pos - b0;
    hist[b0 % BINS] += v * (1 - fr);
    hist[(b0 + 1) % BINS] += v * fr;
  }
  // search within a third of a beat before the DFT guess (tails only ever pull late)
  const gBin = (guess / P) * BINS;
  let pk = Math.round(gBin) % BINS;
  for (let d = -Math.round(BINS / 3); d <= 4; d++) {
    const b = (((Math.round(gBin) + d) % BINS) + BINS) % BINS;
    if (hist[b] > hist[pk]) pk = b;
  }
  const hm = hist[(pk - 1 + BINS) % BINS];
  const h0 = hist[pk];
  const hp = hist[(pk + 1) % BINS];
  const denom = hm - 2 * h0 + hp;
  const off = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (hm - hp)) / denom)) : 0;
  let t0 = ((pk + off) / BINS) * P;

  // Final refinement: least-squares fit of a straight grid through the actual onset
  // peaks found near each predicted beat. Tightens both tempo and phase.
  let period = P;
  for (let iter = 0; iter < 2; iter++) {
    const win = Math.max(2, Math.round(period * 0.12));
    const ks: number[] = [];
    const ts: number[] = [];
    const ws: number[] = [];
    const peaks: number[] = [];
    for (let k = 0; t0 + k * period < odf.length; k++) {
      const c = Math.round(t0 + k * period);
      let bi = -1;
      let bv = 0;
      for (let f = c - win; f <= c + win; f++) {
        const v = odf[f];
        if (v !== undefined && v > bv) {
          bv = v;
          bi = f;
        }
      }
      if (bi < 1 || bi + 1 >= odf.length) continue;
      // sub-frame peak position
      const a0 = odf[bi - 1];
      const a2 = odf[bi + 1];
      const dd = a0 - 2 * bv + a2;
      const sub = dd !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a0 - a2)) / dd)) : 0;
      ks.push(k);
      ts.push(bi + sub);
      ws.push(bv);
      peaks.push(bv);
    }
    if (ks.length < 8) break;
    const sorted = [...peaks].sort((a, b) => a - b);
    const thr = sorted[Math.floor(sorted.length / 2)] * 0.5;
    let sw = 0, sk = 0, st = 0, skk = 0, skt = 0;
    for (let i = 0; i < ks.length; i++) {
      if (ws[i] < thr) continue;
      const w = ws[i];
      sw += w; sk += w * ks[i]; st += w * ts[i]; skk += w * ks[i] * ks[i]; skt += w * ks[i] * ts[i];
    }
    const det = sw * skk - sk * sk;
    if (det <= 0) break;
    const slope = (sw * skt - sk * st) / det;
    const icpt = (st - slope * sk) / sw;
    if (Math.abs(slope - period) / period > 0.01) break; // refuse wild jumps
    period = slope;
    t0 = icpt;
  }
  const fitted = (fps * 60) / period;
  bpm = Math.round(fitted * 100) / 100;
  if (Math.abs(fitted - Math.round(fitted)) < 0.03) bpm = Math.round(fitted);
  else if (Math.abs(fitted * 2 - Math.round(fitted * 2)) < 0.03) bpm = Math.round(fitted * 2) / 2;
  // re-centre the phase on the snapped period (keep the middle of the track exact)
  const mid = Math.floor(odf.length / period / 2);
  t0 = t0 + mid * period - mid * ((fps * 60) / bpm);

  // Onset frame f spans samples [f*HOP, (f+1)*HOP): use its centre.
  const periodSec = 60 / bpm;
  let firstBeat = (t0 + 0.5) / fps;
  firstBeat = ((firstBeat % periodSec) + periodSec) % periodSec;

  // Downbeat: the beat phase (mod 4) with the most low-band onset energy.
  const sums = [0, 0, 0, 0];
  const nBeats = Math.floor((low.length / fps - firstBeat) / periodSec);
  for (let k = 0; k < nBeats; k++) {
    const f = Math.round((firstBeat + k * periodSec) * fps + 0.5);
    let m = 0;
    for (let d = -2; d <= 2; d++) {
      const v = low[f + d];
      if (v !== undefined && v > m) m = v;
    }
    sums[k % 4] += m;
  }
  let downbeat = 0;
  for (let k = 1; k < 4; k++) if (sums[k] > sums[downbeat] * 1.05) downbeat = k;

  // Confidence: coherent energy relative to total energy.
  let total = 0;
  for (let t = 0; t < odf.length; t++) total += odf[t];
  const confidence = total > 0 ? Math.min(1, (snapped.mag / total) * 2) : 0;

  return { bpm, firstBeat, downbeat, confidence };
}
