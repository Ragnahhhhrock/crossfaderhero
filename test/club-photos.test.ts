import { describe, expect, it } from 'vitest';
import { defaultCharacter, normalise, randomCharacter } from '../src/character/options';
import { coverRect, fitWithin, isProfilePhoto, PROFILE_MAX_CHARS } from '../src/club/imageMath';

describe('club photos: picture maths', () => {
  it('crops a wide picture to a square from the middle', () => {
    const r = coverRect(1600, 900, 256, 256);
    expect(r.sh).toBeCloseTo(900);
    expect(r.sw).toBeCloseTo(900);
    expect(r.sx).toBeCloseTo(350);
    expect(r.sy).toBeCloseTo(0);
  });

  it('crops a tall picture to a wide screen from the middle', () => {
    const r = coverRect(900, 1600, 640, 320);
    expect(r.sw).toBeCloseTo(900);
    expect(r.sh).toBeCloseTo(450);
    expect(r.sy).toBeCloseTo(575);
    // the crop has the screen's shape, so nothing is stretched
    expect(r.sw / r.sh).toBeCloseTo(2);
  });

  it('zooms in towards the centre', () => {
    const flat = coverRect(1000, 500, 640, 320);
    const zoomed = coverRect(1000, 500, 640, 320, 1.25);
    expect(zoomed.sw).toBeCloseTo(flat.sw / 1.25);
    expect(zoomed.sx + zoomed.sw / 2).toBeCloseTo(500);
    // zoom never goes below 1 (no gaps at the edges)
    expect(coverRect(1000, 500, 640, 320, 0.5).sw).toBeCloseTo(flat.sw);
  });

  it('shrinks big pictures but never enlarges small ones', () => {
    expect(fitWithin(4000, 3000, 1000)).toEqual({ w: 1000, h: 750 });
    expect(fitWithin(3000, 4000, 1000)).toEqual({ w: 750, h: 1000 });
    expect(fitWithin(400, 300, 1000)).toEqual({ w: 400, h: 300 });
  });
});

describe('club photos: the DJ profile picture', () => {
  const ok = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

  it('accepts small image data URLs only', () => {
    expect(isProfilePhoto(ok)).toBe(true);
    expect(isProfilePhoto('')).toBe(false);
    expect(isProfilePhoto('https://example.com/me.jpg')).toBe(false);
    expect(isProfilePhoto('data:text/html;base64,PGgxPg==')).toBe(false);
    expect(isProfilePhoto(`data:image/jpeg;base64,${'A'.repeat(PROFILE_MAX_CHARS)}`)).toBe(false);
    expect(isProfilePhoto(42)).toBe(false);
  });

  it('starts with no picture', () => {
    expect(defaultCharacter().photo).toBe('');
    expect(randomCharacter().photo).toBe('');
  });

  it('keeps a good picture and drops a bad one when loading a save', () => {
    expect(normalise({ ...defaultCharacter(), photo: ok })!.photo).toBe(ok);
    expect(normalise({ ...defaultCharacter(), photo: 'javascript:alert(1)' })!.photo).toBe('');
  });

  it('loads a save from before pictures existed', () => {
    const { photo: _photo, ...old } = defaultCharacter();
    void _photo;
    expect(normalise(old)!.photo).toBe('');
  });
});
