import type { DeckId } from '../types';

/**
 * Performance actions the player takes on the gear. The audio classes emit
 * these so the career coach can count technique (cue sets, hot-cue jumps,
 * scratch flips, crossfader cuts…) without the audio code knowing about it.
 */
export type ActionType =
  | 'cueSet'
  | 'cuePreview'
  | 'cueReturn'
  | 'hotCueSet'
  | 'hotCueJump'
  | 'loopSet'
  | 'loopHalve'
  | 'loopDouble'
  | 'loopExit'
  | 'beatJump'
  | 'sync'
  | 'scratchFlip'
  | 'crossfader'
  | 'play'
  | 'trackEnd';

export interface Action {
  type: ActionType;
  deck?: DeckId;
}

const listeners = new Set<(a: Action) => void>();

export function emitAction(type: ActionType, deck?: DeckId) {
  const a = { type, deck };
  for (const l of listeners) l(a);
}

export function onAction(fn: (a: Action) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
