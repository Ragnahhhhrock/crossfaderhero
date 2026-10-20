import { useEffect, useRef, useState } from 'react';
import { useStats, type Totals } from '../state/stats';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Counts from 0 up to `value` on mount (and eases to new values after that). */
function useCountUp(value: number, delay = 0, ms = 1100): number {
  const [shown, setShown] = useState(() => (reduced() ? value : 0));
  const from = useRef(reduced() ? value : 0);
  useEffect(() => {
    if (reduced()) return void setShown(value);
    let raf = 0;
    let start = 0;
    const begin = from.current;
    const timer = setTimeout(() => {
      const tick = (t: number) => {
        start ||= t;
        const k = Math.min(1, (t - start) / ms);
        const eased = 1 - Math.pow(1 - k, 3);
        const v = Math.round(begin + (value - begin) * eased);
        from.current = v;
        setShown(v);
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [value, delay, ms]);
  return shown;
}

function Stat({ label, value, index, format }: { label: string; value: number; index: number; format?: (n: number) => string }) {
  const n = useCountUp(value, 250 + index * 120);
  return (
    <div className="stat" style={{ animationDelay: `${index * 120}ms` }}>
      <dd className="stat-num">{format ? format(n) : n.toLocaleString()}</dd>
      <dt className="stat-label">{label}</dt>
    </div>
  );
}

const hours = (secs: number) => (secs < 3600 ? `${Math.floor(secs / 60)}m` : `${Math.floor(secs / 3600).toLocaleString()}h`);

/** Totals for every player, on the home view. Numbers animate up from zero on page load. */
export function CareerStats() {
  const totals = useStats((s) => s.totals);
  const pending = useStats((s) => s.pending);
  if (!totals) return null; // not loaded (or no backend): show nothing rather than zeros
  const n = (k: keyof Totals) => totals[k] + pending[k];
  return (
    <section className="career-stats" aria-label="Crossfader Hero players, all time">
      <h2 className="stats-title">All players, all time</h2>
      <dl className="stats-grid">
        <Stat index={0} label="Tracks played" value={n('tracksPlayed')} />
        <Stat index={1} label="Tracks mixed" value={n('tracksMixed')} />
        <Stat index={2} label="Club gigs" value={n('gigs')} />
        <Stat index={3} label="Records dropped" value={n('vinylDrops')} />
        <Stat index={4} label="Time on the decks" value={n('playSeconds')} format={hours} />
      </dl>
    </section>
  );
}
