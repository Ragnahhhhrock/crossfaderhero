/**
 * Three-band peak waveform (low / mid / high), `binsPerSecond` columns per second,
 * stored as interleaved bytes. Bands are scaled against the loudest full-band peak
 * so relative loudness between sections is kept.
 */
export function buildWaveform(x: Float32Array, sr: number, binsPerSecond = 100): Uint8Array {
  const per = sr / binsPerSecond;
  const bins = Math.floor(x.length / per);
  const raw = new Float32Array(bins * 3);
  const aLow = Math.exp((-2 * Math.PI * 220) / sr);
  const aHigh = Math.exp((-2 * Math.PI * 2500) / sr);
  let lpLow = 0;
  let lpHigh = 0;
  let peakAll = 1e-6;
  for (let b = 0; b < bins; b++) {
    const s0 = Math.floor(b * per);
    const s1 = Math.floor((b + 1) * per);
    let pl = 0;
    let pm = 0;
    let ph = 0;
    for (let i = s0; i < s1; i++) {
      const v = x[i];
      lpLow = (1 - aLow) * v + aLow * lpLow;
      lpHigh = (1 - aHigh) * v + aHigh * lpHigh;
      const low = Math.abs(lpLow);
      const high = Math.abs(v - lpHigh);
      const mid = Math.abs(lpHigh - lpLow);
      if (low > pl) pl = low;
      if (mid > pm) pm = mid;
      if (high > ph) ph = high;
      const av = Math.abs(v);
      if (av > peakAll) peakAll = av;
    }
    raw[b * 3] = pl;
    raw[b * 3 + 1] = pm;
    raw[b * 3 + 2] = ph;
  }
  const out = new Uint8Array(bins * 3);
  const scale = 255 / peakAll;
  for (let i = 0; i < raw.length; i++) {
    // gentle compression so quiet detail stays visible
    const v = Math.pow(Math.min(1, raw[i] * scale / 255), 0.8) * 255;
    out[i] = Math.min(255, Math.round(v));
  }
  return out;
}
