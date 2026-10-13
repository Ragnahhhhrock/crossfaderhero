import { describe, expect, it } from 'vitest';
import { groupTracks, labelFor, mainArtist, matches, periodOf, poolTracks, resolve } from '../src/library/sorting';
import { parseYear } from '../src/library/id3';
import type { SlotId, Track } from '../src/types';

const t = (key: string, meta: Partial<Track['meta']>, slot: SlotId = 'A'): Track => ({
  key, slot, folder: 0, path: key, name: key, size: 5e6, lastModified: 0,
  meta: { title: key, artist: '', album: '', genre: '', ...meta },
  analysisState: 'pending', getFile: async () => new File([], key),
});

describe('sorting', () => {
  it('reads periods and years', () => {
    expect(periodOf(1997)).toBe('1990s');
    expect(periodOf(2004)).toBe('2000s');
    expect(periodOf()).toBeNull();
    expect(parseYear('1997-05-01')).toBe(1997);
    expect(parseYear('2003/04')).toBe(2003);
    expect(parseYear('n/a')).toBeUndefined();
  });

  it('files collaborations with the main artist, keeps duos whole', () => {
    expect(mainArtist('Daft Punk feat. Pharrell')).toBe('Daft Punk');
    expect(mainArtist('DJ A vs. DJ B')).toBe('DJ A');
    expect(mainArtist('Simon & Garfunkel')).toBe('Simon & Garfunkel');
  });

  it('groups by label, untagged last', () => {
    const list = [t('a', { genre: 'House' }), t('b', { genre: 'house ' }), t('c', { genre: 'Techno' }), t('d', {})];
    const g = groupTracks(list, 'genre');
    expect(g.map((x) => [x.label, x.tracks.length])).toEqual([['House', 2], ['Techno', 1], [null, 1]]);
    expect(matches(list[1], 'genre', 'HOUSE')).toBe(true);
    expect(labelFor(list[0], 'category')).toBeNull();
  });

  it('sorts periods chronologically', () => {
    const g = groupTracks([t('a', { year: 2012 }), t('b', { year: 1988 }), t('c', { year: 1995 })], 'period');
    expect(g.map((x) => x.label)).toEqual(['1980s', '1990s', '2010s']);
  });

  it('pools every slot once and resolves keys in order', () => {
    const a = t('x', {}), b = t('y', {}, 'crate');
    const pool = poolTracks({ A: { tracks: [a] }, B: { tracks: [a] }, crate: { tracks: [b] } });
    expect(pool.map((p) => p.key)).toEqual(['x', 'y']);
    expect(resolve(['y', 'gone', 'x'], new Map(pool.map((p) => [p.key, p]))).map((p) => p.key)).toEqual(['y', 'x']);
  });
});
