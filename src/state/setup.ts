import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { engine } from '../audio/engine';
import type { ChannelInput } from '../audio/mixer';
import type { DeckId } from '../types';
import { track } from '../analytics/ga';

/** What's on the desk: two CDJs, two turntables, or both pairs. */
export type Gear = 'cdj' | 'vinyl' | 'both';

export const GEAR_LABEL: Record<Gear, string> = {
  cdj: '2 × CDJs',
  vinyl: '2 × turntables',
  both: '2 × CDJs + 2 × turntables',
};

interface SetupState {
  /** null until the player picks their gear on first start. */
  gear: Gear | null;
  choose: (g: Gear) => void;
}

export const useSetup = create<SetupState>()(
  persist(
    (set, get) => ({
      gear: null,
      choose: (gear) => {
        const before = get().gear;
        set({ gear });
        applyGear(gear);
        track('gear_choice', { gear, first_time: before ? 'no' : 'yes' });
      },
    }),
    { name: 'cfh-setup', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);

/** Which inputs the gear allows on a channel. */
export function inputsFor(gear: Gear | null): ChannelInput[] {
  if (gear === 'vinyl') return ['phono'];
  if (gear === 'both') return ['cd', 'phono'];
  return ['cd'];
}

/** Point the mixer's input selectors at the gear on the desk. */
export function applyGear(gear: Gear | null) {
  const m = engine.mixer;
  for (const id of ['A', 'B'] as DeckId[]) {
    const allowed = inputsFor(gear);
    if (!allowed.includes(m.state[id].input)) m.setInput(id, allowed[0]);
  }
  if (gear === 'both') {
    // start with a CDJ on the left and a turntable on the right
    if (m.state.A.input === m.state.B.input) {
      m.setInput('A', 'cd');
      m.setInput('B', 'phono');
    }
  }
  // gear that's been taken off the desk goes quiet
  if (gear === 'vinyl') for (const id of ['A', 'B'] as DeckId[]) engine.decks[id].pause();
  if (gear === 'cdj' || gear === null)
    for (const id of ['A', 'B'] as DeckId[]) {
      const tt = engine.turntables[id];
      if (tt.motor) tt.toggleStart();
      if (tt.needleDown) tt.liftNeedle();
    }
  if (gear === 'vinyl' || gear === 'both') {
    engine.turntables.A.warmUp();
    engine.turntables.B.warmUp();
    // battle style: sharp cut-in crossfader
    if (gear === 'vinyl') m.setCurve('sharp');
  }
}

/** Apply the saved gear at startup. */
export function initSetup() {
  applyGear(useSetup.getState().gear);
}
