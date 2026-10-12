import * as THREE from 'three';
import { alpha, font, shade, token } from '../design/tokens';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Warm oak floorboards. */
export function floorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  const r = rng(7);
  const plankW = 128;
  for (let x = 0; x < 1024; x += plankW) {
    let y = -Math.floor(r() * 400);
    while (y < 1024) {
      const len = 300 + Math.floor(r() * 400);
      g.fillStyle = shade('room-oak', 0.85 + r() * 0.3);
      g.fillRect(x, y, plankW, len);
      // grain
      for (let i = 0; i < 40; i++) {
        g.strokeStyle = alpha('room-fill-ground', 0.08 + r() * 0.12);
        g.lineWidth = 1 + r() * 2;
        const gx = x + r() * plankW;
        g.beginPath();
        g.moveTo(gx, y);
        g.bezierCurveTo(gx + (r() - 0.5) * 20, y + len / 3, gx + (r() - 0.5) * 20, y + (2 * len) / 3, gx, y + len);
        g.stroke();
      }
      g.fillStyle = alpha('room-fill-ground', 0.8);
      g.fillRect(x, y + len - 2, plankW, 3);
      y += len;
    }
    g.fillStyle = alpha('room-fill-ground', 0.9);
    g.fillRect(x, 0, 2, 1024);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4.5, 4.5);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A flat-weave rug. */
export function rugTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = token('print-plum');
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = token('print-gold');
  g.lineWidth = 10;
  g.strokeRect(24, 24, 464, 464);
  g.strokeStyle = token('print-rose');
  g.lineWidth = 6;
  g.strokeRect(48, 48, 416, 416);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = token(i % 2 ? 'print-plum-light' : 'print-gold');
    g.beginPath();
    g.moveTo(256, 120 + i * 20);
    g.lineTo(392 - i * 20, 256);
    g.lineTo(256, 392 - i * 20);
    g.lineTo(120 + i * 20, 256);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Original gig posters — invented nights, no real artists or brands. */
export function posterTexture(kind: 0 | 1 | 2): THREE.CanvasTexture {
  const [c, g] = canvas(512, 724);
  if (kind === 0) {
    g.fillStyle = token('print-paper');
    g.fillRect(0, 0, 512, 724);
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = token(i % 2 ? 'print-red' : 'print-ink');
      g.lineWidth = 14;
      g.beginPath();
      g.arc(256, 300, 40 + i * 22, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = token('print-ink');
    g.font = font('ui', 66, 700);
    g.textAlign = 'center';
    g.fillText('LOW END', 256, 600);
    g.font = font('ui', 28);
    g.fillText('SOUNDSYSTEM SESSIONS', 256, 645);
    g.fillText('SAT · BACK ROOM', 256, 685);
  } else if (kind === 1) {
    const grd = g.createLinearGradient(0, 0, 0, 724);
    grd.addColorStop(0, token('print-night'));
    grd.addColorStop(1, token('print-magenta'));
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 724);
    g.strokeStyle = alpha('white', 0.35);
    g.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      g.beginPath();
      g.moveTo(256, 360);
      g.lineTo(i * 30 - 10, 724);
      g.stroke();
    }
    g.fillStyle = token('print-sun');
    g.beginPath();
    g.arc(256, 300, 110, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = token('white');
    g.font = font('ui', 72, 700);
    g.textAlign = 'center';
    g.fillText('SUNRISE', 256, 110);
    g.font = font('ui', 30);
    g.fillText('OPEN AIR · ALL NIGHT', 256, 160);
  } else {
    g.fillStyle = token('graphite-850');
    g.fillRect(0, 0, 512, 724);
    g.fillStyle = token('deck-a');
    for (let i = 0; i < 24; i++) g.fillRect(40 + i * 18, 420 - Math.abs(Math.sin(i * 0.7)) * 260, 10, Math.abs(Math.sin(i * 0.7)) * 260);
    g.fillStyle = token('deck-b');
    g.font = font('ui', 60, 700);
    g.textAlign = 'center';
    g.fillText('WAREHOUSE', 256, 540);
    g.fillStyle = token('ink-100');
    g.font = font('ui', 30);
    g.fillText('174 BPM · TILL LATE', 256, 590);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Night sky for the window. */
export function nightTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, token('room-sky-top'));
  grd.addColorStop(1, token('room-sky-low'));
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  const r = rng(3);
  for (let i = 0; i < 140; i++) {
    g.fillStyle = alpha('white', 0.3 + r() * 0.7);
    g.fillRect(r() * 512, r() * 340, r() < 0.1 ? 2 : 1, r() < 0.1 ? 2 : 1);
  }
  // distant skyline with lit windows
  g.fillStyle = token('room-city');
  let x = 0;
  while (x < 512) {
    const w = 30 + r() * 50;
    const h = 60 + r() * 140;
    g.fillRect(x, 512 - h, w, h);
    for (let wy = 512 - h + 8; wy < 500; wy += 12)
      for (let wx = x + 5; wx < x + w - 5; wx += 9) if (r() < 0.25) {
        g.fillStyle = token(r() < 0.5 ? 'room-window-warm' : 'room-window-cool');
        g.fillRect(wx, wy, 4, 5);
        g.fillStyle = token('room-city');
      }
    x += w + 4;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Speaker grille-free woofer face. */
export function wooferTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, shade('gear-cone', 1.4));
  grd.addColorStop(0.18, shade('gear-cone', 0.4));
  grd.addColorStop(0.22, shade('gear-cone', 0.7));
  grd.addColorStop(0.85, shade('gear-cone', 0.3));
  grd.addColorStop(0.9, token('gear-cone'));
  grd.addColorStop(1, shade('gear-cone', 0.5));
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
