import { useEffect, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { recordCanvas } from '../library/sleeve';
import { toast } from '../state/toasts';
import { track as ga } from '../analytics/ga';
import type { Track } from '../types';
import { formatTime, usePolled, useTurntable } from '../ui/hooks';
import { SleeveImg } from './Dig';
import { useShop } from './shopState';

/** The shop's one turntable. */
const tt = () => engine.turntables.A;

/** Lift the needle and stop the platter. */
export function stopPlatter() {
  const t = tt();
  t.liftNeedle();
  if (t.motor) t.toggleStart();
}

/** The vinyl itself, drawn from above. */
function Vinyl({ t, className }: { t: Track; className?: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const c = recordCanvas(t, t.analysis ?? null, 240, (cc) => setUrl(cc.toDataURL()));
    setUrl(c.toDataURL());
  }, [t.key, t.artworkUrl, t.analysis]); // eslint-disable-line react-hooks/exhaustive-deps
  return url ? <img className={className} src={url} alt="" draggable={false} /> : null;
}

/**
 * The listening station controls (the 3D turntable is behind this panel).
 * A record goes: bin → your hands → out of its sleeve → on the platter → and back.
 */
export function Station({ byKey, onClose }: { byKey: Map<string, Track>; onClose: () => void }) {
  const deck = useTurntable('A');
  const hand = useShop((s) => s.hand);
  const bag = useShop((s) => s.bag);
  const pile = [...hand, ...bag.filter((k) => !hand.includes(k))];
  const [sel, setSel] = useState<string | null>(() => deck.track?.key ?? pile[0] ?? null);
  /** The record whose vinyl is out of its sleeve and in your hand. */
  const [out, setOut] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pos = usePolled(() => Math.floor(deck.position * 4) / 4);

  const t = sel ? byKey.get(sel) : undefined;
  // keep the selection on something you're still holding
  useEffect(() => {
    if (sel && !pile.includes(sel) && deck.track?.key !== sel) setSel(pile[0] ?? null);
    if (!sel && pile.length) setSel(pile[0]);
  }, [sel, pile.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPlatter = !!t && deck.track?.key === t.key;
  const vinylOut = !!t && out === t.key;
  const soundOn = usePolled(() => engine.ctx.state === 'running');

  const takeOff = () => {
    stopPlatter();
    const k = deck.track?.key ?? null;
    deck.eject();
    return k;
  };
  const place = async () => {
    if (!t || busy) return;
    setBusy(true);
    if (deck.track) takeOff();
    const r = await engine.loadRecord('A', t);
    setBusy(false);
    if (!r.ok) return toast(r.reason ?? `Couldn't put that on.`, 'warn');
    setOut(null);
    ga('store_listen', { genre: t.meta.genre.slice(0, 40) });
  };
  const slipBack = () => {
    if (onPlatter) takeOff();
    setOut(null);
  };
  const liftOff = () => {
    // the record leaves the platter and sits in your hand, out of its sleeve
    const k = takeOff();
    if (k) setOut(k);
  };
  const putBack = (rec: Track) => {
    if (deck.track?.key === rec.key) takeOff();
    setOut(null);
    useShop.getState().putBack(rec.key);
  };
  const play = () => {
    engine.resume();
    if (!deck.motor) deck.toggleStart();
    if (!deck.needleDown) deck.dropNeedle(deck.armOnRecord ? undefined : 0);
  };
  const stop = () => stopPlatter();
  const close = () => {
    stopPlatter();
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Space plays / stops, unless a button has the focus
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || (e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT') return;
      e.preventDefault();
      const d = tt();
      if (d.loaded) (d.needleDown && d.motor ? stopPlatter : play)();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const playing = deck.needleDown && deck.motor;
  return (
    <div className="store-station" role="dialog" aria-label="Listening station">
      <div className="store-station-head">
        <h2>Listening station</h2>
        <span className="store-sub">Pick records up from the crates, then try them here before you buy.</span>
        <button className="tiny" onClick={close} title="Esc">Step away</button>
      </div>

      <div className="store-station-body">
        <div className="store-hand" aria-label="Records you're holding">
          {pile.length === 0 && <p className="store-sub">Your hands are empty. Dig through a crate and pick a few records up (<kbd>P</kbd>).</p>}
          {pile.map((k) => {
            const r = byKey.get(k);
            if (!r) return null;
            return (
              <button key={k} className={`store-hand-rec ${k === sel ? 'on' : ''}`} onClick={() => setSel(k)} aria-pressed={k === sel} title={`${r.meta.title} — ${r.meta.artist}`}>
                <SleeveImg t={r} size={110} />
                {deck.track?.key === k && <span className="store-chip">on platter</span>}
                {bag.includes(k) && deck.track?.key !== k && <span className="store-chip bag">in bag</span>}
              </button>
            );
          })}
        </div>

        <div className="store-rec">
          {!t ? (
            <p className="store-sub">Choose a record.</p>
          ) : (
            <>
              <div className={`store-sleeve-wrap ${vinylOut || onPlatter ? 'out' : ''}`}>
                <Vinyl t={t} className="store-vinyl" />
                <SleeveImg t={t} size={220} className="store-sleeve-front" />
              </div>
              <div className="store-rec-meta">
                <strong>{t.meta.title}</strong>
                <span>{t.meta.artist || 'Unknown artist'}</span>
                {onPlatter && <span className="store-sub">{formatTime(pos)} / {formatTime(deck.duration)}</span>}
              </div>
            </>
          )}
        </div>

        <div className="store-controls">
          {t && !onPlatter && !vinylOut && (
            <button className="primary" onClick={() => setOut(t.key)}>Slide the vinyl out of its sleeve</button>
          )}
          {t && !onPlatter && vinylOut && (
            <>
              <button className="primary" onClick={place} disabled={busy}>{busy ? 'Putting it on…' : deck.track ? 'Swap onto the platter' : 'Place on the platter'}</button>
              <button className="tiny" onClick={slipBack}>Slip it back in the sleeve</button>
            </>
          )}
          {t && onPlatter && (
            <>
              <div className="store-transport">
                <button className="primary" onClick={playing ? stop : play}>{playing ? '■ Stop' : '▶ Play'}</button>
                <button className={`tiny ${deck.motor ? 'on' : ''}`} onClick={() => deck.toggleStart()} title="The platter motor">Start / stop platter</button>
                <button className={`tiny ${deck.needleDown ? 'on' : ''}`} onClick={() => deck.toggleNeedle()} title="Lower or lift the needle">{deck.needleDown ? 'Lift needle' : 'Drop needle'}</button>
                <span className="store-rpm" role="group" aria-label="Speed">
                  {[33, 45].map((r) => (
                    <button key={r} className={`tiny ${deck.rpm === r ? 'on' : ''}`} onClick={() => deck.setRpm(r as 33 | 45)}>{r}</button>
                  ))}
                </span>
              </div>
              <input
                className="store-seek"
                type="range"
                min={0}
                max={Math.max(1, Math.floor(deck.duration))}
                step={0.25}
                value={Math.min(pos, deck.duration)}
                onChange={(e) => (deck.needleDown ? deck.dropNeedle(Number(e.target.value)) : deck.moveNeedle(Number(e.target.value)))}
                aria-label="Move the needle along the record"
              />
              <button className="tiny" onClick={liftOff}>Lift the record off</button>
              {!soundOn && <p className="store-sub">Click anywhere to switch the sound on.</p>}
            </>
          )}
          {t && !onPlatter && !vinylOut && deck.track && <p className="store-sub">Another record is on the platter. Placing this one will swap them.</p>}
          {t && (
            <button className="tiny store-back" onClick={() => putBack(t)} disabled={!hand.includes(t.key)}>
              Put it back in the bin
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
