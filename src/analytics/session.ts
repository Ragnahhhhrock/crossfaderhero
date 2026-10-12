/** Running totals for the session_summary event; bumped wherever the thing happens. */
export const session = {
  tracksLoaded: 0,
  tracksPlayed: 0,
  tracksFinished: 0,
  playSeconds: 0,
  cleanMixes: 0,
  trainwrecks: 0,
};

/** Library sizes as coarse buckets (fewer distinct values = easier reports). */
export function sizeBucket(n: number): string {
  if (n === 0) return '0';
  if (n < 10) return '1-9';
  if (n < 50) return '10-49';
  if (n < 200) return '50-199';
  if (n < 1000) return '200-999';
  return '1000+';
}

export function genreOf(genre: string | undefined): string {
  const g = (genre ?? '').trim().slice(0, 40);
  return g || '(none)';
}
