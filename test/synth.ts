/** Deterministic synthetic test tracks. */
export const SR = 44100;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
}

export interface SynthOpts {
  bpm: number;
  offset: number; // seconds to the first beat
  seconds: number;
  pattern: 'four' | 'dnb';
  tonic?: number; // pitch class for a minor-triad pad
}

export function synthTrack(o: SynthOpts): Float32Array {
  const n = Math.floor(o.seconds * SR);
  const x = new Float32Array(n);
  const r = rng(42);
  const beat = 60 / o.bpm;
  const kick = (t0: number) => {
    const s0 = Math.floor(t0 * SR);
    for (let i = 0; i < SR * 0.25 && s0 + i < n; i++) {
      if (s0 + i < 0) continue;
      const t = i / SR;
      const f = 50 + 90 * Math.exp(-t * 30);
      x[s0 + i] += 0.8 * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 12);
    }
  };
  const noise = (t0: number, amp: number, dur: number) => {
    const s0 = Math.floor(t0 * SR);
    for (let i = 0; i < SR * dur && s0 + i < n; i++) {
      if (s0 + i < 0) continue;
      x[s0 + i] += amp * r() * Math.exp(-(i / SR) * (3 / dur));
    }
  };
  const tone = (t0: number, f: number, amp: number, dur: number) => {
    const s0 = Math.floor(t0 * SR);
    for (let i = 0; i < SR * dur * 3 && s0 + i < n; i++) {
      if (s0 + i < 0) continue;
      const t = i / SR;
      x[s0 + i] += amp * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / dur);
    }
  };
  for (let k = 0; o.offset + k * beat < o.seconds; k++) {
    const t = o.offset + k * beat;
    if (o.pattern === 'four') {
      kick(t);
      noise(t + beat / 2, 0.15, 0.05);
    } else {
      const inBar = k % 4;
      if (inBar === 0) kick(t);
      if (inBar === 2) kick(t + beat / 2);
      if (inBar === 1 || inBar === 3) {
        noise(t, 0.8, 0.12);
        tone(t, 190, 0.5, 0.08);
      }
      noise(t + beat / 2, 0.08, 0.04);
    }
  }
  if (o.tonic !== undefined) {
    const freqs = [0, 3, 7].map((iv) => 220 * Math.pow(2, (o.tonic! - 9 + iv) / 12));
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let v = 0;
      for (const f of freqs) v += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t);
      x[i] += 0.05 * v;
    }
  }
  return x;
}
