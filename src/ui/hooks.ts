import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { engine } from '../audio/engine';
import type { DeckId } from '../types';
import type { Deck } from '../audio/deck';
import type { Mixer } from '../audio/mixer';

/** Re-render when the deck's discrete state changes (load, cue, loop…). */
export function useDeck(id: DeckId): Deck {
  const deck = engine.decks[id];
  useSyncExternalStore(deck.subscribe, deck.getVersion);
  return deck;
}

export function useMixer(): Mixer {
  const m = engine.mixer;
  useSyncExternalStore(m.subscribe, m.getVersion);
  return m;
}

/** Run a callback every animation frame while mounted. */
export function useAnimationFrame(cb: (t: number) => void): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    let id = 0;
    const loop = (t: number) => {
      ref.current(t);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}

/** A polled value that only re-renders when it changes, sampled every frame. */
export function usePolled<T>(fn: () => T): T {
  const [v, setV] = useState(fn);
  const last = useRef(v);
  useAnimationFrame(() => {
    const n = fn();
    if (n !== last.current) {
      last.current = n;
      setV(n);
    }
  });
  return v;
}

/** Keep a canvas sized to its CSS box at device pixel ratio. Returns [ref, width, height] in CSS px. */
export function useCanvasSize() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ro = new ResizeObserver(() => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, []);
  return [ref, size.w, size.h] as const;
}

export function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}
