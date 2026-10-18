import * as THREE from 'three';
import { alpha } from '../design/tokens';
import logos from '../brand/cfh-logo.json';

/**
 * Club CFH neon, drawn from the logo geometry in src/brand/cfh-logo.json (the same
 * tubes the SVG files and the brand page use). Used by the signs in the 3D club
 * and by the LED wall.
 */

export type CfhLogo = 'lockup' | 'mark';

const COLOUR = { pink: 'cfh-pink', cyan: 'cfh-cyan' } as const;

interface Tube {
  id: string;
  role: keyof typeof COLOUR;
  width: number;
  d: string;
}
interface Cap {
  track: [number, number];
  y: number;
  w: number;
  h: number;
  rx: number;
  rest: number;
}
interface Geometry {
  viewBox: [number, number];
  tubes: Tube[];
  cap: Cap;
}

const GEOMETRY = logos as unknown as Record<CfhLogo, Geometry>;
const baseCache = new Map<string, Path2D>();

function basePath(which: CfhLogo, t: Tube): Path2D {
  const key = `${which}/${t.id}`;
  let p = baseCache.get(key);
  if (!p) baseCache.set(key, (p = new Path2D(t.d)));
  return p;
}

/** The logo's size in its own units (400 × 216 for the lock-up, 64 × 64 for the mark). */
export function logoSize(which: CfhLogo): [number, number] {
  return GEOMETRY[which].viewBox;
}

export interface NeonOptions {
  /** 'blur' gives the soft shadow halo (for textures drawn once); 'layered' is cheap enough for every frame. */
  glow?: 'blur' | 'layered';
  /** Crossfader cap position along its slot, 0..1. Default: where it rests in the logo. */
  cap?: number;
  /** Brightness of the lit tubes, 0..1 (neon buzz and flicker). */
  lit?: number;
}

/** A lit neon tube: a soft halo, the coloured glass, and a hot white core. Width in pixels. */
export function tube(ctx: CanvasRenderingContext2D, path: Path2D, colour: string, width: number, glow: 'blur' | 'layered' = 'blur', lit = 1): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (glow === 'blur') {
    ctx.shadowColor = alpha(colour, lit);
    ctx.shadowBlur = width * 3;
    ctx.strokeStyle = alpha(colour, 0.35 * lit);
    ctx.lineWidth = width * 2;
    ctx.stroke(path);
    ctx.shadowBlur = width;
  } else {
    ctx.strokeStyle = alpha(colour, 0.12 * lit);
    ctx.lineWidth = width * 3.4;
    ctx.stroke(path);
    ctx.strokeStyle = alpha(colour, 0.3 * lit);
    ctx.lineWidth = width * 2;
    ctx.stroke(path);
  }
  ctx.strokeStyle = alpha(colour, lit);
  ctx.lineWidth = width;
  ctx.stroke(path);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = alpha('cfh-core', 0.9 * lit);
  ctx.lineWidth = width * 0.32;
  ctx.stroke(path);
  ctx.restore();
}

/** Draw the logo centred on (cx, cy), `scale` pixels per logo unit. */
export function drawCfh(ctx: CanvasRenderingContext2D, which: CfhLogo, cx: number, cy: number, scale: number, o: NeonOptions = {}): void {
  const g = GEOMETRY[which];
  const [w, h] = g.viewBox;
  const glow = o.glow ?? 'blur';
  const lit = o.lit ?? 1;
  const left = cx - (w * scale) / 2;
  const top = cy - (h * scale) / 2;
  const m = new DOMMatrix([scale, 0, 0, scale, left, top]);
  for (const t of g.tubes) {
    const p = new Path2D();
    p.addPath(basePath(which, t), m);
    tube(ctx, p, COLOUR[t.role], t.width * scale, glow, lit);
  }
  // the crossfader cap on its slot
  const { track, y, w: cw, h: ch, rx } = g.cap;
  const x = left + (track[0] + (track[1] - track[0]) * (o.cap ?? g.cap.rest)) * scale;
  const yy = top + y * scale;
  ctx.save();
  if (glow === 'blur') {
    ctx.shadowColor = alpha('cfh-cyan', lit);
    ctx.shadowBlur = cw * scale * 0.8;
  }
  ctx.fillStyle = alpha('cfh-core', lit);
  ctx.strokeStyle = alpha('cfh-cyan', lit);
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.roundRect(x - (cw * scale) / 2, yy - (ch * scale) / 2, cw * scale, ch * scale, rx * scale);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Room around the tubes for their halo, in logo units. */
const PAD: Record<CfhLogo, number> = { lockup: 30, mark: 16 };

export interface NeonTexture {
  texture: THREE.CanvasTexture;
  /** Texture width ÷ logo width: how much wider the plane must be than the logo itself. */
  frame: number;
  /** Texture width ÷ height. */
  aspect: number;
}

/** The logo lit on a transparent canvas, with room for the halo, ready to hang on a plane. */
export function cfhTexture(which: CfhLogo, pixelsPerUnit: number): NeonTexture {
  const [w, h] = GEOMETRY[which].viewBox;
  const pad = PAD[which];
  const c = document.createElement('canvas');
  c.width = Math.round((w + pad * 2) * pixelsPerUnit);
  c.height = Math.round((h + pad * 2) * pixelsPerUnit);
  const ctx = c.getContext('2d')!;
  drawCfh(ctx, which, c.width / 2, c.height / 2, pixelsPerUnit, { glow: 'blur' });
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, frame: (w + pad * 2) / w, aspect: c.width / c.height };
}
