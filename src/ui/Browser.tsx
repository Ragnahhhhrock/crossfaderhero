import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { engine } from '../audio/engine';
import { supportsFolderAccess, useLibrary } from '../state/library';
import { toast } from '../state/toasts';
import type { DeckId, Track } from '../types';
import { formatTime, useDeck } from './hooks';
import { ScanProgress } from './ScanProgress';
import { Organizer } from './Organizer';
import { useCollection } from '../state/collection';
import { bytesUsed, formatBytes, poolTracks, resolve } from '../library/sorting';
import { artworkUrlOf } from '../library/cover';

type SortKey = 'title' | 'artist' | 'bpm' | 'key' | 'genre' | 'time';
const ROW = 34;

async function loadTo(id: DeckId, t: Track) {
  const r = await engine.loadTrack(id, t);
  if (!r.ok && r.reason) toast(r.reason, 'warn');
}

function sortValue(t: Track, k: SortKey): string | number {
  switch (k) {
    case 'title': return t.meta.title.toLowerCase();
    case 'artist': return t.meta.artist.toLowerCase();
    case 'genre': return t.meta.genre.toLowerCase();
    case 'bpm': return t.analysis?.bpm ?? 9999;
    case 'key': {
      const m = /^(\d+)([AB])$/.exec(t.analysis?.camelot ?? '');
      return m ? Number(m[1]) * 2 + (m[2] === 'B' ? 1 : 0) : 99;
    }
    case 'time': return t.analysis?.duration ?? 0;
  }
}

function UsbEmpty({ slot }: { slot: DeckId }) {
  const insert = useLibrary((s) => s.insertFolder);
  return (
    <div className="usb-empty">
      <h2>Plug in USB {slot}</h2>
      <p>
        Pick a folder of MP3s on this computer. The deck reads them straight from your drive — nothing is uploaded.
        You can add more folders to the same USB afterwards.
      </p>
      <button className="primary" onClick={() => insert(slot)}>
        Choose music folder
      </button>
      {!supportsFolderAccess && (
        <p className="note">
          This browser can't remember folders, so you'll choose them again each visit. Chrome or Edge on a desktop remembers them.
        </p>
      )}
    </div>
  );
}

function UsbLocked({ slot }: { slot: DeckId }) {
  const { unlock, eject } = useLibrary.getState();
  const folders = useLibrary((s) => s.slots[slot].folders);
  return (
    <div className="usb-empty">
      <h2>USB {slot} is still plugged in</h2>
      <p>Your browser needs your OK to read {folders.map((f) => `“${f.name}”`).join(', ')} again this session.</p>
      <div className="row">
        <button className="primary" onClick={() => unlock(slot)}>Allow access</button>
        <button onClick={() => eject(slot)}>Eject</button>
      </div>
    </div>
  );
}

export function Browser() {
  /** USB A / B (folders), or the id of one of your sorted USB drives. */
  const [tab, setTab] = useState<string>('A');
  const [sorting, setSorting] = useState(false);
  const usbs = useCollection((c) => c.usbs);
  const drive = usbs.find((u) => u.id === tab);
  const slot: DeckId = tab === 'B' ? 'B' : 'A';
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'title', dir: 1 });
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(300);
  const scroller = useRef<HTMLDivElement>(null);
  const slots = useLibrary((s) => s.slots);
  const analysing = useLibrary((s) => s.analysing);
  const queued = useLibrary((s) => s.queued);
  const { insertFolder, eject, removeFolder } = useLibrary.getState();
  const folderSlot = slots[slot];
  const pool = useMemo(() => poolTracks(slots), [slots]);
  const driveTracks = useMemo(() => (drive ? resolve(drive.keys, new Map(pool.map((t) => [t.key, t]))) : []), [drive, pool]);
  // a sorted drive reads like a USB that's always plugged in
  const s = drive ? { ...folderSlot, status: 'ready' as const, tracks: driveTracks, found: driveTracks.length } : folderSlot;
  useEffect(() => {
    if (tab !== 'A' && tab !== 'B' && !drive) setTab('A');
  }, [tab, drive]);
  useDeck('A');
  useDeck('B');

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [s.status]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? s.tracks.filter((t) => `${t.meta.title} ${t.meta.artist} ${t.meta.genre} ${t.path}`.toLowerCase().includes(q))
      : s.tracks.slice();
    list.sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
    return list;
  }, [s.tracks, query, sort]);

  const first = Math.max(0, Math.floor(scrollTop / ROW) - 5);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW) + 5);

  const header = (k: SortKey, label: string, cls = '') => (
    <button
      className={`th ${cls} ${sort.key === k ? 'sorted' : ''}`}
      onClick={() => setSort((p) => ({ key: k, dir: p.key === k ? (-p.dir as 1 | -1) : 1 }))}
      aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {sort.key === k ? (sort.dir === 1 ? ' ▴' : ' ▾') : ''}
    </button>
  );

  return (
    <section className="browser" aria-label="Music browser">
      <div className="browser-bar">
        <div className="tabs" role="tablist">
          {(['A', 'B'] as DeckId[]).map((id) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`tab tab-${id.toLowerCase()} ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
              USB {id}
              <span className="count">{slots[id].status === 'empty' ? 'empty' : slots[id].found}</span>
            </button>
          ))}
          {usbs.map((u) => (
            <button
              key={u.id}
              role="tab"
              aria-selected={tab === u.id}
              className={`tab tab-usb ${tab === u.id ? 'on' : ''}`}
              style={{ '--accent': `var(--${u.colour})` } as CSSProperties}
              onClick={() => setTab(u.id)}
              title={`Sorted USB drive “${u.name}”`}
            >
              <i className="usb-dot" />
              {u.name}
              <span className="count">{u.keys.length}</span>
            </button>
          ))}
        </div>
        <button className="tiny" onClick={() => setSorting(true)} title="Sort your music into USB drives and record crates">
          Sort into USBs
        </button>
        {drive && (
          <span className="drive-size">
            {formatBytes(bytesUsed(driveTracks))} of {drive.capacityGb} GB
            {driveTracks.length < drive.keys.length ? ` · ${drive.keys.length - driveTracks.length} not plugged in` : ''}
          </span>
        )}
        {!drive && s.status !== 'empty' && s.status !== 'locked' && (
          <div className="folders">
            {s.folders.map((f, i) => (
              <span className="folder-chip" key={`${f.name}-${i}`}>
                {f.name}
                <button aria-label={`Remove folder ${f.name}`} onClick={() => removeFolder(slot, i)}>×</button>
              </span>
            ))}
            <button className="tiny" onClick={() => insertFolder(slot)}>Add folder</button>
            <button className="tiny" onClick={() => eject(slot)}>Eject</button>
          </div>
        )}
        <input
          className="search"
          type="search"
          placeholder="Search title, artist, genre"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search tracks"
          onKeyDown={(e) => e.stopPropagation()}
        />
        <span className="status">
          {s.status === 'scanning' ? <ScanProgress slot={s} noun="tracks" /> : analysing ? `Analysing ${queued} track${queued === 1 ? '' : 's'}…` : ''}
        </span>
      </div>

      {sorting && <Organizer start="usb" onClose={() => setSorting(false)} />}
      {drive && driveTracks.length === 0 ? (
        <div className="usb-empty">
          <h2>“{drive.name}” is empty</h2>
          <p>{drive.keys.length ? 'Its folders aren’t plugged in this session — choose them on USB A or B first.' : 'Copy some tracks onto it.'}</p>
          <button className="primary" onClick={() => setSorting(true)}>Sort into USBs</button>
        </div>
      ) : s.status === 'empty' ? (
        <UsbEmpty slot={slot} />
      ) : s.status === 'locked' ? (
        <UsbLocked slot={slot} />
      ) : (
        <div className="table" role="table" aria-rowcount={rows.length}>
          <div className="thead" role="row">
            <span className="th art" />
            {header('title', 'Title', 'grow')}
            {header('artist', 'Artist', 'grow')}
            {header('bpm', 'BPM', 'num')}
            {header('key', 'Key', 'num')}
            {header('genre', 'Genre')}
            {header('time', 'Time', 'num')}
            <span className="th load">Load</span>
          </div>
          <div
            className="tbody"
            ref={scroller}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
            {rows.length === 0 && s.status === 'ready' && (
              <p className="empty-rows">{query ? 'No tracks match that search.' : drive ? 'Nothing on this drive yet.' : 'No MP3 files in this folder. Add another folder to this USB.'}</p>
            )}
            <div style={{ height: rows.length * ROW, position: 'relative' }}>
              {rows.slice(first, last).map((t, i) => {
                const a = t.analysis;
                const loadedOn = (['A', 'B'] as DeckId[]).filter((d) => engine.decks[d].track?.key === t.key);
                return (
                  <div
                    className={`tr ${loadedOn.length ? 'loaded' : ''}`}
                    role="row"
                    key={t.key}
                    style={{ top: (first + i) * ROW }}
                    onDoubleClick={() => loadTo(slot, t)}
                  >
                    <span className="td art">{artworkUrlOf(t) ? <img src={artworkUrlOf(t)} alt="" loading="lazy" /> : <i />}</span>
                    <span className="td grow title" title={t.path}>{t.meta.title}</span>
                    <span className="td grow">{t.meta.artist}</span>
                    <span className="td num">
                      {a ? a.bpm.toFixed(a.bpm % 1 ? 2 : 0) : t.analysisState === 'running' || analysing === t.key ? <span className="spin" aria-label="Analysing" /> : t.analysisState === 'error' ? '!' : '…'}
                    </span>
                    <span className="td num" title={a?.key}>{a?.camelot ?? ''}</span>
                    <span className="td genre">{t.meta.genre}</span>
                    <span className="td num">{a ? formatTime(a.duration).replace(/\.\d$/, '') : ''}</span>
                    <span className="td load">
                      <button className="tiny load-a" onClick={() => loadTo('A', t)} aria-label={`Load ${t.meta.title} to deck A`}>A</button>
                      <button className="tiny load-b" onClick={() => loadTo('B', t)} aria-label={`Load ${t.meta.title} to deck B`}>B</button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
