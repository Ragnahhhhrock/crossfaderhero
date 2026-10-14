import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { STARTING_CASH } from '../store/pricing';

/**
 * Your money and the records you've bought. Persisted in the browser; records
 * are remembered by track key, so they stay yours as long as the folder is plugged in.
 */
interface WalletState {
  cash: number;
  /** Track key → price paid. */
  owned: Record<string, number>;
  /** Pay `total` for these keys. Returns false (and changes nothing) if you can't afford it. */
  buy: (keys: string[], total: number) => boolean;
  earn: (amount: number) => void;
}

export const useWallet = create<WalletState>()(
  persist(
    (set, get) => ({
      cash: STARTING_CASH,
      owned: {},
      buy(keys, total) {
        if (total > get().cash) return false;
        set((s) => {
          const owned = { ...s.owned };
          const each = keys.length ? Math.round(total / keys.length) : 0;
          for (const k of keys) owned[k] = each;
          return { cash: s.cash - total, owned };
        });
        return true;
      },
      earn(amount) {
        set((s) => ({ cash: s.cash + Math.max(0, amount) }));
      },
    }),
    {
      name: 'cfh-wallet',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ cash: s.cash, owned: s.owned }),
    },
  ),
);
