import { useCollection } from '../state/collection';
import { useWallet } from '../state/wallet';
import type { Track } from '../types';
import { quote } from './pricing';
import { useShop } from './shopState';

/** The crate your purchases land in, in your collection (the bedroom and club crates show it). */
export const STORE_CRATE = 'Record store finds';

/** File bought records into the "Record store finds" crate (made on the first purchase). */
export function stashPurchases(tracks: Track[]) {
  const c = useCollection.getState();
  const existing = c.crates.find((x) => x.name === STORE_CRATE);
  const id = existing?.id ?? c.addCrate(STORE_CRATE, 'category');
  c.addTracks({ kind: 'crate', id }, tracks);
}

export type CheckoutResult = { ok: true; items: Track[]; total: number } | { ok: false; reason: string };

/** Pay for everything in the bag: take the money, mark the records yours, crate them, empty the bag. */
export function checkout(bagTracks: Track[]): CheckoutResult {
  const wallet = useWallet.getState();
  const owned = new Set(Object.keys(wallet.owned));
  const q = quote(bagTracks, owned, wallet.cash);
  if (!q.ok) return { ok: false, reason: q.reason };
  const items = bagTracks.filter((t) => !owned.has(t.key));
  if (!wallet.buy(items.map((t) => t.key), q.total)) return { ok: false, reason: `You can't cover that.` };
  stashPurchases(items);
  useShop.getState().clearBag();
  return { ok: true, items, total: q.total };
}
