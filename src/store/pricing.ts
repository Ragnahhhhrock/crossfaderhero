import type { Track } from '../types';

/** What a new player has in their pocket the first time they walk in. */
export const STARTING_CASH = 150;
/** How many records fit in the record bag. */
export const BAG_LIMIT = 12;
/** How many records you can carry round the shop in your hands. */
export const HAND_LIMIT = 4;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Roughly one record in thirteen is a rare pressing. */
export function isRare(t: Track): boolean {
  return hash(`rare|${t.key}`) % 13 === 0;
}

/**
 * Shop price in whole dollars. Steady per record (it never changes between
 * visits): $6–$19 to start, a little more for older pressings, double for rarities.
 */
export function priceOf(t: Track): number {
  let p = 6 + (hash(`price|${t.key}`) % 14);
  const year = t.meta.year;
  if (year && year < 1980) p += 8;
  else if (year && year < 1995) p += 4;
  if (isRare(t)) p *= 2;
  return p;
}

export const money = (n: number) => `$${n.toLocaleString('en-US')}`;

export type PurchaseResult = { ok: true; total: number } | { ok: false; reason: string; total: number };

/** Can `cash` cover these records? (Records you already own are never charged twice.) */
export function quote(tracks: Track[], owned: ReadonlySet<string>, cash: number): PurchaseResult {
  const items = tracks.filter((t) => !owned.has(t.key));
  const total = items.reduce((n, t) => n + priceOf(t), 0);
  if (!items.length) return { ok: false, reason: 'Your bag is empty.', total: 0 };
  if (total > cash) return { ok: false, reason: `That's ${money(total)} and you've got ${money(cash)}.`, total };
  return { ok: true, total };
}
