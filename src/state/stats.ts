import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { engine } from '../audio/engine';
import { onAction } from '../audio/actions';
import type { DeckId } from '../types';

/**
 * Lifetime career stats, kept on this device. Clean mixes live in the career
 * store (useCareer.mixes); everything else the home page shows is counted here.
 */
interface StatsState {
  /** Tracks you've started, once per load (not every pause/resume). */
  tracksPlayed: number;
  /** Club sets: one for each visit to the club where you got a track playing. */
  gigs: number;
  /** Times you've dropped the needle on a record. */
  vinylDrops: number;
  /** Seconds with at least one deck playing. */
  playSeconds: number;
  notePlay: () => void;
  noteGig: () => void;
  noteDrop: () => void;
  addSeconds: (n: number) => void;
  reset: () => void;
}

export const useStats = create<StatsState>()(
  persist(
    (set) => ({
      tracksPlayed: 0,
      gigs: 0,
      vinylDrops: 0,
      playSeconds: 0,
      notePlay: () => set((s) => ({ tracksPlayed: s.tracksPlayed + 1 })),
      noteGig: () => set((s) => ({ gigs: s.gigs + 1 })),
      noteDrop: () => set((s) => ({ vinylDrops: s.vinylDrops + 1 })),
      addSeconds: (n) => set((s) => ({ playSeconds: s.playSeconds + n })),
      reset: () => set({ tracksPlayed: 0, gigs: 0, vinylDrops: 0, playSeconds: 0 }),
    }),
    {
      name: 'cfh-stats',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ tracksPlayed: s.tracksPlayed, gigs: s.gigs, vinylDrops: s.vinylDrops, playSeconds: s.playSeconds }),
    },
  ),
);

/** Start counting. Call once; returns a stop function. */
export function startStats(venue: 'bedroom' | 'club'): () => void {
  const played: Record<DeckId, string | null> = { A: null, B: null };
  let gigCounted = false;
  const off = onAction(({ type, deck: id }) => {
    const st = useStats.getState();
    if (type === 'needleDrop') return st.noteDrop();
    if (type !== 'play' || !id) return;
    const t = engine.player(id).track;
    if (!t || played[id] === t.key) return;
    played[id] = t.key;
    st.notePlay();
    if (venue === 'club' && !gigCounted) {
      gigCounted = true;
      st.noteGig();
    }
  });
  const timer = setInterval(() => {
    if (engine.player('A').playing || engine.player('B').playing) useStats.getState().addSeconds(1);
  }, 1000);
  return () => {
    off();
    clearInterval(timer);
  };
}
