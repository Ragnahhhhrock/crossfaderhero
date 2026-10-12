import type { Analysis, DeckId, Track } from '../types';
import { beatAt, beatLength, beatTime, quantize, type Grid } from './grid';

export type TempoRange = 6 | 10 | 16;
export const HOT_CUES = 8;

export interface Loop {
  start: number;
  end: number;
  beats: number; // 0 = manual
  active: boolean;
}

/**
 * One CDJ: an AudioBufferSourceNode player with CDJ-style transport.
 * The source node can't seek, so every jump starts a fresh node. Position is
 * tracked analytically from an anchor (context time, track position, rate).
 */
export class Deck {
  readonly id: DeckId;
  readonly ctx: AudioContext;
  readonly output: GainNode;

  track: Track | null = null;
  buffer: AudioBuffer | null = null;
  analysis: Analysis | null = null;
  loading = false;

  playing = false;
  private source: AudioBufferSourceNode | null = null;
  private anchorCtx = 0;
  private anchorPos = 0;
  private pausePos = 0;

  tempo = 0; // fraction, e.g. 0.034 = +3.4%
  range: TempoRange = 10;
  private nudge = 0; // fraction, jog bend while playing
  quantizeOn = true;

  cuePoint = 0;
  private cuePreview = false;
  hotCues: (number | null)[] = new Array(HOT_CUES).fill(null);
  loop: Loop | null = null;
  loopSize = 4; // beats, for auto loop and beat jump

  /** Remember hot cues per track for the session. */
  private static cueMemory = new Map<string, { cue: number; hot: (number | null)[] }>();

  private listeners = new Set<() => void>();
  version = 0;

  constructor(id: DeckId, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.output = ctx.createGain();
  }

  // ---------- change notification ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  private changed() {
    this.version++;
    for (const l of this.listeners) l();
  }

  // ---------- derived ----------
  get rate(): number {
    return (1 + this.tempo) * (1 + this.nudge);
  }
  get grid(): Grid | null {
    return this.analysis ? { bpm: this.analysis.bpm, firstBeat: this.analysis.firstBeat, downbeat: this.analysis.downbeat } : null;
  }
  get duration(): number {
    return this.buffer?.duration ?? 0;
  }
  get bpm(): number {
    return this.analysis ? this.analysis.bpm * (1 + this.tempo) : 0;
  }
  get loaded(): boolean {
    return !!this.buffer;
  }

  get position(): number {
    if (!this.playing) return this.pausePos;
    let pos = this.anchorPos + (this.ctx.currentTime - this.anchorCtx) * this.rate;
    const l = this.loop;
    if (l?.active && pos >= l.end) {
      const len = l.end - l.start;
      pos = l.start + ((pos - l.start) % len);
    }
    return Math.min(pos, this.duration);
  }

  private reanchor() {
    const pos = this.position;
    this.anchorPos = pos;
    this.anchorCtx = this.ctx.currentTime;
  }

  private applyRate() {
    if (this.playing) {
      this.reanchor();
      this.source?.playbackRate.setValueAtTime(this.rate, this.ctx.currentTime);
    }
  }

  // ---------- loading ----------
  async load(track: Track, buffer: AudioBuffer, analysis: Analysis) {
    this.stopSource();
    this.playing = false;
    this.track = track;
    this.buffer = buffer;
    this.analysis = analysis;
    this.loop = null;
    const mem = Deck.cueMemory.get(track.key);
    this.hotCues = mem ? mem.hot.slice() : new Array(HOT_CUES).fill(null);
    this.cuePoint = mem ? mem.cue : analysis.firstBeat;
    this.pausePos = this.cuePoint;
    this.changed();
  }

  setLoading(v: boolean) {
    this.loading = v;
    this.changed();
  }

  updateAnalysis(a: Analysis) {
    this.reanchor();
    this.analysis = a;
    this.changed();
  }

  private remember() {
    if (this.track) Deck.cueMemory.set(this.track.key, { cue: this.cuePoint, hot: this.hotCues.slice() });
  }

  // ---------- transport ----------
  private startSource(pos: number) {
    if (!this.buffer) return;
    this.stopSource();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.rate;
    if (this.loop?.active) {
      src.loop = true;
      src.loopStart = this.loop.start;
      src.loopEnd = this.loop.end;
    }
    src.connect(this.output);
    src.onended = () => {
      if (this.source !== src) return;
      this.source = null;
      this.playing = false;
      this.pausePos = this.duration;
      this.changed();
    };
    src.start(0, Math.max(0, Math.min(pos, this.duration - 0.001)));
    this.source = src;
    this.anchorCtx = this.ctx.currentTime;
    this.anchorPos = pos;
    this.playing = true;
  }

  private stopSource() {
    const s = this.source;
    this.source = null;
    if (s) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      s.disconnect();
    }
  }

  play() {
    if (!this.buffer || this.playing) return;
    void this.ctx.resume();
    this.cuePreview = false;
    if (this.pausePos >= this.duration - 0.01) this.pausePos = this.cuePoint;
    this.startSource(this.pausePos);
    this.changed();
  }

  pause() {
    if (!this.playing) return;
    this.pausePos = this.position;
    this.stopSource();
    this.playing = false;
    this.changed();
  }

  togglePlay() {
    if (this.playing) {
      // Play pressed while holding CUE latches playback — handled by cuePreview=false in play()
      this.pause();
    } else this.play();
  }

  seek(pos: number) {
    if (!this.buffer) return;
    pos = Math.max(0, Math.min(pos, this.duration - 0.01));
    if (this.loop?.active && (pos < this.loop.start || pos >= this.loop.end)) this.loop = { ...this.loop, active: false };
    if (this.playing) this.startSource(pos);
    else this.pausePos = pos;
    this.changed();
  }

  /** CDJ CUE button down. */
  cueDown() {
    if (!this.buffer) return;
    if (this.playing && !this.cuePreview) {
      // back to cue and stop
      this.stopSource();
      this.playing = false;
      this.pausePos = this.cuePoint;
    } else if (!this.playing) {
      const pos = this.pausePos;
      if (Math.abs(pos - this.cuePoint) < 0.005) {
        // hold to preview from the cue
        void this.ctx.resume();
        this.startSource(this.cuePoint);
        this.cuePreview = true;
      } else {
        const g = this.grid;
        this.cuePoint = g && this.quantizeOn ? quantize(g, pos) : pos;
        this.pausePos = this.cuePoint;
        this.remember();
      }
    }
    this.changed();
  }

  /** CDJ CUE button up — ends a cue preview. */
  cueUp() {
    if (this.cuePreview && this.playing) {
      this.stopSource();
      this.playing = false;
      this.pausePos = this.cuePoint;
    }
    this.cuePreview = false;
    this.changed();
  }

  // ---------- hot cues ----------
  hotCue(i: number) {
    if (!this.buffer) return;
    const t = this.hotCues[i];
    if (t === null) {
      const g = this.grid;
      const pos = this.position;
      this.hotCues[i] = g && this.quantizeOn ? quantize(g, pos) : pos;
      this.remember();
      this.changed();
      return;
    }
    if (this.playing) {
      // jump in phase: keep the fractional beat position so the mix doesn't break
      const g = this.grid;
      if (g && this.quantizeOn) {
        const frac = beatAt(g, this.position) - Math.floor(beatAt(g, this.position));
        this.seek(beatTime(g, Math.round(beatAt(g, t)) + frac));
      } else this.seek(t);
    } else {
      this.seek(t);
      this.cuePoint = t;
      this.remember();
    }
  }

  deleteHotCue(i: number) {
    this.hotCues[i] = null;
    this.remember();
    this.changed();
  }

  // ---------- loops & beat jump ----------
  autoLoop(beats: number) {
    const g = this.grid;
    if (!this.buffer || !g) return;
    if (this.loop?.active && this.loop.beats === beats) return this.exitLoop();
    const pos = this.position;
    const len = beatLength(g) * beats;
    let start: number;
    if (this.quantizeOn) {
      // start on the beat (or sub-beat) we're in
      const unit = beats < 1 ? beats : 1;
      start = beatTime(g, Math.floor(beatAt(g, pos) / unit) * unit);
    } else start = pos;
    const end = Math.min(start + len, this.duration);
    this.loop = { start, end, beats, active: true };
    this.loopSize = beats;
    if (this.playing) {
      if (pos >= end) this.startSource(start);
      else if (this.source) {
        this.source.loopStart = start;
        this.source.loopEnd = end;
        this.source.loop = true;
      }
    }
    this.changed();
  }

  exitLoop() {
    if (!this.loop) return;
    if (this.playing) {
      this.reanchor();
      if (this.source) this.source.loop = false;
    }
    this.loop = { ...this.loop, active: false };
    this.changed();
  }

  reloop() {
    if (!this.loop) return;
    this.loop = { ...this.loop, active: true };
    if (this.playing) this.startSource(this.loop.start);
    else this.pausePos = this.loop.start;
    this.changed();
  }

  /** Halve or double the active loop, keeping its start. */
  resizeLoop(factor: number) {
    const g = this.grid;
    if (!g) return;
    const beats = Math.max(1 / 8, Math.min(64, (this.loop?.beats || this.loopSize) * factor));
    this.loopSize = beats;
    if (this.loop?.active) {
      const pos = this.position;
      const end = Math.min(this.loop.start + beatLength(g) * beats, this.duration);
      this.loop = { ...this.loop, end, beats };
      if (this.playing) {
        if (pos >= end) this.startSource(this.loop.start);
        else if (this.source) this.source.loopEnd = end;
      }
    }
    this.changed();
  }

  beatJump(beats: number) {
    const g = this.grid;
    if (!g || !this.buffer) return;
    const delta = beatLength(g) * beats;
    if (this.loop?.active) {
      // move the loop with the playhead, like a CDJ
      this.loop = { ...this.loop, start: this.loop.start + delta, end: this.loop.end + delta };
    }
    const target = this.position + delta;
    if (this.playing) this.startSource(Math.max(0, target));
    else this.pausePos = Math.max(0, Math.min(target, this.duration - 0.01));
    this.changed();
  }

  // ---------- tempo ----------
  /** Fader value -1..1 (down = faster, as on a CDJ, is handled by the UI). */
  setTempoFraction(f: number) {
    const step = this.range === 6 ? 0.0002 : 0.0005;
    const t = Math.round((f * this.range) / 100 / step) * step;
    this.tempo = Math.max(-this.range / 100, Math.min(this.range / 100, t));
    this.applyRate();
    this.changed();
  }

  setTempo(t: number) {
    this.tempo = Math.max(-this.range / 100, Math.min(this.range / 100, t));
    this.applyRate();
    this.changed();
  }

  cycleRange() {
    const order: TempoRange[] = [6, 10, 16];
    this.range = order[(order.indexOf(this.range) + 1) % order.length];
    this.setTempo(this.tempo);
  }

  resetTempo() {
    this.setTempo(0);
  }

  toggleQuantize() {
    this.quantizeOn = !this.quantizeOn;
    this.changed();
  }

  /** Jog wheel: `amount` is a bend fraction while playing (e.g. ±0.08). */
  setNudge(amount: number) {
    this.nudge = Math.max(-0.5, Math.min(0.5, amount));
    this.applyRate();
  }

  /** Jog while paused: scrub by seconds. */
  scrub(seconds: number) {
    if (this.playing || !this.buffer) return;
    this.pausePos = Math.max(0, Math.min(this.pausePos + seconds, this.duration - 0.01));
    this.changed();
  }

  /** Match tempo (and beat phase if both are playing) to another deck. */
  syncTo(other: Deck): boolean {
    if (!this.analysis || !other.analysis) return false;
    let target = other.bpm / this.analysis.bpm - 1;
    // allow half/double-time matching if the straight match is out of range
    for (const m of [1, 2, 0.5]) {
      const t = (other.bpm * m) / this.analysis.bpm - 1;
      if (Math.abs(t) <= this.range / 100) {
        target = t;
        break;
      }
    }
    if (Math.abs(target) > this.range / 100) {
      if (Math.abs(target) <= 0.16) this.range = 16;
      else return false;
    }
    this.setTempo(target);
    const g = this.grid;
    const og = other.grid;
    if (this.playing && other.playing && g && og) {
      const myPhase = beatAt(g, this.position);
      const otherPhase = beatAt(og, other.position);
      let d = (otherPhase - Math.floor(otherPhase)) - (myPhase - Math.floor(myPhase));
      if (d > 0.5) d -= 1;
      if (d < -0.5) d += 1;
      this.seek(this.position + d * beatLength(g));
    }
    return true;
  }

  /** Manual grid fixes. */
  adjustGrid(change: { bpmFactor?: number; shift?: number }): Analysis | null {
    if (!this.analysis) return null;
    const a = { ...this.analysis };
    if (change.bpmFactor) {
      a.bpm = Math.round(a.bpm * change.bpmFactor * 100) / 100;
      if (change.bpmFactor < 1) a.downbeat = 0;
    }
    if (change.shift) {
      const period = 60 / a.bpm;
      a.firstBeat = (((a.firstBeat + change.shift) % period) + period) % period;
    }
    this.updateAnalysis(a);
    return a;
  }

  eject() {
    this.stopSource();
    this.playing = false;
    this.track = null;
    this.buffer = null;
    this.analysis = null;
    this.loop = null;
    this.pausePos = 0;
    this.changed();
  }
}
