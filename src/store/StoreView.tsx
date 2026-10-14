import { useEffect, useMemo, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { startAnalytics } from '../analytics/events';
import { track as ga } from '../analytics/ga';
import { poolTracks } from '../library/sorting';
import { setBackgroundAnalysis, supportsFolderAccess, useLibrary } from '../state/library';
import { useToasts } from '../state/toasts';
import { useWallet } from '../state/wallet';
import type { Track } from '../types';
import { ScanProgress } from '../ui/ScanProgress';
import { useTurntable } from '../ui/hooks';
import { Counter } from './Counter';
import { Dig } from './Dig';
import { money, BAG_LIMIT } from './pricing';
import { useShop } from './shopState';
import { Station, stopPlatter } from './Station';
import { Store, type StoreTarget } from './Store';
import { binTitle, stockBins, type Bin } from './stock';
import './store.css';

type View = { kind: 'walk' } | { kind: 'dig'; bin: Bin } | { kind: 'station' } | { kind: 'counter' };

function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} className={`toast ${t.tone}`} onClick={() => dismiss(t.id)}>
          {t.text}
        </button>
      ))}
    </div>
  );
}

/** What the shelves are waiting on: permission to read the folders, a scan, or music to stock. */
function Stocking({ shopEmpty }: { shopEmpty: boolean }) {
  const slots = useLibrary((s) => s.slots);
  const insert = useLibrary((s) => s.insertFolder);
  const unlock = useLibrary((s) => s.unlock);
  const locked = (['A', 'B', 'crate'] as const).filter((id) => slots[id].status === 'locked');
  const scanning = (['A', 'B', 'crate'] as const).filter((id) => slots[id].status === 'scanning');
  if (!shopEmpty && !locked.length && !scanning.length) return null;
  if (!shopEmpty) {
    return (
      <div className="store-status" role="status">
        {locked.length > 0 && (
          <button className="tiny warn" onClick={() => locked.forEach((id) => void unlock(id))}>Allow access to the rest of your music</button>
        )}
        {scanning.map((id) => <ScanProgress key={id} slot={slots[id]} noun="records" />)}
      </div>
    );
  }
  return (
    <div className="store-empty" role="dialog" aria-label="Stock the shop">
      <h2>The bins are bare</h2>
      {scanning.length > 0 ? (
        <>
          <p>Unpacking your records…</p>
          {scanning.map((id) => <ScanProgress key={id} slot={slots[id]} noun="records" />)}
        </>
      ) : locked.length > 0 ? (
        <>
          <p>Your browser needs your OK to read your music folders again this session. The shop is stocked from the same folders as your decks and crates.</p>
          <div className="row">
            <button className="primary" onClick={() => locked.forEach((id) => void unlock(id))}>Allow access</button>
          </div>
        </>
      ) : (
        <>
          <p>
            The shop sells the music on your computer as vinyl. Choose a folder of MP3s and every track is pressed to a record, filed by genre
            and alphabetically by artist. Music never leaves your computer. Folders already on your decks or crates are stocked too.
          </p>
          <div className="row">
            <button className="primary" onClick={() => void insert('crate')}>Choose a music folder</button>
          </div>
          {!supportsFolderAccess && <p className="note">This browser can't remember folders, so you'll choose again next visit. Chrome or Edge on a desktop remembers them.</p>}
        </>
      )}
    </div>
  );
}

function Prompt({ target }: { target: StoreTarget | null }) {
  const hand = useShop((s) => s.hand.length);
  if (!target) return null;
  const text =
    target.kind === 'bin'
      ? `Dig through ${binTitle(target.bin)}`
      : target.kind === 'station'
        ? hand
          ? 'Listen to the records in your hands'
          : 'Listening station (pick up a record first)'
        : 'Pay at the counter';
  return (
    <div className="step-prompt" aria-live="polite">
      <kbd>E</kbd>
      <span>{text}</span>
    </div>
  );
}

function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="store-help" onClick={(e) => e.stopPropagation()}>
        <h2 id="store-help">Digging for records</h2>
        <p>
          <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or the arrows walk, <kbd>Shift</kbd> hurries, drag to look around. Walk up to a crate
          and press <kbd>E</kbd> (or click it) to dig. The crates are filed by genre, alphabetically by artist.
        </p>
        <ol>
          <li><strong>Dig:</strong> flip through a crate with the arrows or scroll. <kbd>P</kbd> picks a record up to listen to; <kbd>B</kbd> puts it in your bag.</li>
          <li><strong>Listen:</strong> take records to the turntable on the left. Slide the vinyl out of its sleeve, put it on the platter, start the platter and lower the needle. Step away and it keeps playing while you dig.</li>
          <li><strong>Buy:</strong> pay for your bag at the counter on the right. Bought records go in the “Record store finds” crate in your collection.</li>
        </ol>
        <p className="note">The shop is stocked from your own music folders, so nothing leaves your computer. Prices are pocket money for the game: you start with {money(150)}.</p>
        <div className="help-actions">
          <button className="primary" onClick={onClose} autoFocus>Got it</button>
        </div>
      </div>
    </div>
  );
}

/** What's still spinning on the shop turntable while you wander around. */
function NowPlaying({ byKey }: { byKey: Map<string, Track> }) {
  const deck = useTurntable('A');
  if (!deck.track || !(deck.needleDown && deck.motor)) return null;
  const t = byKey.get(deck.track.key) ?? deck.track;
  return (
    <div className="store-nowplaying" role="status">
      <span className="store-nowplaying-dot" aria-hidden />
      <span>On the shop turntable: <strong>{t.meta.title}</strong>{t.meta.artist ? ` — ${t.meta.artist}` : ''}</span>
      <button className="tiny" onClick={stopPlatter}>Stop</button>
    </div>
  );
}

/** The record shop: the 3D shop and the screens for digging, listening and paying. */
export default function StoreView() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const store = useRef<Store | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setViewState] = useState<View>({ kind: 'walk' });
  const [focus, setFocus] = useState<StoreTarget | null>(null);
  const [help, setHelp] = useState(() => {
    try {
      return localStorage.getItem('cfh-store-seen') !== '1';
    } catch {
      return true;
    }
  });
  const speakers = useRef<{ gain: GainNode; pan: StereoPannerNode } | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const cash = useWallet((s) => s.cash);
  const bag = useShop((s) => s.bag);
  const hand = useShop((s) => s.hand);

  const slots = useLibrary((s) => s.slots);
  const pool = useMemo(() => poolTracks(slots), [slots]);
  const byKey = useMemo(() => new Map<string, Track>(pool.map((t) => [t.key, t])), [pool]);
  const sig = `${pool.length}|${pool[0]?.key}|${pool[pool.length - 1]?.key}`;
  const [bins, setBins] = useState<Bin[]>([]);
  // restock once the scan settles, not on every batch of 25 tracks
  useEffect(() => {
    const id = window.setTimeout(() => setBins(stockBins(pool)), pool.length ? 350 : 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // the record keeps spinning when you step away from the station and wander the shop
  const setView = (v: View) => setViewState(v);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    setBackgroundAnalysis(false);
    if (import.meta.env.DEV) (globalThis as unknown as { cfhLibrary: typeof useLibrary }).cfhLibrary = useLibrary; // for screenshots and debugging
    startAnalytics();
    void useLibrary.getState().init();
    ga('store_open');
    // the shop's turntable plays straight to the speakers, not through the mixer
    // via the shop speakers, which get quieter and pan as you walk away from the station
    const t = engine.turntables.A;
    const gain = engine.ctx.createGain();
    const pan = engine.ctx.createStereoPanner();
    t.output.disconnect();
    t.output.connect(gain).connect(pan).connect(engine.ctx.destination);
    speakers.current = { gain, pan };
    store.current?.setSpeakers(speakers.current);
    t.warmUp();
    const unlock = () => engine.resume();
    window.addEventListener('pointerdown', unlock);
    const poll = window.setInterval(() => setSuspended(engine.ctx.state !== 'running'), 500);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      clearInterval(poll);
      setBackgroundAnalysis(true);
    };
  }, []);

  useEffect(() => {
    let s: Store;
    try {
      s = new Store(canvas.current!, {
        onFocus: setFocus,
        onActivate: (t) => {
          engine.resume();
          setView(t.kind === 'bin' ? { kind: 'dig', bin: t.bin } : { kind: t.kind });
        },
      });
    } catch {
      ga('room_3d_unavailable', { reason: 'webgl_unavailable', venue: 'store' });
      setFailed(true);
      return;
    }
    store.current = s;
    if (speakers.current) s.setSpeakers(speakers.current);
    (globalThis as unknown as { store: Store }).store = s;
    return () => {
      s.dispose();
      store.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    store.current?.setBins(bins);
    // a bin you're digging in keeps the records it had when you opened it
  }, [bins]);

  useEffect(() => {
    store.current?.setView(view.kind === 'station' || view.kind === 'counter' ? view.kind : 'walk');
    store.current?.setBlocked(view.kind !== 'walk' || help);
  }, [view, help]);

  // Escape: close the help, then the bag, then step away from whatever you're using
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (help) return closeHelp();
      if (bagOpen) return setBagOpen(false);
      if (viewRef.current.kind !== 'walk') setView({ kind: 'walk' });
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [help, bagOpen]);

  const closeHelp = () => {
    setHelp(false);
    try {
      localStorage.setItem('cfh-store-seen', '1');
    } catch {
      /* storage blocked: the intro just shows again next time */
    }
  };

  return (
    <div className={`app venue-store store-view mode-${view.kind}`}>
      <div className="store-stage">
        <canvas ref={canvas} className="room-canvas" aria-label="A record shop: crates of vinyl by genre, a listening station and a counter" />
      </div>
      {failed && <div className="room-failed">3D isn't available in this browser, so the record shop can't open.</div>}

      <header className="topbar">
        <div className="brand">
          <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden>
            <circle cx="20" cy="32" r="13" fill="none" stroke="var(--deck-a)" strokeWidth="5" />
            <circle cx="44" cy="32" r="13" fill="none" stroke="var(--deck-b)" strokeWidth="5" />
            <rect x="25" y="28" width="14" height="8" rx="2" fill="var(--text)" />
          </svg>
          <span className="wordmark">Crossfader Hero</span>
          <span className="venue">Record store</span>
          <a className="venue-switch" href="/" title="Back to your bedroom">Bedroom</a>
          <a className="venue-switch" href="/club" title="Play the club">The club</a>
        </div>
        <div className="topbar-right">
          {suspended && (
            <button className="tiny warn" onClick={() => engine.resume()}>Turn on sound</button>
          )}
          <span className="store-chip cash" title="Your cash">{money(cash)}</span>
          <button className={`tiny ${bagOpen ? 'on' : ''}`} onClick={() => setBagOpen((o) => !o)} aria-expanded={bagOpen} title="Your record bag">
            Bag {bag.length}/{BAG_LIMIT}
          </button>
          <span className="store-chip" title="Records in your hands">In hand {hand.length}</span>
          <button className="tiny" onClick={() => setHelp(true)}>How it works</button>
        </div>
      </header>

      {view.kind === 'walk' && !help && (
        <>
          <Prompt target={focus} />
          <div className="room-hints"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk</span><span>drag to look</span><span><kbd>E</kbd> use</span></div>
          <Stocking shopEmpty={pool.length === 0} />
          <NowPlaying byKey={byKey} />
        </>
      )}

      {bagOpen && view.kind !== 'counter' && (
        <aside className="store-bagpop" aria-label="Your record bag">
          <h3>Record bag</h3>
          {bag.length === 0 ? (
            <p className="store-sub">Empty. Add records from the crates.</p>
          ) : (
            <ul>
              {bag.map((k) => {
                const t = byKey.get(k);
                return (
                  <li key={k}>
                    <span>{t ? `${t.meta.artist ? `${t.meta.artist} — ` : ''}${t.meta.title}` : 'Missing record'}</span>
                    <button className="tiny" onClick={() => useShop.getState().removeFromBag(k)}>Put back</button>
                  </li>
                );
              })}
            </ul>
          )}
          <button className="tiny" onClick={() => (setBagOpen(false), setView({ kind: 'counter' }))} disabled={!bag.length}>Go to the counter</button>
        </aside>
      )}

      {view.kind === 'dig' && <Dig key={view.bin.id} bin={view.bin} byKey={byKey} onClose={() => setView({ kind: 'walk' })} />}
      {view.kind === 'station' && <Station byKey={byKey} onClose={() => setView({ kind: 'walk' })} />}
      {view.kind === 'counter' && <Counter byKey={byKey} onClose={() => setView({ kind: 'walk' })} />}

      {help && <Help onClose={closeHelp} />}
      <Toasts />
      <div className="small-screen">The record shop needs a screen at least 1100 px wide. Open it on a laptop or desktop.</div>
    </div>
  );
}
