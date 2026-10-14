import { useEffect, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import type { Mode } from '../room/Room';
import type { Gear } from '../state/setup';
import { track } from '../analytics/ga';
import { useCharacter } from '../state/character';
import { Club, type BoothView } from './Club';
import { buildPanel } from './panel';
import { loadSettings } from './settings';
import './club.css';

interface Props {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  /** Vertical centre (0..1) of the gap the booth controls leave for the 3D view. */
  boothCentre: number;
  /** Escape is handled elsewhere while a dialog is open. */
  blockKeys: boolean;
  gear: Gear;
  /** The light desk, while you're on the decks. */
  deskOpen: boolean;
  /** Decks hidden: a clear look at the room from behind the booth. */
  decksHidden: boolean;
  /** Through the DJ's eyes, or from behind them. */
  boothView: BoothView;
  onBoothViewChange: (v: BoothView) => void;
}

/** The club venue: the 3D room, its light desk, and the way onto the decks. */
export function ClubView({ mode, onModeChange, boothCentre, blockKeys, gear, deskOpen, decksHidden, boothView, onBoothViewChange }: Props) {
  const viewRef = useRef(boothView);
  viewRef.current = boothView;
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [lookHint, setLookHint] = useState(true);
  const host = useRef<HTMLDivElement>(null);
  const clubRef = useRef<Club | null>(null);
  const desk = useRef<{ panel: HTMLElement; setOpen: (o: boolean) => void } | null>(null);
  const gearRef = useRef(gear);
  gearRef.current = gear;
  const [failed, setFailed] = useState(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const blockRef = useRef(blockKeys);
  blockRef.current = blockKeys;

  useEffect(() => {
    const el = host.current!;
    const settings = loadSettings();
    let club: Club;
    try {
      club = new Club(el, settings, gearRef.current);
      club.setBoothView(viewRef.current);
    } catch (e) {
      track('room_3d_unavailable', { reason: 'webgl_unavailable', venue: 'club' });
      setFailed(true);
      onModeChange('booth');
      return;
    }
    clubRef.current = club;
    (globalThis as unknown as { club: Club }).club = club;
    desk.current = buildPanel(el.parentElement!, club, settings);
    return () => {
      club.renderer.setAnimationLoop(null);
      club.renderer.dispose();
      desk.current?.panel.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const club = clubRef.current;
    if (!club) return;
    if (mode === 'booth') club.stepUp();
    else club.stepBack();
  }, [mode]);
  useEffect(() => {
    clubRef.current?.setBoothCentre(boothCentre);
  }, [boothCentre]);
  useEffect(() => {
    clubRef.current?.setGear(gear);
  }, [gear]);
  const character = useCharacter((s) => s.character);
  useEffect(() => {
    clubRef.current?.setPlayer(character);
  }, [character]);
  useEffect(() => {
    desk.current?.setOpen(deskOpen);
  }, [deskOpen]);
  useEffect(() => {
    clubRef.current?.setLookAround(decksHidden);
  }, [decksHidden]);
  useEffect(() => {
    clubRef.current?.setBoothView(boothView);
  }, [boothView]);

  // E jumps on the decks from anywhere in the club, Esc steps back down
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey || blockRef.current) return;
      const k = e.key.toLowerCase();
      if (modeRef.current === 'room' && (k === 'e' || k === 'enter') && t.tagName !== 'BUTTON') {
        e.preventDefault();
        engine.resume();
        onModeChange('booth');
      } else if (modeRef.current === 'booth' && k === 'escape') onModeChange('room');
      else if (modeRef.current === 'booth' && k === 'v' && !e.repeat) {
        e.preventDefault();
        onBoothViewChange(viewRef.current === 'eyes' ? 'behind' : 'eyes');
      } else if (modeRef.current === 'booth' && k === 'r' && !e.repeat) {
        e.preventDefault();
        clubRef.current?.resetLook();
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [onModeChange, onBoothViewChange]);

  return (
    <div className={`club-view mode-${mode} ${decksHidden ? 'decks-hidden' : ''}`}>
      <div
        className="club-stage"
        ref={host}
        aria-label="The club: a stage with a DJ booth, a dance floor and a lighting rig"
        onPointerDown={(e) => {
          engine.resume();
          if (modeRef.current !== 'booth') return;
          // on the decks, dragging the view above the controls turns your head (or swings the camera round)
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          clubRef.current?.lookBy(e.clientX - d.x, e.clientY - d.y);
          d.x = e.clientX;
          d.y = e.clientY;
          if (lookHint) setLookHint(false);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => modeRef.current === 'booth' && clubRef.current?.resetLook()}
        onWheel={(e) => modeRef.current === 'booth' && clubRef.current?.zoomBy(e.deltaY)}
      />
      {mode === 'room' && !failed && (
        <button
          className="club-jump"
          onClick={() => {
            engine.resume();
            onModeChange('booth');
          }}
        >
          <kbd>E</kbd> Jump on the decks
        </button>
      )}
      {mode === 'booth' && !failed && (
        <div className={`club-look-hint ${lookHint ? '' : 'faded'}`} style={{ top: decksHidden ? '72%' : `calc(${boothCentre * 100}% - 12px)` }} aria-hidden>
          Drag to look around{boothView === 'behind' ? ', scroll to zoom' : ''} · <kbd>V</kbd> {boothView === 'eyes' ? 'behind the DJ' : "DJ's eyes"} · <kbd>R</kbd> or double-click to reset
        </div>
      )}
      {failed && <div className="room-failed">3D isn't available in this browser, so you're straight on the decks.</div>}
    </div>
  );
}
