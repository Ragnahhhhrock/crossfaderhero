export type DeckId = 'A' | 'B';

/** Result of analysing one track. Cached in IndexedDB by track key. */
export interface Analysis {
  version: number;
  duration: number; // seconds
  bpm: number; // detected BPM at 0% tempo
  firstBeat: number; // seconds, first beat at or after 0
  downbeat: number; // 0..3 — which beat index (mod 4) is beat 1 of a bar
  key: string; // e.g. "A minor"
  camelot: string; // e.g. "8A"
  /** Interleaved [low, mid, high] peak bytes, `binsPerSecond` triplets per second. */
  waveform: Uint8Array;
  binsPerSecond: number;
}

export const ANALYSIS_VERSION = 3;

export interface TrackMeta {
  title: string;
  artist: string;
  album: string;
  genre: string;
  tagBpm?: number;
  tagKey?: string;
  artwork?: { mime: string; data: Uint8Array };
}

export interface Track {
  /** Stable cache key: path + size + mtime. */
  key: string;
  slot: DeckId;
  path: string; // relative path inside the USB, e.g. "House/track.mp3"
  name: string;
  size: number;
  lastModified: number;
  meta: TrackMeta;
  artworkUrl?: string;
  analysis?: Analysis;
  analysisState: 'pending' | 'running' | 'done' | 'error';
  getFile: () => Promise<File>;
}
