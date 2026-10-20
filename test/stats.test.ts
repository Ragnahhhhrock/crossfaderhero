import { describe, expect, it } from 'vitest';
import { CAPS, sanitizeDelta } from '../worker/stats.js';

describe('sanitizeDelta', () => {
  it('keeps known counters as whole numbers', () => {
    expect(sanitizeDelta({ tracksPlayed: 3.9, vinylDrops: 2 })).toMatchObject({ tracksPlayed: 3, vinylDrops: 2, gigs: 0 });
  });
  it('caps each counter per request', () => {
    expect(sanitizeDelta({ tracksPlayed: 1e9 })?.tracksPlayed).toBe(CAPS.tracksPlayed);
  });
  it('ignores junk, negatives and unknown keys', () => {
    expect(sanitizeDelta({ tracksPlayed: -5, gigs: 'x', evil: 99 })).toBeNull();
    expect(sanitizeDelta(null)).toBeNull();
    expect(sanitizeDelta('nope')).toBeNull();
  });
});
