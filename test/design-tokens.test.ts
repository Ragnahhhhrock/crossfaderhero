/**
 * Enforces the design system: every colour and typeface in the product comes
 * from src/design/tokens.css. Add a token there instead of hard-coding a value.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const tokensCss = readFileSync(join(root, 'src/design/tokens.css'), 'utf8');
const definedTokens = new Set([...tokensCss.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const palette = new Set([...tokensCss.matchAll(/#([0-9a-f]{6})\b/gi)].map((m) => m[1].toLowerCase()));

function walk(dir: string, exts: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p, exts) : exts.test(n) ? [p] : [];
  });
}

const sourceFiles = walk(join(root, 'src'), /\.(ts|tsx|css)$/).filter((f) => !f.includes(`${join('src', 'design')}`));
const publicFiles = [
  ...walk(join(root, 'public'), /\.(svg|html|webmanifest|json|xml)$/),
  ...walk(join(root, 'scripts/brand'), /\.html$/),
  ...['index.html', 'brand.html', 'club.html'].map((f) => join(root, f)).filter(existsSync),
];

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('design tokens', () => {
  it('defines a palette', () => {
    expect(palette.size).toBeGreaterThan(40);
    expect(definedTokens.has('deck-a')).toBe(true);
  });

  for (const f of sourceFiles) {
    const rel = relative(root, f);
    it(`${rel} uses tokens, not raw colours or fonts`, () => {
      const s = strip(readFileSync(f, 'utf8'));
      const offenders = [
        ...(s.match(/#[0-9a-f]{3,8}\b(?![-\w])/gi) ?? []),
        ...(s.match(/\b0x[0-9a-f]{6}\b/gi) ?? []),
        ...(s.match(/\b(rgba?|hsla?)\(/gi) ?? []),
        ...(s.match(/Chakra Petch|Share Tech Mono/g) ?? []),
      ];
      expect(offenders).toEqual([]);
    });

    it(`${rel} only references tokens that exist`, () => {
      const s = readFileSync(f, 'utf8');
      const used = [
        ...[...s.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((m) => m[1]),
        ...[...s.matchAll(/\b(?:token|hex|alpha|shade)\('([a-z0-9-]+)'/g)].map((m) => m[1]),
      ];
      // component-scoped custom properties are set inline in TSX and are allowed
      const local = new Set(['accent', 'hc', 'knob-tone', 'fill']);
      expect(used.filter((u) => !definedTokens.has(u) && !local.has(u))).toEqual([]);
    });
  }

  for (const f of publicFiles) {
    const rel = relative(root, f);
    it(`${rel} only uses palette colours`, () => {
      const s = readFileSync(f, 'utf8');
      const off = [...s.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)]
        .map((m) => (m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]).toLowerCase())
        .filter((h) => !palette.has(h));
      expect(off).toEqual([]);
    });
  }
});
