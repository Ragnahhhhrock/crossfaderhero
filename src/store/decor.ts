import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { alpha, font, hex, hue, shade, token } from '../design/tokens';

/*
 * Set dressing for the record shop: gig and festival posters for (fictional)
 * acts, a corkboard of upcoming events, framed memorabilia, and vintage audio
 * gear — boomboxes, portable CD players, personal stereos, tape decks and
 * cassettes. Everything is drawn on canvases or built from primitives, so
 * nothing is downloaded. All of it is decoration: none of it is pickable.
 */

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

function tex(w: number, h: number, draw: Draw): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Shrink a font until the text fits. */
function fit(g: CanvasRenderingContext2D, text: string, maxW: number, px: number, weight = 700, family: 'ui' | 'lcd' = 'ui') {
  let p = px;
  g.font = font(family, p, weight);
  while (g.measureText(text).width > maxW && p > 10) {
    p -= 2;
    g.font = font(family, p, weight);
  }
}

// ------------------------------------------------------------------ the bill
// Every act, venue and festival here is made up.

interface Gig {
  act: string;
  support: string;
  date: string;
  venue: string;
  tag: string;
}

const GIGS: Gig[] = [
  { act: 'VELVET STATIC', support: 'with Koto Bloom', date: 'FRI 21 NOV', venue: 'The Boiler Room, Northbridge', tag: 'LIVE' },
  { act: 'MIRA VOLT', support: '+ Saltwater Disco (DJ set)', date: 'SAT 29 NOV', venue: 'Rosemount Hall', tag: 'ALBUM LAUNCH' },
  { act: 'DUSTHAUS', support: 'all night long', date: 'SAT 6 DEC', venue: 'Warehouse 9', tag: 'EXTENDED SET' },
  { act: 'SISTER SEQUENCER', support: 'with Lowtide Collective', date: 'THU 11 DEC', venue: 'Crossfader Records (in-store)', tag: 'FREE ENTRY' },
  { act: 'DJ PARALLAX', support: 'b2b Ruby Fader', date: 'FRI 19 DEC', venue: 'Club Meridian', tag: 'TOUR' },
  { act: 'THE NIGHT FERRIES', support: '+ special guests', date: 'NYE 31 DEC', venue: 'Harbour Pavilion', tag: 'SOLD OUT' },
  { act: 'GLASSHOUSE SOUNDSYSTEM', support: 'dub · roots · steppers', date: 'SUN 4 JAN', venue: 'Fremantle Arts Yard', tag: 'DAY PARTY' },
  { act: 'NEON TIDAL', support: 'with Halcyon Static', date: 'FRI 16 JAN', venue: 'The Velvet Lounge', tag: 'LIVE' },
];

interface Fest {
  name: string;
  sub: string;
  dates: string;
  place: string;
  bill: string[];
  look: number;
}

const FESTS: Fest[] = [
  { name: 'OUTER ORBIT', sub: 'FESTIVAL', dates: '13–15 FEB', place: 'Swan Valley Grounds', look: 0, bill: ['KALGOORLIE MOON', 'MIRA VOLT · DUSTHAUS', 'Neon Tidal · Koto Bloom · DJ Parallax', 'Ruby Fader · Lowtide Collective · Velvet Static · Sister Sequencer'] },
  { name: 'DESERT PULSE', sub: 'THREE NIGHTS UNDER THE STARS', dates: '6–8 MAR', place: 'Pinnacles Plain', look: 1, bill: ['THE NIGHT FERRIES', 'GLASSHOUSE SOUNDSYSTEM', 'Saltwater Disco · Halcyon Static · Orbit Kids', 'Jules Arcade · Tape Hiss · The Overdubs · Paper Planets'] },
  { name: 'RIVERBANK', sub: 'FREQUENCIES', dates: 'SAT 28 MAR', place: 'Langley Foreshore', look: 2, bill: ['DJ PARALLAX', 'SISTER SEQUENCER · NEON TIDAL', 'Mira Volt · Koto Bloom · Ruby Fader', 'Open-decks winners · Battle DJ finals'] },
];

const FLYERS = [
  { head: 'OPEN DECKS', lines: ['Every Thursday', 'bring your own records', 'sign up at the counter'], ink: 'hot-teal', paper: 'print-ink' },
  { head: 'DJ BATTLE', lines: ['Local heats', 'Sat 22 Nov · 2pm', '$500 + trophy'], ink: 'print-red', paper: 'print-paper' },
  { head: 'RECORD FAIR', lines: ['40+ stalls', 'Sun 30 Nov', 'Town Hall · 9am'], ink: 'print-ink', paper: 'print-sun' },
  { head: 'IN-STORE', lines: ['Sister Sequencer', 'live set + signing', 'Thu 11 Dec · 6pm'], ink: 'white', paper: 'print-violet' },
  { head: 'SCRATCH CLASS', lines: ['Beginners welcome', 'Tuesdays 7pm', 'turntables provided'], ink: 'print-ink', paper: 'hot-yellow' },
  { head: 'WANTED', lines: ['Your old vinyl', 'we buy collections', 'ask at the counter'], ink: 'print-paper', paper: 'print-rose' },
  { head: 'BAND WANTS DJ', lines: ['Neon Tidal seek', 'tour support DJ', 'call Jules'], ink: 'print-ink', paper: 'print-paper' },
  { head: 'RECORD STORE DAY', lines: ['Exclusive pressings', 'doors 8am', 'queue early!'], ink: 'print-sun', paper: 'print-night' },
];

// ---------------------------------------------------------------- posters

/** A gig poster for a (fictional) act. 512×724. */
function gigPoster(gig: Gig, seed: number): THREE.CanvasTexture {
  return tex(512, 724, (g, w, h) => {
    const r = rng(seed);
    const look = seed % 4;
    const base = r();
    if (look === 0) {
      // bold duotone with big circles
      g.fillStyle = hue(base, 0.65, 0.18);
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = hue(base + 0.08 * i + 0.4, 0.75, 0.55, 0.85);
        g.beginPath();
        g.arc(80 + r() * 350, 120 + r() * 320, 40 + r() * 110, 0, Math.PI * 2);
        g.fill();
      }
    } else if (look === 1) {
      // paper with diagonal stripes
      g.fillStyle = token('print-paper');
      g.fillRect(0, 0, w, h);
      g.save();
      g.translate(w / 2, 280);
      g.rotate(-0.5);
      for (let i = -8; i < 8; i++) {
        g.fillStyle = i % 2 ? token('print-red') : token('print-ink');
        g.fillRect(i * 46, -260, 22, 520);
      }
      g.restore();
    } else if (look === 2) {
      // sunset gradient and a grid horizon
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, token('print-night'));
      grd.addColorStop(0.55, hue(base, 0.8, 0.45));
      grd.addColorStop(1, token('print-ink'));
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      g.fillStyle = token('print-sun');
      g.beginPath();
      g.arc(w / 2, 360, 120, Math.PI, 0);
      g.fill();
      g.strokeStyle = alpha('print-magenta', 0.8);
      g.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.moveTo(0, 360 + i * i * 4);
        g.lineTo(w, 360 + i * i * 4);
        g.stroke();
      }
      for (let i = -10; i <= 10; i++) {
        g.beginPath();
        g.moveTo(w / 2, 360);
        g.lineTo(w / 2 + i * 60, 724);
        g.stroke();
      }
    } else {
      // halftone dots
      g.fillStyle = hue(base, 0.5, 0.82);
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < 460; y += 18) {
        for (let x = 0; x < w; x += 18) {
          const d = Math.hypot(x - 256, y - 230) / 260;
          g.fillStyle = hue(base + 0.5, 0.7, 0.3);
          g.beginPath();
          g.arc(x, y, Math.max(0, 8 * (1 - d)), 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    const dark = look === 1 || look === 3;
    const ink = dark ? token('print-ink') : token('white');
    // tag ribbon
    g.fillStyle = token(gig.tag === 'SOLD OUT' ? 'print-red' : 'print-sun');
    g.fillRect(0, 34, 230, 46);
    g.fillStyle = token('print-ink');
    fit(g, gig.tag, 200, 28);
    g.textBaseline = 'middle';
    g.fillText(gig.tag, 18, 58);
    // the act
    g.textAlign = 'center';
    g.fillStyle = ink;
    const words = gig.act.split(' ');
    const lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : words.length === 2 && gig.act.length > 12 ? words : [gig.act];
    lines.forEach((l, i) => {
      fit(g, l, 460, 92);
      g.fillText(l, w / 2, 520 + i * 74 - (lines.length - 1) * 37);
    });
    g.font = font('ui', 26, 500);
    g.fillStyle = dark ? alpha('print-ink', 0.8) : alpha('white', 0.85);
    g.fillText(gig.support, w / 2, 612);
    g.fillStyle = token(dark ? 'print-ink' : 'print-sun');
    g.fillRect(40, 634, w - 80, 3);
    g.fillStyle = ink;
    g.font = font('ui', 34, 700);
    g.fillText(gig.date, w / 2, 664);
    fit(g, gig.venue.toUpperCase(), 430, 22, 500);
    g.fillText(gig.venue.toUpperCase(), w / 2, 700);
  });
}

/** A festival line-up poster. 512×724. */
function festPoster(f: Fest): THREE.CanvasTexture {
  return tex(512, 724, (g, w, h) => {
    if (f.look === 0) {
      g.fillStyle = token('print-night');
      g.fillRect(0, 0, w, h);
      // planets and stars
      const r = rng(11);
      for (let i = 0; i < 90; i++) {
        g.fillStyle = alpha('white', 0.3 + r() * 0.7);
        g.fillRect(r() * w, r() * 300, 2, 2);
      }
      const grd = g.createRadialGradient(330, 150, 10, 330, 150, 110);
      grd.addColorStop(0, token('print-magenta'));
      grd.addColorStop(1, token('print-violet'));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(330, 150, 100, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = token('print-sun');
      g.lineWidth = 6;
      g.beginPath();
      g.ellipse(330, 150, 160, 30, -0.25, 0, Math.PI * 2);
      g.stroke();
    } else if (f.look === 1) {
      const grd = g.createLinearGradient(0, 0, 0, 340);
      grd.addColorStop(0, token('print-rose'));
      grd.addColorStop(1, token('print-sun'));
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      g.fillStyle = token('print-paper');
      g.beginPath();
      g.arc(256, 260, 70, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = token('print-plum');
      g.beginPath();
      g.moveTo(0, 340);
      g.lineTo(120, 230);
      g.lineTo(220, 300);
      g.lineTo(330, 200);
      g.lineTo(512, 330);
      g.lineTo(512, 724);
      g.lineTo(0, 724);
      g.fill();
    } else {
      g.fillStyle = token('hot-teal');
      g.fillRect(0, 0, w, h);
      g.strokeStyle = alpha('print-ink', 0.35);
      g.lineWidth = 5;
      for (let i = 0; i < 7; i++) {
        g.beginPath();
        for (let x = 0; x <= w; x += 16) g.lineTo(x, 120 + i * 28 + Math.sin(x / 40 + i) * 12);
        g.stroke();
      }
      g.fillStyle = token('print-ink');
      g.fillRect(0, 330, w, h - 330);
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const titleInk = f.look === 2 ? 'print-ink' : 'white';
    g.fillStyle = token(titleInk);
    fit(g, f.name, 470, 84);
    g.fillText(f.name, w / 2, f.look === 1 ? 70 : 300);
    g.font = font('ui', 24, 600);
    g.fillText(f.sub, w / 2, f.look === 1 ? 118 : 344);
    const top = 395;
    g.fillStyle = token(f.look === 1 ? 'print-sun' : f.look === 2 ? 'hot-teal' : 'print-sun');
    f.bill.forEach((line, i) => {
      if (i > 0) g.fillStyle = token(i === 1 ? 'white' : 'ink-300');
      fit(g, line, 470, [52, 34, 24, 19][i] ?? 18, i < 2 ? 700 : 500);
      g.fillText(line, w / 2, top + [0, 62, 112, 152][i]);
    });
    g.fillStyle = token(f.look === 2 ? 'hot-teal' : 'print-magenta');
    g.fillRect(60, 600, w - 120, 4);
    g.fillStyle = token('white');
    g.font = font('ui', 40, 700);
    g.fillText(f.dates, w / 2, 640);
    g.font = font('ui', 22, 500);
    g.fillText(`${f.place.toUpperCase()}  ·  TICKETS ON SALE NOW`, w / 2, 684);
  });
}

/** A small flyer for the corkboard. 256×340. */
function flyer(i: number): THREE.CanvasTexture {
  const f = FLYERS[i % FLYERS.length];
  return tex(256, 340, (g, w) => {
    g.fillStyle = token(f.paper);
    g.fillRect(0, 0, w, 340);
    g.strokeStyle = token(f.ink);
    g.lineWidth = 4;
    g.setLineDash([10, 6]);
    g.strokeRect(10, 10, w - 20, 320);
    g.setLineDash([]);
    g.fillStyle = token(f.ink);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fit(g, f.head, 220, 40);
    g.fillText(f.head, w / 2, 70);
    g.fillRect(40, 104, w - 80, 3);
    f.lines.forEach((l, k) => {
      fit(g, l, 210, 24, k === 1 ? 700 : 500);
      g.fillText(l, w / 2, 160 + k * 52);
    });
    // tear-off tabs
    if (i % 3 === 0) {
      g.font = font('lcd', 12);
      for (let t = 0; t < 7; t++) {
        g.save();
        g.translate(22 + t * 32, 315);
        g.rotate(-Math.PI / 2);
        g.fillText('0400 123 456', 0, 0);
        g.restore();
      }
    }
  });
}

/** The corkboard of upcoming events. */
function corkboard(): THREE.CanvasTexture {
  return tex(1024, 640, (g, w, h) => {
    g.fillStyle = shade('room-crate', 0.75);
    g.fillRect(0, 0, w, h);
    const r = rng(5);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = alpha('room-fill-ground', 0.1 + r() * 0.3);
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    g.fillStyle = token('print-ink');
    g.fillRect(0, 0, w, 74);
    g.fillStyle = token('print-sun');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = font('ui', 48, 700);
    g.fillText("WHAT'S ON  ·  UPCOMING EVENTS", w / 2, 39);
  });
}

// ------------------------------------------------------------ memorabilia

type Memento = 'gold' | 'platinum' | 'setlist' | 'passes' | 'drumhead' | 'tee' | 'ticket';

function memento(kind: Memento, seed: number): THREE.CanvasTexture {
  return tex(512, 640, (g, w, h) => {
    const r = rng(seed);
    const sig = (x: number, y: number, ink: string, s = 1) => {
      g.strokeStyle = token(ink);
      g.lineWidth = 3 * s;
      g.beginPath();
      g.moveTo(x, y);
      for (let i = 0; i < 9; i++) g.quadraticCurveTo(x + (i + 0.5) * 14 * s, y + (r() - 0.5) * 50 * s, x + (i + 1) * 14 * s, y + (r() - 0.5) * 20 * s);
      g.stroke();
    };
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (kind === 'gold' || kind === 'platinum') {
      g.fillStyle = token('graphite-900');
      g.fillRect(0, 0, w, h);
      const metal = kind === 'gold' ? 'print-gold' : 'ink-300';
      const grd = g.createRadialGradient(220, 230, 20, 256, 260, 190);
      grd.addColorStop(0, shade(metal, 1.5));
      grd.addColorStop(0.6, token(metal));
      grd.addColorStop(1, shade(metal, 0.6));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(256, 260, 190, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = alpha('black', 0.15);
      g.lineWidth = 1;
      for (let rr = 70; rr < 186; rr += 5) {
        g.beginPath();
        g.arc(256, 260, rr, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = token(kind === 'gold' ? 'print-red' : 'deck-a');
      g.beginPath();
      g.arc(256, 260, 62, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = token('black');
      g.beginPath();
      g.arc(256, 260, 6, 0, Math.PI * 2);
      g.fill();
      // plaque
      g.fillStyle = shade('print-gold', 0.9);
      g.fillRect(96, 480, 320, 120);
      g.fillStyle = token('print-ink');
      const act = GIGS[seed % GIGS.length].act;
      fit(g, act, 290, 26);
      g.fillText(act, 256, 510);
      g.font = font('ui', 15, 500);
      g.fillText(kind === 'gold' ? 'Presented to Crossfader Records' : 'Certified Platinum', 256, 540);
      g.fillText(kind === 'gold' ? 'to commemorate 50,000 copies sold' : 'in recognition of 100,000 copies sold', 256, 562);
      g.fillText('"Midnight Signals" LP', 256, 584);
    } else if (kind === 'setlist') {
      g.fillStyle = token('print-paper');
      g.fillRect(0, 0, w, h);
      g.fillStyle = token('print-ink');
      g.font = font('ui', 30, 700);
      g.fillText('SETLIST', 256, 50);
      g.font = font('ui', 18, 500);
      g.fillText('Velvet Static · Boiler Room · 2019', 256, 84);
      const songs = ['Low Orbit', 'Tape Hiss Lullaby', 'Northbridge 3AM', 'Glass Hearts', 'Fader Down', 'Signal / Noise', 'Encore: Ferry Home'];
      g.textAlign = 'left';
      songs.forEach((s, i) => {
        g.font = font('ui', 32, 600);
        g.fillText(`${i + 1}. ${s}`, 60, 150 + i * 56);
      });
      sig(140, 560, 'print-red', 1.5);
      sig(300, 590, 'deck-a', 1.2);
      // tape at the corners
      g.fillStyle = alpha('print-sun', 0.5);
      g.fillRect(-10, 6, 90, 30);
      g.fillRect(w - 80, h - 40, 90, 30);
    } else if (kind === 'passes') {
      g.fillStyle = token('graphite-800');
      g.fillRect(0, 0, w, h);
      const names = ['ALL ACCESS', 'BACKSTAGE', 'CREW', 'AAA', 'GUEST'];
      for (let i = 0; i < 6; i++) {
        g.save();
        g.translate(110 + (i % 2) * 290, 110 + Math.floor(i / 2) * 200);
        g.rotate((r() - 0.5) * 0.5);
        g.fillStyle = hue(r(), 0.7, 0.55);
        g.fillRect(-90, -70, 180, 140);
        g.fillStyle = token('white');
        g.fillRect(-90, 20, 180, 50);
        g.fillStyle = token('print-ink');
        fit(g, names[i % names.length], 160, 26);
        g.fillText(names[i % names.length], 0, 45);
        g.fillStyle = token('white');
        fit(g, GIGS[(seed + i) % GIGS.length].act, 160, 20);
        g.fillText(GIGS[(seed + i) % GIGS.length].act, 0, -30);
        g.font = font('ui', 14, 500);
        g.fillText(`TOUR ${2014 + i * 2}`, 0, 0);
        g.restore();
      }
    } else if (kind === 'drumhead') {
      g.fillStyle = token('graphite-900');
      g.fillRect(0, 0, w, h);
      g.fillStyle = token('sleeve-white');
      g.beginPath();
      g.arc(256, 320, 230, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = token('tt-chrome');
      g.lineWidth = 14;
      g.stroke();
      g.fillStyle = token('print-ink');
      fit(g, 'THE NIGHT FERRIES', 380, 46);
      g.fillText('THE NIGHT FERRIES', 256, 280);
      g.font = font('ui', 20, 500);
      g.fillText('WORLD TOUR · 2011', 256, 322);
      sig(150, 400, 'print-ink', 1.2);
      sig(270, 440, 'print-red', 1);
      sig(180, 200, 'deck-a', 0.9);
    } else if (kind === 'tee') {
      g.fillStyle = token('graphite-700');
      g.fillRect(0, 0, w, h);
      g.fillStyle = token('print-ink');
      g.beginPath();
      g.moveTo(150, 90);
      g.lineTo(60, 160);
      g.lineTo(110, 240);
      g.lineTo(150, 210);
      g.lineTo(150, 580);
      g.lineTo(362, 580);
      g.lineTo(362, 210);
      g.lineTo(402, 240);
      g.lineTo(452, 160);
      g.lineTo(362, 90);
      g.quadraticCurveTo(256, 150, 150, 90);
      g.fill();
      g.fillStyle = token('print-sun');
      g.beginPath();
      g.arc(256, 300, 70, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = token('print-magenta');
      fit(g, 'DESERT PULSE', 190, 30);
      g.fillText('DESERT PULSE', 256, 410);
      g.font = font('ui', 18, 600);
      g.fillStyle = token('white');
      g.fillText('CREW · 2009', 256, 444);
    } else {
      // a framed collage of old ticket stubs
      g.fillStyle = token('print-plum');
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 7; i++) {
        g.save();
        g.translate(256 + (r() - 0.5) * 220, 70 + i * 82);
        g.rotate((r() - 0.5) * 0.35);
        g.fillStyle = token(i % 2 ? 'print-paper' : 'hot-yellow');
        g.fillRect(-170, -32, 340, 64);
        g.strokeStyle = token('print-ink');
        g.setLineDash([4, 4]);
        g.beginPath();
        g.moveTo(100, -32);
        g.lineTo(100, 32);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = token('print-ink');
        const gig = GIGS[(seed + i) % GIGS.length];
        fit(g, gig.act, 240, 20);
        g.fillText(gig.act, -30, -8);
        g.font = font('lcd', 14);
        g.fillText(`${gig.date} · ADMIT ONE`, -30, 14);
        g.fillText(`No ${1000 + Math.floor(r() * 8999)}`, 136, 0);
        g.restore();
      }
    }
  });
}

// ------------------------------------------------------------ wall pieces

const FRAME = { d: 0.03, border: 0.04 };

/** A picture in a frame (or a bare poster if frame is null), facing +z of its group. */
function framed(map: THREE.Texture, w: number, h: number, frame: string | null): THREE.Group {
  const g = new THREE.Group();
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, roughness: frame ? 0.35 : 0.9 }));
  if (frame) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w + FRAME.border * 2, h + FRAME.border * 2, FRAME.d), new THREE.MeshStandardMaterial({ color: hex(frame), roughness: 0.5, metalness: frame === 'print-gold' ? 0.6 : 0.1 }));
    m.position.z = FRAME.d / 2;
    g.add(m);
    pic.position.z = FRAME.d + 0.002;
  } else {
    pic.position.z = 0.004;
  }
  g.add(pic);
  return g;
}

/** Place something flat on a wall. side: which wall; u: position along it; y: height of its centre. */
export type WallSide = 'entrance' | 'back' | 'left' | 'right';

export interface ShopSize {
  W: number;
  D: number;
}

function onWall(o: THREE.Object3D, side: WallSide, u: number, y: number, s: ShopSize) {
  if (side === 'entrance') {
    o.position.set(u, y, -0.012);
    o.rotation.y = Math.PI;
  } else if (side === 'back') {
    o.position.set(u, y, -s.D + 0.012);
  } else if (side === 'left') {
    o.position.set(-s.W / 2 + 0.012, y, u);
    o.rotation.y = Math.PI / 2;
  } else {
    o.position.set(s.W / 2 - 0.012, y, u);
    o.rotation.y = -Math.PI / 2;
  }
  return o;
}

/** The deck of wall pieces, dealt out in order so neighbouring spots differ. */
function wallPiece(i: number): THREE.Group {
  // gig · festival · memento · gig · memento · gig, round and round
  const cycle = i % 6;
  const k = Math.floor(i / 6);
  if (cycle === 0 || cycle === 3 || cycle === 5) return framed(gigPoster(GIGS[(i + k) % GIGS.length], i * 7 + 3), 0.62, 0.88, null);
  if (cycle === 1) return framed(festPoster(FESTS[k % FESTS.length]), 0.7, 0.99, null);
  const kinds: Memento[] = ['gold', 'setlist', 'passes', 'platinum', 'drumhead', 'tee', 'ticket'];
  const kind = kinds[(k * 2 + (cycle === 2 ? 0 : 1)) % kinds.length];
  const frame = kind === 'gold' || kind === 'platinum' ? 'print-gold' : kind === 'setlist' ? 'graphite-900' : 'room-desk';
  return framed(memento(kind, i + 1), 0.52, 0.65, frame);
}

// --------------------------------------------------------------- the gear

type Body = 'silver' | 'black' | 'red' | 'blue' | 'yellow';
const BODY: Record<Body, string> = { silver: 'tt-chrome', black: 'graphite-850', red: 'print-red', blue: 'deck-a', yellow: 'hot-yellow' };

function speakerGrille(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.fillStyle = token('graphite-950');
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = token('tt-chrome');
  g.lineWidth = r * 0.08;
  g.stroke();
  g.fillStyle = alpha('ink-500', 0.5);
  for (let y = -r; y < r; y += r / 7) for (let x = -r; x < r; x += r / 7) if (Math.hypot(x, y) < r * 0.88) g.fillRect(cx + x, cy + y, r / 18, r / 18);
  g.fillStyle = token('graphite-700');
  g.beginPath();
  g.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  g.fill();
}

/** The front of a boombox / radio-cassette player. */
function boomboxFace(body: Body, twin: boolean): THREE.CanvasTexture {
  return tex(1024, 512, (g, w, h) => {
    g.fillStyle = token(BODY[body]);
    g.fillRect(0, 0, w, h);
    const sr = twin ? 175 : 190;
    speakerGrille(g, 210, 290, sr);
    speakerGrille(g, w - 210, 290, sr);
    // tuning dial across the top
    g.fillStyle = token('lcd-bg');
    g.fillRect(150, 30, w - 300, 70);
    g.strokeStyle = token('lcd-edge');
    g.strokeRect(150, 30, w - 300, 70);
    g.fillStyle = token('hot-yellow');
    g.font = font('lcd', 20);
    g.textBaseline = 'middle';
    const fm = ['88', '92', '96', '100', '104', '108'];
    fm.forEach((f, i) => g.fillText(f, 180 + i * 120, 52));
    g.fillStyle = token('print-red');
    g.fillRect(420, 36, 4, 58);
    g.fillStyle = token('ink-300');
    g.fillText('FM · AM · SW', 180, 82);
    // cassette deck(s)
    const decks = twin ? [384, 640] : [512];
    for (const cx of decks) {
      g.fillStyle = token('graphite-900');
      g.fillRect(cx - 110, 150, 220, 150);
      g.fillStyle = alpha('white', 0.12);
      g.fillRect(cx - 100, 160, 200, 70);
      g.fillStyle = token('ink-300');
      for (const rx of [-45, 45]) {
        g.beginPath();
        g.arc(cx + rx, 195, 20, 0, Math.PI * 2);
        g.fill();
      }
    }
    // piano-key buttons
    for (let i = 0; i < 6; i++) {
      g.fillStyle = token(i === 0 ? 'print-red' : 'graphite-650');
      g.fillRect(400 + i * 38, 330, 30, 54);
    }
    // VU meters and knobs
    g.fillStyle = token('print-paper');
    g.fillRect(410, 400, 90, 60);
    g.fillRect(524, 400, 90, 60);
    g.strokeStyle = token('print-red');
    g.lineWidth = 3;
    for (const x of [455, 569]) {
      g.beginPath();
      g.moveTo(x, 455);
      g.lineTo(x + 22, 412);
      g.stroke();
    }
    g.fillStyle = token('ink-300');
    g.font = font('ui', 26, 700);
    g.textAlign = 'center';
    g.fillText(twin ? 'STEREO DOUBLE CASSETTE' : 'RADIO · CASSETTE', w / 2, 486);
  });
}

function solid(name: string, rough = 0.5, metal = 0.1) {
  return new THREE.MeshStandardMaterial({ color: hex(name), roughness: rough, metalness: metal });
}

/** A radio-cassette player. Its front faces +z; it sits on y = 0. */
export function boombox(body: Body = 'silver', scale = 1, twin = false): THREE.Group {
  const g = new THREE.Group();
  const W = 0.62;
  const Hh = 0.3;
  const D = 0.14;
  const bodyMat = solid(BODY[body], 0.4, body === 'silver' ? 0.5 : 0.15);
  const face = new THREE.MeshStandardMaterial({ map: boomboxFace(body, twin), roughness: 0.45 });
  const m = new THREE.Mesh(new RoundedBoxGeometry(W, Hh, D, 3, 0.02), bodyMat);
  m.position.y = Hh / 2;
  g.add(m);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.03, Hh - 0.03), face);
  front.position.set(0, Hh / 2, D / 2 + 0.001);
  g.add(front);
  // carry handle
  const chrome = solid('tt-chrome', 0.25, 0.9);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.03), chrome);
    post.position.set(sx * 0.2, Hh + 0.035, 0);
    g.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 10), chrome);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, Hh + 0.07, 0);
  g.add(bar);
  // telescopic aerial, folded down along the top
  const aerial = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 6), chrome);
  aerial.rotation.z = Math.PI / 2 - 0.05;
  aerial.position.set(0, Hh + 0.01, -D / 2 + 0.015);
  g.add(aerial);
  g.scale.setScalar(scale);
  return g;
}

/** A portable CD player, lid up a little on alternate units. */
export function discman(body: Body = 'silver', open = false): THREE.Group {
  const g = new THREE.Group();
  const top = tex(256, 256, (c, w) => {
    c.fillStyle = token(BODY[body]);
    c.fillRect(0, 0, w, w);
    c.strokeStyle = alpha('black', 0.25);
    c.lineWidth = 3;
    c.beginPath();
    c.arc(128, 128, 90, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = alpha('black', 0.3);
    c.beginPath();
    c.arc(128, 128, 34, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = token(body === 'silver' ? 'graphite-700' : 'ink-300');
    c.font = font('ui', 20, 700);
    c.textAlign = 'center';
    c.fillText('COMPACT DISC', 128, 214);
    c.fillText('ANTI-SKIP', 128, 52);
  });
  const side = solid(BODY[body], 0.35, body === 'silver' ? 0.5 : 0.1);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.012, 32), [side, new THREE.MeshStandardMaterial({ map: top, roughness: 0.35 }), side]);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.016, 32), solid('graphite-850', 0.5));
  base.position.y = 0.008;
  g.add(base);
  if (open) {
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.016, -0.068);
    lid.position.set(0, 0, 0.068);
    hinge.add(lid);
    hinge.rotation.x = -1.1;
    g.add(hinge);
    const cd = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.002, 32), solid('vinyl-sheen', 0.1, 0.9));
    cd.position.y = 0.017;
    g.add(cd);
  } else {
    lid.position.y = 0.022;
    g.add(lid);
  }
  // buttons along the front edge
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.006), solid(i === 1 ? 'play' : 'graphite-600'));
    b.position.set(-0.024 + i * 0.016, 0.01, 0.07);
    g.add(b);
  }
  return g;
}

/** A personal cassette player with headphones draped on it. Front faces +z, lying flat. */
export function walkman(body: Body = 'blue'): THREE.Group {
  const g = new THREE.Group();
  const face = tex(256, 200, (c, w, h) => {
    c.fillStyle = token(BODY[body]);
    c.fillRect(0, 0, w, h);
    c.fillStyle = alpha('black', 0.55);
    c.fillRect(30, 30, w - 60, h - 70);
    c.fillStyle = token('ink-300');
    for (const x of [90, 166]) {
      c.beginPath();
      c.arc(x, 85, 18, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = token('print-paper');
    c.fillRect(50, 120, w - 100, 22);
    c.fillStyle = token(body === 'yellow' ? 'print-ink' : 'white');
    c.font = font('ui', 20, 700);
    c.textAlign = 'center';
    c.fillText('STEREO · AUTO REVERSE', w / 2, 186);
  });
  const bodyMat = solid(BODY[body], 0.45);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.085), [bodyMat, bodyMat, new THREE.MeshStandardMaterial({ map: face, roughness: 0.4 }), bodyMat, bodyMat, bodyMat]);
  box.position.y = 0.015;
  g.add(box);
  // foam headphones lying beside it
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.004, 6, 24, Math.PI), solid('tt-chrome', 0.3, 0.8));
  band.rotation.x = -Math.PI / 2;
  band.position.set(0.11, 0.006, 0);
  g.add(band);
  for (const sx of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.014, 14), solid('print-rose', 0.95));
    pad.position.set(0.11 + sx * 0.06, 0.008, 0);
    g.add(pad);
  }
  return g;
}

/** A cassette tape lying flat, label up. */
export function cassette(seed: number): THREE.Mesh {
  const r = rng(seed);
  const shellTok = ['graphite-900', 'sleeve-white', 'print-red', 'deck-a', 'graphite-600'][seed % 5];
  const label = tex(256, 160, (c, w, h) => {
    c.fillStyle = token(shellTok);
    c.fillRect(0, 0, w, h);
    c.fillStyle = hue(r(), 0.6, 0.75);
    c.fillRect(14, 12, w - 28, 92);
    c.fillStyle = token('print-ink');
    c.font = font('ui', 18, 700);
    c.fillText(seed % 3 ? `MIXTAPE #${seed}` : GIGS[seed % GIGS.length].act, 24, 40);
    c.strokeStyle = alpha('print-ink', 0.4);
    for (let l = 0; l < 3; l++) {
      c.beginPath();
      c.moveTo(24, 60 + l * 14);
      c.lineTo(w - 24, 60 + l * 14);
      c.stroke();
    }
    c.fillStyle = alpha('black', 0.6);
    c.fillRect(70, 110, w - 140, 36);
    c.fillStyle = token('ink-300');
    for (const x of [100, 156]) {
      c.beginPath();
      c.arc(x, 128, 12, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = token('print-ink');
    c.font = font('ui', 14, 700);
    c.fillText(seed % 2 ? 'C90' : 'C60', w - 50, 40);
  });
  const shell = solid(shellTok, 0.4);
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.064), [shell, shell, new THREE.MeshStandardMaterial({ map: label, roughness: 0.45 }), shell, shell, shell]);
  m.position.y = 0.006;
  return m;
}

/** A hi-fi separates stack: amplifier, tape deck, CD player, tuner. Front faces +z. */
export function hifiStack(): THREE.Group {
  const g = new THREE.Group();
  const units: { h: number; draw: Draw }[] = [
    {
      h: 0.11,
      draw: (c, w, h) => {
        // amplifier: two big knobs and a power meter
        c.fillStyle = token('tt-chrome');
        c.fillRect(0, 0, w, h);
        for (const x of [90, w - 90]) {
          c.fillStyle = token('graphite-700');
          c.beginPath();
          c.arc(x, h / 2, 46, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = token('graphite-500');
          c.beginPath();
          c.arc(x, h / 2, 34, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = token('room-lamp');
        c.fillRect(200, 26, w - 400, 54);
        c.fillStyle = token('print-ink');
        c.font = font('ui', 18, 700);
        c.textAlign = 'center';
        c.fillText('INTEGRATED AMPLIFIER', w / 2, 108);
      },
    },
    {
      h: 0.09,
      draw: (c, w, h) => {
        // twin tape deck
        c.fillStyle = token('graphite-850');
        c.fillRect(0, 0, w, h);
        for (const x of [70, w / 2 + 20]) {
          c.fillStyle = token('graphite-950');
          c.fillRect(x, 12, 170, h - 30);
          c.fillStyle = alpha('white', 0.15);
          c.fillRect(x + 10, 18, 150, 30);
        }
        c.fillStyle = token('hot-teal');
        c.font = font('lcd', 16);
        c.fillText('DOLBY B·C NR', w - 150, h - 10);
      },
    },
    {
      h: 0.08,
      draw: (c, w, h) => {
        // CD player
        c.fillStyle = token('graphite-850');
        c.fillRect(0, 0, w, h);
        c.fillStyle = token('graphite-950');
        c.fillRect(40, 18, 220, 14);
        c.fillStyle = token('lcd-bg');
        c.fillRect(w - 260, 14, 200, 40);
        c.fillStyle = token('hot-teal');
        c.font = font('lcd', 28);
        c.fillText('01  03:42', w - 245, 44);
        c.fillStyle = token('ink-300');
        c.font = font('ui', 14, 700);
        c.fillText('COMPACT DISC PLAYER', 40, h - 12);
      },
    },
    {
      h: 0.07,
      draw: (c, w, h) => {
        // tuner
        c.fillStyle = token('tt-chrome');
        c.fillRect(0, 0, w, h);
        c.fillStyle = token('print-ink');
        c.fillRect(60, 14, w - 200, h - 30);
        c.fillStyle = token('room-lamp');
        c.font = font('lcd', 14);
        ['88', '94', '100', '106'].forEach((f, i) => c.fillText(f, 80 + i * 70, 34));
        c.fillStyle = token('print-red');
        c.fillRect(220, 18, 3, h - 38);
      },
    },
  ];
  let y = 0;
  const W = 0.43;
  const D = 0.3;
  for (const u of units) {
    const face = tex(512, Math.round((512 * u.h) / W), u.draw);
    const side = solid('graphite-850', 0.5, 0.3);
    const m = new THREE.Mesh(new THREE.BoxGeometry(W, u.h, D), [side, side, side, side, new THREE.MeshStandardMaterial({ map: face, roughness: 0.4, metalness: 0.2 }), side]);
    m.position.y = y + u.h / 2;
    g.add(m);
    y += u.h + 0.004;
  }
  return g;
}

/** A small shop sign on a stand or a shelf edge. */
function shelfSign(text: string, sub: string, ink: string, w = 0.6): THREE.Mesh {
  const t = tex(512, 160, (c, cw, ch) => {
    c.fillStyle = token('print-ink');
    c.fillRect(0, 0, cw, ch);
    c.strokeStyle = token(ink);
    c.lineWidth = 6;
    c.strokeRect(6, 6, cw - 12, ch - 12);
    c.fillStyle = token(ink);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fit(c, text, 470, 56);
    c.fillText(text, cw / 2, 60);
    c.font = font('ui', 26, 500);
    c.fillText(sub, cw / 2, 118);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.3125), new THREE.MeshBasicMaterial({ map: t }));
}

// --------------------------------------------------------------- placement

/** The shopper's body radius, kept clear of furniture. */
const REACH = 0.3;

export interface DecorBox {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * The front of the shop, which never moves: posters, memorabilia and the
 * events board on the entrance wall, the vintage-audio shelves on the left
 * wall beside the listening station, and a display case by the door.
 * Returns the floor footprints of anything you could walk into.
 */
export function decorateFront(parent: THREE.Object3D, s: ShopSize, door: { x: number; w: number }): DecorBox[] {
  const boxes: DecorBox[] = [];
  const wood = solid('room-desk', 0.6);
  const crate = solid('room-crate', 0.8);

  // ---- entrance wall: left of the door
  const leftOfDoor = [door.x - door.w / 2 - 0.55, door.x - door.w / 2 - 1.35, door.x - door.w / 2 - 2.2, door.x - door.w / 2 - 3.15];
  leftOfDoor.forEach((u, i) => {
    if (u < -s.W / 2 + 0.4) return;
    const piece = i === 2 ? framed(memento('gold', 2), 0.52, 0.65, 'print-gold') : i === 3 ? framed(festPoster(FESTS[1]), 0.7, 0.99, null) : framed(gigPoster(GIGS[i * 3 + 1], 40 + i), 0.62, 0.88, null);
    parent.add(onWall(piece, 'entrance', u, 1.72, s));
  });

  // ---- entrance wall: the events corkboard right of the door, with flyers pinned on it
  const boardX = door.x + door.w / 2 + 1.55;
  const board = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.08, 0.03), wood);
  frame.position.z = 0.015;
  board.add(frame);
  const cork = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 1.0), new THREE.MeshStandardMaterial({ map: corkboard(), roughness: 1 }));
  cork.position.z = 0.032;
  board.add(cork);
  const pinMats = ['print-red', 'hot-yellow', 'deck-a', 'play'].map((t) => solid(t, 0.3));
  for (let i = 0; i < 8; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), new THREE.MeshStandardMaterial({ map: flyer(i), roughness: 0.95 }));
    fl.position.set(-0.6 + col * 0.4 + ((i * 37) % 7) * 0.006, 0.16 - row * 0.44 + (row ? 0.1 : 0), 0.036 + i * 0.0006);
    fl.rotation.z = (((i * 53) % 9) - 4) * 0.022;
    if (row === 1) fl.scale.setScalar(0.82);
    board.add(fl);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), pinMats[i % 4]);
    pin.position.set(fl.position.x, fl.position.y + 0.17 * fl.scale.y, 0.05);
    board.add(pin);
  }
  parent.add(onWall(board, 'entrance', boardX, 1.78, s));

  // ---- entrance wall: further right, above the counter
  [boardX + 1.4, boardX + 2.25, boardX + 3.15].forEach((u, i) => {
    if (u > s.W / 2 - 0.4) return;
    const piece = i === 1 ? framed(memento('platinum', 4), 0.52, 0.65, 'print-gold') : i === 0 ? framed(festPoster(FESTS[0]), 0.7, 0.99, null) : framed(gigPoster(GIGS[5], 77), 0.62, 0.88, null);
    parent.add(onWall(piece, 'entrance', u, 1.75, s));
  });

  // ---- a glass-topped display case by the door: personal stereos, CD players and tapes
  const caseX = door.x + door.w / 2 + 1.55;
  const caseZ = -0.42;
  const CASE = { w: 1.5, d: 0.5, h: 0.92 };
  const dc = new THREE.Group();
  dc.position.set(caseX, 0, caseZ);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(CASE.w, CASE.h - 0.25, CASE.d), crate);
  cab.position.y = (CASE.h - 0.25) / 2;
  dc.add(cab);
  const felt = new THREE.Mesh(new THREE.BoxGeometry(CASE.w - 0.04, 0.01, CASE.d - 0.04), solid('print-plum', 1));
  felt.position.y = CASE.h - 0.25 + 0.005;
  dc.add(felt);
  const glass = new THREE.MeshStandardMaterial({ color: hex('room-window-cool'), transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false });
  const glassTop = new THREE.Mesh(new THREE.BoxGeometry(CASE.w, 0.01, CASE.d), glass);
  glassTop.position.y = CASE.h;
  dc.add(glassTop);
  for (const [w, d, x, z] of [[CASE.w, 0.01, 0, CASE.d / 2], [CASE.w, 0.01, 0, -CASE.d / 2], [0.01, CASE.d, CASE.w / 2, 0], [0.01, CASE.d, -CASE.w / 2, 0]] as const) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), glass);
    p.position.set(x, CASE.h - 0.125, z);
    dc.add(p);
  }
  const inside = CASE.h - 0.24;
  const items: [THREE.Object3D, number, number, number][] = [
    [discman('silver', true), -0.55, 0.02, 0.3],
    [discman('black'), -0.3, -0.08, -0.2],
    [walkman('blue'), -0.05, 0.06, 0.1],
    [walkman('yellow'), 0.22, -0.1, -0.3],
    [discman('red'), 0.48, 0.05, 0.5],
  ];
  for (const [o, x, z, ry] of items) {
    o.position.set(x, inside, z);
    o.rotation.y = ry;
    dc.add(o);
  }
  for (let i = 0; i < 4; i++) {
    const c = cassette(i + 3);
    c.position.set(0.58 - (i % 2) * 0.12, inside + 0.006 + Math.floor(i / 2) * 0.012, -0.12 + (i % 2) * 0.02);
    c.rotation.y = 0.2 * i;
    dc.add(c);
  }
  // a hi-fi stack on top of the case and a sign
  const hifi = hifiStack();
  hifi.scale.setScalar(0.8);
  hifi.position.set(-0.4, CASE.h + 0.005, -0.08);
  dc.add(hifi);
  const sign = shelfSign('VINTAGE AUDIO', 'ask to try · all tested', 'hot-yellow', 0.5);
  sign.position.set(0.3, CASE.h + 0.16, -0.05);
  sign.rotation.x = -0.1;
  dc.add(sign);
  const sStand = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.02), solid('graphite-700', 0.4, 0.6));
  sStand.position.set(0.3, CASE.h + 0.08, -0.06);
  dc.add(sStand);
  // display case faces into the shop
  dc.rotation.y = Math.PI; // the glass front and the sign face into the shop
  parent.add(dc);
  boxes.push({ x0: caseX - CASE.w / 2 - REACH, x1: caseX + CASE.w / 2 + REACH, z0: caseZ - CASE.d / 2 - REACH, z1: caseZ + CASE.d / 2 + REACH });

  // ---- left wall beside the listening station: shelving full of boomboxes and players
  const shelfZ = -1.9;
  const SH = { len: 2.6, d: 0.38, levels: [0.12, 0.62, 1.12, 1.62], top: 2.0 };
  const unit = new THREE.Group();
  unit.position.set(-s.W / 2 + SH.d / 2 + 0.01, 0, shelfZ);
  unit.rotation.y = Math.PI / 2; // shelf front faces +x, into the shop
  for (const sx of [-1, 1]) {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.04, SH.top, SH.d), wood);
    upright.position.set((sx * SH.len) / 2, SH.top / 2, 0);
    unit.add(upright);
  }
  const backPanel = new THREE.Mesh(new THREE.BoxGeometry(SH.len, SH.top, 0.02), solid('graphite-850', 0.9));
  backPanel.position.set(0, SH.top / 2, -SH.d / 2 + 0.01);
  unit.add(backPanel);
  for (const y of [...SH.levels, SH.top]) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(SH.len, 0.03, SH.d), wood);
    plank.position.set(0, y, 0);
    unit.add(plank);
  }
  const at = (o: THREE.Object3D, x: number, level: number, z = 0, ry = 0) => {
    o.position.set(x, (level < SH.levels.length ? SH.levels[level] : SH.top) + 0.015, z);
    o.rotation.y = ry;
    unit.add(o);
  };
  // bottom: the big twin-deck boombox and a hi-fi stack
  at(boombox('black', 1.3, true), -0.6, 0, 0.0);
  at(hifiStack(), 0.6, 0, -0.02);
  // second: boomboxes
  at(boombox('silver', 0.9), -0.75, 1);
  at(boombox('red', 0.75), 0.05, 1, 0.02, -0.08);
  at(boombox('silver', 0.85, true), 0.82, 1);
  // third: CD players, personal stereos and tapes
  at(discman('silver', true), -1.0, 2, 0.03);
  at(discman('blue'), -0.75, 2, -0.02, 0.4);
  at(walkman('yellow'), -0.45, 2, 0.04, -0.2);
  at(walkman('red'), -0.15, 2, -0.05, 0.3);
  for (let i = 0; i < 10; i++) {
    const c = cassette(i + 11);
    // standing on edge in a row, like on a tape rack
    c.rotation.set(0, 0, Math.PI / 2);
    c.position.set(0.18 + i * 0.016, SH.levels[2] + 0.015 + 0.05, 0.02);
    unit.add(c);
  }
  at(boombox('yellow', 0.6), 0.85, 2);
  // top shelf: a row of jewel-cased CDs and a radio
  for (let i = 0; i < 14; i++) {
    const cd = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.125, 0.142), [solid('graphite-900', 0.3), solid('graphite-900', 0.3), solid('graphite-900'), solid('graphite-900'), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(((i * 37) % 100) / 100, 0.6, 0.5), roughness: 0.3 }), solid('graphite-900')]);
    cd.position.set(-1.05 + i * 0.012, SH.levels[3] + 0.015 + 0.0625, 0);
    unit.add(cd);
  }
  at(boombox('blue', 0.7), -0.5, 3);
  at(discman('black', true), 0.15, 3);
  at(boombox('silver', 0.8, true), 0.75, 3);
  // on top of the unit
  at(boombox('black', 1.0), -0.45, 4);
  const topSign = shelfSign('RETRO AUDIO', 'radios · tapes · CD players', 'hot-teal', 0.8);
  topSign.position.set(0.55, SH.top + 0.15, 0);
  unit.add(topSign);
  parent.add(unit);
  // a warm light washing down the shelves
  const wash = new THREE.SpotLight(hex('room-lamp-hot'), 12, 4.5, 0.75, 0.7, 1.3);
  wash.position.set(-s.W / 2 + 1.6, 2.9, shelfZ);
  wash.target.position.set(-s.W / 2 + 0.1, 0.9, shelfZ);
  parent.add(wash, wash.target);
  const ux = -s.W / 2;
  boxes.push({ x0: ux - 0.1, x1: ux + SH.d + REACH, z0: shelfZ - SH.len / 2 - REACH, z1: shelfZ + SH.len / 2 + REACH });
  return boxes;
}

/** A boombox on the shop counter, for the clerk. y is the counter top. */
export function counterBoombox(): THREE.Group {
  const b = boombox('silver', 0.75);
  b.rotation.y = 0.35; // facing the shop, angled towards the till
  return b;
}

/**
 * The long walls, which change length with the stock: posters, festival
 * line-ups and framed memorabilia on the left, back and right walls, avoiding
 * the new-arrivals display on the right wall (z from `display.z0` to `display.z1`).
 */
export function decorateWalls(parent: THREE.Object3D, s: ShopSize, display: { z0: number; z1: number } | null): DecorBox[] {
  const boxes: DecorBox[] = [];
  let n = 0;
  // left wall, behind the vintage-audio shelves
  for (let z = -3.7; z > -s.D + 0.8; z -= 1.15) parent.add(onWall(wallPiece(n++), 'left', z, 1.72, s));
  // right wall: by the counter, then past the new-arrivals display
  for (const z of [-0.8, -3.0]) parent.add(onWall(wallPiece(n++), 'right', z, 1.72, s));
  const after = display ? display.z1 - 0.7 : -4.2;
  for (let z = after; z > -s.D + 0.8; z -= 1.15) parent.add(onWall(wallPiece(n++), 'right', z, 1.72, s));
  // above the new-arrivals display, a row of framed records
  if (display) {
    for (let z = display.z0 - 0.5, i = 0; z > display.z1 + 0.3 && i < 4; z -= 1.5, i++) {
      parent.add(onWall(framed(memento(i % 2 ? 'platinum' : 'gold', 30 + i), 0.34, 0.42, 'print-gold'), 'right', z, 2.72, s));
    }
  }
  // back wall either side of the neon
  [-1.95, 1.95, -3.0, 3.0, -4.3, 4.3].forEach((u, i) => {
    if (Math.abs(u) > s.W / 2 - 0.45) return;
    const piece = i < 2 ? framed(festPoster(FESTS[(i + 2) % FESTS.length]), 0.7, 0.99, null) : wallPiece(n++);
    parent.add(onWall(piece, 'back', u, 1.72, s));
  });
  // a big boombox on the floor in each back corner, like it's waiting for a breakdancer
  for (const sx of [-1, 1]) {
    const b = boombox(sx < 0 ? 'silver' : 'black', 1.5, sx > 0);
    b.position.set(sx * (s.W / 2 - 0.6), 0, -s.D + 0.25);
    b.rotation.y = -sx * 0.5;
    parent.add(b);
    boxes.push({ x0: sx * (s.W / 2 - 0.6) - 0.5 - REACH, x1: sx * (s.W / 2 - 0.6) + 0.5 + REACH, z0: -s.D, z1: -s.D + 0.35 + REACH });
  }
  return boxes;
}
