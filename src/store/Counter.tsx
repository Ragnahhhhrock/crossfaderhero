import { useState } from 'react';
import { toast } from '../state/toasts';
import { useWallet } from '../state/wallet';
import { track as ga } from '../analytics/ga';
import type { Track } from '../types';
import { SleeveImg } from './Dig';
import { money, priceOf, quote } from './pricing';
import { checkout, STORE_CRATE } from './purchase';
import { useShop } from './shopState';

const GREETINGS = [
  `Hey! Find anything good?`,
  `Afternoon. Dig anything out of the crates?`,
  `Alright? Let's see what you've got.`,
];
const THANKS = [`Cheers! They're all yours.`, `Sorted. Enjoy the wax.`, `Good picks. Come back when you've worn those out.`];

const pickLine = (lines: string[], seed: number) => lines[seed % lines.length];

/** The counter: the clerk rings up your bag and takes your money. */
export function Counter({ byKey, onClose }: { byKey: Map<string, Track>; onClose: () => void }) {
  const bag = useShop((s) => s.bag);
  const cash = useWallet((s) => s.cash);
  const owned = useWallet((s) => s.owned);
  const [receipt, setReceipt] = useState<{ items: Track[]; total: number } | null>(null);
  const [seed] = useState(() => Math.floor(Math.random() * 1000));
  const [line, setLine] = useState('');

  const tracks = bag.map((k) => byKey.get(k)).filter((t): t is Track => !!t);
  const q = quote(tracks, new Set(Object.keys(owned)), cash);
  const total = tracks.reduce((n, t) => n + (t.key in owned ? 0 : priceOf(t)), 0);

  const say = line || (receipt ? pickLine(THANKS, seed) : !tracks.length ? `Nothing in the bag yet. Go and dig!` : q.ok ? `That's ${money(q.total)} for ${tracks.length === 1 ? 'the one' : `the ${tracks.length}`}. Cash or card?` : pickLine(GREETINGS, seed));

  const pay = () => {
    const r = checkout(tracks);
    if (!r.ok) {
      setLine(`${r.reason} Want to put something back?`);
      return toast(r.reason, 'warn');
    }
    ga('store_purchase', { records: r.items.length, total: r.total });
    setReceipt({ items: r.items, total: r.total });
    setLine('');
  };

  return (
    <div className="store-counter" role="dialog" aria-label="Checkout">
      <div className="store-station-head">
        <h2>The counter</h2>
        <span className="store-sub">You've got {money(cash)}</span>
        <button className="tiny" onClick={onClose} title="Esc">Step away</button>
      </div>
      <div className="store-counter-body">
        <blockquote className="store-clerk">
          <span className="store-sub">Shop clerk</span>
          <p>“{say}”</p>
        </blockquote>

        {receipt ? (
          <div className="store-receipt">
            <h3>Receipt</h3>
            <ul>
              {receipt.items.map((t) => (
                <li key={t.key}>
                  <span>{t.meta.artist ? `${t.meta.artist} — ` : ''}{t.meta.title}</span>
                  <span>{money(priceOf(t))}</span>
                </li>
              ))}
            </ul>
            <p className="store-total"><span>Paid</span><strong>{money(receipt.total)}</strong></p>
            <p className="store-sub">They're in the “{STORE_CRATE}” crate in your collection, ready for the decks. You've got {money(cash)} left.</p>
            <button className="primary" onClick={onClose}>Back to the crates</button>
          </div>
        ) : (
          <div className="store-bag">
            <h3>Your record bag <span className="store-sub">{tracks.length} {tracks.length === 1 ? 'record' : 'records'}</span></h3>
            {tracks.length === 0 ? (
              <p className="store-sub">Empty. Add records from the crates with “Add to bag”.</p>
            ) : (
              <ul>
                {tracks.map((t) => (
                  <li key={t.key}>
                    <SleeveImg t={t} size={80} className="store-thumb" />
                    <span className="store-li-name"><strong>{t.meta.title}</strong><span className="store-sub">{t.meta.artist || 'Unknown artist'}</span></span>
                    <span>{t.key in owned ? 'owned' : money(priceOf(t))}</span>
                    <button className="tiny" onClick={() => useShop.getState().removeFromBag(t.key)} aria-label={`Take ${t.meta.title} out of the bag`}>Put back</button>
                  </li>
                ))}
              </ul>
            )}
            <p className="store-total"><span>Total</span><strong className={q.ok || !tracks.length ? '' : 'short'}>{money(total)}</strong></p>
            <button className="primary" onClick={pay} disabled={!tracks.length}>Pay {money(total)}</button>
            {!q.ok && tracks.length > 0 && <p className="store-sub short">{q.reason}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
