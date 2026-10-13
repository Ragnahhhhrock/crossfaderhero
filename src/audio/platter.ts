/**
 * Direct-drive turntable physics, shared by the audio worklet (which runs it
 * per sample block) and the unit tests. Pure functions, no DOM or audio APIs.
 *
 * Speeds are in "record speed" units: 1 = the record turning at 33⅓ rpm with
 * the pitch at 0 %, which plays the track at its original speed. Position is in
 * track seconds; one record revolution at 33⅓ is SECONDS_PER_REV of audio.
 */

export const SECONDS_PER_REV = 1.8; // 60 / 33⅓
export const RPM_45 = 45 / (100 / 3); // 1.35

export interface PlatterParams {
  /** Motor running (Start/Stop). */
  motor: boolean;
  /** Power switch: off means the platter coasts down slowly. */
  power: boolean;
  /** Target platter speed with the motor on: rpm factor × (1 + pitch). */
  target: number;
  /** Seconds to reach full speed from a standstill (start-up torque). */
  startTime: number;
  /** Seconds to stop from full speed with the Stop button (electronic brake). */
  brakeTime: number;
  /** Finger on the platter edge, −1..1: drags it slower or pushes it faster. */
  nudge: number;
  /** Hand on the record. */
  held: boolean;
  /** Where the hand wants the record, in track seconds (only while held). */
  handTarget: number;
}

export interface PlatterState {
  /** Platter speed (under the slipmat). */
  platter: number;
  /** Record speed (what the needle reads). */
  record: number;
  /** How far the record has turned, in seconds of audio (unbounded; 1 turn = SECONDS_PER_REV). */
  rot: number;
  /** Track position under the needle, seconds. Only moves while the needle is down. */
  pos: number;
}

/** How hard the slipmat drags the record towards the platter speed, in speed units per second. */
export const SLIP_ACCEL = 9;
/** Power off: a free-spinning platter loses about this much speed per second. */
export const COAST_DECEL = 0.28;
/** How quickly the record follows the hand (seconds); short so scratches feel locked to the hand. */
export const HAND_TAU = 0.006;

const approach = (v: number, target: number, maxStep: number) =>
  v < target ? Math.min(target, v + maxStep) : Math.max(target, v - maxStep);

/** Advance the platter, record and position by `dt` seconds. Mutates and returns `s`. */
export function stepPlatter(s: PlatterState, p: PlatterParams, dt: number, duration: number, needleDown = true): PlatterState {
  // ---- platter: motor torque, brake, or coasting ----
  if (p.power && p.motor) {
    const tgt = p.target * (1 + p.nudge * 0.1);
    const accel = p.target / Math.max(0.05, p.startTime);
    s.platter = approach(s.platter, tgt, accel * dt);
  } else if (p.power) {
    s.platter = approach(s.platter, 0, (Math.max(p.target, 1) / Math.max(0.05, p.brakeTime)) * dt);
  } else {
    s.platter = approach(s.platter, 0, COAST_DECEL * dt);
  }
  // a finger on the edge of a stopped or slowing platter still drags it a little
  if (!(p.power && p.motor) && p.nudge !== 0) s.platter = Math.max(0, s.platter + p.nudge * 0.6 * dt);

  // ---- record: follows the hand, or is dragged by the slipmat ----
  if (p.held) {
    const want = (p.handTarget - s.rot) / HAND_TAU;
    const clamped = Math.max(-12, Math.min(12, want));
    // a touch of smoothing so the hand's steps don't click
    s.record += (clamped - s.record) * Math.min(1, dt / 0.002);
  } else {
    s.record = approach(s.record, s.platter, SLIP_ACCEL * dt);
  }

  s.rot += s.record * dt;
  // the needle rides the groove; at either end it sits in the lead-in or run-out
  if (needleDown) s.pos = Math.max(0, Math.min(duration, s.pos + s.record * dt));
  return s;
}

/** Where on the record (radius, metres) a track position sits: outer edge = start, label = end. */
export const GROOVE_OUTER = 0.146;
export const GROOVE_INNER = 0.062;
export function grooveRadius(pos: number, duration: number): number {
  const f = duration > 0 ? Math.max(0, Math.min(1, pos / duration)) : 0;
  return GROOVE_OUTER - f * (GROOVE_OUTER - GROOVE_INNER);
}
export function positionAtRadius(r: number, duration: number): number {
  const f = (GROOVE_OUTER - r) / (GROOVE_OUTER - GROOVE_INNER);
  return Math.max(0, Math.min(1, f)) * duration;
}
