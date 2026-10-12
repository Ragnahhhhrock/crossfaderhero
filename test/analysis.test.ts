import { describe, expect, it } from 'vitest';
import { detectBeatGrid, onsetEnvelope, rangeForGenre } from '../src/library/bpm';
import { camelotDistance, detectKey } from '../src/library/key';
import { buildWaveform } from '../src/library/waveform';
import { SR, synthTrack } from './synth';

function phaseError(found: number, expected: number, bpm: number): number {
  const p = 60 / bpm;
  let d = (((found - expected) % p) + p) % p;
  if (d > p / 2) d -= p;
  return Math.abs(d);
}

describe('beat grid', () => {
  const cases = [
    { bpm: 128, offset: 0.31, pattern: 'four' as const },
    { bpm: 124.5, offset: 0.05, pattern: 'four' as const },
    { bpm: 140, offset: 0.2, pattern: 'four' as const },
    { bpm: 190, offset: 0.4, pattern: 'four' as const },
    { bpm: 95, offset: 0.25, pattern: 'four' as const },
  ];
  for (const c of cases) {
    it(`finds ${c.bpm} BPM (${c.pattern})`, () => {
      const x = synthTrack({ ...c, seconds: 90 });
      const g = detectBeatGrid(onsetEnvelope(x, SR));
      expect(Math.abs(g.bpm - c.bpm)).toBeLessThan(0.03);
      expect(phaseError(g.firstBeat, c.offset, c.bpm)).toBeLessThan(0.012);
    });
  }

  it('finds 174 BPM DnB with the genre hint, kick on the downbeat', () => {
    const x = synthTrack({ bpm: 174, offset: 0.12, pattern: 'dnb', seconds: 90 });
    const g = detectBeatGrid(onsetEnvelope(x, SR), rangeForGenre('Drum & Bass'));
    expect(g.bpm).toBe(174);
    expect(phaseError(g.firstBeat, 0.12, 174)).toBeLessThan(0.012);
    const beatsFromFirst = Math.round((0.12 - g.firstBeat) / (60 / 174));
    expect(((beatsFromFirst % 4) + 4) % 4).toBe(g.downbeat);
  });

  it('lands on 174 or its half-time without a hint', () => {
    const x = synthTrack({ bpm: 174, offset: 0.12, pattern: 'dnb', seconds: 90 });
    const g = detectBeatGrid(onsetEnvelope(x, SR));
    expect([87, 174]).toContain(g.bpm);
  });

  it('maps genre tags to tempo ranges', () => {
    expect(rangeForGenre('Drum and Bass').minBpm).toBe(155);
    expect(rangeForGenre('DnB').minBpm).toBe(155);
    expect(rangeForGenre('Gabber').maxBpm).toBe(240);
    expect(rangeForGenre('Deep House')).toEqual({});
  });
});

describe('key', () => {
  it('detects A minor', () => {
    const x = synthTrack({ bpm: 128, offset: 0, pattern: 'four', seconds: 30, tonic: 9 });
    const k = detectKey(x, SR);
    expect(k.camelot).toBe('8A');
  });
  it('detects F# minor', () => {
    const x = synthTrack({ bpm: 128, offset: 0, pattern: 'four', seconds: 30, tonic: 6 });
    expect(detectKey(x, SR).camelot).toBe('11A');
  });
  it('measures camelot distance', () => {
    expect(camelotDistance('8A', '8A')).toBe(0);
    expect(camelotDistance('8A', '9A')).toBe(1);
    expect(camelotDistance('8A', '8B')).toBe(1);
    expect(camelotDistance('12A', '1A')).toBe(1);
    expect(camelotDistance('8A', '2A')).toBe(6);
  });
});

describe('waveform', () => {
  it('has 100 bins per second, 3 bands each', () => {
    const x = synthTrack({ bpm: 128, offset: 0, pattern: 'four', seconds: 10 });
    const w = buildWaveform(x, SR, 100);
    expect(w.length).toBe(1000 * 3);
    expect(Math.max(...w)).toBeGreaterThan(100);
  });
});
