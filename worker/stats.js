/**
 * Global player stats: GET /api/stats returns the totals for everyone,
 * POST /api/stats adds a batch of counts from one player's session.
 *
 * The totals live in one Durable Object (worker/statsCounter.js) so concurrent
 * increments can't overwrite each other. Counts are sanity-capped per request;
 * they're fun numbers for the home page, not anything to trust or bill on.
 */

export const STATS_PATH = '/api/stats';

/** Largest amount one request may add to each counter. */
export const CAPS = {
  tracksPlayed: 20,
  tracksMixed: 20,
  gigs: 2,
  vinylDrops: 50,
  playSeconds: 600,
};

export const FIELDS = Object.keys(CAPS);

export function emptyTotals() {
  return Object.fromEntries(FIELDS.map((f) => [f, 0]));
}

/** Keep only known counters, as whole numbers from 0 up to the cap. Returns null if nothing usable. */
export function sanitizeDelta(body) {
  if (!body || typeof body !== 'object') return null;
  const out = emptyTotals();
  let any = false;
  for (const f of FIELDS) {
    const n = Number(body[f]);
    if (Number.isFinite(n) && n > 0) {
      out[f] = Math.min(CAPS[f], Math.floor(n));
      any = out[f] > 0 || any;
    }
  }
  return any ? out : null;
}

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } });

export async function handleStats(request, env) {
  const stub = env.STATS.get(env.STATS.idFromName('global'));
  if (request.method === 'GET') {
    // a short edge cache keeps page loads from all hitting the one counter
    const cache = caches.default;
    const key = new Request(new URL(request.url).origin + STATS_PATH);
    const hit = await cache.match(key);
    if (hit) return hit;
    const totals = await (await stub.fetch('https://counter/totals')).json();
    const res = json(totals, { headers: { 'cache-control': 'public, max-age=20' } });
    await cache.put(key, res.clone());
    return res;
  }
  if (request.method === 'POST') {
    let body = null;
    try {
      const text = await request.text();
      if (text.length < 1024) body = JSON.parse(text);
    } catch {
      /* falls through to 400 */
    }
    const delta = sanitizeDelta(body);
    if (!delta) return json({ error: 'bad request' }, { status: 400 });
    const totals = await (await stub.fetch('https://counter/add', { method: 'POST', body: JSON.stringify(delta) })).json();
    return json(totals, { headers: { 'cache-control': 'no-store' } });
  }
  return new Response('method not allowed', { status: 405 });
}
