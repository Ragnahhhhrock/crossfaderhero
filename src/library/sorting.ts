import type { SlotId, Track } from '../types';

/**
 * Sorting your music into USB drives (for the CDJs) and labelled record crates
 * (for the turntables). Pure helpers — the store lives in state/collection.ts.
 */

/** What a crate's label describes. "category" is your own (Warm-up, Peak time, Battle tools…). */
export type CrateBy = 'genre' | 'artist' | 'period' | 'category';

export const CRATE_BY: { id: CrateBy; label: string; hint: string }[] = [
  { id: 'genre', label: 'Genre', hint: 'House, Techno, Hip-Hop…' },
  { id: 'artist', label: 'Artist', hint: 'One crate per artist' },
  { id: 'period', label: 'Period', hint: '1980s, 1990s, 2000s…' },
  { id: 'category', label: 'Category', hint: 'Your own: Warm-up, Peak time, Battle tools…' },
];

/** USB stick sizes on offer, in GB. */
export const USB_SIZES = [8, 16, 32, 64, 128];

/** Accent colours for USB sticks (token names). */
export const USB_COLOURS = ['hot-pink', 'hot-teal', 'hot-yellow', 'print-violet', 'print-sun', 'play', 'deck-a', 'deck-b'];

/** 1997 → "1990s". */
export function periodOf(year?: number): string | null {
  if (!year) return null;
  return `${Math.floor(year / 10) * 10}s`;
}

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Main artist, so "A feat. B", "A vs. B" and "A, B" files land with A (duos like "Simon & Garfunkel" stay whole). */
export function mainArtist(artist: string): string {
  return tidy(artist.split(/\s+(?:feat\.?|ft\.?|featuring|vs\.?)\s+|\s*[,;]\s*/i)[0] ?? '');
}

/** The label a track would get in a crate sorted by `by` (null when the tags don't say). */
export function labelFor(t: Track, by: CrateBy): string | null {
  switch (by) {
    case 'genre': return tidy(t.meta.genre) || null;
    case 'artist': return mainArtist(t.meta.artist) || null;
    case 'period': return periodOf(t.meta.year);
    case 'category': return null;
  }
}

/** Group tracks by their label, biggest group first; untagged tracks go under `null`. */
export function groupTracks(tracks: Track[], by: CrateBy): { label: string | null; tracks: Track[] }[] {
  const groups = new Map<string, { label: string | null; tracks: Track[] }>();
  for (const t of tracks) {
    const label = labelFor(t, by);
    const k = label?.toLowerCase() ?? '\u0000';
    const g = groups.get(k) ?? { label, tracks: [] };
    g.tracks.push(t);
    groups.set(k, g);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.label === null) return 1;
    if (b.label === null) return -1;
    if (by === 'period') return a.label.localeCompare(b.label);
    return b.tracks.length - a.tracks.length || a.label.localeCompare(b.label);
  });
}

/** Does the track belong in a crate named `name` that's sorted by `by`? */
export function matches(t: Track, by: CrateBy, name: string): boolean {
  const l = labelFor(t, by);
  return !!l && l.toLowerCase() === name.trim().toLowerCase();
}

/** Every track found on any USB folder or crate folder, once each. */
export function poolTracks(slots: Record<SlotId, { tracks: Track[] }>): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const id of ['A', 'B', 'crate'] as SlotId[]) {
    for (const t of slots[id].tracks) {
      if (seen.has(t.key)) continue;
      seen.add(t.key);
      out.push(t);
    }
  }
  return out;
}

/** Look up tracks by key, in the order the keys are listed; missing ones are skipped. */
export function resolve(keys: string[], byKey: Map<string, Track>): Track[] {
  const out: Track[] = [];
  for (const k of keys) {
    const t = byKey.get(k);
    if (t) out.push(t);
  }
  return out;
}

export const bytesUsed = (tracks: Track[]) => tracks.reduce((n, t) => n + t.size, 0);

export function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} GB`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`;
  return `${Math.max(0, Math.round(n / 1e3))} KB`;
}

/** A real crate holds about this many records before it's full. */
export const CRATE_HOLDS = 100;
