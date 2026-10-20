import type { Analysis, DeckId, Track } from '../types';
import type { Grid } from './grid';
import type { Player } from './player';
import { emitAction } from './actions';
import { RPM_45, SECONDS_PER_REV } from './platter';
import workletUrl from './turntable.worklet.ts?worker&url';

export type PitchRange = 8 | 16;

interface Report {
  pos: number;
  rot: number;
  needle: boolean;
  record: number;
  platter: number;
  t: number;
}

const modules = new WeakMap<BaseAudioContext, Promise<void>>();
function loadModule(ctx: AudioContext): Promise<void> {
  let p = modules.get(ctx);
  if (!p) {
    p = ctx.audioWorklet.addModule(workletUrl);
    modules.set(ctx, p);
  }
  return p;
}

/**
 * A direct-drive turntable with a record on it. The platter, slipmat and
 * needle are simulated in an AudioWorklet (turntable.worklet.ts); this class
 * holds the controls and mirrors the worklet's reported position.
 */
export class Turntable implements Player {
  readonly id: DeckId;
  readonly kind = 'turntable' as const;
  readonly ctx: AudioContext;
  readonly output: GainNode;
  private node: AudioWorkletNode | null = null;
  private nodeReady: Promise<AudioWorkletNode> | null = null;

  track: Track | null = null;
  analysis: Analysis | null = null;
  loading = false;
  private length = 0;

  /** Start/Stop: the motor. */
  motor = false;
  /** Power switch. Off = the platter coasts to a stop. */
  power = true;
  rpm: 33 | 45 = 33;
  /** Pitch fader, as a fraction (0.04 = +4 %). */
  pitch = 0;
  range: PitchRange = 8;
  startTime = 0.7;
  brakeTime = 0.6;
  private nudge = 0;
  held = false;
  needleDown = false;
  /** The arm is over the record (false = parked on its rest). */
  armOnRecord = false;
  /** Show BPM, time and waveforms (off = the authentic, by-ear experience). */
  assist = true;

  private rep: Report = { pos: 0, rot: 0, needle: false, record: 0, platter: 0, t: 0 };
  /** Platter angle in revolutions (for the strobe dots and 3D platter). */
  private platterRevs = 0;
  private ended = false;
  private lastHand = 0;
  private handDir: -1 | 0 | 1 = 0;

  private listeners = new Set<() => void>();
  version = 0;

  constructor(id: DeckId, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.output = ctx.createGain();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  private changed() {
    this.version++;
    for (const l of this.listeners) l();
  }

  // ---------- audio node ----------
  private ensureNode(): Promise<AudioWorkletNode> {
    if (!this.nodeReady) {
      this.nodeReady = loadModule(this.ctx).then(() => {
        const n = new AudioWorkletNode(this.ctx, 'cfh-turntable', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
        n.port.onmessage = (e: MessageEvent<Report>) => this.onReport(e.data);
        n.connect(this.output);
        this.node = n;
        this.sendParams();
        return n;
      });
    }
    return this.nodeReady;
  }

  /** Spin up the worklet early so Start works before a record is on. */
  warmUp() {
    void this.ensureNode().catch(() => undefined);
  }

  private onReport(r: Report) {
    const dt = Math.max(0, r.t - this.rep.t);
    if (this.rep.t > 0) this.platterRevs += ((this.rep.platter + r.platter) / 2) * dt / SECONDS_PER_REV;
    const wasPlaying = this.playing;
    this.rep = r;
    if (this.loaded && this.needleDown && !this.ended && r.pos >= this.length - 0.05 && r.record > 0) {
      this.ended = true;
      emitAction('trackEnd', this.id);
    }
    if (wasPlaying !== this.playing) this.changed();
  }

  private post(m: unknown, transfer: Transferable[] = []) {
    this.node?.port.postMessage(m, transfer);
  }

  private sendParams() {
    this.post({
      type: 'params',
      params: { motor: this.motor, power: this.power, target: this.target, startTime: this.startTime, brakeTime: this.brakeTime, nudge: this.nudge },
    });
  }

  // ---------- derived ----------
  /** Platter target speed with the motor on (1 = 33⅓ at 0 %). */
  get target(): number {
    return (this.rpm === 45 ? RPM_45 : 1) * (1 + this.pitch);
  }
  get loaded(): boolean {
    return !!this.track && this.length > 0;
  }
  get duration(): number {
    return this.length;
  }
  get position(): number {
    if (!this.needleDown || !this.rep.needle) return Math.max(0, Math.min(this.rep.pos, this.length));
    const p = this.rep.pos + Math.max(0, this.ctx.currentTime - this.rep.t) * this.rep.record;
    return Math.max(0, Math.min(p, this.length));
  }
  /** The record is turning under the needle. */
  get playing(): boolean {
    return this.loaded && this.needleDown && !this.held && this.rep.record > 0.05;
  }
  get scratching(): boolean {
    return this.held;
  }
  /** Actual record speed right now. */
  get speed(): number {
    return this.rep.record;
  }
  get platterSpeed(): number {
    return this.rep.platter;
  }
  /** Nominal playback speed (what the pitch is set to), for beatmatching maths and waveform scaling. */
  get rate(): number {
    return this.target;
  }
  get bpm(): number {
    return this.analysis ? this.analysis.bpm * this.target : 0;
  }
  /** Speed change vs the original, as a fraction (like a CDJ's tempo). */
  get tempo(): number {
    return this.target - 1;
  }
  get grid(): Grid | null {
    return this.analysis ? { bpm: this.analysis.bpm, firstBeat: this.analysis.firstBeat, downbeat: this.analysis.downbeat } : null;
  }
  /** Record angle in revolutions: one turn = 1.8 s of audio. */
  get recordRevs(): number {
    return (this.rep.rot + Math.max(0, this.ctx.currentTime - this.rep.t) * this.rep.record) / SECONDS_PER_REV;
  }
  get platterAngleRevs(): number {
    return this.platterRevs + Math.max(0, this.ctx.currentTime - this.rep.t) * this.rep.platter / SECONDS_PER_REV;
  }

  // ---------- records ----------
  setLoading(v: boolean) {
    this.loading = v;
    this.changed();
  }

  /** Put a record on the platter. The needle stays up until you drop it. */
  async load(track: Track, buffer: AudioBuffer, analysis: Analysis) {
    const node = await this.ensureNode();
    const channels: Float32Array[] = [];
    for (let i = 0; i < Math.min(2, buffer.numberOfChannels); i++) channels.push(buffer.getChannelData(i).slice());
    this.needleDown = false;
    this.armOnRecord = false;
    this.held = false;
    this.ended = false;
    node.port.postMessage({ type: 'needle', down: false });
    node.port.postMessage({ type: 'release' });
    node.port.postMessage({ type: 'load', channels, rate: buffer.sampleRate, pos: 0 }, channels.map((c) => c.buffer));
    this.track = track;
    this.analysis = analysis;
    this.length = buffer.duration;
    this.rep = { ...this.rep, pos: 0, t: this.ctx.currentTime };
    this.changed();
  }

  updateAnalysis(a: Analysis) {
    this.analysis = a;
    this.changed();
  }

  eject() {
    this.post({ type: 'needle', down: false });
    this.post({ type: 'eject' });
    this.needleDown = false;
    this.armOnRecord = false;
    this.held = false;
    this.track = null;
    this.analysis = null;
    this.length = 0;
    this.rep = { ...this.rep, pos: 0 };
    this.changed();
  }

  // ---------- motor ----------
  toggleStart() {
    void this.ctx.resume();
    this.warmUp();
    this.motor = !this.motor;
    if (this.motor && !this.power) this.power = true;
    this.sendParams();
    if (this.motor && this.loaded && this.needleDown) emitAction('play', this.id);
    this.changed();
  }

  togglePower() {
    this.power = !this.power;
    this.sendParams();
    this.changed();
  }

  setRpm(rpm: 33 | 45) {
    this.rpm = rpm;
    this.sendParams();
    this.changed();
  }

  /** Fader −1..1 → pitch within the range. */
  setPitchFraction(f: number) {
    const step = this.range === 8 ? 0.0005 : 0.001;
    const p = Math.round(((f * this.range) / 100) / step) * step;
    this.setPitch(p);
  }

  setPitch(p: number) {
    this.pitch = Math.max(-this.range / 100, Math.min(this.range / 100, p));
    this.sendParams();
    this.changed();
  }

  cycleRange() {
    this.range = this.range === 8 ? 16 : 8;
    this.setPitch(this.pitch);
  }

  resetPitch() {
    this.setPitch(0);
  }

  setStartTime(s: number) {
    this.startTime = s;
    this.sendParams();
    this.changed();
  }

  setBrakeTime(s: number) {
    this.brakeTime = s;
    this.sendParams();
    this.changed();
  }

  toggleAssist() {
    this.assist = !this.assist;
    this.changed();
  }

  /** Finger on the platter edge: −1 drags it slower, +1 pushes it faster. */
  setNudge(v: number) {
    const n = Math.max(-1, Math.min(1, v));
    if (n === this.nudge) return;
    this.nudge = n;
    this.sendParams();
  }

  // ---------- hand on the record ----------
  grab() {
    if (this.held) return;
    void this.ctx.resume();
    this.warmUp();
    this.held = true;
    this.lastHand = 0;
    this.handDir = 0;
    this.post({ type: 'grab' });
    this.changed();
  }

  /** Move the record by `seconds` of audio from where it was grabbed (1 turn = 1.8 s). */
  handTo(seconds: number) {
    if (!this.held) return;
    const d = seconds - this.lastHand;
    const dir: -1 | 0 | 1 = Math.abs(d) < 0.002 ? 0 : d > 0 ? 1 : -1;
    if (dir !== 0) {
      if (this.handDir !== 0 && dir !== this.handDir && this.needleDown) emitAction('scratchFlip', this.id);
      this.handDir = dir;
    }
    this.lastHand = seconds;
    this.post({ type: 'hand', offset: seconds });
  }

  release() {
    if (!this.held) return;
    this.held = false;
    this.post({ type: 'release' });
    this.changed();
  }

  // ---------- needle ----------
  /** Drop the needle, at `pos` seconds if given (else where it is). */
  dropNeedle(pos?: number) {
    if (!this.loaded) return;
    void this.ctx.resume();
    const p = pos === undefined ? this.position : Math.max(0, Math.min(pos, this.length - 0.05));
    this.needleDown = true;
    this.armOnRecord = true;
    this.ended = false;
    this.post({ type: 'needle', down: true, pos: p });
    if (pos !== undefined) this.rep = { ...this.rep, pos: p, needle: true, t: this.ctx.currentTime };
    emitAction('needleDrop', this.id);
    if (this.motor) emitAction('play', this.id);
    this.changed();
  }

  liftNeedle() {
    this.needleDown = false;
    this.post({ type: 'needle', down: false });
    this.changed();
  }

  /** Move the arm without playing (needle up), e.g. while cueing by eye. */
  moveNeedle(pos: number) {
    if (!this.loaded) return;
    const p = Math.max(0, Math.min(pos, this.length - 0.05));
    this.post({ type: 'needle', down: false, pos: p });
    this.needleDown = false;
    this.armOnRecord = true;
    this.rep = { ...this.rep, pos: p, t: this.ctx.currentTime };
    this.changed();
  }

  /** Lift the needle and put the arm back on its rest. */
  parkArm() {
    this.needleDown = false;
    this.armOnRecord = false;
    this.post({ type: 'needle', down: false });
    this.changed();
  }

  /** The cue lever: lift the needle, or lower it (onto the lead-in if the arm was parked). */
  toggleNeedle() {
    if (this.needleDown) this.liftNeedle();
    else if (this.armOnRecord) this.dropNeedle();
    else this.dropNeedle(0);
  }

  setCrackle(level: number) {
    this.post({ type: 'crackle', level });
  }
}
