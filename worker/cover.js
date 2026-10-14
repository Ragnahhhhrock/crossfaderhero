/**
 * Cover art lookup: GET /api/cover?artist=…&title=…&album=…
 *
 * For tracks whose MP3 has no embedded picture. Searches Deezer, then the
 * iTunes Search API, picks the best match on artist + album/title, and returns
 * the image bytes from our own origin (so the game can draw it on canvases
 * without tainting them). 404 when nothing matches. Results — hits and misses —
 * are cached at the edge.
 *
 * Shared by the Cloudflare Worker (worker/index.js) and the Vite dev server.
 */

export const COVER_PATH = '/api/cover';
const HIT_TTL = 60 * 60 * 24 * 30; // 30 days
const MISS_TTL = 60 * 60 * 24 * 3; // retry misses after a few days

/** Lower-case, strip accents, brackets ("(Original Mix)", "[Remastered]"), "feat." and punctuation. */
export function norm(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]/g, ' ')
    .replace(/\b(feat|ft|featuring)\.?\s.*$/, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the\s+/, '')
    .trim();
}

/** 0..1 — how well `found` matches `wanted` (token overlap, exact = 1). */
export function similarity(wanted, found) {
  const a = norm(wanted);
  const b = norm(found);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.max(ta.size, tb.size);
}

/**
 * Pick the best candidate: the artist must match, then the album (if we know
 * it) or the title. Candidates: { artist, album, title, image }.
 */
export function pickBest(q, candidates) {
  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    if (!c.image) continue;
    const artist = similarity(q.artist, c.artist);
    if (artist < 0.6) continue;
    const albumScore = q.album ? similarity(q.album, c.album) : 0;
    const titleScore = q.title ? similarity(q.title, c.title) : 0;
    const what = Math.max(albumScore, titleScore);
    if (what < 0.6) continue;
    const score = artist + what + (albumScore > 0.8 ? 0.2 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

async function json(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'CrossfaderHero/1.0 (contact@crossfaderhero.com)' } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function deezer(q) {
  const out = [];
  if (q.album) {
    const d = await json(`https://api.deezer.com/search/album?limit=8&q=${encodeURIComponent(`${q.artist} ${q.album}`)}`);
    for (const a of d.data || []) out.push({ artist: a.artist?.name, album: a.title, title: '', image: a.cover_big || a.cover_medium });
  }
  if (q.title) {
    const d = await json(`https://api.deezer.com/search?limit=8&q=${encodeURIComponent(`${q.artist} ${q.title}`)}`);
    for (const t of d.data || []) out.push({ artist: t.artist?.name, album: t.album?.title, title: t.title, image: t.album?.cover_big || t.album?.cover_medium });
  }
  return out;
}

async function itunes(q) {
  const term = `${q.artist} ${q.album || q.title}`;
  const entity = q.album ? 'album' : 'song';
  const d = await json(`https://itunes.apple.com/search?limit=8&media=music&entity=${entity}&term=${encodeURIComponent(term)}`);
  return (d.results || []).map((r) => ({
    artist: r.artistName,
    album: r.collectionName,
    title: r.trackName || '',
    image: r.artworkUrl100 ? r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.') : '',
  }));
}

/** Find a cover image URL for the query, or null. */
export async function findCover(q) {
  for (const source of [deezer, itunes]) {
    try {
      const best = pickBest(q, await source(q));
      if (best) return best.image;
    } catch {
      /* source down or rate limited — try the next */
    }
  }
  return null;
}

const notFound = () => new Response('no cover', { status: 404, headers: { 'Cache-Control': `public, max-age=${MISS_TTL}` } });

export async function handleCover(request) {
  const url = new URL(request.url);
  const q = {
    artist: (url.searchParams.get('artist') || '').slice(0, 200).trim(),
    title: (url.searchParams.get('title') || '').slice(0, 200).trim(),
    album: (url.searchParams.get('album') || '').slice(0, 200).trim(),
  };
  if (!q.artist || (!q.title && !q.album)) return new Response('artist and title or album required', { status: 400 });

  // one cache entry per normalised query, so "Daft Punk" and "daft punk" share it
  const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  const cacheKey = new Request(`${url.origin}${COVER_PATH}?k=${encodeURIComponent([norm(q.artist), norm(q.album), q.album ? '' : norm(q.title)].join('|'))}`);
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  let res;
  const image = await findCover(q);
  if (!image) res = notFound();
  else {
    const img = await fetch(image).catch(() => null);
    const type = img?.headers.get('Content-Type') || '';
    if (!img || !img.ok || !type.startsWith('image/')) res = notFound();
    else {
      res = new Response(img.body, {
        headers: { 'Content-Type': type, 'Cache-Control': `public, max-age=${HIT_TTL}`, 'X-Cover-Source': new URL(image).hostname },
      });
    }
  }
  if (cache) await cache.put(cacheKey, res.clone()).catch(() => {});
  return res;
}
