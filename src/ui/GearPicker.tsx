import { useEffect, useState, type ReactElement } from 'react';
import { GEAR_LABEL, useSetup, type Gear } from '../state/setup';

function CdjIcon() {
  return (
    <g>
      <rect x="2" y="4" width="30" height="40" rx="3" className="g-body" />
      <rect x="7" y="7" width="20" height="8" rx="1" className="g-screen" />
      <circle cx="17" cy="30" r="10" className="g-jog" />
      <circle cx="17" cy="30" r="3.5" className="g-accent" />
    </g>
  );
}

function TurntableIcon() {
  return (
    <g>
      <rect x="2" y="6" width="44" height="36" rx="3" className="g-body" />
      <circle cx="20" cy="24" r="15" className="g-platter" />
      <circle cx="20" cy="24" r="13" className="g-vinyl" />
      <circle cx="20" cy="24" r="4.5" className="g-accent" />
      <path d="M41 10 L36 33 L32 35" className="g-arm" />
      <circle cx="41" cy="10" r="2.6" className="g-pivot" />
    </g>
  );
}

function MixerIcon() {
  return (
    <g>
      <rect x="1" y="6" width="16" height="36" rx="2" className="g-body" />
      <rect x="5" y="22" width="2" height="12" className="g-slot" />
      <rect x="11" y="22" width="2" height="12" className="g-slot" />
      <rect x="4" y="37" width="10" height="2" className="g-slot" />
    </g>
  );
}

const OPTIONS: { gear: Gear; title: string; text: string; art: ReactElement }[] = [
  {
    gear: 'cdj',
    title: 'CDJs',
    text: 'Two media players and a club mixer. Your MP3 folders go on USB sticks. Hot cues, loops, sync and waveforms — the modern club setup.',
    art: (
      <svg viewBox="0 0 90 48" aria-hidden>
        <CdjIcon />
        <g transform="translate(36 0)"><MixerIcon /></g>
        <g transform="translate(56 0)"><CdjIcon /></g>
      </svg>
    ),
  },
  {
    gear: 'vinyl',
    title: 'Vinyl turntables',
    text: 'Two direct-drive turntables and a battle mixer. Your MP3s are pressed to vinyl and stacked in crates. Pull a record, drop the needle, scratch and juggle by hand. The path to the DJ battle championships.',
    art: (
      <svg viewBox="0 0 116 48" aria-hidden>
        <TurntableIcon />
        <g transform="translate(50 0)"><MixerIcon /></g>
        <g transform="translate(70 0)"><TurntableIcon /></g>
      </svg>
    ),
  },
  {
    gear: 'both',
    title: 'Both',
    text: 'Two CDJs and two turntables on a wider desk. Each mixer channel has a CD / Phono switch, so you can blend a CDJ into a record or scratch over a track.',
    art: (
      <svg viewBox="0 0 186 48" aria-hidden>
        <TurntableIcon />
        <g transform="translate(48 0)"><CdjIcon /></g>
        <g transform="translate(82 0)"><MixerIcon /></g>
        <g transform="translate(102 0)"><CdjIcon /></g>
        <g transform="translate(138 0)"><TurntableIcon /></g>
      </svg>
    ),
  },
];

/** Pick the gear on the desk: on first start, and later from the top bar. */
export function GearPicker({ onClose }: { onClose?: () => void }) {
  const current = useSetup((s) => s.gear);
  const choose = useSetup((s) => s.choose);
  const [pick, setPick] = useState<Gear>(current ?? 'cdj');
  const first = current === null;

  useEffect(() => {
    if (first || !onClose) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [first, onClose]);

  return (
    <div className="modal-backdrop" onClick={first ? undefined : onClose}>
      <div className="modal gear-picker" role="dialog" aria-modal="true" aria-labelledby="gear-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="gear-title">{first ? 'Set up your desk' : 'Change your gear'}</h2>
        <p>{first ? 'What are you learning on? You can change this any time from Gear in the top bar.' : 'Swap what’s on the desk. Your crates, USB sticks and career carry over.'}</p>
        <div className="gear-options" role="radiogroup" aria-label="Gear">
          {OPTIONS.map((o) => (
            <button key={o.gear} role="radio" aria-checked={pick === o.gear} className={`gear-option ${pick === o.gear ? 'on' : ''}`} onClick={() => setPick(o.gear)} onDoubleClick={() => (choose(o.gear), onClose?.())}>
              <span className="gear-art">{o.art}</span>
              <strong>{o.title}</strong>
              <span className="gear-sub">{GEAR_LABEL[o.gear]}</span>
              <span className="gear-text">{o.text}</span>
            </button>
          ))}
        </div>
        <div className="welcome-actions">
          <button
            className="primary"
            autoFocus
            onClick={() => {
              choose(pick);
              onClose?.();
            }}
          >
            {first ? 'Set up the desk' : 'Swap gear'}
          </button>
          {!first && <button className="tiny" onClick={onClose}>Cancel</button>}
        </div>
      </div>
    </div>
  );
}
