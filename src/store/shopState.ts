import { create } from 'zustand';
import { BAG_LIMIT, HAND_LIMIT } from './pricing';

/** What you're carrying round the shop (not saved: a new visit starts with empty hands). */
interface ShopState {
  /** Records pulled out of the bins to listen to, as track keys. */
  hand: string[];
  /** The record bag: what you're buying at the counter. */
  bag: string[];
  pickUp: (key: string) => 'ok' | 'full' | 'have';
  putBack: (key: string) => void;
  addToBag: (key: string) => 'ok' | 'full' | 'have';
  removeFromBag: (key: string) => void;
  clearBag: () => void;
}

export const useShop = create<ShopState>((set, get) => ({
  hand: [],
  bag: [],
  pickUp(key) {
    const { hand } = get();
    if (hand.includes(key)) return 'have';
    if (hand.length >= HAND_LIMIT) return 'full';
    set({ hand: [...hand, key] });
    return 'ok';
  },
  putBack(key) {
    set((s) => ({ hand: s.hand.filter((k) => k !== key) }));
  },
  addToBag(key) {
    const { bag } = get();
    if (bag.includes(key)) return 'have';
    if (bag.length >= BAG_LIMIT) return 'full';
    set((s) => ({ bag: [...bag, key], hand: s.hand.filter((k) => k !== key) }));
    return 'ok';
  },
  removeFromBag(key) {
    set((s) => ({ bag: s.bag.filter((k) => k !== key) }));
  },
  clearBag() {
    set({ bag: [] });
  },
}));
