import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import logos from '../src/brand/cfh-logo.json';

const root = join(__dirname, '..');
const tokensCss = readFileSync(join(root, 'src/design/tokens.css'), 'utf8');
const roles = { pink: 'cfh-pink', cyan: 'cfh-cyan' } as Record<string, string>;

describe('Club CFH logo', () => {
  for (const which of ['lockup', 'mark'] as const) {
    const g = logos[which];
    it(`${which}: every tube uses a Club CFH colour that exists as a token`, () => {
      expect(g.tubes.length).toBeGreaterThan(1);
      for (const t of g.tubes) {
        expect(roles[t.role], `${t.id} role`).toBeTruthy();
        expect(tokensCss).toContain(`--${roles[t.role]}:`);
      }
      expect(tokensCss).toContain('--cfh-core:');
    });
    it(`${which}: paths are plain SVG path data inside the viewBox`, () => {
      const [w, h] = g.viewBox;
      for (const t of g.tubes) {
        expect(t.d).toMatch(/^M[-\d.\sMLHVQAZ,]+$/);
        const nums = t.d.replace(/[A-Za-z]/g, ' ').split(/[\s,]+/).filter(Boolean).map(Number);
        expect(nums.every((n) => Number.isFinite(n))).toBe(true);
        expect(Math.max(...nums)).toBeLessThanOrEqual(Math.max(w, h));
        expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
      }
    });
    it(`${which}: the crossfader cap sits on its slot`, () => {
      const slot = g.tubes.find((t) => t.id === 'slot')!;
      const y = Number(/^M[\d.]+ ([\d.]+)/.exec(slot.d)![1]);
      expect(g.cap.y).toBe(y);
      expect(g.cap.rest).toBeGreaterThanOrEqual(0);
      expect(g.cap.rest).toBeLessThanOrEqual(1);
    });
  }
});
