import type { DeckId, Track } from '../types';
import { Deck } from './deck';
import { Mixer } from './mixer';
import { Turntable } from './turntable';
import type { Player } from './player';
import { analyzeBuffer } from '../library/analysisService';
import { useLibrary } from '../state/library';
import { track as gaTrack } from '../analytics/ga';
import { genreOf, session } from '../analytics/session';

export class Engine {
  readonly ctx: AudioContext;
  /** The CDJs. */
  readonly decks: Record<DeckId, Deck>;
  readonly turntables: Record<DeckId, Turntable>;
  readonly mixer: Mixer;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.mixer = new Mixer(this.ctx);
    this.decks = { A: new Deck('A', this.ctx), B: new Deck('B', this.ctx) };
    this.turntables = { A: new Turntable('A', this.ctx), B: new Turntable('B', this.ctx) };
    for (const id of ['A', 'B'] as DeckId[]) {
      this.decks[id].output.connect(this.mixer.channels[id].cd);
      this.turntables[id].output.connect(this.mixer.channels[id].phono);
    }
  }

  /** Whatever is plugged into channel `id` right now: its CDJ or its turntable. */
  player(id: DeckId): Player {
    return this.mixer.state[id].input === 'phono' ? this.turntables[id] : this.decks[id];
  }

  /** The source on the other channel. */
  other(id: DeckId): Player {
    return this.player(id === 'A' ? 'B' : 'A');
  }

  /** Decode a track and make sure it's analysed. */
  private async prepare(track: Track) {
    const file = await track.getFile();
    const data = await file.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(data);
    let analysis = useLibrary.getState().findTrack(track.key)?.analysis ?? track.analysis;
    if (!analysis) {
      analysis = await analyzeBuffer(buffer, track.meta.genre);
      useLibrary.getState().setAnalysis(track.key, analysis);
    }
    return { buffer, analysis };
  }

  /** Put a record from the crate on a turntable. Refuses if the record there is playing on air. */
  async loadRecord(id: DeckId, track: Track): Promise<{ ok: boolean; reason?: string }> {
    const tt = this.turntables[id];
    if (tt.playing && this.mixer.state[id].input === 'phono' && this.mixer.onAir(id)) {
      gaTrack('track_load_failed', { deck: id, error_type: 'on_air' });
      return { ok: false, reason: `Turntable ${id} is playing on air — lift the needle or pull its fader down first.` };
    }
    if (tt.loading) return { ok: false, reason: `Turntable ${id} is still loading.` };
    this.resume();
    tt.setLoading(true);
    try {
      const { buffer, analysis } = await this.prepare(track);
      await tt.load({ ...track, analysis, analysisState: 'done' }, buffer, analysis);
      session.tracksLoaded++;
      gaTrack('record_load', {
        deck: id,
        genre: genreOf(track.meta.genre),
        bpm: Math.round(analysis.bpm),
        camelot: analysis.camelot,
      });
      return { ok: true };
    } catch (e) {
      gaTrack('track_load_failed', { deck: id, error_type: (e as Error).name === 'EncodingError' ? 'decode' : 'read' });
      return { ok: false, reason: `Couldn't put "${track.meta.title}" on the turntable: ${(e as Error).message}` };
    } finally {
      tt.setLoading(false);
    }
  }

  resume() {
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  /** Load a track onto a deck. Refuses if the deck is playing on air, like a real CDJ booth rule. */
  async loadTrack(id: DeckId, track: Track): Promise<{ ok: boolean; reason?: string }> {
    const deck = this.decks[id];
    if (deck.playing && this.mixer.onAir(id)) {
      gaTrack('track_load_failed', { deck: id, error_type: 'on_air' });
      return { ok: false, reason: `Deck ${id} is playing on air — pause it or pull its fader down first.` };
    }
    if (deck.loading) return { ok: false, reason: `Deck ${id} is still loading.` };
    this.resume();
    deck.setLoading(true);
    try {
      const { buffer, analysis } = await this.prepare(track);
      if (deck.playing) deck.pause();
      await deck.load({ ...track, analysis, analysisState: 'done' }, buffer, analysis);
      session.tracksLoaded++;
      gaTrack('track_load', {
        deck: id,
        genre: genreOf(track.meta.genre),
        bpm: Math.round(analysis.bpm),
        camelot: analysis.camelot,
        length_min: Math.round(analysis.duration / 6) / 10,
      });
      return { ok: true };
    } catch (e) {
      gaTrack('track_load_failed', { deck: id, error_type: (e as Error).name === 'EncodingError' ? 'decode' : 'read' });
      return { ok: false, reason: `Couldn't load "${track.meta.title}": ${(e as Error).message}` };
    } finally {
      deck.setLoading(false);
    }
  }

  /** Persist a manual grid change (×2, ÷2, shift). */
  adjustGrid(id: DeckId, change: { bpmFactor?: number; shift?: number }) {
    const deck = this.decks[id];
    const a = deck.adjustGrid(change);
    if (a && deck.track) {
      useLibrary.getState().setAnalysis(deck.track.key, a);
      // the same record may be on a turntable too
      for (const t of Object.values(this.turntables)) if (t.track?.key === deck.track.key) t.updateAnalysis(a);
    }
  }
}

export const engine = new Engine();
// handy for debugging in the console
(globalThis as unknown as { cfh: Engine }).cfh = engine;
