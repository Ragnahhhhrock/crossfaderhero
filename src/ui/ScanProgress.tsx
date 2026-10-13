import type { SlotState } from '../state/library';

/** Progress bar shown while a USB / crate folder is being scanned. */
export function ScanProgress({ slot, noun }: { slot: SlotState; noun: string }) {
  const { total, scanned } = slot;
  const counting = total === null;
  const pct = counting || total === 0 ? 0 : Math.min(100, Math.round((scanned / total) * 100));
  const label = counting ? `Finding ${noun}… ${scanned}` : `Reading ${noun} ${scanned} / ${total}`;
  return (
    <span className="scan-progress" title={label}>
      <span className="scan-label">{label}</span>
      <span
        className={`scan-track${counting ? ' indeterminate' : ''}`}
        role="progressbar"
        aria-label={`Scanning ${noun}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={counting ? undefined : pct}
        aria-valuetext={label}
      >
        <span className="scan-fill" style={counting ? undefined : { width: `${pct}%` }} />
      </span>
    </span>
  );
}
