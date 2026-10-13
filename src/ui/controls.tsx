import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface KnobProps {
  label: string;
  value: number; // min..max
  min?: number;
  max?: number;
  defaultValue?: number;
  bipolar?: boolean;
  size?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  tone?: string;
  /** Hover tip explaining what the knob does. */
  tip?: string;
}

/** Rotary knob. Drag up/down, scroll, arrow keys; double-click resets. */
export function Knob({ label, value, min = -1, max = 1, defaultValue = 0, bipolar = true, size = 40, onChange, format, tone, tip }: KnobProps) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const span = max - min;
  const norm = (value - min) / span;
  const angle = -135 + norm * 270;
  const r = size / 2 - 3;
  const c = size / 2;
  const arc = (from: number, to: number) => {
    const a0 = ((from - 90) * Math.PI) / 180;
    const a1 = ((to - 90) * Math.PI) / 180;
    const large = Math.abs(to - from) > 180 ? 1 : 0;
    const sweep = to > from ? 1 : 0;
    return `M ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 ${large} ${sweep} ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)}`;
  };
  const zeroAngle = bipolar ? -135 + ((defaultValue - min) / span) * 270 : -135;
  const centred = Math.abs(value - defaultValue) < span * 0.005;

  const onPointerDown = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, v: value };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const fine = e.shiftKey ? 0.25 : 1;
    let v = drag.current.v + ((drag.current.y - e.clientY) / 160) * span * fine;
    // gentle detent at the default
    if (Math.abs(v - defaultValue) < span * 0.02) v = defaultValue;
    onChange(clamp(v, min, max));
  };
  const onKey = (e: KeyboardEvent) => {
    const step = span / 50;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clamp(value + step, min, max));
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clamp(value - step, min, max));
    else if (e.key === 'Home' || e.key === '0') onChange(defaultValue);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="knob" style={{ '--knob-tone': tone } as CSSProperties}>
      <svg
        width={size}
        height={size}
        role="slider"
        tabIndex={0}
        aria-label={label}
        data-tip={tip ? `${tip} Drag, scroll or use the arrow keys; double-click resets.` : undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 100) / 100}
        aria-valuetext={format ? format(value) : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => onChange(defaultValue)}
        onWheel={(e) => onChange(clamp(value - Math.sign(e.deltaY) * span * 0.02, min, max))}
        onKeyDown={onKey}
      >
        <path d={arc(-135, 135)} className="knob-track" />
        {!centred && <path d={arc(Math.min(zeroAngle, angle), Math.max(zeroAngle, angle))} className="knob-fill" />}
        <circle cx={c} cy={c} r={r - 5} className="knob-cap" />
        <line
          x1={c}
          y1={c}
          x2={c + (r - 7) * Math.sin((angle * Math.PI) / 180)}
          y2={c - (r - 7) * Math.cos((angle * Math.PI) / 180)}
          className="knob-pointer"
        />
      </svg>
      <span className="knob-label" title={format ? format(value) : undefined}>
        {label}
      </span>
    </div>
  );
}

interface FaderProps {
  label: string;
  value: number; // 0..1, 1 = top / right
  onChange: (v: number) => void;
  orientation?: 'vertical' | 'horizontal';
  length?: number;
  defaultValue?: number;
  className?: string;
  children?: ReactNode;
  valueText?: string;
  /** Hover tip explaining what the fader does. */
  tip?: string;
}

/** Linear fader. Drag the cap or click the track; arrow keys; double-click resets. */
export function Fader({ label, value, onChange, orientation = 'vertical', length = 140, defaultValue, className = '', children, valueText, tip }: FaderProps) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const vertical = orientation === 'vertical';

  const fromEvent = (e: PointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    const cap = 22;
    const v = vertical ? 1 - (e.clientY - r.top - cap / 2) / (r.height - cap) : (e.clientX - r.left - cap / 2) / (r.width - cap);
    return clamp(v, 0, 1);
  };

  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.002 : 0.02;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clamp(value + step, 0, 1));
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clamp(value - step, 0, 1));
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const pct = `calc(${value} * (100% - 22px))`;
  return (
    <div
      ref={track}
      className={`fader fader-${orientation} ${className}`}
      style={vertical ? { height: length } : { width: length }}
      role="slider"
      tabIndex={0}
      aria-label={label}
      data-tip={tip}
      aria-orientation={orientation}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Math.round(value * 1000) / 1000}
      aria-valuetext={valueText}
      onPointerDown={(e) => {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        dragging.current = true;
        onChange(fromEvent(e));
      }}
      onPointerMove={(e) => dragging.current && onChange(fromEvent(e))}
      onPointerUp={() => (dragging.current = false)}
      onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
      onKeyDown={onKey}
    >
      <div className="fader-slot" />
      {children}
      <div className="fader-cap" style={vertical ? { bottom: pct } : { left: pct }} />
    </div>
  );
}
