import { engine } from '../audio/engine';
import { stopPlatter } from './Station';
import { useEffect, useRef, useState } from 'react';
import { toast } from '../state/toasts';
import { useWallet } from '../state/wallet';
import { track as ga } from '../analytics/ga';
import type { Track } from '../types';
import { shopSleeve } from './art';
import { BAG_LIMIT, HAND_LIMIT, isRare, money, priceOf } from './pricing';
import { useShop } from './shopState';
import { binTitle, firstWithLetter, letterOf, lettersIn, type Bin } from './stock';

/** Where you got to in each bin, so walking back to a crate picks up where you left off. */
const place = new Map<string, number>();

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function SleeveImg({ t, size = 300, className }: { t: Track; size?: number; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    void shopSleeve(t, size).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [t.key, t.artworkUrl, size]); // eslint-disable-line react-hooks/exhaustive-deps
  return url ? <img className={className} src={url} alt="" draggable={false} /> : <span className={`store-blank ${className ?? ''}`} />;
}

interface Props {
  bin: Bin;
  byKey: Map<string, Track>;
  onClose: () => void;
}

/** Flipping through a bin, one record at a time, like leafing through a crate. */
export function Dig({ bin, byKey, onClose }: Props) {
  const tracks = bin.tracks.map((t) => byKey.get(t.key) ?? t);
  const last = tracks.length - 1;
  const [i, setI] = useState(() => clamp(place.get(bin.id) ?? 0, 0, last));
  const hand = useShop((s) => s.hand);
  const bag = useShop((s) => s.bag);
  const owned = useWallet((s) => s.owned);
  const wheel = useRef(0);
  const go = (n: number) => setI((c) => clamp(n === Infinity ? last : n === -Infinity ? 0 : c + n, 0, last));
  useEffect(() => void place.set(bin.id, i), [bin.id, i]);
  useEffect(() => {
    ga('store_dig', { genre: bin.genre.slice(0, 40), records: bin.tracks.length });
  }, [bin]);

  const t = tracks[i];
  const inHand = !!t && hand.includes(t.key);
  const inBag = !!t && bag.includes(t.key);
  const mine = !!t && t.key in owned;

  const toggleBag = () => {
    if (!t || mine) return;
    if (inBag) return useShop.getState().removeFromBag(t.key);
    const r = useShop.getState().addToBag(t.key);
    if (r === 'full') toast(`Your bag's full (${BAG_LIMIT} records). Pay at the counter or take something out.`, 'warn');
    else ga('store_bag_add', { price: priceOf(t), rare: isRare(t) });
  };
  const toggleHand = () => {
    if (!t) return;
    if (inHand) {
      // it can't be back in the bin and still on the turntable
      if (engine.turntables.A.track?.key === t.key) {
        stopPlatter();
        engine.turntables.A.eject();
      }
      return useShop.getState().putBack(t.key);
    }
    const r = useShop.getState().pickUp(t.key);
    if (r === 'full') toast(`Your hands are full (${HAND_LIMIT} records). Put one back first.`, 'warn');
    else ga('store_pickup');
  };

  const stateRef = useRef({ toggleBag, toggleHand });
  stateRef.current = { toggleBag, toggleHand };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      const onButton = (e.target as HTMLElement).tagName === 'BUTTON';
      if (k === 'ArrowRight' || k === 'ArrowDown') go(e.shiftKey ? 10 : 1);
      else if (k === 'ArrowLeft' || k === 'ArrowUp') go(e.shiftKey ? -10 : -1);
      else if (k === 'PageDown') go(10);
      else if (k === 'PageUp') go(-10);
      else if (k === 'Home') go(-Infinity);
      else if (k === 'End') go(Infinity);
      else if (k.toLowerCase() === 'p' && !e.repeat) stateRef.current.toggleHand();
      else if (k.toLowerCase() === 'b' && !e.repeat) stateRef.current.toggleBag();
      else if (k === 'Enter' && !onButton && !e.repeat) stateRef.current.toggleBag();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [bin]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!t) return null;
  const letters = lettersIn(bin);
  const here = letterOf(t);
  const shown = [];
  for (let off = -6; off <= 6; off++) {
    const idx = i + off;
    if (idx < 0 || idx > last) continue;
    shown.push({ off, idx, rec: tracks[idx] });
  }

  return (
    <div
      className="store-dig"
      role="dialog"
      aria-label={`Digging in ${binTitle(bin)}`}
      onWheel={(e) => {
        wheel.current += e.deltaY + e.deltaX;
        const steps = Math.trunc(wheel.current / 45);
        if (steps) {
          wheel.current -= steps * 45;
          go(steps);
        }
      }}
    >
      <header className="store-dig-head">
        <div>
          <h2>{bin.genre}</h2>
          <span className="store-sub">
            {bin.parts > 1 ? `Bin ${bin.part} of ${bin.parts} · ${bin.range} · ` : ''}
            {bin.tracks.length} records · filed by artist
          </span>
        </div>
        <button className="tiny" onClick={onClose} title="Esc">Back to the shop</button>
      </header>

      <nav className="store-letters" aria-label="Jump to a letter">
        {letters.map((l) => (
          <button key={l} className={l === here ? 'on' : ''} onClick={() => setI(Math.max(0, firstWithLetter(bin, l)))} aria-current={l === here}>
            {l}
          </button>
        ))}
      </nav>

      <div className="store-flip" aria-live="polite">
        {shown.map(({ off, idx, rec }) => {
          const x = off === 0 ? 0 : off > 0 ? 200 + (off - 1) * 40 : -200 + (off + 1) * 40;
          const ry = off === 0 ? 0 : off > 0 ? -58 : 58;
          return (
            <button
              key={rec.key}
              className={`store-flip-sleeve ${off === 0 ? 'front' : ''}`}
              style={{ transform: `translateX(${x}px) ${off === 0 ? 'translateZ(70px)' : ''} rotateY(${ry}deg)`, zIndex: 100 - Math.abs(off), opacity: off === 0 ? 1 : Math.max(0.3, 1 - Math.abs(off) * 0.12) }}
              onClick={() => off !== 0 && setI(idx)}
              tabIndex={off === 0 ? 0 : -1}
              aria-label={`${rec.meta.title} by ${rec.meta.artist || 'unknown artist'}`}
            >
              <SleeveImg t={rec} size={off === 0 ? 360 : 220} />
              {off === 0 && (
                <span className="store-sticker" aria-hidden>
                  {rec.key in owned ? 'OWNED' : money(priceOf(rec))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <section className="store-detail">
        <div className="store-detail-meta">
          <strong>{t.meta.title}</strong>
          <span>{t.meta.artist || 'Unknown artist'}</span>
          <span className="store-sub">
            {[t.meta.album, t.meta.year, t.meta.genre].filter(Boolean).join(' · ') || 'No tags on this one'}
            {isRare(t) && <em className="store-rare">Rare pressing</em>}
          </span>
        </div>
        <div className="store-detail-actions">
          <button className={`tiny ${inHand ? 'on' : ''}`} onClick={toggleHand} title="P">
            {inHand ? 'In your hands · put back' : 'Pick up to listen'}
          </button>
          <button className="primary" onClick={toggleBag} disabled={mine} title="B or Enter">
            {mine ? 'Already yours' : inBag ? 'In your bag · take out' : `Add to bag · ${money(priceOf(t))}`}
          </button>
        </div>
        <div className="store-pos">
          {i + 1} / {tracks.length}
          <input type="range" min={0} max={last} value={i} onChange={(e) => setI(Number(e.target.value))} aria-label="Position in the bin" />
        </div>
      </section>
      <p className="store-keys">
        <kbd>←</kbd> <kbd>→</kbd> or scroll to flip · letter tabs jump ahead · <kbd>P</kbd> pick up · <kbd>B</kbd> add to bag · <kbd>Esc</kbd> back
      </p>
    </div>
  );
}
