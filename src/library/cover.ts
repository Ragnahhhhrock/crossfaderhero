/**
 * Online cover art for tracks with no picture embedded in the MP3.
 *
 * Asks our /api/cover endpoint (Deezer / iTunes, see worker/cover.js) by
 * artist + album (or title when there's no album), so every track off the
 * same album shares one lookup. Images and misses are kept in IndexedDB, so
 * each cover is only fetched once per browser.
 */
import { createStore, get, set } from 'idb-keyval';
import type { Track } from '../types';

const db = createStore('crossfaderhero-covers', 'covers');
const MISS_RETRY_MS = 14 * 24 * 3600 * 1000;
const CONCURRENCY = 2;

type Cached = { blob: Blob } | { miss: number };

/** Lookup key: tracks off the same album share a cover. */
export function coverKey(t: Pick<Track, 'meta'>): string | null {
  const clean = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const artist = clean(t.meta.artist);
  if (!artist || /^(unknown|various)( artists?)?$/.test(artist)) return null;
  const album = clean(t.meta.album);
  if (album) return `${artist}|album|${album}`;
  const title = clean(t.meta.title);
  return title ? `${artist}|title|${title}` : null;
}

/** Cover URLs found online, by track key — for track objects held outside the library store (e.g. on a deck). */
const byTrack = new Map<string, string>();
const byCover = new Map<string, Promise<string | null>>();

/** The track's cover: embedded art first, then any found online. */
export function artworkUrlOf(t: Track | null | undefined): string | undefined {
  if (!t) return undefined;
  return t.artworkUrl ?? byTrack.get(t.key);
}

const queue: (() => Promise<void>)[] = [];
let running = 0;
function pump() {
  while (running < CONCURRENCY && queue.length) {
    const job = queue.shift()!;
    running++;
    void job().finally(() => {
      running--;
      setTimeout(pump, 250); // be gentle with the lookup services
    });
  }
}

async function fetchCover(t: Track, key: string): Promise<string | null> {
  try {
    const cached = await get<Cached>(key, db);
    if (cached && 'blob' in cached) return URL.createObjectURL(cached.blob);
    if (cached && 'miss' in cached && Date.now() - cached.miss < MISS_RETRY_MS) return null;
  } catch {
    /* IndexedDB unavailable — just look it up */
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  return new Promise((resolve) => {
    queue.push(async () => {
      try {
        const p = new URLSearchParams({ artist: t.meta.artist });
        if (t.meta.album) p.set('album', t.meta.album);
        if (t.meta.title) p.set('title', t.meta.title);
        const r = await fetch(`/api/cover?${p}`);
        const type = r.headers.get('Content-Type') ?? '';
        if (r.ok && type.startsWith('image/')) {
          const blob = await r.blob();
          await set(key, { blob } satisfies Cached, db).catch(() => {});
          resolve(URL.createObjectURL(blob));
        } else {
          // only remember real misses, not outages
          if (r.status === 404) await set(key, { miss: Date.now() } satisfies Cached, db).catch(() => {});
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });
    pump();
  });
}

/**
 * Find a cover online for a track with none embedded. Resolves to its URL, or
 * null. Calls for the same album share one request.
 */
export function lookupCover(t: Track): Promise<string | null> {
  if (t.artworkUrl) return Promise.resolve(t.artworkUrl);
  const known = byTrack.get(t.key);
  if (known) return Promise.resolve(known);
  const key = coverKey(t);
  if (!key) return Promise.resolve(null);
  let p = byCover.get(key);
  if (!p) {
    p = fetchCover(t, key);
    byCover.set(key, p);
  }
  return p.then((url) => {
    if (url) byTrack.set(t.key, url);
    return url;
  });
}

/** Resolves once the track's cover is known (embedded, found online, or none). */
export function coverSettled(t: Track): Promise<string | null> {
  const now = artworkUrlOf(t);
  if (now) return Promise.resolve(now);
  const key = coverKey(t);
  const p = key ? byCover.get(key) : undefined;
  return p ? lookupCover(t) : Promise.resolve(null);
}
