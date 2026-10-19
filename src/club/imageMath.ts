/** Picture maths with no DOM, so the character data and the tests can use it. */

/** A profile picture's data URL is never longer than this (it lives in localStorage with the character). */
export const PROFILE_MAX_CHARS = 120_000;

/** The part of the source image that fills a `dw` × `dh` box with no gaps and no stretching, centred. */
export function coverRect(sw: number, sh: number, dw: number, dh: number, zoom = 1): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(dw / sw, dh / sh) * Math.max(1, zoom);
  const w = dw / scale;
  const h = dh / scale;
  return { sx: (sw - w) / 2, sy: (sh - h) / 2, sw: w, sh: h };
}

/** The size an image shrinks to so its longest side is at most `max` (never bigger than it started). */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Is this a profile picture we saved: a small image data URL? */
export function isProfilePhoto(v: unknown): v is string {
  return typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(v) && v.length <= PROFILE_MAX_CHARS;
}
