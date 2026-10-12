/**
 * Runtime access to the design tokens in tokens.css, for code that can't use
 * CSS variables directly: the three.js room and <canvas> drawing.
 */

const cache = new Map<string, string>();

/** The resolved value of a token, e.g. token('deck-a') → '#5cc8ff'. */
export function token(name: string): string {
  let v = cache.get(name);
  if (v === undefined) {
    v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
    if (!v) throw new Error(`Unknown design token --${name}`);
    cache.set(name, v);
  }
  return v;
}

/** A token colour as a number for three.js, e.g. 0x5cc8ff. */
export function hex(name: string): number {
  return parseInt(token(name).slice(1, 7), 16);
}

/** A token colour at an opacity, for canvas drawing. */
export function alpha(name: string, a: number): string {
  const n = hex(name);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a})`;
}

/** A token colour scaled in brightness (0..2), for procedural textures. */
export function shade(name: string, k: number): string {
  const n = hex(name);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)} ${c((n >> 8) & 255)} ${c(n & 255)})`;
}

/** A canvas font string using a token family, e.g. font('ui', 28, 600). */
export function font(family: 'ui' | 'lcd', px: number, weight = 400): string {
  return `${weight} ${px}px ${token(`font-${family}`)}`;
}

/** Hot cue colours A–H, in order. */
export const HOT_CUE_TOKENS = ['play', 'deck-a', 'hot-pink', 'hot-yellow', 'filter', 'deck-b', 'hot-teal', 'ink-100'] as const;
