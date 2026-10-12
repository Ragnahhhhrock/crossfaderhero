/// <reference lib="webworker" />
import { analyzeMono } from './analyze';

interface Req {
  id: number;
  samples: Float32Array;
  sampleRate: number;
  genre?: string;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, samples, sampleRate, genre } = e.data;
  try {
    const analysis = analyzeMono(samples, sampleRate, genre);
    (self as unknown as Worker).postMessage({ id, analysis }, [analysis.waveform.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
