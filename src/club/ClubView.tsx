import { useEffect, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import type { Mode } from '../room/Room';
import type { Gear } from '../state/setup';
import { track } from '../analytics/ga';
import { Club } from './Club';
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
}

/** The club venue: the 3D room, its light desk, and the way onto the decks. */
export function ClubView({ mode, onModeChange, boothCentre, blockKeys, gear, deskOpen, decksHidden }: Props) {
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
  useEffect(() => {
    desk.current?.setOpen(deskOpen);
  }, [deskOpen]);
  useEffect(() => {
    clubRef.current?.setLookAround(decksHidden);
  }, [decksHidden]);

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
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [onModeChange]);

  return (
    <div className={`club-view mode-${mode} ${decksHidden ? 'decks-hidden' : ''}`}>
      <div className="club-stage" ref={host} onPointerDown={() => engine.resume()} aria-label="The club: a stage with a DJ booth, a dance floor and a lighting rig" />
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
      {failed && <div className="room-failed">3D isn't available in this browser, so you're straight on the decks.</div>}
    </div>
  );
}
