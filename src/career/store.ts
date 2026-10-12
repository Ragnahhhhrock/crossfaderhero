import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { lessonById, LESSONS } from './lessons';
import { tierFor } from './rules';

interface CareerState {
  rep: number;
  completed: string[];
  /** Guided lessons pop up and the next fundamentals lesson starts automatically. */
  beginner: boolean;
  /** The first-visit "new to DJing?" question has been answered. */
  onboarded: boolean;
  mixes: number;
  /** Lesson in progress (not persisted mid-step — steps restart on reload). */
  active: string | null;
  step: number;

  setBeginner: (on: boolean) => void;
  finishOnboarding: (beginner: boolean) => void;
  start: (id: string) => void;
  stop: () => void;
  advance: () => void;
  addRep: (n: number) => void;
  noteMix: () => void;
  reset: () => void;
}

export const useCareer = create<CareerState>()(
  persist(
    (set, get) => ({
      rep: 0,
      completed: [],
      beginner: false,
      onboarded: false,
      mixes: 0,
      active: null,
      step: 0,

      setBeginner: (beginner) => set({ beginner }),
      finishOnboarding: (beginner) => set({ beginner, onboarded: true }),
      start: (id) => {
        const l = lessonById(id);
        if (l && l.tier <= tierFor(get().rep).id) set({ active: id, step: 0 });
      },
      stop: () => set({ active: null, step: 0 }),
      advance: () => {
        const { active, step, completed, rep } = get();
        const l = active ? lessonById(active) : null;
        if (!l) return;
        if (step + 1 < l.steps.length) return set({ step: step + 1 });
        const first = !completed.includes(l.id);
        set({
          active: null,
          step: 0,
          completed: first ? [...completed, l.id] : completed,
          rep: first ? rep + l.rep : rep,
        });
      },
      addRep: (n) => set((s) => ({ rep: s.rep + n })),
      noteMix: () => set((s) => ({ mixes: s.mixes + 1 })),
      reset: () => set({ rep: 0, completed: [], mixes: 0, active: null, step: 0 }),
    }),
    {
      name: 'cfh-career',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ rep: s.rep, completed: s.completed, beginner: s.beginner, onboarded: s.onboarded, mixes: s.mixes }),
    },
  ),
);

export const lessonCount = LESSONS.length;
