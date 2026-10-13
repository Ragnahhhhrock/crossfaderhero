import { useEffect, useMemo, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { supportsFolderAccess, useLibrary } from '../state/library';
import { toast } from '../state/toasts';
import { sleeveUrl } from '../library/sleeve';
import type { DeckId, Track } from '../types';
import { formatTime, useMixer, useTurntable } from './hooks';
import { useSetup } from '../state/setup';
import { ScanProgress } from './ScanProgress';

type SortKey = 'title' | 'artist' | 'bpm' | 'key' | 'genre';

async function putOn(id: DeckId, t: Track) {
  const r = await engine.loadRecord(id, t);
  if (!r.ok && r.reason) return toast(r.reason, 'warn');
  // with both pairs on the desk, flip the channel to phono if nothing's playing through it
  const m = engine.mixer;
  if (useSetup.getState().gear === 'both' && m.state[id].input === 'cd' && !engine.decks[id].playing) {
    m.setInput(id, 'phono');
    toast(`Channel ${id} switched to Phono for turntable ${id}.`);
  }
}

function camelotOrder(c?: string): number {
  const m = /^(\d+)([AB])$/.exec(c ?? '');
  return m ? Number(m[1]) * 2 + (m[2] === 'B' ? 1 : 0) : 99;
}

function sortValue(t: Track, k: SortKey): string | number {
  switch (k) {
    case 'title': return t.meta.title.toLowerCase();
    case 'artist': return t.meta.artist.toLowerCase();
    case 'genre': return t.meta.genre.toLowerCase();
    case 'bpm': return t.analysis?.bpm ?? 9999;
    case 'key': return camelotOrder(t.analysis?.camelot);
  }
}

/** One record standing in the crate: its sleeve, drawn when it scrolls into view. */
function Sleeve({ t, selected, onSelect, onPlay }: { t: Track; selected: boolean; onSelect: () => void; onPlay: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const pressing = !t.analysis && t.analysisState !== 'error';
  const ready = !!t.analysis;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        void sleeveUrl(t).then((u) => live && setUrl(u));
      }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => {
      live = false;
      io.disconnect();
    };
    // redraw once the BPM/key are known (they're written on the sleeve)
  }, [t, ready]);
  const onA = engine.turntables.A.track?.key === t.key;
  const onB = engine.turntables.B.track?.key === t.key;
  return (
    <button
      ref={ref}
      className={`sleeve ${selected ? 'pulled' : ''}`}
      onClick={onSelect}
      onDoubleClick={onPlay}
      aria-pressed={selected}
      aria-label={`${t.meta.title} by ${t.meta.artist || 'unknown artist'}${t.analysis ? `, ${Math.round(t.analysis.bpm)} BPM, ${t.analysis.camelot}` : ''}`}
      title={`${t.meta.title} — ${t.meta.artist}`}
    >
      {url ? <img src={url} alt="" draggable={false} /> : <span className="sleeve-blank" />}
      {pressing && <span className="pressing">Pressing…</span>}
      {(onA || onB) && <span className="on-deck">{onA && onB ? 'A + B' : onA ? 'On A' : 'On B'}</span>}
    </button>
  );
}

function CrateEmpty() {
  const insert = useLibrary((s) => s.insertFolder);
  return (
    <div className="usb-empty">
      <h2>Fill a record crate</h2>
      <p>
        Choose a folder of MP3s. Every track is pressed to its own vinyl record — cover art on the sleeve, the BPM and key
        marked on the corner — and stacked in a crate next to the decks. Each folder becomes a crate. Music never leaves your computer.
      </p>
      <button className="primary" onClick={() => insert('crate')}>Choose a folder for a crate</button>
      {!supportsFolderAccess && <p className="note">This browser can't remember folders, so you'll fill the crates again each visit. Chrome or Edge on a desktop remembers them.</p>}
    </div>
  );
}

function CrateLocked() {
  const { unlock, eject } = useLibrary.getState();
  const folders = useLibrary((s) => s.slots.crate.folders);
  return (
    <div className="usb-empty">
      <h2>Your crates are still here</h2>
      <p>Your browser needs your OK to read {folders.map((f) => `“${f.name}”`).join(', ')} again this session.</p>
      <div className="row">
        <button className="primary" onClick={() => unlock('crate')}>Allow access</button>
        <button onClick={() => eject('crate')}>Empty the crates</button>
      </div>
    </div>
  );
}

/** The pulled-out record: big sleeve and where to put it. */
function Pulled({ t }: { t: Track }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void sleeveUrl(t, 360).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [t, t.analysis]);
  const A = useTurntable('A');
  const B = useTurntable('B');
  useMixer();
  const a = t.analysis;
  const button = (id: DeckId, tt: typeof A) => {
    const busy = tt.playing && engine.mixer.state[id].input === 'phono' && engine.mixer.onAir(id);
    return (
      <button className={`primary put-${id.toLowerCase()}`} disabled={busy || tt.loading} onClick={() => putOn(id, t)} title={busy ? `Turntable ${id} is playing on air` : undefined}>
        {tt.track?.key === t.key ? `On turntable ${id} ✓` : `Put on turntable ${id}`}
      </button>
    );
  };
  return (
    <aside className="pulled-record">
      {url ? <img src={url} alt="" /> : <span className="sleeve-blank big" />}
      <div className="pulled-meta">
        <strong>{t.meta.title}</strong>
        <span>{t.meta.artist || 'Unknown artist'}</span>
        <span className="muted">
          {a ? `${a.bpm.toFixed(a.bpm % 1 ? 1 : 0)} BPM · ${a.camelot} · ${formatTime(a.duration).replace(/\.\d$/, '')}` : t.analysisState === 'error' ? 'Couldn’t read this one' : 'Pressing…'}
          {t.meta.genre ? ` · ${t.meta.genre}` : ''}
        </span>
      </div>
      <div className="pulled-actions">
        {button('A', A)}
        {button('B', B)}
      </div>
      <p className="note">Want a double for beat juggling? Put the same record on both turntables.</p>
    </aside>
  );
}

/** The record crates: flip through, pull a record, put it on a turntable. */
export function Crates() {
  const slot = useLibrary((s) => s.slots.crate);
  const analysing = useLibrary((s) => s.analysing);
  const { insertFolder, removeFolder } = useLibrary.getState();
  const [crate, setCrate] = useState<number | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('bpm');
  const [pulled, setPulled] = useState<string | null>(null);
  useTurntable('A');
  useTurntable('B');

  const counts = useMemo(() => {
    const c = slot.folders.map(() => 0);
    for (const t of slot.tracks) c[t.folder] = (c[t.folder] ?? 0) + 1;
    return c;
  }, [slot.tracks, slot.folders]);

  const records = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = slot.tracks.filter(
      (t) => (crate === 'all' || t.folder === crate) && (!q || `${t.meta.title} ${t.meta.artist} ${t.meta.genre}`.toLowerCase().includes(q)),
    );
    list.sort((a, b) => {
      const va = sortValue(a, sort);
      const vb = sortValue(b, sort);
      return va < vb ? -1 : va > vb ? 1 : 0;
    });
    return list;
  }, [slot.tracks, crate, query, sort]);

  const pulledTrack = pulled ? slot.tracks.find((t) => t.key === pulled) ?? null : null;
  const pressingCount = slot.tracks.filter((t) => !t.analysis && t.analysisState !== 'error').length;

  // a quick double-click puts it on whichever turntable isn't playing on air
  const quickPut = (t: Track) => {
    const free = (['A', 'B'] as DeckId[]).find((id) => !(engine.turntables[id].playing && engine.mixer.onAir(id))) ?? 'A';
    void putOn(free, t);
  };

  return (
    <section className="browser crates" aria-label="Record crates">
      <div className="browser-bar">
        <div className="tabs" role="tablist">
          {slot.folders.length > 1 && (
            <button role="tab" aria-selected={crate === 'all'} className={`tab ${crate === 'all' ? 'on' : ''}`} onClick={() => setCrate('all')}>
              All crates <span className="count">{slot.tracks.length}</span>
            </button>
          )}
          {slot.folders.map((f, i) => (
            <span key={`${f.name}-${i}`} className={`tab crate-tab ${crate === i || (crate === 'all' && slot.folders.length === 1) ? 'on' : ''}`}>
              <button role="tab" aria-selected={crate === i} onClick={() => setCrate(i)}>
                {f.name} <span className="count">{counts[i] ?? 0}</span>
              </button>
              <button
                className="crate-x"
                aria-label={`Remove crate ${f.name}`}
                onClick={() => {
                  setCrate('all');
                  void removeFolder('crate', i);
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {slot.status !== 'empty' && slot.status !== 'locked' && (
          <button className="tiny" onClick={() => insertFolder('crate')}>New crate from folder</button>
        )}
        <select className="tiny sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort records">
          <option value="bpm">By BPM</option>
          <option value="key">By key</option>
          <option value="title">By title</option>
          <option value="artist">By artist</option>
          <option value="genre">By genre</option>
        </select>
        <input
          className="search"
          type="search"
          placeholder="Search the crates"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search records"
          onKeyDown={(e) => e.stopPropagation()}
        />
        <span className="status">
          {slot.status === 'scanning' ? <ScanProgress slot={slot} noun="records" /> : pressingCount && analysing ? `Pressing ${pressingCount} record${pressingCount === 1 ? '' : 's'}…` : ''}
        </span>
      </div>

      {slot.status === 'empty' ? (
        <CrateEmpty />
      ) : slot.status === 'locked' ? (
        <CrateLocked />
      ) : (
        <div className="crate-body">
          <div className="crate-records" role="list">
            {records.length === 0 && slot.status === 'ready' && (
              <p className="empty-rows">{query ? 'No records match that search.' : 'No MP3s in this folder. Make a crate from another folder.'}</p>
            )}
            {records.map((t) => (
              <Sleeve key={t.key} t={t} selected={pulled === t.key} onSelect={() => setPulled(t.key === pulled ? null : t.key)} onPlay={() => quickPut(t)} />
            ))}
          </div>
          {pulledTrack ? (
            <Pulled t={pulledTrack} />
          ) : (
            <aside className="pulled-record hint">
              <p>Flip through and click a sleeve to pull the record out. Double-click to put it straight on a free turntable.</p>
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
