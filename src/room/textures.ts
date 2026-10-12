import * as THREE from 'three';

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
      const base = 120 + r() * 40;
      g.fillStyle = `rgb(${base + 10}, ${base * 0.74}, ${base * 0.52})`;
      g.fillRect(x, y, plankW, len);
      // grain
      for (let i = 0; i < 40; i++) {
        g.strokeStyle = `rgba(60, 35, 15, ${0.05 + r() * 0.08})`;
        g.lineWidth = 1 + r() * 2;
        const gx = x + r() * plankW;
        g.beginPath();
        g.moveTo(gx, y);
        g.bezierCurveTo(gx + (r() - 0.5) * 20, y + len / 3, gx + (r() - 0.5) * 20, y + (2 * len) / 3, gx, y + len);
        g.stroke();
      }
      g.fillStyle = 'rgba(30, 18, 8, 0.7)';
      g.fillRect(x, y + len - 2, plankW, 3);
      y += len;
    }
    g.fillStyle = 'rgba(30, 18, 8, 0.8)';
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
  g.fillStyle = '#2c2440';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#d8a24a';
  g.lineWidth = 10;
  g.strokeRect(24, 24, 464, 464);
  g.strokeStyle = '#b8475a';
  g.lineWidth = 6;
  g.strokeRect(48, 48, 416, 416);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i % 2 ? '#3f3560' : '#d8a24a';
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
    g.fillStyle = '#f2e6cf';
    g.fillRect(0, 0, 512, 724);
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = i % 2 ? '#e2462f' : '#1b1b1b';
      g.lineWidth = 14;
      g.beginPath();
      g.arc(256, 300, 40 + i * 22, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#1b1b1b';
    g.font = 'bold 66px "Chakra Petch", sans-serif';
    g.textAlign = 'center';
    g.fillText('LOW END', 256, 600);
    g.font = '28px "Chakra Petch", sans-serif';
    g.fillText('SOUNDSYSTEM SESSIONS', 256, 645);
    g.fillText('SAT · BACK ROOM', 256, 685);
  } else if (kind === 1) {
    const grd = g.createLinearGradient(0, 0, 0, 724);
    grd.addColorStop(0, '#12002b');
    grd.addColorStop(1, '#ff3d7f');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 724);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      g.beginPath();
      g.moveTo(256, 360);
      g.lineTo(i * 30 - 10, 724);
      g.stroke();
    }
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.arc(256, 300, 110, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 72px "Chakra Petch", sans-serif';
    g.textAlign = 'center';
    g.fillText('SUNRISE', 256, 110);
    g.font = '30px "Chakra Petch", sans-serif';
    g.fillText('OPEN AIR · ALL NIGHT', 256, 160);
  } else {
    g.fillStyle = '#0d0f12';
    g.fillRect(0, 0, 512, 724);
    g.fillStyle = '#5cc8ff';
    for (let i = 0; i < 24; i++) g.fillRect(40 + i * 18, 420 - Math.abs(Math.sin(i * 0.7)) * 260, 10, Math.abs(Math.sin(i * 0.7)) * 260);
    g.fillStyle = '#ffa040';
    g.font = 'bold 60px "Chakra Petch", sans-serif';
    g.textAlign = 'center';
    g.fillText('WAREHOUSE', 256, 540);
    g.fillStyle = '#ece8df';
    g.font = '30px "Chakra Petch", sans-serif';
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
  grd.addColorStop(0, '#060a1c');
  grd.addColorStop(1, '#23305a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  const r = rng(3);
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
    g.fillRect(r() * 512, r() * 340, r() < 0.1 ? 2 : 1, r() < 0.1 ? 2 : 1);
  }
  // distant skyline with lit windows
  g.fillStyle = '#05070f';
  let x = 0;
  while (x < 512) {
    const w = 30 + r() * 50;
    const h = 60 + r() * 140;
    g.fillRect(x, 512 - h, w, h);
    for (let wy = 512 - h + 8; wy < 500; wy += 12)
      for (let wx = x + 5; wx < x + w - 5; wx += 9) if (r() < 0.25) {
        g.fillStyle = r() < 0.5 ? '#ffd27a' : '#9fc4ff';
        g.fillRect(wx, wy, 4, 5);
        g.fillStyle = '#05070f';
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
  grd.addColorStop(0, '#3a3a3a');
  grd.addColorStop(0.18, '#111');
  grd.addColorStop(0.22, '#1d1d1d');
  grd.addColorStop(0.85, '#0c0c0c');
  grd.addColorStop(0.9, '#2a2a2a');
  grd.addColorStop(1, '#151515');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
