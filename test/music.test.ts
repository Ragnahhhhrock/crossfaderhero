import { describe, expect, it } from 'vitest';
import { musicStyle } from '../src/club/music';

describe('musicStyle', () => {
  it('reads the genre tag', () => {
    expect(musicStyle('Drum & Bass', 174)).toBe('dnb');
    expect(musicStyle('Tech House', 126)).toBe('house');
    expect(musicStyle('Techno (Peak Time)', 132)).toBe('techno');
    expect(musicStyle('Progressive Trance', 138)).toBe('trance');
    expect(musicStyle('Hip-Hop', 92)).toBe('hiphop');
    expect(musicStyle('Nu Disco', 118)).toBe('disco');
    expect(musicStyle('Trip Hop', 90)).toBe('chill');
  });
  it('falls back to the tempo', () => {
    expect(musicStyle('', 75)).toBe('chill');
    expect(musicStyle(undefined, 95)).toBe('hiphop');
    expect(musicStyle('', 124)).toBe('house');
    expect(musicStyle('', 130)).toBe('techno');
    expect(musicStyle('', 172)).toBe('dnb');
    expect(musicStyle('(none)', 140)).toBe('trance');
  });
});
