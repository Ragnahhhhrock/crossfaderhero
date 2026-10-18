import * as THREE from 'three';
import { font, hue, token } from '../design/tokens';
import { drawCfh, logoSize } from './neon';
import type { ScreenMode } from './settings';

/**
 * The giant LED wall behind the DJ: a canvas redrawn every frame with
 * beat-synced visuals, used as an unlit texture so it reads as emissive.
 */
export class LedWall {
  readonly texture: THREE.CanvasTexture;
  /** The wall's average colour this frame, for the light it spills on the stage. */
  readonly spill = new THREE.Color();
  /** The DJ on the decks, billed on the logo screen. Empty: the game's name. */
  djName = '';
  private ctx: CanvasRenderingContext2D;
  private small: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private img: ImageData;
  private w = 640;
  private h = 320;

  constructor() {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    this.ctx = c.getContext('2d')!;
    this.small = document.createElement('canvas');
    this.small.width = 96;
    this.small.height = 48;
    this.sctx = this.small.getContext('2d')!;
    this.img = this.sctx.createImageData(96, 48);
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  /** Blank wall (screen switched off). */
  off(): void {
    const { ctx, w, h } = this;
    ctx.fillStyle = token('club-fixture');
    ctx.fillRect(0, 0, w, h);
    this.texture.needsUpdate = true;
    this.spill.setRGB(0, 0, 0);
  }

  draw(mode: ScreenMode, beats: number, time: number, speed: number, baseHue: number, energy: number): void {
    const t = time * (0.4 + speed * 1.6);
    const ph = beats % 1;
    const kick = Math.pow(1 - ph, 2.5);
    const { ctx, w, h } = this;
    ctx.save();
    switch (mode) {
      case 'tunnel':
        this.tunnel(t, beats, kick, baseHue);
        break;
      case 'spectrum':
        this.spectrum(t, beats, kick, baseHue, energy);
        break;
      case 'kaleido':
        this.kaleido(t, beats, kick, baseHue);
        break;
      case 'plasma':
        this.plasma(t, kick, baseHue);
        break;
      case 'grid':
        this.grid(t, beats, kick, baseHue);
        break;
      case 'logo':
        this.logo(t, beats, kick, baseHue);
        break;
    }
    ctx.restore();
    if (mode !== 'logo') this.station(beats, kick);
    // LED pixel grid over everything
    ctx.fillStyle = token('black');
    ctx.globalAlpha = 0.28;
    for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 1, h);
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
    ctx.globalAlpha = 1;
    this.texture.needsUpdate = true;
    this.spill.setHSL(((baseHue % 1) + 1) % 1, 0.9, 0.25 + 0.25 * kick);
  }

  private clear(a = 1): void {
    this.ctx.fillStyle = token('black');
    this.ctx.globalAlpha = a;
    this.ctx.fillRect(0, 0, this.w, this.h);
    this.ctx.globalAlpha = 1;
  }

  private tunnel(t: number, beats: number, kick: number, h0: number): void {
    const { ctx, w, h } = this;
    this.clear(0.35); // trails
    ctx.translate(w / 2, h / 2);
    const n = 14;
    for (let i = 0; i < n; i++) {
      const z = (i + ((t * 1.5) % 1)) / n;
      const size = Math.pow(z, 2.2) * w * 1.3;
      ctx.save();
      ctx.rotate(t * 0.6 + i * 0.18 + Math.sin(beats * 0.25) * 0.5);
      ctx.strokeStyle = hue(h0 + i * 0.04 + beats * 0.01, 1, 0.5 + 0.2 * kick);
      ctx.lineWidth = 2 + z * 14 * (0.6 + kick);
      if (Math.floor(beats) % 2) ctx.strokeRect(-size / 2, -size / 2, size, size);
      else {
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * size * 0.6, Math.sin(a) * size * 0.6);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = hue(h0 + 0.5, 1, 0.75, 0.8 * kick);
    ctx.beginPath();
    ctx.arc(0, 0, 18 + 30 * kick, 0, Math.PI * 2);
    ctx.fill();
  }

  private spectrum(t: number, beats: number, kick: number, h0: number, energy: number): void {
    const { ctx, w, h } = this;
    this.clear(1);
    const bars = 32;
    const bw = w / bars;
    for (let i = 0; i < bars; i++) {
      const f = i / bars;
      // fake audio: bass follows the kick, highs flicker on the off-beats
      const lowBand = kick * (1 - f) * 1.1;
      const high = Math.abs(Math.sin(t * 7 + i * 1.7) * Math.sin(t * 3.1 + i)) * f * 0.7;
      const mid = 0.25 + 0.25 * Math.sin(t * 2 + i * 0.4);
      const v = Math.min(1, (lowBand + high + mid * 0.6) * (0.55 + 0.45 * Math.min(1.4, energy)));
      const segs = 16;
      const lit = Math.round(v * segs);
      for (let sgm = 0; sgm < lit; sgm++) {
        const y = h - (sgm + 1) * (h / segs);
        ctx.fillStyle = hue(h0 + f * 0.35 + sgm * 0.012, 1, 0.5);
        ctx.fillRect(i * bw + 2, y + 2, bw - 4, h / segs - 4);
      }
      // peak hold
      ctx.fillStyle = token('ink-100');
      ctx.fillRect(i * bw + 2, h - (lit + 1) * (h / segs) + 2, bw - 4, 3);
    }
    if (Math.floor(beats) % 4 === 0) {
      ctx.fillStyle = token('white');
      ctx.globalAlpha = 0.25 * kick;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  private kaleido(t: number, beats: number, kick: number, h0: number): void {
    const { ctx, w, h } = this;
    this.clear(0.5);
    ctx.translate(w / 2, h / 2);
    const k = 8;
    for (let seg = 0; seg < k; seg++) {
      ctx.save();
      ctx.rotate((seg / k) * Math.PI * 2 + t * 0.3);
      if (seg % 2) ctx.scale(1, -1);
      for (let i = 0; i < 5; i++) {
        const r = 30 + i * 38 + kick * 20;
        const a = t * (0.8 + i * 0.2) + i;
        ctx.fillStyle = hue(h0 + i * 0.09 + beats * 0.02, 1, 0.55, 0.85);
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(r + 30 + 20 * Math.sin(a), 18 + 10 * Math.cos(a * 1.3));
        ctx.lineTo(r + 50 * Math.cos(a), -12);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private plasma(t: number, kick: number, h0: number): void {
    const { img, sctx, ctx, w, h } = this;
    const d = img.data;
    const c = new THREE.Color();
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 96; x++) {
        const v =
          Math.sin(x * 0.12 + t * 1.3) + Math.sin(y * 0.18 - t) + Math.sin((x + y) * 0.08 + t * 0.7) + Math.sin(Math.hypot(x - 48, y - 24) * 0.2 - t * 2);
        c.setHSL((((h0 + v * 0.08) % 1) + 1) % 1, 1, 0.35 + 0.15 * Math.sin(v * 2) + 0.2 * kick);
        const o = (y * 96 + x) * 4;
        d[o] = c.r * 255;
        d[o + 1] = c.g * 255;
        d[o + 2] = c.b * 255;
        d[o + 3] = 255;
      }
    sctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.small, 0, 0, w, h);
  }

  private grid(t: number, beats: number, kick: number, h0: number): void {
    const { ctx, w, h } = this;
    const horizon = h * 0.52;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, token('print-night'));
    sky.addColorStop(1, hue(h0 + 0.85, 0.9, 0.3));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon);
    // sun with stripes
    const sr = 70 + kick * 8;
    const sun = ctx.createLinearGradient(0, horizon - sr * 2, 0, horizon);
    sun.addColorStop(0, token('print-sun'));
    sun.addColorStop(1, token('print-magenta'));
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(w / 2, horizon, sr, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = token('print-night');
    for (let i = 0; i < 6; i++) ctx.fillRect(w / 2 - sr, horizon - 8 - i * 11, sr * 2, 2 + i * 0.6);
    ctx.fillStyle = token('black');
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.strokeStyle = hue(h0, 1, 0.55 + 0.2 * kick);
    ctx.lineWidth = 2;
    // receding horizontal lines
    for (let i = 0; i < 14; i++) {
      const z = (i + ((t * 1.2) % 1)) / 14;
      const y = horizon + Math.pow(z, 2.4) * (h - horizon);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let i = -12; i <= 12; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * 8, horizon);
      ctx.lineTo(w / 2 + i * 70, h);
      ctx.stroke();
    }
    void beats;
  }

  /**
   * Club CFH on top of every visual: a small neon sign in the corner all night, and
   * once every eight bars (the last bar of the phrase) the full sign takes the wall.
   */
  private station(beats: number, kick: number): void {
    const { ctx, w, h } = this;
    const [lw] = logoSize('lockup');
    const phrase = beats % 32;
    const ident = phrase >= 28 ? Math.min(1, (phrase - 28) * 2, (32 - phrase) * 2) : 0;
    if (ident > 0) {
      ctx.fillStyle = token('black');
      ctx.globalAlpha = 0.72 * ident;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      const s = ((w * 0.6) / lw) * (0.94 + 0.06 * ident + 0.03 * kick);
      drawCfh(ctx, 'lockup', w / 2, h / 2, s, { glow: 'layered', cap: 0.5 + 0.5 * Math.sin(beats * Math.PI * 0.5), lit: ident });
    }
    // the corner bug, on a dark plate so it reads over any visual
    const s = 96 / lw;
    const [, lh] = logoSize('lockup');
    const bw = 96 + 16;
    const bh = lh * s + 14;
    const x = w - bw - 10;
    const y = h - bh - 8;
    ctx.fillStyle = token('black');
    ctx.globalAlpha = 0.62;
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
    drawCfh(ctx, 'lockup', x + bw / 2, y + bh / 2, s, { glow: 'layered', cap: 0.5 + 0.5 * Math.sin(beats * Math.PI * 0.5), lit: 0.9 + 0.1 * kick });
  }

  /** The logo screen: the Club CFH sign, its crossfader cap swinging with the beat, and who's playing. */
  private logo(t: number, beats: number, kick: number, h0: number): void {
    const { ctx, w, h } = this;
    void t;
    void h0;
    this.clear(0.5);
    const [lw] = logoSize('lockup');
    const s = ((w * 0.62) / lw) * (1 + 0.03 * kick);
    drawCfh(ctx, 'lockup', w / 2, h * 0.43, s, { glow: 'layered', cap: 0.5 + 0.5 * Math.sin(beats * Math.PI * 0.5) });
    ctx.textAlign = 'center';
    ctx.fillStyle = token('ink-100');
    const bill = this.djName || 'Crossfader Hero';
    let size = 30;
    ctx.font = font('ui', size, 700);
    while (size > 16 && ctx.measureText(bill).width > w * 0.9) ctx.font = font('ui', (size -= 2), 700);
    ctx.fillText(bill, w / 2, h * 0.87);
    ctx.font = font('lcd', 18);
    ctx.fillStyle = token('cfh-cyan');
    ctx.fillText('crossfaderhero.com', w / 2, h * 0.96);
  }
}
