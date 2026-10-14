import { sleeveUrl } from '../library/sleeve';
import type { Track } from '../types';

/**
 * A sleeve as the shop sells it: no BPM or key written on the corner (those
 * are the DJ's own marker notes, added once the record is in your crate).
 */
export function shopSleeve(t: Track, size = 260): Promise<string> {
  return sleeveUrl({ ...t, analysis: undefined }, size);
}
