import { describe, expect, it } from 'vitest';
import {
  GROOVE_INNER,
  GROOVE_OUTER,
  grooveRadius,
  positionAtRadius,
  RPM_45,
  stepPlatter,
  type PlatterParams,
  type PlatterState,
} from '../src/audio/platter';

const params = (p: Partial<PlatterParams> = {}): PlatterParams => ({
  motor: false,
  power: true,
  target: 1,
  startTime: 0.7,
  brakeTime: 0.6,
  nudge: 0,
  held: false,
  handTarget: 0,
  ...p,
});
const fresh = (): PlatterState => ({ platter: 0, record: 0, rot: 0, pos: 0 });

/** Run the physics for `seconds` at a 1 ms step. */
function run(s: PlatterState, p: PlatterParams, seconds: number, needle = true, duration = 300) {
  for (let i = 0; i < Math.round(seconds * 1000); i++) stepPlatter(s, p, 0.001, duration, needle);
  return s;
}

describe('turntable physics', () => {
  it('spins up to speed in the start-up time', () => {
    const s = fresh();
    run(s, params({ motor: true }), 0.35);
    expect(s.platter).toBeGreaterThan(0.45);
    expect(s.platter).toBeLessThan(0.55);
    run(s, params({ motor: true }), 0.5);
    expect(s.platter).toBeCloseTo(1, 5);
    expect(s.record).toBeCloseTo(1, 3);
  });

  it('plays at the original speed at 33 with the pitch at 0', () => {
    const s = run(fresh(), params({ motor: true }), 2);
    const before = s.pos;
    run(s, params({ motor: true }), 1);
    expect(s.pos - before).toBeCloseTo(1, 3);
  });

  it('45 RPM and the pitch fader speed it up', () => {
    const s = run(fresh(), params({ motor: true, target: RPM_45 * 1.08 }), 3);
    expect(s.platter).toBeCloseTo(1.35 * 1.08, 5);
  });

  it('brakes fast with Stop, coasts slowly with the power off', () => {
    const braked = run(fresh(), params({ motor: true }), 2);
    run(braked, params({ motor: false }), 0.6);
    expect(braked.platter).toBe(0);
    const coasting = run(fresh(), params({ motor: true }), 2);
    run(coasting, params({ motor: true, power: false }), 1);
    expect(coasting.platter).toBeGreaterThan(0.6);
  });

  it('a hand on the record stops it while the platter keeps turning', () => {
    const s = run(fresh(), params({ motor: true }), 2);
    const p = params({ motor: true, held: true, handTarget: s.rot });
    run(s, p, 0.2);
    expect(Math.abs(s.record)).toBeLessThan(0.01);
    expect(s.platter).toBeCloseTo(1, 5);
  });

  it('the record follows the hand back and forth (a scratch returns to the same spot)', () => {
    const s = run(fresh(), params({ motor: true }), 2);
    const anchor = s.rot;
    const startPos = s.pos;
    const p = params({ motor: true, held: true, handTarget: anchor });
    run(s, p, 0.05);
    p.handTarget = anchor - 0.3; // pull back 0.3 s
    run(s, p, 0.15);
    expect(s.pos).toBeCloseTo(startPos - 0.3, 2);
    p.handTarget = anchor; // push forward again
    run(s, p, 0.15);
    expect(s.pos).toBeCloseTo(startPos, 2);
  });

  it('let go and the slipmat brings the record back up to speed', () => {
    const s = run(fresh(), params({ motor: true }), 2);
    run(s, params({ motor: true, held: true, handTarget: s.rot }), 0.1);
    run(s, params({ motor: true }), 0.25);
    expect(s.record).toBeCloseTo(1, 3);
  });

  it('a back-spin slows and reverses back to forward play', () => {
    const s = run(fresh(), params({ motor: true }), 2);
    s.record = -4; // flung backwards
    run(s, params({ motor: true }), 0.2);
    expect(s.record).toBeLessThan(0);
    run(s, params({ motor: true }), 0.5);
    expect(s.record).toBeCloseTo(1, 3);
  });

  it('with the needle up, the record turns but the needle stays in its groove', () => {
    const s = fresh();
    s.pos = 42;
    run(s, params({ motor: true }), 2, false);
    expect(s.pos).toBe(42);
    expect(s.rot).toBeGreaterThan(1);
  });

  it('a finger on the edge drags the platter slower or pushes it faster', () => {
    const slow = run(fresh(), params({ motor: true, nudge: -1 }), 3);
    const fast = run(fresh(), params({ motor: true, nudge: 1 }), 3);
    expect(slow.platter).toBeLessThan(0.95);
    expect(fast.platter).toBeGreaterThan(1.05);
  });

  it('maps track position to groove radius and back', () => {
    expect(grooveRadius(0, 300)).toBe(GROOVE_OUTER);
    expect(grooveRadius(300, 300)).toBe(GROOVE_INNER);
    for (const t of [0, 12.5, 150, 299]) expect(positionAtRadius(grooveRadius(t, 300), 300)).toBeCloseTo(t, 6);
    expect(positionAtRadius(0.2, 300)).toBe(0);
    expect(positionAtRadius(0.01, 300)).toBe(300);
  });
});
