import { create } from 'zustand';
import { engine } from '../audio/engine';
import { onAction } from '../audio/actions';
import { useCareer } from '../career/store';
import type { DeckId } from '../types';

/**
 * Global stats: totals for every player, kept by the Worker (/api/stats).
 * This device batches what you do and sends it every few seconds; the totals
 * shown are the server's plus whatever hasn't been sent yet.
 */
export interface Totals {
  tracksPlayed: number;
  tracksMixed: number;
  gigs: number;
  vinylDrops: number;
  playSeconds: number;
}

const ZERO: Totals = { tracksPlayed: 0, tracksMixed: 0, gigs: 0, vinylDrops: 0, playSeconds: 0 };
const KEYS = Object.keys(ZERO) as (keyof Totals)[];
const URL_STATS = '/api/stats';
const FLUSH_MS = 15_000;
const REFRESH_MS = 60_000;

interface StatsState {
  /** Server totals; null until the first successful load (the panel stays hidden). */
  totals: Totals | null;
  /** Counted here but not yet confirmed by the server. */
  pending: Totals;
}

export const useStats = create<StatsState>(() => ({ totals: null, pending: { ...ZERO } }));

const parse = (j: unknown): Totals | null => {
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  const t = { ...ZERO };
  for (const k of KEYS) {
    const n = Number(o[k]);
    if (!Number.isFinite(n)) return null;
    t[k] = n;
  }
  return t;
};

function bump(key: keyof Totals, n = 1) {
  useStats.setState((s) => ({ pending: { ...s.pending, [key]: s.pending[key] + n } }));
}

let inflight = false;

async function flush(exiting = false) {
  const { pending } = useStats.getState();
  if (inflight || !KEYS.some((k) => pending[k] > 0)) return;
  const sent = { ...pending };
  inflight = true;
  try {
    const res = await fetch(URL_STATS, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sent), keepalive: exiting });
    if (!res.ok) return; // keep pending and try again next time
    const totals = parse(await res.json());
    useStats.setState((s) => {
      const left = { ...s.pending };
      for (const k of KEYS) left[k] = Math.max(0, left[k] - sent[k]);
      return { totals: totals ?? s.totals, pending: left };
    });
  } catch {
    /* offline or no backend (dev server): counts stay queued */
  } finally {
    inflight = false;
  }
}

async function refresh() {
  try {
    const res = await fetch(URL_STATS);
    if (!res.ok) return;
    const totals = parse(await res.json());
    if (totals) useStats.setState({ totals });
  } catch {
    /* no backend: the panel stays hidden */
  }
}

/** Start counting and syncing. Call once; returns a stop function. */
export function startStats(venue: 'bedroom' | 'club'): () => void {
  const played: Record<DeckId, string | null> = { A: null, B: null };
  let gigCounted = false;
  const off = onAction(({ type, deck: id }) => {
    if (type === 'needleDrop') return bump('vinylDrops');
    if (type !== 'play' || !id) return;
    const t = engine.player(id).track;
    if (!t || played[id] === t.key) return;
    played[id] = t.key;
    bump('tracksPlayed');
    if (venue === 'club' && !gigCounted) {
      gigCounted = true;
      bump('gigs');
    }
  });
  const offMix = useCareer.subscribe((s, prev) => {
    if (s.mixes > prev.mixes) bump('tracksMixed', s.mixes - prev.mixes);
  });
  const tick = setInterval(() => {
    if (engine.player('A').playing || engine.player('B').playing) bump('playSeconds');
  }, 1000);
  const flushTimer = setInterval(() => void flush(), FLUSH_MS);
  const refreshTimer = setInterval(() => void refresh(), REFRESH_MS);
  const onHide = () => document.visibilityState === 'hidden' && void flush(true);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);
  void refresh();
  return () => {
    off();
    offMix();
    clearInterval(tick);
    clearInterval(flushTimer);
    clearInterval(refreshTimer);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onHide);
  };
}
