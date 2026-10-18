import * as THREE from 'three';
import { font, hue, token } from '../design/tokens';
import { drawCfh, logoSize, tube } from './neon';
import type { ScreenMode } from './settings';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Ease-out bounce: 0 → 1, overshooting and settling like something dropped. */
function bounce(p: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
  if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
  return n * (p -= 2.625 / d) * p + 0.984375;
}

/** The DJ's name has four looks; each plays for eight beats on the name screen. */
const NAME_SCENES = 4;

/**
 * An LED screen: a canvas redrawn every frame with beat-synced visuals, used as an
 * unlit texture so it reads as emissive. The big wall behind the DJ is one; the
 * screens round the room are more of the same at other sizes.
 */
export class LedWall {
  readonly texture: THREE.CanvasTexture;
  /** The wall's average colour this frame, for the light it spills on the stage. */
  readonly spill = new THREE.Color();
  /** The DJ on the decks, billed on the logo screen and animated on the name screen. Empty: the game's name. */
  djName = '';
  /** Station branding on top of the visual: the corner bug, the name break and the Club CFH ident. */
  chrome = true;
  private ctx: CanvasRenderingContext2D;
  private small: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private img: ImageData;
  private sw = 96;
  private sh: number;
  /** Pixel pitch of the LED grid laid over the picture. */
  private pitch: number;
  /** Sizes in the original 640 × 320 wall's pixels scale by this. */
  private u: number;
  private layout = { key: '', size: 0, xs: [] as number[], ws: [] as number[], chars: [] as string[] };

  constructor(
    private w = 640,
    private h = 320,
  ) {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    this.ctx = c.getContext('2d')!;
    this.sh = Math.max(8, Math.round((this.sw * this.h) / this.w));
    this.small = document.createElement('canvas');
    this.small.width = this.sw;
    this.small.height = this.sh;
    this.sctx = this.small.getContext('2d')!;
    this.img = this.sctx.createImageData(this.sw, this.sh);
    this.pitch = Math.max(2, Math.round(this.w / 160));
    this.u = this.h / 320;
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
      case 'name':
        this.nameScreen(beats, kick);
        break;
    }
    ctx.restore();
    if (this.chrome && mode !== 'logo') this.station(mode, beats, kick);
    // LED pixel grid over everything
    ctx.fillStyle = token('black');
    ctx.globalAlpha = 0.28;
    for (let x = 0; x < w; x += this.pitch) ctx.fillRect(x, 0, 1, h);
    for (let y = 0; y < h; y += this.pitch) ctx.fillRect(0, y, w, 1);
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
    ctx.arc(0, 0, (18 + 30 * kick) * this.u, 0, Math.PI * 2);
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
        const r = (30 + i * 38 + kick * 20) * this.u;
        const a = t * (0.8 + i * 0.2) + i;
        ctx.fillStyle = hue(h0 + i * 0.09 + beats * 0.02, 1, 0.55, 0.85);
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(r + (30 + 20 * Math.sin(a)) * this.u, (18 + 10 * Math.cos(a * 1.3)) * this.u);
        ctx.lineTo(r + 50 * Math.cos(a) * this.u, -12 * this.u);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private plasma(t: number, kick: number, h0: number): void {
    const { img, sctx, ctx, w, h, sw, sh } = this;
    const d = img.data;
    const c = new THREE.Color();
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++) {
        const v =
          Math.sin(x * 0.12 + t * 1.3) + Math.sin(y * 0.18 - t) + Math.sin((x + y) * 0.08 + t * 0.7) + Math.sin(Math.hypot(x - sw / 2, y - sh / 2) * 0.2 - t * 2);
        c.setHSL((((h0 + v * 0.08) % 1) + 1) % 1, 1, 0.35 + 0.15 * Math.sin(v * 2) + 0.2 * kick);
        const o = (y * sw + x) * 4;
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
    const sr = (70 + kick * 8) * this.u;
    const sun = ctx.createLinearGradient(0, horizon - sr * 2, 0, horizon);
    sun.addColorStop(0, token('print-sun'));
    sun.addColorStop(1, token('print-magenta'));
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(w / 2, horizon, sr, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = token('print-night');
    for (let i = 0; i < 6; i++) ctx.fillRect(w / 2 - sr, horizon - (8 + i * 11) * this.u, sr * 2, (2 + i * 0.6) * this.u);
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
      ctx.moveTo(w / 2 + i * w * 0.0125, horizon);
      ctx.lineTo(w / 2 + i * w * 0.11, h);
      ctx.stroke();
    }
    void beats;
  }

  /** Pixels per logo unit that fit the lock-up in `frac` of the screen's width and 80% of its height. */
  private logoScale(frac: number): number {
    const [lw, lh] = logoSize('lockup');
    return Math.min((this.w * frac) / lw, (this.h * 0.8) / lh);
  }

  /**
   * Station branding on top of every visual: a small Club CFH sign in the corner all
   * night; then in the last two bars of every eight, the DJ's name takes the screen for
   * a bar and the full Club CFH sign for the next.
   */
  private station(mode: ScreenMode, beats: number, kick: number): void {
    const { ctx, w, h } = this;
    const phrase = beats % 32;
    // the name's bar (not on the name screen, which is already all name)
    if (mode !== 'name' && phrase >= 24 && phrase < 28) {
      const a = Math.min(1, (phrase - 24) * 3, (28 - phrase) * 3);
      ctx.fillStyle = token('black');
      ctx.globalAlpha = 0.7 * a;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = a;
      this.nameScene(Math.floor(beats / 32) % NAME_SCENES, phrase - 24, beats, kick);
      ctx.globalAlpha = 1;
    }
    // the Club CFH ident
    const ident = phrase >= 28 ? Math.min(1, (phrase - 28) * 2, (32 - phrase) * 2) : 0;
    if (ident > 0) {
      ctx.fillStyle = token('black');
      ctx.globalAlpha = 0.72 * ident;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      const s = this.logoScale(0.6) * (0.94 + 0.06 * ident + 0.03 * kick);
      drawCfh(ctx, 'lockup', w / 2, h / 2, s, { glow: 'layered', cap: 0.5 + 0.5 * Math.sin(beats * Math.PI * 0.5), lit: ident });
    }
    // the corner bug, on a dark plate so it reads over any visual
    const [lw, lh] = logoSize('lockup');
    const bugW = Math.min(96, w * 0.22);
    const s = bugW / lw;
    const bw = bugW + 16;
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
    const tall = h > w * 0.35;
    const s = this.logoScale(0.62) * (1 + 0.03 * kick);
    drawCfh(ctx, 'lockup', w / 2, tall ? h * 0.43 : h / 2, s, { glow: 'layered', cap: 0.5 + 0.5 * Math.sin(beats * Math.PI * 0.5) });
    if (!tall) return;
    ctx.textAlign = 'center';
    ctx.fillStyle = token('ink-100');
    const bill = this.djName || 'Crossfader Hero';
    let size = 30 * this.u;
    ctx.font = font('ui', size, 700);
    while (size > 16 && ctx.measureText(bill).width > w * 0.9) ctx.font = font('ui', (size -= 2), 700);
    ctx.fillText(bill, w / 2, h * 0.87);
    ctx.font = font('lcd', 18 * this.u);
    ctx.fillStyle = token('cfh-cyan');
    ctx.fillText('crossfaderhero.com', w / 2, h * 0.96);
  }

  // ---------------------------------------------------------------- the DJ's name

  /** The name screen: four looks for the DJ's name, eight beats each. */
  private nameScreen(beats: number, kick: number): void {
    this.nameScene(Math.floor(beats / 8) % NAME_SCENES, beats % 8, beats, kick);
  }

  /** The name, upper-cased like a sign, sized to fit, with each letter's place. */
  private nameLayout(): { size: number; xs: number[]; ws: number[]; chars: string[] } {
    const { ctx, w, h } = this;
    const text = (this.djName.trim() || 'Guest DJ').toUpperCase();
    const key = `${text}|${w}|${h}|${document.fonts?.check(font('ui', 20, 700)) ?? ''}`;
    if (this.layout.key === key) return this.layout;
    const chars = [...text];
    let size = Math.round(h * 0.56);
    let ws: number[] = [];
    let total = 0;
    let track = 0;
    for (;;) {
      ctx.font = font('ui', size, 700);
      track = size * 0.08;
      ws = chars.map((c) => ctx.measureText(c).width);
      total = ws.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
      if (total <= w * 0.88 || size <= 12) break;
      size -= 2;
    }
    const xs: number[] = [];
    let x = (w - total) / 2;
    for (const cw of ws) {
      xs.push(x);
      x += cw + track;
    }
    this.layout = { key, size, xs, ws, chars };
    return this.layout;
  }

  /** One letter of the name, centred on its slot, with a glow and a hot core. */
  private letter(i: number, colour: string, o: { dx?: number; dy?: number; scale?: number; rot?: number; alpha?: number; blur?: number; core?: number; outline?: boolean } = {}): void {
    const { ctx } = this;
    const { size, xs, ws, chars } = this.layout;
    ctx.save();
    ctx.translate(xs[i] + ws[i] / 2 + (o.dx ?? 0), this.h * 0.46 + (o.dy ?? 0));
    ctx.rotate(o.rot ?? 0);
    const sc = o.scale ?? 1;
    ctx.scale(sc, sc);
    ctx.font = font('ui', size, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.shadowColor = colour;
    ctx.shadowBlur = (o.blur ?? 0.16) * size;
    ctx.lineJoin = 'round';
    if (o.outline) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = size * 0.07;
      ctx.strokeText(chars[i], 0, 0);
    } else {
      ctx.fillStyle = colour;
      ctx.fillText(chars[i], 0, 0);
    }
    if (o.core) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = token('cfh-core');
      ctx.globalAlpha *= o.core;
      ctx.lineWidth = Math.max(1, size * 0.025);
      ctx.strokeText(chars[i], 0, 0);
    }
    ctx.restore();
  }

  /** The crossfader slot under the name, its cap riding the beat. */
  private slot(beats: number, lit: number): void {
    const { ctx, w, h } = this;
    const { size } = this.layout;
    const y = Math.min(h * 0.46 + size * 0.72, h - 6 * this.u);
    const x0 = w * 0.22;
    const x1 = w * 0.78;
    const path = new Path2D();
    path.moveTo(x0, y);
    path.lineTo(x1, y);
    tube(ctx, path, 'cfh-cyan', Math.max(2, size * 0.05), 'layered', lit);
    const cw = size * 0.2;
    const ch = size * 0.15;
    const x = x0 + (x1 - x0) * (0.5 + 0.5 * Math.sin(beats * Math.PI * 0.5));
    ctx.save();
    ctx.globalAlpha *= lit;
    ctx.fillStyle = token('cfh-core');
    ctx.strokeStyle = token('cfh-cyan');
    ctx.lineWidth = Math.max(1.5, size * 0.025);
    ctx.beginPath();
    ctx.roundRect(x - cw / 2, y - ch / 2, cw, ch, ch * 0.25);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /**
   * One look for the DJ's name. `tt` is beats since the look started; `beats` keeps
   * counting so things that ride the groove stay on the grid.
   *  0 drop: letters fall in one by one and bounce, then pulse on the kick
   *  1 neon: the name lights up letter by letter, flickering on like glass tube
   *  2 split: big and loud, split into cyan and pink on every kick
   *  3 wave: the letters roll in a wave with a reflection on the floor
   */
  private nameScene(scene: number, tt: number, beats: number, kick: number): void {
    const { ctx, w, h } = this;
    this.clear(scene === 2 ? 0.55 : 0.8);
    const { size, chars } = this.nameLayout();
    const n = chars.length;
    const pink = token('cfh-pink');
    const cyan = token('cfh-cyan');
    const core = token('cfh-core');
    const colourOf = (i: number) => (i % 2 ? cyan : pink);

    if (scene === 0) {
      const stagger = Math.min(0.25, 1.6 / n);
      for (let i = 0; i < n; i++) {
        const p = clamp01((tt - i * stagger) / 1.1);
        if (p <= 0) continue;
        const landed = p >= 1;
        const fall = (1 - bounce(p)) * h * 0.9;
        const pulse = landed ? 0.1 * kick : 0;
        this.letter(i, colourOf(i), { dy: -fall, scale: 1 + pulse, core: 0.7, alpha: Math.min(1, p * 4) });
      }
      this.slot(beats, clamp01((tt - n * stagger) / 0.5));
    } else if (scene === 1) {
      for (let i = 0; i < n; i++) {
        const onAt = 0.3 + i * Math.min(0.3, 2.2 / n);
        const since = tt - onAt;
        if (since < 0) {
          this.letter(i, colourOf(i), { outline: true, alpha: 0.14, blur: 0 });
          continue;
        }
        const flicker = since < 0.6 ? (Math.sin(since * 90 + i * 13) > -0.1 ? 1 : 0.2) : 1;
        this.letter(i, colourOf(i), { outline: true, alpha: flicker, blur: 0.22 + 0.06 * kick, core: 0.9 });
      }
      this.slot(beats, clamp01((tt - 2.5) / 0.5));
    } else if (scene === 2) {
      const grow = bounce(clamp01(tt / 0.8));
      const dx = (0.05 + 0.09 * kick) * size;
      const sc = (0.8 + 0.2 * grow) * (1 + 0.08 * kick);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        this.letter(i, cyan, { dx: -dx * sc, scale: sc, blur: 0.1, alpha: 0.9 });
        this.letter(i, pink, { dx: dx * sc, scale: sc, blur: 0.1, alpha: 0.9 });
      }
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < n; i++) this.letter(i, core, { scale: sc, blur: 0.05, alpha: 0.25 });
      // a scan line sweeps the name once a bar
      const sx = ((beats / 4) % 1) * w;
      ctx.fillStyle = core;
      ctx.globalAlpha *= 0.25;
      ctx.fillRect(sx - 2 * this.u, 0, 4 * this.u, h);
      ctx.globalAlpha = 1;
    } else {
      const reflect = h * 0.46 + size * 0.7;
      for (let i = 0; i < n; i++) {
        const k = Math.sin(beats * Math.PI * 0.5 + i * 0.55);
        const dy = k * size * 0.22;
        const mix = 0.5 + 0.5 * Math.sin(beats * 0.4 + i * 0.35);
        this.letter(i, pink, { dy, alpha: 1 - mix, core: 0.6 });
        this.letter(i, cyan, { dy, alpha: mix, core: 0.6 });
        // reflection in the floor below, fading with distance
        ctx.save();
        ctx.translate(0, reflect * 2);
        ctx.scale(1, -1);
        this.letter(i, mix > 0.5 ? cyan : pink, { dy, alpha: 0.18, blur: 0 });
        ctx.restore();
      }
      ctx.fillStyle = core;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(w * 0.1, reflect, w * 0.8, Math.max(1, 2 * this.u));
      ctx.globalAlpha = 1;
    }
  }
}
