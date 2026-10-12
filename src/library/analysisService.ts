import { createStore, get, set } from 'idb-keyval';
import { ANALYSIS_VERSION, type Analysis } from '../types';

const store = createStore('cfh-analysis', 'tracks');

export async function getCachedAnalysis(key: string): Promise<Analysis | undefined> {
  try {
    const a = (await get(key, store)) as Analysis | undefined;
    return a && a.version === ANALYSIS_VERSION ? a : undefined;
  } catch {
    return undefined;
  }
}

export async function saveAnalysis(key: string, a: Analysis): Promise<void> {
  try {
    await set(key, a, store);
  } catch {
    /* storage full or blocked — analysis just won't be cached */
  }
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (a: Analysis) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; analysis?: Analysis; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.analysis) p.resolve(e.data.analysis);
      else p.reject(new Error(e.data.error ?? 'analysis failed'));
    };
  }
  return worker;
}

export function toMono(buf: AudioBuffer): Float32Array {
  const n = buf.length;
  if (buf.numberOfChannels === 1) return buf.getChannelData(0).slice();
  const out = new Float32Array(n);
  const chs = buf.numberOfChannels;
  for (let c = 0; c < chs; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i] / chs;
  }
  return out;
}

/** Analyse already-decoded audio in the worker. */
export function analyzeBuffer(buf: AudioBuffer, genre?: string): Promise<Analysis> {
  const samples = toMono(buf);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, samples, sampleRate: buf.sampleRate, genre }, [samples.buffer]);
  });
}

let offline: OfflineAudioContext | null = null;

/** Decode a file for background analysis (44.1 kHz, independent of the live context). */
export async function decodeForAnalysis(file: File): Promise<AudioBuffer> {
  if (!offline) offline = new OfflineAudioContext(1, 1, 44100);
  const data = await file.arrayBuffer();
  return offline.decodeAudioData(data);
}
