import { beforeEach, describe, expect, it } from 'vitest';
import { binTitle, compareRecords, filingKey, firstWithLetter, letterOf, lettersIn, stockBins, UNSORTED } from '../src/store/stock';
import { BAG_LIMIT, HAND_LIMIT, isRare, priceOf, quote } from '../src/store/pricing';
import { useShop } from '../src/store/shopState';
import type { Track } from '../src/types';

const t = (key: string, meta: Partial<Track['meta']>): Track => ({
  key, slot: 'A', folder: 0, path: key, name: key, size: 5e6, lastModified: 0,
  meta: { title: key, artist: '', album: '', genre: '', ...meta },
  analysisState: 'pending', getFile: async () => new File([], key),
});

describe('filing', () => {
  it('ignores "The", accents and punctuation', () => {
    expect(filingKey('The Prodigy')).toBe('prodigy');
    expect(filingKey('A Tribe Called Quest')).toBe('tribe called quest');
    expect(filingKey('Ålesund')).toBe('alesund');
    expect(filingKey('"Weird" Al')).toBe('weird" al');
    expect(filingKey('The')).toBe('the'); // a band called "The" still files somewhere
  });

  it('puts numbers and symbols under #', () => {
    expect(letterOf(t('a', { artist: '2 Unlimited' }))).toBe('#');
    expect(letterOf(t('b', { artist: 'The Chemical Brothers' }))).toBe('C');
  });

  it('sorts by artist then title, case-blind', () => {
    const list = [
      t('1', { artist: 'the Prodigy', title: 'Voodoo People' }),
      t('2', { artist: 'Aphex Twin', title: 'Xtal' }),
      t('3', { artist: 'aphex twin', title: 'Alberto Balsalm' }),
      t('4', { artist: 'Orbital', title: 'Halcyon' }),
    ].sort(compareRecords);
    expect(list.map((x) => x.key)).toEqual(['3', '2', '4', '1']);
  });

  it('files collaborations under the main artist and untagged under the title', () => {
    expect(letterOf(t('a', { artist: 'Zed feat. Anna', title: 'Aaa' }))).toBe('Z');
    expect(letterOf(t('b', { artist: '', title: 'Midnight' }))).toBe('M');
  });
});

describe('stocking bins', () => {
  const tracks = [
    t('1', { genre: 'House', artist: 'Bob', title: 'b' }),
    t('2', { genre: 'house', artist: 'Alice', title: 'a' }),
    t('3', { genre: 'Techno', artist: 'Carl', title: 'c' }),
    t('4', { genre: '', artist: 'Dee', title: 'd' }),
    t('5', { genre: 'Ambient', artist: 'Eno', title: 'e' }),
  ];

  it('makes one bin per genre, A–Z, untagged last, merging case', () => {
    const bins = stockBins(tracks);
    expect(bins.map((b) => b.genre)).toEqual(['Ambient', 'House', 'Techno', UNSORTED]);
    expect(bins[1].tracks.map((x) => x.key)).toEqual(['2', '1']); // Alice before Bob
  });

  it('splits a big genre into even, still-alphabetical bins with ranges', () => {
    const many = Array.from({ length: 10 }, (_, i) => t(`k${i}`, { genre: 'House', artist: String.fromCharCode(65 + i) + 'x', title: 't' }));
    const bins = stockBins(many, 4);
    expect(bins.map((b) => b.tracks.length)).toEqual([4, 4, 2]);
    expect(bins.every((b) => b.parts === 3)).toBe(true);
    expect(bins[0].range).toBe('A–D');
    expect(binTitle(bins[0])).toBe('House · A–D');
    const flat = bins.flatMap((b) => b.tracks.map((x) => x.key));
    expect(flat).toEqual(many.map((x) => x.key));
  });

  it('names a bin by more letters when it sits inside one letter', () => {
    const same = [t('1', { genre: 'Dub', artist: 'Bass Hit' }), t('2', { genre: 'Dub', artist: 'Bob' })];
    expect(stockBins(same)[0].range).toBe('Ba–Bo');
  });

  it('finds letters for the divider tabs', () => {
    const [bin] = stockBins([t('1', { genre: 'X', artist: 'Amy' }), t('2', { genre: 'X', artist: 'Bo' }), t('3', { genre: 'X', artist: 'Bz' }), t('4', { genre: 'X', artist: '7th' })]);
    expect(lettersIn(bin)).toEqual(['#', 'A', 'B']);
    expect(firstWithLetter(bin, 'B')).toBe(2);
    expect(firstWithLetter(bin, 'Z')).toBe(-1);
  });

  it('has no bins for an empty shop', () => {
    expect(stockBins([])).toEqual([]);
  });
});

describe('pricing and checkout', () => {
  const rec = t('some|record', { year: 1999 });

  it('prices a record the same way every time, within range', () => {
    expect(priceOf(rec)).toBe(priceOf(rec));
    for (let i = 0; i < 200; i++) {
      const x = t(`r${i}`, { year: 2005 });
      const p = priceOf(x);
      expect(p).toBeGreaterThanOrEqual(6);
      expect(p).toBeLessThanOrEqual(isRare(x) ? 38 : 19);
    }
  });

  it('charges more for old pressings', () => {
    const old = { ...rec, key: 'same', meta: { ...rec.meta, year: 1975 } };
    const modern = { ...rec, key: 'same', meta: { ...rec.meta, year: 2010 } };
    expect(priceOf(old)).toBeGreaterThan(priceOf(modern));
  });

  it('quotes the bag, skipping what you own, and refuses when short', () => {
    const a = t('a', {});
    const b = t('b', {});
    const total = priceOf(a) + priceOf(b);
    expect(quote([a, b], new Set(), total)).toEqual({ ok: true, total });
    expect(quote([a, b], new Set(['a']), 1000)).toEqual({ ok: true, total: priceOf(b) });
    const short = quote([a, b], new Set(), total - 1);
    expect(short.ok).toBe(false);
    expect(quote([], new Set(), 100).ok).toBe(false);
    expect(quote([a], new Set(['a']), 100).ok).toBe(false);
  });
});

describe('hands and bag', () => {
  beforeEach(() => useShop.setState({ hand: [], bag: [] }));

  it('carries a few records and no more', () => {
    for (let i = 0; i < HAND_LIMIT; i++) expect(useShop.getState().pickUp(`k${i}`)).toBe('ok');
    expect(useShop.getState().pickUp('extra')).toBe('full');
    expect(useShop.getState().pickUp('k0')).toBe('have');
    useShop.getState().putBack('k0');
    expect(useShop.getState().pickUp('extra')).toBe('ok');
  });

  it('moves a record from hand to bag and caps the bag', () => {
    useShop.getState().pickUp('a');
    expect(useShop.getState().addToBag('a')).toBe('ok');
    expect(useShop.getState().hand).toEqual([]);
    expect(useShop.getState().addToBag('a')).toBe('have');
    for (let i = 0; i < BAG_LIMIT - 1; i++) useShop.getState().addToBag(`b${i}`);
    expect(useShop.getState().addToBag('one-too-many')).toBe('full');
    useShop.getState().removeFromBag('a');
    expect(useShop.getState().addToBag('one-too-many')).toBe('ok');
  });
});
