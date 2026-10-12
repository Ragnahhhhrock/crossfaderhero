import { describe, expect, it } from 'vitest';
import { id3v2Size, metaFromFilename, parseId3v1, parseId3v2 } from '../src/library/id3';

function syncsafe(n: number): number[] {
  return [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
}

function frame23(id: string, payload: number[]): number[] {
  const n = payload.length;
  return [...id.split('').map((c) => c.charCodeAt(0)), (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, 0, 0, ...payload];
}

function frame24(id: string, payload: number[]): number[] {
  return [...id.split('').map((c) => c.charCodeAt(0)), ...syncsafe(payload.length), 0, 0, ...payload];
}

const latin = (s: string) => [0, ...s.split('').map((c) => c.charCodeAt(0))];
const utf8 = (s: string) => [3, ...new TextEncoder().encode(s)];
const utf16 = (s: string) => {
  const out = [1, 0xff, 0xfe];
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out.push(c & 255, c >> 8);
  }
  return out;
};

function tag(major: number, frames: number[]): Uint8Array {
  const body = [...frames, ...new Array(32).fill(0)];
  return new Uint8Array([0x49, 0x44, 0x33, major, 0, 0, ...syncsafe(body.length), ...body]);
}

describe('ID3v2', () => {
  it('reads v2.3 text frames, numeric genre and artwork', () => {
    const apic = [0, ...'image/png'.split('').map((c) => c.charCodeAt(0)), 0, 3, ...latin('cover').slice(1), 0, 0x89, 0x50, 0x4e, 0x47];
    const t = tag(3, [
      ...frame23('TIT2', latin('Night Drive')),
      ...frame23('TPE1', utf16('DJ Test')),
      ...frame23('TCON', latin('(35)')),
      ...frame23('TBPM', latin('128')),
      ...frame23('APIC', apic),
    ]);
    const m = parseId3v2(t);
    expect(m.title).toBe('Night Drive');
    expect(m.artist).toBe('DJ Test');
    expect(m.genre).toBe('House');
    expect(m.tagBpm).toBe(128);
    expect(m.artwork?.mime).toBe('image/png');
    expect(Array.from(m.artwork!.data)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(id3v2Size(t)).toBe(t.length);
  });

  it('reads v2.4 UTF-8 frames', () => {
    const t = tag(4, [...frame24('TIT2', utf8('Ünïcødé Tünë')), ...frame24('TCON', utf8('Drum & Bass'))]);
    const m = parseId3v2(t);
    expect(m.title).toBe('Ünïcødé Tünë');
    expect(m.genre).toBe('Drum & Bass');
  });

  it('ignores non-tags', () => {
    expect(parseId3v2(new Uint8Array([1, 2, 3]))).toEqual({});
  });
});

describe('ID3v1 and filenames', () => {
  it('reads an ID3v1 trailer', () => {
    const t = new Uint8Array(128);
    t.set([0x54, 0x41, 0x47]);
    t.set(new TextEncoder().encode('Title Here'), 3);
    t.set(new TextEncoder().encode('Artist Here'), 33);
    t[127] = 18;
    const m = parseId3v1(t);
    expect(m.title).toBe('Title Here');
    expect(m.artist).toBe('Artist Here');
    expect(m.genre).toBe('Techno');
  });

  it('splits "Artist - Title" filenames', () => {
    expect(metaFromFilename('Some Artist - Big_Tune.mp3')).toEqual({ artist: 'Some Artist', title: 'Big Tune' });
    expect(metaFromFilename('untitled.mp3')).toEqual({ artist: '', title: 'untitled' });
  });
});
