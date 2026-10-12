import { describe, expect, it } from 'vitest';
import { crossfaderGains, eqDb, faderGain, trimDb } from '../src/audio/mixer';
import { barBeat, beatInBar, phaseOffset, quantize } from '../src/audio/grid';

describe('mixer curves', () => {
  it('smooth crossfader is constant power', () => {
    for (const x of [0, 0.2, 0.5, 0.8, 1]) {
      const [a, b] = crossfaderGains(x, 'smooth');
      expect(a * a + b * b).toBeCloseTo(1, 6);
    }
    expect(crossfaderGains(0, 'smooth')).toEqual([1, 0]);
  });
  it('sharp crossfader cuts in fast', () => {
    expect(crossfaderGains(0.5, 'sharp')).toEqual([1, 1]);
    expect(crossfaderGains(0, 'sharp')[1]).toBe(0);
    expect(crossfaderGains(1, 'sharp')[0]).toBe(0);
  });
  it('knob mappings', () => {
    expect(eqDb(-1)).toBe(-26);
    expect(eqDb(0)).toBe(0);
    expect(eqDb(1)).toBe(6);
    expect(trimDb(1)).toBe(9);
    expect(faderGain(0)).toBe(0);
    expect(faderGain(1)).toBe(1);
  });
});

describe('beat grid maths', () => {
  const g = { bpm: 120, firstBeat: 0.1, downbeat: 1 };
  it('quantizes to the nearest beat', () => {
    expect(quantize(g, 0.34)).toBeCloseTo(0.1, 9);
    expect(quantize(g, 0.36)).toBeCloseTo(0.6, 9);
  });
  it('counts bars from the downbeat', () => {
    expect(beatInBar(g, 0.6)).toBe(0); // beat index 1 is the downbeat
    expect(barBeat(g, 0.6)).toEqual({ bar: 1, beat: 1 });
    expect(barBeat(g, 2.6)).toEqual({ bar: 2, beat: 1 });
  });
  it('measures phase offset between decks', () => {
    const h = { bpm: 120, firstBeat: 0, downbeat: 0 };
    expect(phaseOffset(g, 0.2, h, 0)).toBeCloseTo(0.2, 9);
    expect(phaseOffset(g, 0.1, h, 0.4)).toBeCloseTo(0.2, 9);
  });
});
