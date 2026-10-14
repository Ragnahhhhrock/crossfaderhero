import { beforeEach, describe, expect, it } from 'vitest';
import { useCollection } from '../src/state/collection';
import { useWallet } from '../src/state/wallet';
import { checkout, STORE_CRATE } from '../src/store/purchase';
import { priceOf, STARTING_CASH } from '../src/store/pricing';
import { useShop } from '../src/store/shopState';
import type { Track } from '../src/types';

const rec = (key: string): Track => ({
  key, slot: 'crate', folder: 0, path: key, name: key, size: 5e6, lastModified: 0,
  meta: { title: key, artist: 'Someone', album: '', genre: 'House' },
  analysisState: 'pending', getFile: async () => new File([], key),
});

describe('checkout', () => {
  beforeEach(() => {
    useWallet.setState({ cash: STARTING_CASH, owned: {} });
    useCollection.setState({ usbs: [], crates: [] });
    useShop.setState({ hand: [], bag: [] });
  });

  it('takes the money, marks the records yours, files them in the store crate and empties the bag', () => {
    const a = rec('a');
    const b = rec('b');
    useShop.setState({ bag: ['a', 'b'] });
    const r = checkout([a, b]);
    const total = priceOf(a) + priceOf(b);
    expect(r).toMatchObject({ ok: true, total });
    expect(useWallet.getState().cash).toBe(STARTING_CASH - total);
    expect(Object.keys(useWallet.getState().owned).sort()).toEqual(['a', 'b']);
    const crate = useCollection.getState().crates.find((c) => c.name === STORE_CRATE);
    expect(crate?.keys).toEqual(['a', 'b']);
    expect(useShop.getState().bag).toEqual([]);
  });

  it('refuses when you are short and changes nothing', () => {
    useWallet.setState({ cash: 1 });
    useShop.setState({ bag: ['a'] });
    const r = checkout([rec('a')]);
    expect(r.ok).toBe(false);
    expect(useWallet.getState().cash).toBe(1);
    expect(useWallet.getState().owned).toEqual({});
    expect(useCollection.getState().crates).toEqual([]);
    expect(useShop.getState().bag).toEqual(['a']);
  });

  it('never charges twice for a record you already own, and reuses the crate', () => {
    const a = rec('a');
    expect(checkout([a]).ok).toBe(true);
    const cash = useWallet.getState().cash;
    expect(checkout([a]).ok).toBe(false); // nothing new to pay for
    expect(useWallet.getState().cash).toBe(cash);
    expect(checkout([rec('c')]).ok).toBe(true);
    const crates = useCollection.getState().crates.filter((c) => c.name === STORE_CRATE);
    expect(crates).toHaveLength(1);
    expect(crates[0].keys).toEqual(['a', 'c']);
  });
});
