/**
 * The turntable's needle: reads the record at whatever speed and direction the
 * platter physics says, sample by sample, so scratches, back-spins, spin-ups
 * and brakes sound right. Runs in the audio thread.
 */
import { stepPlatter, type PlatterParams, type PlatterState } from './platter';

declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}

type Msg =
  | { type: 'load'; channels: Float32Array[]; rate: number; pos: number }
  | { type: 'eject' }
  | { type: 'params'; params: Omit<PlatterParams, 'held' | 'handTarget'> }
  | { type: 'grab' }
  | { type: 'hand'; offset: number }
  | { type: 'release' }
  | { type: 'needle'; down: boolean; pos?: number }
  | { type: 'crackle'; level: number };

class TurntableProcessor extends AudioWorkletProcessor {
  private ch: Float32Array[] = [];
  private srcRate = 44100;
  private duration = 0;
  private s: PlatterState = { platter: 0, record: 0, rot: 0, pos: 0 };
  private p: PlatterParams = { motor: false, power: true, target: 1, startTime: 0.7, brakeTime: 0.6, nudge: 0, held: false, handTarget: 0 };
  private anchor = 0;
  private needleDown = false;
  private thump = 0; // samples left of the needle-drop thump
  private crackle = 0.35;
  private gainSmooth = 0;
  private lp = [0, 0];
  private blocks = 0;
  private seed = 12345;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<Msg>) => this.onMsg(e.data);
  }

  private onMsg(m: Msg) {
    switch (m.type) {
      case 'load':
        this.ch = m.channels;
        this.srcRate = m.rate;
        this.duration = m.channels[0].length / m.rate;
        this.s.pos = m.pos;
        this.s.record = this.p.held ? 0 : this.s.platter;
        break;
      case 'eject':
        this.ch = [];
        this.duration = 0;
        this.s.pos = 0;
        this.needleDown = false;
        break;
      case 'params':
        Object.assign(this.p, m.params);
        break;
      case 'grab':
        this.p.held = true;
        this.anchor = this.s.rot;
        this.p.handTarget = this.s.rot;
        break;
      case 'hand':
        this.p.handTarget = this.anchor + m.offset;
        break;
      case 'release':
        this.p.held = false;
        break;
      case 'needle':
        if (m.pos !== undefined) this.s.pos = Math.max(0, Math.min(m.pos, this.duration));
        if (m.down && !this.needleDown) this.thump = Math.round(sampleRate * 0.07);
        this.needleDown = m.down;
        break;
      case 'crackle':
        this.crackle = m.level;
        break;
    }
  }

  private rand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  process(_in: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] ?? out[0];
    const n = L.length;
    const dt = 1 / sampleRate;
    const has = this.ch.length > 0 && this.duration > 0;
    const cl = this.ch[0];
    const cr = this.ch[1] ?? this.ch[0];
    const len = has ? cl.length : 0;

    for (let i = 0; i < n; i++) {
      stepPlatter(this.s, this.p, dt, this.duration, this.needleDown && has);
      let l = 0;
      let r = 0;
      if (has && this.needleDown) {
        // 4-point Hermite interpolation at the needle position
        const x = this.s.pos * this.srcRate;
        const i1 = Math.floor(x);
        const f = x - i1;
        const inGroove = this.s.pos > 0 && this.s.pos < this.duration;
        if (inGroove && i1 >= 1 && i1 + 2 < len) {
          l = hermite(cl[i1 - 1], cl[i1], cl[i1 + 1], cl[i1 + 2], f);
          r = hermite(cr[i1 - 1], cr[i1], cr[i1 + 1], cr[i1 + 2], f);
        }
        // the cartridge's output follows stylus speed: slow drags are quiet and dull
        const v = Math.abs(this.s.record);
        const g = Math.min(1, v / 0.3);
        this.gainSmooth += (g - this.gainSmooth) * 0.01;
        const k = Math.min(1, 0.08 + v * 0.9); // one-pole low-pass, opens up with speed
        this.lp[0] += (l - this.lp[0]) * k;
        this.lp[1] += (r - this.lp[1]) * k;
        l = this.lp[0] * this.gainSmooth;
        r = this.lp[1] * this.gainSmooth;
        // surface noise: the odd pop and a faint hiss, only while the record moves
        if (this.crackle > 0 && v > 0.05) {
          const pop = this.rand() < 0.00012 * v ? (this.rand() - 0.5) * 0.25 : 0;
          const hiss = (this.rand() - 0.5) * 0.004;
          const c = (pop + hiss) * this.crackle;
          l += c;
          r += c;
        }
      } else {
        this.gainSmooth *= 0.99;
      }
      if (this.thump > 0) {
        const t = 1 - this.thump / (sampleRate * 0.07);
        const th = Math.sin(2 * Math.PI * 45 * t * 0.07) * (1 - t) * 0.18;
        l += th;
        r += th;
        this.thump--;
      }
      L[i] = l;
      if (R !== L) R[i] = r;
    }

    if (++this.blocks % 3 === 0) {
      this.port.postMessage({ pos: this.s.pos, rot: this.s.rot, record: this.s.record, platter: this.s.platter, needle: this.needleDown, t: currentTime });
    }
    return true;
  }
}

function hermite(xm1: number, x0: number, x1: number, x2: number, t: number): number {
  const c = (x1 - xm1) * 0.5;
  const v = x0 - x1;
  const w = c + v;
  const a = w + v + (x2 - x0) * 0.5;
  const b = w + a;
  return ((a * t - b) * t + c) * t + x0;
}

registerProcessor('cfh-turntable', TurntableProcessor);
