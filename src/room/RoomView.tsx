import { useEffect, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { toast } from '../state/toasts';
import { track } from '../analytics/ga';
import type { Action } from './models';
import { Room, type Mode } from './Room';
import type { Gear } from '../state/setup';
import { useLibrary } from '../state/library';
import { useCollection } from '../state/collection';
import { poolTracks, resolve } from '../library/sorting';

interface Props {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  /** Vertical centre (0..1) of the gap the booth controls leave for the 3D view. */
  boothCentre: number;
  /** Escape is handled elsewhere while a dialog is open. */
  blockKeys: boolean;
  gear: Gear;
  /** Clicking a record crate opens the crate browser. */
  onOpenCrate: () => void;
}

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift']);

function perform(a: Action, openCrate: () => void) {
  engine.resume();
  if (a.kind === 'crate') return openCrate();
  if (a.kind === 'ttStart' || a.kind === 'rpm' || a.kind === 'needle') {
    const tt = engine.turntables[a.deck];
    if (a.kind === 'ttStart') tt.toggleStart();
    else if (a.kind === 'rpm') tt.setRpm(a.rpm);
    else if (!tt.loaded) toast(`Turntable ${a.deck} has no record on it. Click a record crate to pull one out.`);
    else tt.toggleNeedle();
    return;
  }
  const deck = engine.decks[a.deck];
  if (!deck.loaded && a.kind !== 'sync') {
    toast(`Deck ${a.deck} is empty. Step up to the decks (E) and load a track from your USB.`);
    return;
  }
  switch (a.kind) {
    case 'play': deck.togglePlay(); break;
    case 'hot': deck.hotCue(a.index); break;
    case 'loop': deck.autoLoop(4); break;
    case 'sync': {
      const other = engine.other(a.deck);
      if (!deck.loaded || !other.loaded) toast('Load both decks to sync them.');
      else if (!deck.syncTo(other)) toast(`Deck ${a.deck} can't reach ${other.bpm.toFixed(1)} BPM.`, 'warn');
      break;
    }
    case 'cue': break; // handled on press/release
  }
}

export function RoomView({ mode, onModeChange, boothCentre, blockKeys, gear, onOpenCrate }: Props) {
  const openCrate = useRef(onOpenCrate);
  openCrate.current = onOpenCrate;
  const gearRef = useRef(gear);
  gearRef.current = gear;
  const canvas = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [near, setNear] = useState(false);
  const [hover, setHover] = useState<{ label: string; x: number; y: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const blockRef = useRef(blockKeys);
  blockRef.current = blockKeys;

  // create the scene and run the frame loop
  useEffect(() => {
    const c = canvas.current!;
    let room: Room;
    try {
      if (new URLSearchParams(location.search).has('no3d')) throw new Error('3D disabled');
      room = new Room(c, gearRef.current);
    } catch (e) {
      track('room_3d_unavailable', { reason: (e as Error)?.message === '3D disabled' ? 'no3d_param' : 'webgl_unavailable' });
      setFailed(true);
      onModeChange('booth');
      return;
    }
    roomRef.current = room;
    (globalThis as unknown as { cfhRoom: Room }).cfhRoom = room;
    const ro = new ResizeObserver(() => room.resize(c.clientWidth, c.clientHeight));
    ro.observe(c);
    room.resize(c.clientWidth, c.clientHeight);
    if (new URLSearchParams(location.search).has('shot')) {
      room.startShowcase();
      document.documentElement.classList.add('shot');
    }
    let raf = 0;
    let last = performance.now();
    let wasNear = false;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // at the decks the room is only a backdrop: 30 fps is plenty
      if (room.mode === 'booth' && !room.busy && now - last < 30) return;
      room.update((now - last) / 1000, now);
      last = now;
      const n = room.canStepUp();
      if (n !== wasNear) {
        wasNear = n;
        setNear(n);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      room.dispose();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the room in step with the app's mode
  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    if (mode === 'booth' && room.mode !== 'booth') room.stepUp();
    if (mode === 'room' && room.mode !== 'room') room.stepBack();
    setHover(null);
  }, [mode]);

  useEffect(() => roomRef.current?.setBoothCentre(boothCentre), [boothCentre]);
  useEffect(() => roomRef.current?.setGear(gear), [gear]);

  // the crates on the floor follow the record crates in the library
  useEffect(() => {
    let timer = 0;
    let last: unknown = null;
    let lastLabelled: unknown = null;
    let lastSlots: unknown = null;
    const sync = () => {
      const { slots } = useLibrary.getState();
      const slot = slots.crate;
      const labelled = useCollection.getState().crates;
      if (slot.tracks === last && labelled === lastLabelled && (!labelled.length || slots === lastSlots)) return;
      last = slot.tracks;
      lastLabelled = labelled;
      lastSlots = slots;
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const byKey = new Map(poolTracks(useLibrary.getState().slots).map((t) => [t.key, t]));
        // labelled crates first (they're the ones you sorted), then one per crate folder
        const crates = [
          ...useCollection.getState().crates.map((c) => ({ name: c.name, tracks: resolve(c.keys, byKey) })).filter((c) => c.tracks.length),
          ...slot.folders.map((f, i) => ({ name: f.name, tracks: slot.tracks.filter((t) => t.folder === i) })),
        ];
        roomRef.current?.setCrates(crates);
      }, slot.status === 'scanning' ? 1500 : 300);
    };
    sync();
    const unsub = useLibrary.subscribe(sync);
    const unsubC = useCollection.subscribe(sync);
    return () => {
      unsub();
      unsubC();
      clearTimeout(timer);
    };
  }, []);

  // walking keys
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const room = roomRef.current;
      const t = e.target as HTMLElement;
      if (!room || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (modeRef.current === 'room') {
        if (MOVE_KEYS.has(k)) {
          room.keys.add(k);
          e.preventDefault();
        } else if (k === 'e' || k === 'enter') {
          if (room.canStepUp()) {
            e.preventDefault();
            onModeChange('booth');
          }
        }
      } else if (k === 'escape' && !blockRef.current) {
        onModeChange('room');
      }
    };
    const up = (e: KeyboardEvent) => roomRef.current?.keys.delete(e.key.toLowerCase());
    const blur = () => roomRef.current?.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [onModeChange]);

  // drag to look, click to press
  const drag = useRef<{ x: number; y: number; moved: boolean; cue: Action | null } | null>(null);

  return (
    <div className={`room-view mode-${mode}`}>
      <canvas
        ref={canvas}
        className="room-canvas"
        aria-label={`Your bedroom: a desk with ${gear === 'both' ? 'two CDJs, two turntables' : gear === 'vinyl' ? 'two turntables' : 'two decks'}, a mixer and two speakers`}
        onPointerDown={(e) => {
          const room = roomRef.current;
          if (!room) return;
          engine.resume();
          (e.target as Element).setPointerCapture(e.pointerId);
          const hit = room.pick(e.clientX, e.clientY, canvas.current!.getBoundingClientRect());
          let cue: Action | null = null;
          if (hit?.action.kind === 'cue') {
            cue = hit.action;
            if (engine.decks[cue.deck].loaded) engine.decks[cue.deck].cueDown();
            else perform(cue, openCrate.current);
          }
          drag.current = { x: e.clientX, y: e.clientY, moved: false, cue };
        }}
        onPointerMove={(e) => {
          const room = roomRef.current;
          if (!room) return;
          const d = drag.current;
          if (d) {
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true;
            if (d.moved && !d.cue) {
              room.look(e.movementX, e.movementY);
              setHover(null);
            }
            return;
          }
          const hit = room.pick(e.clientX, e.clientY, canvas.current!.getBoundingClientRect());
          setHover(hit ? { label: hit.label, x: e.clientX, y: e.clientY } : null);
        }}
        onPointerUp={(e) => {
          const room = roomRef.current;
          const d = drag.current;
          drag.current = null;
          if (!room || !d) return;
          if (d.cue) {
            if (d.cue.kind === 'cue') engine.decks[d.cue.deck].cueUp();
            return;
          }
          if (d.moved) return;
          const hit = room.pick(e.clientX, e.clientY, canvas.current!.getBoundingClientRect());
          if (hit) perform(hit.action, openCrate.current);
          else if (modeRef.current === 'room' && room.canStepUp()) {
            // clicking the desk area from close by also steps up
            const r = canvas.current!.getBoundingClientRect();
            if (e.clientY > r.top + r.height * 0.45) onModeChange('booth');
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: hover ? 'pointer' : drag.current?.moved ? 'grabbing' : 'grab' }}
      />
      {hover && (
        <div className="hover-label" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {hover.label}
        </div>
      )}
      {mode === 'room' && !failed && (
        <>
          {near && (
            <div className="step-prompt" role="status">
              <kbd>E</kbd> Step up to the decks
            </div>
          )}
          <div className="room-hints" aria-hidden>
            <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk</span>
            <span>Drag to look</span>
            <span>Click the gear to press buttons</span>
          </div>
        </>
      )}
      {failed && <div className="room-failed">3D isn't available in this browser, so you're straight on the decks.</div>}
    </div>
  );
}
