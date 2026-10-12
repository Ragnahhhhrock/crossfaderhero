import type { DeckId, Track } from '../types';
import { Deck } from './deck';
import { Mixer } from './mixer';
import { analyzeBuffer } from '../library/analysisService';
import { useLibrary } from '../state/library';
import { track as gaTrack } from '../analytics/ga';
import { genreOf, session } from '../analytics/session';

export class Engine {
  readonly ctx: AudioContext;
  readonly decks: Record<DeckId, Deck>;
  readonly mixer: Mixer;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.mixer = new Mixer(this.ctx);
    this.decks = { A: new Deck('A', this.ctx), B: new Deck('B', this.ctx) };
    this.decks.A.output.connect(this.mixer.channels.A.input);
    this.decks.B.output.connect(this.mixer.channels.B.input);
  }

  other(id: DeckId): Deck {
    return this.decks[id === 'A' ? 'B' : 'A'];
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
      const file = await track.getFile();
      const data = await file.arrayBuffer();
      const buffer = await this.ctx.decodeAudioData(data);
      let analysis = useLibrary.getState().findTrack(track.key)?.analysis ?? track.analysis;
      if (!analysis) {
        analysis = await analyzeBuffer(buffer, track.meta.genre);
        useLibrary.getState().setAnalysis(track.key, analysis);
      }
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
    if (a && deck.track) useLibrary.getState().setAnalysis(deck.track.key, a);
  }
}

export const engine = new Engine();
// handy for debugging in the console
(globalThis as unknown as { cfh: Engine }).cfh = engine;
