/**
 * "Pressing" an MP3 to vinyl: the record sleeve, the centre label and the
 * grooves, all drawn from the track's tags, cover art and analysis.
 * Used by the crate browser (2D), the turntable panel and the 3D room.
 */
import type { Analysis, Track } from '../types';
import { alpha, font, shade, token } from '../design/tokens';
import { GROOVE_INNER, GROOVE_OUTER, positionAtRadius } from '../audio/platter';
import { artworkUrlOf, coverSettled } from './cover';

/** Record radius in metres (a 12" record). */
export const RECORD_R = 0.152;
export const LABEL_R = 0.05;

type Palette = [bg: string, fg: string, accent: string];
const PALETTES: Palette[] = [
  ['print-red', 'print-paper', 'print-ink'],
  ['print-ink', 'print-sun', 'print-magenta'],
  ['print-night', 'print-magenta', 'print-paper'],
  ['print-plum', 'print-gold', 'print-paper'],
  ['print-paper', 'print-ink', 'print-red'],
  ['print-violet', 'print-paper', 'print-sun'],
  ['print-sun', 'print-ink', 'print-red'],
  ['wave-low', 'print-paper', 'print-sun'],
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function paletteFor(t: Track): Palette {
  return PALETTES[hash(t.key) % PALETTES.length];
}

const images = new Map<string, Promise<HTMLImageElement | null>>();
/** Load (once) the track's cover art, or null if it has none or it won't decode. */
export function artworkImage(t: Track): Promise<HTMLImageElement | null> {
  const url = artworkUrlOf(t);
  if (!url) return Promise.resolve(null);
  return loadImage(url);
}

/** Like artworkImage, but waits for an online cover lookup that's still running. */
export function artworkImageWhenReady(t: Track): Promise<HTMLImageElement | null> {
  return coverSettled(t).then((url) => (url ? loadImage(url) : null));
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
}

function fitText(g: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (g.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && g.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

/** BPM and key scribbled on the sleeve in marker, like a DJ does. */
function markerNotes(g: CanvasRenderingContext2D, size: number, t: Track) {
  const a = t.analysis;
  if (!a) return;
  g.save();
  g.translate(size * 0.8, size * 0.13);
  g.rotate(-0.12);
  const text = `${Math.round(a.bpm)}  ${a.camelot}`;
  g.font = font('ui', size * 0.085, 700);
  const w = g.measureText(text).width + size * 0.06;
  g.fillStyle = alpha('print-paper', 0.92);
  g.fillRect(-w / 2, -size * 0.07, w, size * 0.11);
  g.fillStyle = token('print-ink');
  g.textAlign = 'center';
  g.fillText(text, 0, size * 0.015);
  g.restore();
}

/** Draw a sleeve: the cover art if the MP3 has one, otherwise a generated design. */
export function drawSleeve(g: CanvasRenderingContext2D, size: number, t: Track, img: HTMLImageElement | null) {
  const [bg, fg, ac] = paletteFor(t);
  const h = hash(t.key);
  g.save();
  if (img) {
    g.drawImage(img, 0, 0, size, size);
  } else {
    const style = (h >> 4) % 4;
    if (style === 0) {
      // white label: plain sleeve with a die-cut hole showing the label
      g.fillStyle = token('sleeve-white');
      g.fillRect(0, 0, size, size);
      g.fillStyle = token('vinyl-black');
      g.beginPath();
      g.arc(size / 2, size / 2, size * 0.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = token(bg);
      g.beginPath();
      g.arc(size / 2, size / 2, size * 0.16, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = token('vinyl-black');
      g.beginPath();
      g.arc(size / 2, size / 2, size * 0.012, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = token(bg);
      g.fillRect(0, 0, size, size);
      g.fillStyle = token(ac);
      g.strokeStyle = token(fg);
      if (style === 1) {
        g.lineWidth = size * 0.05;
        for (let i = -4; i < 10; i++) {
          g.strokeStyle = token(i % 2 ? fg : ac);
          g.beginPath();
          g.moveTo(i * size * 0.14, size);
          g.lineTo(i * size * 0.14 + size, 0);
          g.stroke();
        }
      } else if (style === 2) {
        for (let r = 0.46; r > 0.04; r -= 0.07) {
          g.fillStyle = token(Math.round(r * 100) % 2 ? fg : ac);
          g.beginPath();
          g.arc(size * 0.5, size * 0.45, size * r, 0, Math.PI * 2);
          g.fill();
        }
      } else {
        g.fillStyle = token(fg);
        g.textBaseline = 'top';
        const word = (t.meta.artist || t.meta.title || '?').split(/\s+/)[0].toUpperCase();
        // big type, shrunk to fit the sleeve
        let px = size * 0.34;
        g.font = font('ui', px, 700);
        while (px > size * 0.12 && g.measureText(word).width > size * 0.9) {
          px *= 0.9;
          g.font = font('ui', px, 700);
        }
        g.fillText(fitText(g, word, size * 0.92), size * 0.05, size * 0.05 + (size * 0.34 - px) * 0.5);
        g.fillStyle = token(ac);
        g.fillRect(size * 0.05, size * 0.44, size * 0.9, size * 0.03);
      }
    }
    // title block
    g.fillStyle = alpha('print-ink', style === 0 ? 0 : 0.55);
    g.fillRect(0, size * 0.74, size, size * 0.26);
    g.fillStyle = token(style === 0 ? 'print-ink' : 'print-paper');
    g.textBaseline = 'alphabetic';
    g.font = font('ui', size * 0.075, 700);
    g.fillText(fitText(g, t.meta.title, size * 0.9), size * 0.05, size * 0.85);
    g.font = font('ui', size * 0.06, 500);
    g.fillText(fitText(g, t.meta.artist || 'Unknown artist', size * 0.9), size * 0.05, size * 0.94);
  }
  markerNotes(g, size, t);
  g.restore();
}

const sleeveUrls = new Map<string, Promise<string>>();
/** A sleeve as an image URL for the crate browser (cached per track). */
export function sleeveUrl(t: Track, size = 220): Promise<string> {
  const id = `${t.key}|${artworkUrlOf(t) ? 'art' : ''}|${t.analysis ? `${Math.round(t.analysis.bpm)}${t.analysis.camelot}` : ''}|${size}`;
  let p = sleeveUrls.get(id);
  if (!p) {
    p = artworkImage(t).then((img) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      drawSleeve(c.getContext('2d')!, size, t, img);
      return c.toDataURL('image/jpeg', 0.85);
    });
    sleeveUrls.set(id, p);
  }
  return p;
}

/** The centre label, centred on (cx, cy) with radius r. */
export function drawLabel(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: Track, img: HTMLImageElement | null) {
  const [bg, fg] = paletteFor(t);
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.clip();
  if (img) {
    g.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  } else {
    g.fillStyle = token(bg);
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
    g.fillStyle = token(fg);
    g.textAlign = 'center';
    g.font = font('ui', r * 0.2, 700);
    g.fillText(fitText(g, t.meta.title, r * 1.5), cx, cy - r * 0.35);
    g.font = font('ui', r * 0.15, 500);
    g.fillText(fitText(g, t.meta.artist || '', r * 1.5), cx, cy + r * 0.5);
    g.font = font('lcd', r * 0.13);
    g.fillText('33⅓ RPM', cx, cy + r * 0.75);
  }
  g.restore();
  // spindle hole
  g.fillStyle = token('graphite-1000');
  g.beginPath();
  g.arc(cx, cy, r * 0.075, 0, Math.PI * 2);
  g.fill();
}

/**
 * The whole record seen from above, at `size` px. The grooves follow the
 * track: loud passages are dense and dark, quiet ones and breaks show as
 * lighter bands you can find by eye — exactly how DJs spot a break.
 */
export function drawRecord(g: CanvasRenderingContext2D, size: number, t: Track | null, a: Analysis | null, img: HTMLImageElement | null) {
  const c = size / 2;
  const px = c / RECORD_R; // pixels per metre
  g.clearRect(0, 0, size, size);
  g.fillStyle = token('vinyl-black');
  g.beginPath();
  g.arc(c, c, c, 0, Math.PI * 2);
  g.fill();
  // grooves, one ring per pixel of radius
  const outer = GROOVE_OUTER * px;
  const inner = GROOVE_INNER * px;
  for (let rp = Math.floor(outer); rp > inner; rp -= 1) {
    let level = 0.5;
    if (a) {
      const pos = positionAtRadius(rp / px, a.duration);
      const bins = a.waveform.length / 3;
      const span = (a.duration / (outer - inner)) * a.binsPerSecond;
      const b0 = Math.max(0, Math.floor(pos * a.binsPerSecond));
      const b1 = Math.min(bins, Math.max(b0 + 1, Math.floor(b0 + span)));
      let m = 0;
      for (let b = b0; b < b1; b++) m = Math.max(m, a.waveform[b * 3], a.waveform[b * 3 + 1]);
      level = m / 255;
    }
    // quiet = shiny (lighter), loud = dense (darker)
    const k = Math.max(0, 1 - level * 1.3);
    g.strokeStyle = k > 0.55 ? token('vinyl-quiet') : shade('vinyl-groove', 0.8 + k * 0.9 + (rp % 2) * 0.15);
    g.lineWidth = 1;
    g.beginPath();
    g.arc(c, c, rp, 0, Math.PI * 2);
    g.stroke();
  }
  // lead-in and run-out: smooth vinyl
  g.strokeStyle = shade('vinyl-black', 1.3);
  g.lineWidth = 1;
  g.beginPath();
  g.arc(c, c, c - 1, 0, Math.PI * 2);
  g.stroke();
  // a soft highlight across the grooves so it reads as shiny vinyl when it spins
  const sheen = g.createLinearGradient(0, 0, size, size);
  sheen.addColorStop(0.3, alpha('vinyl-sheen', 0));
  sheen.addColorStop(0.5, alpha('vinyl-sheen', 0.22));
  sheen.addColorStop(0.7, alpha('vinyl-sheen', 0));
  g.fillStyle = sheen;
  g.beginPath();
  g.arc(c, c, outer, 0, Math.PI * 2);
  g.arc(c, c, LABEL_R * px * 1.05, 0, Math.PI * 2, true);
  g.fill();
  if (t) drawLabel(g, c, c, LABEL_R * px, t, img);
  else {
    g.fillStyle = token('graphite-1000');
    g.beginPath();
    g.arc(c, c, 3, 0, Math.PI * 2);
    g.fill();
  }
}

/** A record image as an offscreen canvas, redrawn once the cover art loads. */
export function recordCanvas(t: Track | null, a: Analysis | null, size: number, onReady?: (c: HTMLCanvasElement) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  drawRecord(g, size, t, a, null);
  if (t) {
    void artworkImageWhenReady(t).then((img) => {
      if (!img) return;
      drawRecord(g, size, t, a, img);
      onReady?.(c);
    });
  }
  return c;
}
