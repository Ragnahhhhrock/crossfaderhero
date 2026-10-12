import type { DeckId } from '../types';

export type CrossfaderCurve = 'smooth' | 'sharp';
export type CueMode = 'off' | 'split';

const dbToGain = (db: number) => Math.pow(10, db / 20);

/** Knob -1..1 → EQ gain in dB: -1 = kill (-26 dB), 0 = flat, +1 = +6 dB. */
export const eqDb = (v: number) => (v < 0 ? v * 26 : v * 6);
/** Knob -1..1 → trim dB: -1 = -24 dB, 0 = 0 dB, +1 = +9 dB. */
export const trimDb = (v: number) => (v < 0 ? v * 24 : v * 9);

export function crossfaderGains(x: number, curve: CrossfaderCurve): [number, number] {
  x = Math.max(0, Math.min(1, x));
  if (curve === 'sharp') {
    const cut = 0.06;
    const a = x <= 1 - cut ? 1 : (1 - x) / cut;
    const b = x >= cut ? 1 : x / cut;
    return [a, b];
  }
  return [Math.cos((x * Math.PI) / 2), Math.sin((x * Math.PI) / 2)];
}

/** Channel fader position 0..1 → gain (audio-taper). */
export const faderGain = (v: number) => (v <= 0 ? 0 : Math.pow(v, 2.2) * 1.0);

export interface ChannelState {
  trim: number;
  hi: number;
  mid: number;
  low: number;
  filter: number; // -1 (low-pass) .. 0 (off) .. +1 (high-pass)
  fader: number; // 0..1
  cue: boolean;
}

class Channel {
  readonly input: GainNode;
  readonly trim: GainNode;
  readonly low: BiquadFilterNode;
  readonly mid: BiquadFilterNode;
  readonly hi: BiquadFilterNode;
  readonly hpf: BiquadFilterNode;
  readonly lpf: BiquadFilterNode;
  readonly fader: GainNode;
  readonly xfade: GainNode;
  readonly cueSend: GainNode;
  readonly meter: AnalyserNode;

  constructor(ctx: AudioContext) {
    this.input = ctx.createGain();
    this.trim = ctx.createGain();
    this.low = ctx.createBiquadFilter();
    this.low.type = 'lowshelf';
    this.low.frequency.value = 220;
    this.mid = ctx.createBiquadFilter();
    this.mid.type = 'peaking';
    this.mid.frequency.value = 1000;
    this.mid.Q.value = 0.7;
    this.hi = ctx.createBiquadFilter();
    this.hi.type = 'highshelf';
    this.hi.frequency.value = 3500;
    this.hpf = ctx.createBiquadFilter();
    this.hpf.type = 'highpass';
    this.hpf.frequency.value = 10;
    this.hpf.Q.value = 0.9;
    this.lpf = ctx.createBiquadFilter();
    this.lpf.type = 'lowpass';
    this.lpf.frequency.value = 22000;
    this.lpf.Q.value = 0.9;
    this.fader = ctx.createGain();
    this.xfade = ctx.createGain();
    this.cueSend = ctx.createGain();
    this.cueSend.gain.value = 0;
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 1024;

    this.input.connect(this.trim).connect(this.low).connect(this.mid).connect(this.hi).connect(this.hpf).connect(this.lpf);
    this.lpf.connect(this.meter); // pre-fader level, like a DJM channel meter
    this.lpf.connect(this.cueSend);
    this.lpf.connect(this.fader).connect(this.xfade);
  }
}

export class Mixer {
  readonly ctx: AudioContext;
  readonly channels: Record<DeckId, Channel>;
  readonly master: GainNode;
  readonly masterMeterL: AnalyserNode;
  readonly masterMeterR: AnalyserNode;
  private readonly cueBus: GainNode;
  private readonly splitMerger: ChannelMergerNode;
  private readonly monoMaster: GainNode;
  private readonly monoCue: GainNode;

  state: Record<DeckId, ChannelState> = {
    A: { trim: 0, hi: 0, mid: 0, low: 0, filter: 0, fader: 0.8, cue: false },
    B: { trim: 0, hi: 0, mid: 0, low: 0, filter: 0, fader: 0.8, cue: false },
  };
  crossfader = 0.5;
  curve: CrossfaderCurve = 'smooth';
  masterLevel = 0.8; // 0..1
  cueMode: CueMode = 'off';
  cueLevel = 0.8;

  private listeners = new Set<() => void>();
  version = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.channels = { A: new Channel(ctx), B: new Channel(ctx) };
    for (const id of ['A', 'B'] as DeckId[]) this.channels[id].xfade.connect(this.master);

    const splitter = ctx.createChannelSplitter(2);
    this.masterMeterL = ctx.createAnalyser();
    this.masterMeterR = ctx.createAnalyser();
    this.masterMeterL.fftSize = 1024;
    this.masterMeterR.fftSize = 1024;
    this.master.connect(splitter);
    splitter.connect(this.masterMeterL, 0);
    splitter.connect(this.masterMeterR, 1);

    this.cueBus = ctx.createGain();
    for (const id of ['A', 'B'] as DeckId[]) this.channels[id].cueSend.connect(this.cueBus);

    // Split cue: cue in the left ear, master in the right (mono each), for one-output setups.
    const mono = (g: GainNode) => {
      g.channelCount = 1;
      g.channelCountMode = 'explicit';
      g.channelInterpretation = 'speakers';
      return g;
    };
    this.monoMaster = mono(ctx.createGain());
    this.monoCue = mono(ctx.createGain());
    this.splitMerger = ctx.createChannelMerger(2);
    this.monoCue.connect(this.splitMerger, 0, 0);
    this.monoMaster.connect(this.splitMerger, 0, 1);

    this.applyAll();
    this.route();
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

  private route() {
    const off = (fn: () => void) => {
      try {
        fn();
      } catch {
        /* wasn't connected */
      }
    };
    off(() => this.master.disconnect(this.ctx.destination));
    off(() => this.master.disconnect(this.monoMaster));
    off(() => this.cueBus.disconnect());
    off(() => this.splitMerger.disconnect());
    if (this.cueMode === 'split') {
      this.master.connect(this.monoMaster);
      this.cueBus.connect(this.monoCue);
      this.splitMerger.connect(this.ctx.destination);
    } else {
      this.master.connect(this.ctx.destination);
    }
  }

  private ramp(p: AudioParam, v: number) {
    p.setTargetAtTime(v, this.ctx.currentTime, 0.012);
  }

  private applyChannel(id: DeckId) {
    const s = this.state[id];
    const c = this.channels[id];
    this.ramp(c.trim.gain, s.trim <= -0.999 ? 0 : dbToGain(trimDb(s.trim)));
    this.ramp(c.low.gain, eqDb(s.low));
    this.ramp(c.mid.gain, eqDb(s.mid));
    this.ramp(c.hi.gain, eqDb(s.hi));
    const f = s.filter;
    if (Math.abs(f) < 0.03) {
      this.ramp(c.lpf.frequency, 22000);
      this.ramp(c.hpf.frequency, 10);
    } else if (f < 0) {
      this.ramp(c.lpf.frequency, 20000 * Math.pow(150 / 20000, -f));
      this.ramp(c.hpf.frequency, 10);
    } else {
      this.ramp(c.hpf.frequency, 20 * Math.pow(9000 / 20, f));
      this.ramp(c.lpf.frequency, 22000);
    }
    this.ramp(c.fader.gain, faderGain(s.fader));
    this.ramp(c.cueSend.gain, s.cue ? this.cueLevel : 0);
  }

  private applyCrossfader() {
    const [a, b] = crossfaderGains(this.crossfader, this.curve);
    this.ramp(this.channels.A.xfade.gain, a);
    this.ramp(this.channels.B.xfade.gain, b);
  }

  private applyAll() {
    this.applyChannel('A');
    this.applyChannel('B');
    this.applyCrossfader();
    this.ramp(this.master.gain, faderGain(this.masterLevel) * 1.25);
  }

  set(id: DeckId, patch: Partial<ChannelState>) {
    this.state = { ...this.state, [id]: { ...this.state[id], ...patch } };
    this.applyChannel(id);
    this.changed();
  }

  setCrossfader(x: number) {
    this.crossfader = Math.max(0, Math.min(1, x));
    this.applyCrossfader();
    this.changed();
  }

  setCurve(c: CrossfaderCurve) {
    this.curve = c;
    this.applyCrossfader();
    this.changed();
  }

  setMaster(v: number) {
    this.masterLevel = Math.max(0, Math.min(1, v));
    this.ramp(this.master.gain, faderGain(this.masterLevel) * 1.25);
    this.changed();
  }

  setCueMode(m: CueMode) {
    this.cueMode = m;
    this.route();
    this.changed();
  }

  setCueLevel(v: number) {
    this.cueLevel = v;
    this.applyChannel('A');
    this.applyChannel('B');
    this.changed();
  }

  /** Is this channel audible on the master right now? */
  onAir(id: DeckId): boolean {
    const [a, b] = crossfaderGains(this.crossfader, this.curve);
    return faderGain(this.state[id].fader) * (id === 'A' ? a : b) > 0.05;
  }
}

const buf = new Float32Array(1024);
/** Peak level in dBFS from an analyser. */
export function peakDb(an: AnalyserNode): number {
  an.getFloatTimeDomainData(buf);
  let m = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i]);
    if (v > m) m = v;
  }
  return m > 0 ? 20 * Math.log10(m) : -120;
}
