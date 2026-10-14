import { describe, expect, it } from 'vitest';
import { characterLook, FIGURE_CM } from '../src/character/avatar';
import { defaultCharacter, HEIGHT, normalise, randomCharacter, suggestName } from '../src/character/options';

const seeded = (seed: number) => {
  let a = seed;
  return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
};

describe('character builder', () => {
  it('maps height to figure scale', () => {
    const c = { ...defaultCharacter(), height: 190 };
    expect(characterLook(c).scale).toBeCloseTo(190 / FIGURE_CM);
  });

  it('builds wider and thicker for heavier bodies', () => {
    const slim = characterLook({ ...defaultCharacter(), body: 'slim' }).look;
    const heavy = characterLook({ ...defaultCharacter(), body: 'heavy' }).look;
    expect(heavy.torsoW).toBeGreaterThan(slim.torsoW);
    expect(heavy.bulk!).toBeGreaterThan(slim.bulk!);
  });

  it('puts earrings and piercings where they were chosen', () => {
    const c = { ...defaultCharacter(), earrings: 'left' as const, earringStyle: 'hoop' as const, piercings: { nose: true, eyebrow: false, lip: true } };
    const { look } = characterLook(c);
    expect(look.studs).toEqual([true, false, true, false, true]);
    expect(look.hoops).toBe(true);
  });

  it('dresses tops, pants and shoes', () => {
    const c = { ...defaultCharacter(), top: 'hoodie' as const, pants: 'shorts' as const, shoes: 'boots' as const, tattoos: { left: 'sleeve' as const, right: 'half' as const } };
    const { outfit, look } = characterLook(c);
    expect(outfit.sleeves).toBe('long');
    expect(outfit.hood).toBe(true);
    expect(outfit.shorts).toBe(true);
    expect(outfit.boots).toBe(true);
    expect(look.tatL).toBeGreaterThan(look.tatR);
  });

  it('rolls random characters inside the limits and keeps the typed name', () => {
    const rand = seeded(42);
    for (let i = 0; i < 200; i++) {
      const c = randomCharacter(rand, 'Test');
      expect(c.djName).toBe('Test');
      expect(c.height).toBeGreaterThanOrEqual(HEIGHT.min);
      expect(c.height).toBeLessThanOrEqual(HEIGHT.max);
    }
    expect(suggestName(seeded(1)).length).toBeGreaterThan(3);
  });

  it('fills in older saves', () => {
    const c = normalise({ djName: 'Old', height: 999 } as never)!;
    expect(c.height).toBe(HEIGHT.max);
    expect(c.piercings).toEqual({ nose: false, eyebrow: false, lip: false });
    expect(normalise(null)).toBeNull();
  });
});
