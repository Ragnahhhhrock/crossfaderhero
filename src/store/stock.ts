import type { Track } from '../types';
import { CRATE_HOLDS, mainArtist } from '../library/sorting';

/**
 * Stocking the record store: every record in the player's folders is put in a
 * bin by genre, and each bin is filed alphabetically by artist, then title,
 * like a real shop. A genre with more records than a bin holds spills into
 * the next bin along ("House A–H", "House I–Z"). Pure helpers — no DOM here.
 */

/** Records one browser bin holds before the shop opens another. */
export const BIN_HOLDS = CRATE_HOLDS;

/** What untagged records are filed under. */
export const UNSORTED = 'Various';

export interface Bin {
  /** Stable id: genre slug + part number. */
  id: string;
  genre: string;
  /** 1-based position among this genre's bins, and how many there are. */
  part: number;
  parts: number;
  /** The filing range on the divider card, e.g. "A–F". */
  range: string;
  tracks: Track[];
}

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');

/** The word a record is filed under: "The Prodigy" files under P, accents and punctuation don't count. */
export function filingKey(s: string): string {
  const plain = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^[^a-z0-9]+/, '')
    .trim();
  return plain.replace(/^(the|a|an)\s+(?=\S)/, '');
}

/** Artist the record is filed under (the title for records with no artist tag). */
export function filedUnder(t: Track): string {
  return mainArtist(t.meta.artist) || tidy(t.meta.title) || t.name;
}

/** The divider letter: A–Z, or # for numbers and symbols. */
export function letterOf(t: Track): string {
  const c = filingKey(filedUnder(t)).charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

/** Alphabetical by artist, then title, then the file name so the order never wobbles. */
export function compareRecords(a: Track, b: Track): number {
  const byArtist = filingKey(filedUnder(a)).localeCompare(filingKey(filedUnder(b)), 'en', { numeric: true });
  if (byArtist) return byArtist;
  const byTitle = filingKey(a.meta.title).localeCompare(filingKey(b.meta.title), 'en', { numeric: true });
  return byTitle || a.path.localeCompare(b.path);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

function rangeLabel(tracks: Track[]): string {
  const key = (t: Track) => filingKey(filedUnder(t));
  const a = key(tracks[0]);
  const b = key(tracks[tracks.length - 1]);
  const cap = (s: string, n: number) => {
    const part = s.slice(0, n) || '#';
    return part.charAt(0).toUpperCase() + part.slice(1);
  };
  const la = letterOf(tracks[0]);
  const lb = letterOf(tracks[tracks.length - 1]);
  if (la !== lb) return `${la}–${lb}`;
  // same first letter all the way through: show a little more of the name
  const n = a.slice(0, 2) === b.slice(0, 2) ? 3 : 2;
  const x = cap(a, n);
  const y = cap(b, n);
  return x === y ? x : `${x}–${y}`;
}

/** Sort the shop's records into bins: genres A–Z (untagged last), records alphabetical inside each. */
export function stockBins(tracks: Track[], holds = BIN_HOLDS): Bin[] {
  const genres = new Map<string, { genre: string; tracks: Track[] }>();
  for (const t of tracks) {
    const genre = tidy(t.meta.genre) || UNSORTED;
    const k = genre.toLowerCase();
    const g = genres.get(k) ?? { genre, tracks: [] };
    g.tracks.push(t);
    genres.set(k, g);
  }
  const ordered = [...genres.values()].sort((a, b) => {
    if (a.genre === UNSORTED) return 1;
    if (b.genre === UNSORTED) return -1;
    return a.genre.localeCompare(b.genre, 'en');
  });
  const bins: Bin[] = [];
  for (const g of ordered) {
    const sorted = g.tracks.slice().sort(compareRecords);
    const parts = Math.max(1, Math.ceil(sorted.length / holds));
    const size = Math.ceil(sorted.length / parts); // even bins, not 100 + 100 + 3
    for (let p = 0; p < parts; p++) {
      const slice = sorted.slice(p * size, (p + 1) * size);
      if (!slice.length) continue;
      bins.push({ id: `${slug(g.genre)}-${p + 1}`, genre: g.genre, part: p + 1, parts, range: rangeLabel(slice), tracks: slice });
    }
  }
  return bins;
}

/** Index of the first record under `letter` in a bin (-1 if there isn't one). */
export function firstWithLetter(bin: Bin, letter: string): number {
  return bin.tracks.findIndex((t) => letterOf(t) === letter);
}

/** The letters a bin has records under, in order. */
export function lettersIn(bin: Bin): string[] {
  const out: string[] = [];
  for (const t of bin.tracks) {
    const l = letterOf(t);
    if (out[out.length - 1] !== l && !out.includes(l)) out.push(l);
  }
  return out;
}

export const binTitle = (b: Bin) => (b.parts > 1 ? `${b.genre} · ${b.range}` : b.genre);
