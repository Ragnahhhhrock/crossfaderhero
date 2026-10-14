import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { track } from '../analytics/ga';
import { normalise, type Character } from '../character/options';

interface CharacterState {
  /** null until the player builds their DJ on first start. */
  character: Character | null;
  save: (c: Character) => void;
}

export const useCharacter = create<CharacterState>()(
  persist(
    (set, get) => ({
      character: null,
      save: (c) => {
        const first = get().character === null;
        const character = normalise({ ...c, djName: c.djName.trim() })!;
        set({ character });
        track(first ? 'character_created' : 'character_edited', {
          gender: character.gender,
          body: character.body,
          hair: character.hairStyle,
          top: character.top,
        });
      },
    }),
    {
      name: 'cfh-character',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      merge: (saved, current) => ({ ...current, character: normalise((saved as Partial<CharacterState> | undefined)?.character) }),
    },
  ),
);
