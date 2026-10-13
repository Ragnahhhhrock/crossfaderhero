import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLibrary } from '../state/library';
import { useCollection, type SortedCrate, type SortedUsb, type Target } from '../state/collection';
import { toast } from '../state/toasts';
import {
  CRATE_BY,
  CRATE_HOLDS,
  USB_SIZES,
  bytesUsed,
  formatBytes,
  groupTracks,
  labelFor,
  matches,
  poolTracks,
  resolve,
  type CrateBy,
} from '../library/sorting';
import type { Track } from '../types';

const ROW = 32;
type Facet = 'genre' | 'artist' | 'period';
const same = (a: Target | null, b: Target | null) => !!a && !!b && a.kind === b.kind && a.id === b.id;
const tKey = (t: Target) => `${t.kind}:${t.id}`;
const fromKey = (k: string): Target | null => {
  const [kind, id] = k.split(':');
  return (kind === 'usb' || kind === 'crate') && id ? { kind, id } : null;
};

/** The music library + all your USB drives and crates, side by side. Tick tracks and send them somewhere. */
export function Organizer({ start = 'usb', onClose }: { start?: 'usb' | 'crate'; onClose: () => void }) {
  const slots = useLibrary((s) => s.slots);
  const usbs = useCollection((s) => s.usbs);
  const crates = useCollection((s) => s.crates);
  const col = useCollection.getState();

  const pool = useMemo(() => poolTracks(slots), [slots]);
  const byKey = useMemo(() => new Map(pool.map((t) => [t.key, t])), [pool]);

  const [side, setSide] = useState<'usb' | 'crate'>(start);
  const [view, setView] = useState<Target | null>(null);
  const [query, setQuery] = useState('');
  const [facet, setFacet] = useState<Facet>('genre');
  const [facetValue, setFacetValue] = useState('');
  const [unsortedOnly, setUnsortedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dest, setDest] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(400);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // where each track has been sorted to
  const homes = useMemo(() => {
    const m = new Map<string, { usbs: SortedUsb[]; crates: SortedCrate[] }>();
    const get = (k: string) => m.get(k) ?? (m.set(k, { usbs: [], crates: [] }), m.get(k)!);
    for (const u of usbs) for (const k of u.keys) get(k).usbs.push(u);
    for (const c of crates) for (const k of c.keys) get(k).crates.push(c);
    return m;
  }, [usbs, crates]);

  const viewed = view ? (view.kind === 'usb' ? usbs.find((u) => u.id === view.id) : crates.find((c) => c.id === view.id)) : undefined;
  useEffect(() => {
    if (view && !viewed) setView(null);
  }, [view, viewed]);

  const facetGroups = useMemo(() => groupTracks(pool, facet).filter((g) => g.label !== null), [pool, facet]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = viewed ? resolve(viewed.keys, byKey) : pool;
    if (facetValue) list = list.filter((t) => matches(t, facet, facetValue));
    if (unsortedOnly) list = list.filter((t) => !homes.has(t.key));
    if (q) list = list.filter((t) => `${t.meta.title} ${t.meta.artist} ${t.meta.genre} ${t.meta.year ?? ''}`.toLowerCase().includes(q));
    return list;
  }, [viewed, byKey, pool, facet, facetValue, unsortedOnly, homes, query]);

  // a sensible destination: the one you're looking at, else the first on this side
  const targets: Target[] = [...usbs.map((u) => ({ kind: 'usb' as const, id: u.id })), ...crates.map((c) => ({ kind: 'crate' as const, id: c.id }))];
  const destTarget = fromKey(dest) && targets.some((t) => tKey(t) === dest) ? fromKey(dest) : view ?? targets.find((t) => t.kind === side) ?? targets[0] ?? null;

  const sendTo = (t: Target, tracks: Track[]) => {
    if (!tracks.length) return;
    const name = t.kind === 'usb' ? usbs.find((u) => u.id === t.id)?.name : crates.find((c) => c.id === t.id)?.name;
    const { added, full } = col.addTracks(t, tracks);
    if (t.kind === 'usb' && full) toast(`“${name}” is full — ${added} of ${tracks.length} copied. Use a bigger stick or another USB.`, 'warn');
    else if (t.kind === 'crate' && full) toast(`${added} record${added === 1 ? '' : 's'} into “${name}” — it's over ${CRATE_HOLDS} now; consider splitting it.`);
    else toast(added ? `${added} ${t.kind === 'usb' ? 'track' : 'record'}${added === 1 ? '' : 's'} ${t.kind === 'usb' ? 'copied to' : 'filed in'} “${name}”.` : `Already all in “${name}”.`);
  };

  const selectedTracks = () => resolve([...selected], byKey);
  const allShownSelected = rows.length > 0 && rows.every((t) => selected.has(t.key));
  const toggle = (k: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const onDragStart = (e: DragEvent, t: Track) => {
    const keys = selected.has(t.key) ? [...selected] : [t.key];
    e.dataTransfer.setData('application/x-cfh-tracks', JSON.stringify(keys));
    e.dataTransfer.effectAllowed = 'copy';
  };
  const dropOn = (e: DragEvent, t: Target) => {
    e.preventDefault();
    try {
      const keys = JSON.parse(e.dataTransfer.getData('application/x-cfh-tracks')) as string[];
      sendTo(t, resolve(keys, byKey));
    } catch {
      /* not ours */
    }
  };

  const first = Math.max(0, Math.floor(scrollTop / ROW) - 5);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW) + 5);

  return createPortal(
    <div className="modal-backdrop organiser-backdrop" onClick={onClose}>
      <div
        className="modal organiser"
        role="dialog"
        aria-modal="true"
        aria-labelledby="org-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key !== 'Escape' && e.stopPropagation()}
      >
        <header className="org-head">
          <h2 id="org-title">Sort your music</h2>
          <p>Tick tracks (or drag them) into USB drives for the CDJs and labelled crates for the turntables. A track can live on as many as you like.</p>
          <button className="tiny drawer-close" onClick={onClose}>Done</button>
        </header>

        {pool.length === 0 ? (
          <div className="usb-empty">
            <h2>No music to sort yet</h2>
            <p>Choose a folder of MP3s first — every track you add becomes part of your collection, ready to sort.</p>
            <button className="primary" onClick={() => useLibrary.getState().insertFolder('A')}>Choose music folder</button>
          </div>
        ) : (
          <div className="org-body">
            <section className="org-library" aria-label="Your music">
              <div className="org-tools">
                <input
                  className="search"
                  type="search"
                  placeholder="Search title, artist, genre, year"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search your music"
                />
                <select className="tiny" value={facet} onChange={(e) => (setFacet(e.target.value as Facet), setFacetValue(''))} aria-label="Filter by">
                  <option value="genre">Genre</option>
                  <option value="artist">Artist</option>
                  <option value="period">Period</option>
                </select>
                <select className="tiny" value={facetValue} onChange={(e) => setFacetValue(e.target.value)} aria-label={`Only this ${facet}`}>
                  <option value="">Any {facet}</option>
                  {facetGroups.map((g) => (
                    <option key={g.label} value={g.label!}>{g.label} ({g.tracks.length})</option>
                  ))}
                </select>
                <label className="org-check">
                  <input type="checkbox" checked={unsortedOnly} onChange={(e) => setUnsortedOnly(e.target.checked)} /> Not sorted yet
                </label>
              </div>

              <div className="org-viewing">
                {viewed ? (
                  <>
                    <span>
                      Showing <strong>{viewed.name}</strong> · {rows.length} of {viewed.keys.length}
                      {resolve(viewed.keys, byKey).length < viewed.keys.length ? ` (${viewed.keys.length - resolve(viewed.keys, byKey).length} not plugged in)` : ''}
                    </span>
                    <button className="tiny" onClick={() => setView(null)}>Back to all music</button>
                  </>
                ) : (
                  <span>All music · {rows.length === pool.length ? pool.length : `${rows.length} of ${pool.length}`} tracks</span>
                )}
              </div>

              <div className="org-actions">
                <label className="org-check">
                  <input
                    type="checkbox"
                    checked={allShownSelected}
                    onChange={() =>
                      setSelected((s) => {
                        const n = new Set(s);
                        for (const t of rows) allShownSelected ? n.delete(t.key) : n.add(t.key);
                        return n;
                      })
                    }
                    aria-label="Select all shown"
                  />
                  {selected.size ? `${selected.size} selected` : 'Select all'}
                </label>
                {selected.size > 0 && <button className="tiny" onClick={() => setSelected(new Set())}>Clear</button>}
                <span className="grow" />
                {targets.length > 0 && destTarget && (
                  <>
                    <select className="tiny" value={tKey(destTarget)} onChange={(e) => setDest(e.target.value)} aria-label="Send to">
                      {usbs.length > 0 && (
                        <optgroup label="USB drives">
                          {usbs.map((u) => <option key={u.id} value={`usb:${u.id}`}>{u.name}</option>)}
                        </optgroup>
                      )}
                      {crates.length > 0 && (
                        <optgroup label="Crates">
                          {crates.map((c) => <option key={c.id} value={`crate:${c.id}`}>{c.name}</option>)}
                        </optgroup>
                      )}
                    </select>
                    <button className="primary tiny" disabled={!selected.size} onClick={() => (sendTo(destTarget, selectedTracks()), setSelected(new Set()))}>
                      Add {selected.size || ''} {destTarget.kind === 'usb' ? 'to USB' : 'to crate'}
                    </button>
                  </>
                )}
                {viewed && view && selected.size > 0 && (
                  <button
                    className="tiny danger"
                    onClick={() => {
                      col.removeKeys(view, [...selected]);
                      setSelected(new Set());
                    }}
                  >
                    Remove {selected.size} from {viewed.name}
                  </button>
                )}
              </div>

              <div className="org-list" ref={scroller} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} role="list">
                {rows.length === 0 && <p className="empty-rows">{viewed && !viewed.keys.length ? 'Empty — tick tracks in All music and add them here.' : 'Nothing matches.'}</p>}
                <div style={{ height: rows.length * ROW, position: 'relative' }}>
                  {rows.slice(first, last).map((t, i) => {
                    const h = homes.get(t.key);
                    return (
                      <label
                        key={t.key}
                        className={`org-row ${selected.has(t.key) ? 'on' : ''}`}
                        style={{ top: (first + i) * ROW }}
                        draggable
                        onDragStart={(e) => onDragStart(e, t)}
                        role="listitem"
                      >
                        <input type="checkbox" checked={selected.has(t.key)} onChange={() => toggle(t.key)} />
                        <span className="grow title" title={t.path}>{t.meta.title}</span>
                        <span className="grow muted">{t.meta.artist}</span>
                        <span className="genre muted">{t.meta.genre}</span>
                        <span className="num muted">{t.meta.year ?? ''}</span>
                        <span className="num muted">{t.analysis ? Math.round(t.analysis.bpm) : ''}</span>
                        <span className="homes" title={h ? [...h.usbs.map((u) => `USB: ${u.name}`), ...h.crates.map((c) => `Crate: ${c.name}`)].join('\n') : 'Not sorted yet'}>
                          {h?.usbs.map((u) => <i key={u.id} className="usb-dot" style={{ '--accent': `var(--${u.colour})` } as CSSProperties} />)}
                          {h && h.crates.length > 0 && <i className="crate-dot">{h.crates.length}</i>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="org-targets" aria-label="USB drives and crates">
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={side === 'usb'} className={`tab ${side === 'usb' ? 'on' : ''}`} onClick={() => setSide('usb')}>
                  USB drives <span className="count">{usbs.length}</span>
                </button>
                <button role="tab" aria-selected={side === 'crate'} className={`tab ${side === 'crate' ? 'on' : ''}`} onClick={() => setSide('crate')}>
                  Crates <span className="count">{crates.length}</span>
                </button>
              </div>

              {side === 'usb' ? (
                <UsbList
                  usbs={usbs}
                  byKey={byKey}
                  view={view}
                  onView={(t) => (setView(same(view, t) ? null : t), setDest(tKey(t)), setSelected(new Set()))}
                  onDrop={dropOn}
                />
              ) : (
                <CrateList
                  crates={crates}
                  pool={pool}
                  byKey={byKey}
                  view={view}
                  onView={(t) => (setView(same(view, t) ? null : t), setDest(tKey(t)), setSelected(new Set()))}
                  onDrop={dropOn}
                  onFill={(c) => sendTo({ kind: 'crate', id: c.id }, pool.filter((t) => matches(t, c.by, c.name)))}
                />
              )}
            </section>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function TargetCard({
  t,
  name,
  active,
  onView,
  onDrop,
  style,
  children,
  meta,
}: {
  t: Target;
  name: string;
  active: boolean;
  onView: (t: Target) => void;
  onDrop: (e: DragEvent, t: Target) => void;
  style?: CSSProperties;
  children?: React.ReactNode;
  meta: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const { rename, remove } = useCollection.getState();
  return (
    <div
      className={`org-card ${t.kind} ${active ? 'on' : ''} ${over ? 'drop' : ''}`}
      style={style}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => (setOver(false), onDrop(e, t))}
    >
      <div className="org-card-top">
        {editing ? (
          <input
            className="search"
            autoFocus
            defaultValue={name}
            aria-label="Name"
            onBlur={(e) => (rename(t, e.target.value), setEditing(false))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') (e.stopPropagation(), setEditing(false));
            }}
          />
        ) : (
          <button className="org-card-name" onClick={() => onView(t)} aria-pressed={active} title={active ? 'Back to all music' : 'Show what’s on it'}>
            {name}
          </button>
        )}
        <button className="tiny" onClick={() => setEditing(true)} aria-label={`Rename ${name}`} title="Rename">✎</button>
        <button
          className="tiny"
          aria-label={`Delete ${name}`}
          title="Delete (your music files aren't touched)"
          onClick={() => window.confirm(`Delete “${name}”? Your music files aren't touched.`) && remove(t)}
        >
          ×
        </button>
      </div>
      <div className="org-card-meta">{meta}</div>
      {children}
    </div>
  );
}

function UsbList({
  usbs,
  byKey,
  view,
  onView,
  onDrop,
}: {
  usbs: SortedUsb[];
  byKey: Map<string, Track>;
  view: Target | null;
  onView: (t: Target) => void;
  onDrop: (e: DragEvent, t: Target) => void;
}) {
  const [name, setName] = useState('');
  const [size, setSize] = useState(32);
  const { addUsb, setCapacity } = useCollection.getState();
  return (
    <div className="org-cards">
      {usbs.length === 0 && <p className="note">Make a USB for each kind of set — a warm-up stick, a peak-time stick, a back-up — and plug any of them into a CDJ.</p>}
      {usbs.map((u) => {
        const t: Target = { kind: 'usb', id: u.id };
        const on = resolve(u.keys, byKey);
        const used = bytesUsed(on);
        const pct = Math.min(100, (used / (u.capacityGb * 1e9)) * 100);
        return (
          <TargetCard
            key={u.id}
            t={t}
            name={u.name}
            active={same(view, t)}
            onView={onView}
            onDrop={onDrop}
            style={{ '--accent': `var(--${u.colour})` } as CSSProperties}
            meta={
              <>
                <span>{u.keys.length} tracks</span>
                <span>
                  {formatBytes(used)} of{' '}
                  <select className="tiny" value={u.capacityGb} onChange={(e) => setCapacity(u.id, Number(e.target.value))} aria-label="Stick size">
                    {USB_SIZES.map((g) => <option key={g} value={g}>{g} GB</option>)}
                  </select>
                </span>
              </>
            }
          >
            <div className="usb-fill" aria-hidden><i style={{ width: `${pct}%` }} /></div>
          </TargetCard>
        );
      })}
      <form
        className="org-new"
        onSubmit={(e) => {
          e.preventDefault();
          onView({ kind: 'usb', id: addUsb(name, size) });
          setName('');
        }}
      >
        <input className="search" placeholder="New USB name, e.g. Peak time" value={name} onChange={(e) => setName(e.target.value)} aria-label="New USB name" />
        <select className="tiny" value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="New USB size">
          {USB_SIZES.map((g) => <option key={g} value={g}>{g} GB</option>)}
        </select>
        <button className="primary tiny" type="submit">New USB</button>
      </form>
    </div>
  );
}

function CrateList({
  crates,
  pool,
  byKey,
  view,
  onView,
  onDrop,
  onFill,
}: {
  crates: SortedCrate[];
  pool: Track[];
  byKey: Map<string, Track>;
  view: Target | null;
  onView: (t: Target) => void;
  onDrop: (e: DragEvent, t: Target) => void;
  onFill: (c: SortedCrate) => void;
}) {
  const [name, setName] = useState('');
  const [by, setBy] = useState<CrateBy>('genre');
  const [autoBy, setAutoBy] = useState<Exclude<CrateBy, 'category'>>('genre');
  const { addCrate, autoCrates } = useCollection.getState();
  const byLabel = (b: CrateBy) => CRATE_BY.find((x) => x.id === b)!.label;
  const untagged = pool.filter((t) => !labelFor(t, autoBy)).length;
  // suggestions for the name box: the labels in your music for the chosen kind
  const suggestions = useMemo(() => (by === 'category' ? [] : groupTracks(pool, by).filter((g) => g.label).slice(0, 60)), [pool, by]);
  return (
    <div className="org-cards">
      <div className="org-auto">
        <span>Auto-sort into one crate per</span>
        <select className="tiny" value={autoBy} onChange={(e) => setAutoBy(e.target.value as typeof autoBy)} aria-label="Auto-sort by">
          <option value="genre">genre</option>
          <option value="artist">artist</option>
          <option value="period">period (decade)</option>
        </select>
        <button
          className="primary tiny"
          onClick={() => {
            const n = autoCrates(autoBy, pool, autoBy === 'artist' ? 2 : 1);
            toast(
              n
                ? `${n} ${byLabel(autoBy).toLowerCase()} crate${n === 1 ? '' : 's'} filled.${untagged ? ` ${untagged} record${untagged === 1 ? ' has' : 's have'} no ${autoBy === 'period' ? 'year' : autoBy} tag — file ${untagged === 1 ? 'it' : 'them'} by hand.` : ''}`
                : `Nothing new to sort by ${autoBy}.`,
            );
          }}
        >
          Sort now
        </button>
      </div>
      {crates.length === 0 && <p className="note">Label crates by genre, artist, period or your own category (Warm-up, Battle tools…). Records can sit in more than one.</p>}
      {crates.map((c) => {
        const t: Target = { kind: 'crate', id: c.id };
        const missing = c.by !== 'category' ? pool.filter((x) => matches(x, c.by, c.name) && !c.keys.includes(x.key)).length : 0;
        const n = resolve(c.keys, byKey).length;
        return (
          <TargetCard
            key={c.id}
            t={t}
            name={c.name}
            active={same(view, t)}
            onView={onView}
            onDrop={onDrop}
            meta={
              <>
                <span className={`crate-by by-${c.by}`}>{byLabel(c.by)}</span>
                <span className={c.keys.length > CRATE_HOLDS ? 'over' : ''}>
                  {n} record{n === 1 ? '' : 's'}
                  {c.keys.length > CRATE_HOLDS ? ' · overflowing' : ''}
                </span>
                {missing > 0 && (
                  <button className="tiny" onClick={() => onFill(c)} title={`Add every record tagged ${c.name}`}>
                    + {missing} matching
                  </button>
                )}
              </>
            }
          />
        );
      })}
      <form
        className="org-new"
        onSubmit={(e) => {
          e.preventDefault();
          const id = addCrate(name, by);
          const crate = useCollection.getState().crates.find((c) => c.id === id)!;
          if (by !== 'category') {
            const fill = pool.filter((t) => matches(t, by, crate.name));
            if (fill.length) onFill(crate);
          }
          onView({ kind: 'crate', id });
          setName('');
        }}
      >
        <select className="tiny" value={by} onChange={(e) => setBy(e.target.value as CrateBy)} aria-label="Label the crate by">
          {CRATE_BY.map((b) => <option key={b.id} value={b.id} title={b.hint}>{b.label}</option>)}
        </select>
        <input
          className="search"
          list="org-crate-names"
          placeholder={by === 'category' ? 'Label, e.g. Warm-up' : `${byLabel(by)}, e.g. ${CRATE_BY.find((x) => x.id === by)!.hint.split(/[,…]/)[0]}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Crate label"
        />
        <datalist id="org-crate-names">
          {suggestions.map((g) => <option key={g.label} value={g.label!}>{g.tracks.length} records</option>)}
        </datalist>
        <button className="primary tiny" type="submit">New crate</button>
      </form>
    </div>
  );
}
