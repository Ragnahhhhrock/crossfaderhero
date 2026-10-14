import { describe, expect, it } from 'vitest';
import { norm, pickBest, similarity } from '../worker/cover.js';
import { coverKey } from '../src/library/cover';

describe('cover lookup matching', () => {
  it('normalises titles', () => {
    expect(norm('One More Time (Original Mix)')).toBe('one more time');
    expect(norm('The Prodigy')).toBe('prodigy');
    expect(norm('Café del Mar [Remastered]')).toBe('cafe del mar');
    expect(norm('Losing It feat. Somebody')).toBe('losing it');
  });

  it('scores similarity', () => {
    expect(similarity('Daft Punk', 'daft punk')).toBe(1);
    expect(similarity('Discovery', 'Discovery (Deluxe)')).toBe(1);
    expect(similarity('Daft Punk', 'Justice')).toBe(0);
  });

  it('needs the artist to match', () => {
    const q = { artist: 'Daft Punk', album: 'Discovery', title: 'One More Time' };
    const best = pickBest(q, [
      { artist: 'Discovery Band', album: 'Discovery', title: '', image: 'wrong' },
      { artist: 'Daft Punk', album: 'Homework', title: 'Da Funk', image: 'meh' },
      { artist: 'Daft Punk', album: 'Discovery', title: '', image: 'right' },
    ]);
    expect(best?.image).toBe('right');
    expect(pickBest({ artist: 'Nobody', title: 'Nothing' }, [{ artist: 'Daft Punk', title: 'Nothing', image: 'x' }])).toBeNull();
  });

  it('groups tracks by album', () => {
    const meta = (artist: string, album: string, title: string) => ({ meta: { artist, album, title, genre: '' } });
    expect(coverKey(meta('Daft Punk', 'Discovery', 'A'))).toBe(coverKey(meta('daft punk', 'Discovery', 'B')));
    expect(coverKey(meta('', 'X', 'Y'))).toBeNull();
    expect(coverKey(meta('Various Artists', 'X', 'Y'))).toBeNull();
    expect(coverKey(meta('Burial', '', 'Archangel'))).toBe('burial|title|archangel');
  });
});
