import { describe, expect, it } from 'vitest';
import { LESSONS, nextLesson } from '../src/career/lessons';
import { camelotCompatible, emptyCounters, MixMonitor, nextTier, tierFor, TIERS, xfOpen, type DeckSnap, type Snap } from '../src/career/rules';

const deck = (p: Partial<DeckSnap> = {}): DeckSnap => ({
  loaded: true,
  playing: true,
  trackKey: 'a',
  bpm: 124,
  camelot: '8A',
  position: 10,
  beatInBar: 0,
  hotCuesSet: 0,
  hotCueBeat: new Array(8).fill(-1),
  loopActive: false,
  vinyl: false,
  scratching: false,
  ...p,
});

const snap = (p: Partial<Snap> = {}, onAir = { A: true, B: true }): Snap => ({
  A: deck(),
  B: deck({ trackKey: 'b' }),
  mix: {
    fader: { A: 1, B: 1 },
    low: { A: 0, B: 0 },
    filter: { A: 0, B: 0 },
    cue: { A: false, B: false },
    onAir,
    crossfader: 0.5,
    curve: 'smooth',
    cueMode: 'off',
  },
  phaseMs: 2,
  tempoDiff: 0,
  ...p,
});

describe('career tiers', () => {
  it('maps rep to tiers', () => {
    expect(tierFor(0).name).toBe('Bedroom DJ');
    expect(tierFor(149).id).toBe(0);
    expect(tierFor(150).id).toBe(1);
    expect(tierFor(99999).id).toBe(TIERS.length - 1);
    expect(nextTier(0)?.id).toBe(1);
    expect(nextTier(5000)).toBeNull();
  });

  it('fundamentals alone earn the first promotion', () => {
    const rep = LESSONS.filter((l) => l.tier === 0).reduce((n, l) => n + l.rep, 0);
    expect(rep).toBeGreaterThanOrEqual(TIERS[1].rep);
  });

  it('every tier has lessons and advanced skills unlock later', () => {
    for (const t of TIERS) expect(LESSONS.some((l) => l.tier === t.id)).toBe(true);
    expect(LESSONS.find((l) => l.id === 'scratch')!.tier).toBeGreaterThan(0);
    expect(LESSONS.find((l) => l.id === 'juggle')!.tier).toBeGreaterThan(0);
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
  });

  it('next lesson respects locks', () => {
    expect(nextLesson([], 0)?.id).toBe('gear');
    const fundamentals = LESSONS.filter((l) => l.tier === 0).map((l) => l.id);
    expect(nextLesson(fundamentals, 0)).toBeNull();
    expect(nextLesson(fundamentals, 1)?.tier).toBe(1);
  });
});

describe('lesson checks', () => {
  const step = (lesson: string, i: number) => LESSONS.find((l) => l.id === lesson)!.steps[i];

  it('beatmatching needs green phase and no sync', () => {
    const s = step('beatmatch', 1);
    expect(s.done(snap({ phaseMs: 4 }), emptyCounters())).toBe(true);
    expect(s.done(snap({ phaseMs: 25 }), emptyCounters())).toBe(false);
    expect(s.restartOn!(snap(), { ...emptyCounters(), syncs: 1 })).toBe(true);
  });

  it('juggling needs restarts on both decks and crossfader cuts', () => {
    const s = step('juggle', 3);
    const c = emptyCounters();
    c.hotCueJumps = { A: 3, B: 3 };
    c.xfCuts = 7;
    expect(s.done(snap(), c)).toBe(false);
    c.xfCuts = 8;
    expect(s.done(snap(), c)).toBe(true);
  });
});

describe('helpers', () => {
  it('camelot compatibility', () => {
    expect(camelotCompatible('8A', '8A')).toBe(true);
    expect(camelotCompatible('8A', '9A')).toBe(true);
    expect(camelotCompatible('12A', '1A')).toBe(true);
    expect(camelotCompatible('8A', '8B')).toBe(true);
    expect(camelotCompatible('8A', '10A')).toBe(false);
    expect(camelotCompatible('8A', '9B')).toBe(false);
    expect(camelotCompatible(null, '8A')).toBe(false);
  });

  it('crossfader open state', () => {
    expect(xfOpen(0, 'sharp')).toEqual([true, false]);
    expect(xfOpen(0.5, 'sharp')).toEqual([true, true]);
    expect(xfOpen(1, 'sharp')).toEqual([false, true]);
  });

  it('mix monitor scores a clean blend and catches trainwrecks', () => {
    const m = new MixMonitor();
    for (let i = 0; i < 90; i++) expect(m.update(snap(), 0.1)).toBeNull();
    expect(m.update(snap({}, { A: false, B: true }), 0.1)).toEqual({ clean: true, synced: false });

    const w = new MixMonitor();
    let r = null;
    for (let i = 0; i < 30 && !r; i++) r = w.update(snap({ phaseMs: 60 }), 0.1);
    expect(r).toBe('trainwreck');

    const short = new MixMonitor();
    for (let i = 0; i < 20; i++) short.update(snap(), 0.1);
    expect(short.update(snap({}, { A: false, B: true }), 0.1)).toBeNull();
  });
});
