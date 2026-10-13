import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Hover tips and the guided tour of the booth. */
interface TipsState {
  /** Show a styled tip when hovering any control. */
  hoverTips: boolean;
  /** The booth tour has been finished or skipped once. */
  tourSeen: boolean;
  /** The tour is running now (not persisted). */
  touring: boolean;
  setHoverTips: (on: boolean) => void;
  startTour: () => void;
  endTour: () => void;
}

export const useTips = create<TipsState>()(
  persist(
    (set) => ({
      hoverTips: true,
      tourSeen: false,
      touring: false,
      setHoverTips: (hoverTips) => set({ hoverTips }),
      startTour: () => set({ touring: true }),
      endTour: () => set({ touring: false, tourSeen: true }),
    }),
    {
      name: 'cfh-tips',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ hoverTips: s.hoverTips, tourSeen: s.tourSeen }),
    },
  ),
);
