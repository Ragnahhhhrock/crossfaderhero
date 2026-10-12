import '@fontsource/chakra-petch/400.css';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/share-tech-mono/400.css';
import '../design/tokens.css';
import '../styles.css';
import './brand.css';
import tokensRaw from '../design/tokens.css?raw';
import { HOT_CUE_TOKENS } from '../design/tokens';

interface Tok {
  name: string;
  value: string;
  note: string;
}

/** Group tokens by their section headers in tokens.css. */
function parse(): { title: string; tokens: Tok[] }[] {
  const groups: { title: string; tokens: Tok[] }[] = [];
  for (const line of tokensRaw.split('\n')) {
    const h = /\/\*\s*-+\s*(.+?)\s*-+\s*\*\//.exec(line);
    if (h) {
      groups.push({ title: h[1], tokens: [] });
      continue;
    }
    const m = /^\s*--([a-z0-9-]+):\s*([^;]+);\s*(?:\/\*\s*(.*?)\s*\*\/)?/.exec(line);
    if (m && groups.length) groups[groups.length - 1].tokens.push({ name: m[1], value: m[2].trim(), note: m[3] ?? '' });
  }
  return groups;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const groups = parse();
const isColour = (t: Tok) => /^#|color-mix|^var\(--(?!font|type|space|radius|shadow|duration|ease|weight|glow)/.test(t.value);
const resolved = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();

const fontName = (t: 'font-ui' | 'font-lcd') => resolved(t).split(',')[0].replace(/['"]/g, '');

const mark = (size: number) => `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><circle cx="20" cy="32" r="13" fill="none" stroke="var(--deck-a)" stroke-width="5"/><circle cx="44" cy="32" r="13" fill="none" stroke="var(--deck-b)" stroke-width="5"/><rect x="25" y="28" width="14" height="8" rx="2" fill="var(--text)"/></svg>`;
const lockup = (size: number, ink = 'var(--text)') => `<div style="display:flex;align-items:center;gap:${size * 0.22}px">${mark(size).replace('var(--text)', ink)}<span style="font:var(--weight-bold) ${size * 0.6}px var(--font-ui);color:${ink};white-space:nowrap">Crossfader Hero</span></div>`;

const colourSections = groups
  .filter((g) => g.tokens.some(isColour))
  .map(
    (g) => `<h3>${esc(g.title)}</h3><div class="swatches">${g.tokens
      .filter(isColour)
      .map(
        (t) => `<div class="swatch"><div class="swatch-chip" style="background:var(--${t.name})"></div><div class="swatch-meta"><b>--${t.name}</b><span>${esc(t.value.startsWith('#') ? t.value : resolved(t.name) || t.value)}</span>${t.note ? `<i>${esc(t.note)}</i>` : ''}</div></div>`,
      )
      .join('')}</div>`,
  )
  .join('');

const tokensIn = (title: string) => groups.find((g) => g.title === title)?.tokens ?? [];
const all = groups.flatMap((g) => g.tokens);
const typeRows = all
  .filter((t) => t.name.startsWith('type-'))
  .map((t) => `<div class="type-row"><code>--${t.name} · ${esc(t.value)}</code><span style="font-size:var(--${t.name});${t.name === 'type-readout' ? 'font-family:var(--font-lcd)' : ''};font-weight:${t.name === 'type-display' || t.name === 'type-brand' ? 700 : 400}">${t.name === 'type-readout' ? '3:12.4  128.00' : t.note ? esc(t.note[0].toUpperCase() + t.note.slice(1)) : 'Crossfader Hero'}</span></div>`)
  .join('');
const spaceRows = all.filter((t) => t.name.startsWith('space-')).map((t) => `<div class="scale-row"><code>--${t.name} · ${t.value}</code><div class="scale-bar" style="width:calc(var(--${t.name}) * 6)"></div></div>`).join('');
const radii = all.filter((t) => t.name.startsWith('radius-')).map((t) => `<figure><div class="radius-demo" style="border-radius:var(--${t.name})"></div><figcaption>--${t.name} · ${t.value}</figcaption></figure>`).join('');
const shadows = all.filter((t) => t.name.startsWith('shadow-')).map((t) => `<figure><div class="shadow-demo" style="box-shadow:var(--${t.name})"></div><figcaption>--${t.name}</figcaption></figure>`).join('');
void tokensIn;

document.getElementById('brand')!.innerHTML = `
<div class="bg">
  <header class="bg-head">${mark(72)}<div><h1>Crossfader Hero</h1><p>Brand and design system. Every value on this page is read from <code>src/design/tokens.css</code>, the same file the game uses.</p></div></header>

  <h2>Idea</h2>
  <p><strong style="color:var(--text)">Club hardware in a bedroom.</strong> The interface is a booth: graphite chassis, backlit LCD screens and LEDs that only light up when they mean something. The world around it is a warm bedroom that grows into bigger venues as the career does.</p>
  <ul class="principles">
    <li><strong>Light means state</strong>A glowing control is on, playing or needs attention. Signal colours are never decoration.</li>
    <li><strong>A is blue, B is amber</strong>Everything that belongs to a deck wears its colour. Nothing else does.</li>
    <li><strong>The music is the colour</strong>Surfaces stay graphite so waveforms, LEDs and lights carry the colour.</li>
    <li><strong>Real gear words</strong>Cue, Sync, Quantize, Trim, Hot cue. Name controls the way a DJ would.</li>
    <li><strong>One showpiece per view</strong>The jog wheels, the gear on the desk, the setup in social art.</li>
  </ul>

  <h2>Logo</h2>
  <p>Two rings for the two decks, A on the left and B on the right, joined by a crossfader cap. The wordmark is ${fontName('font-ui')} Bold in sentence case. Keep clear space of at least the cap's height around it.</p>
  <div class="logo-tiles">
    <div class="logo-tile dark">${lockup(38)}</div>
    <div class="logo-tile panel">${mark(96)}</div>
    <div class="logo-tile paper">${lockup(34, 'var(--print-ink)')}</div>
    <div class="logo-tile dark"><img src="/favicon.svg" width="96" height="96" alt="App icon" /></div>
  </div>

  <h2>Colour</h2>
  <p>Use the semantic aliases in UI code. Translucency comes in fixed shade and tint steps. Hot cues A–H use ${HOT_CUE_TOKENS.map((t) => `<code>--${t}</code>`).join(', ')}.</p>
  ${colourSections}

  <h2>Type</h2>
  <p><strong style="color:var(--text)">${fontName('font-ui')}</strong> for everything; <span style="font-family:var(--font-lcd);color:var(--text)">${fontName('font-lcd')}</span> only for what a device would show on a display: time, BPM, tempo, key, counts. Sentence case, no all-caps labels.</p>
  ${typeRows}

  <h2>Space</h2>
  ${spaceRows}

  <h2>Shape and depth</h2>
  <h3>Radius grows with the object</h3>
  <div class="demo-row">${radii}</div>
  <h3>Elevation</h3>
  <div class="demo-row">${shadows}</div>

  <h2>Components</h2>
  <div class="demo-row">
    <figure><button class="tiny">Sync</button><figcaption>Small button</figcaption></figure>
    <figure><button class="tiny on">Quantize</button><figcaption>Active toggle</figcaption></figure>
    <figure><button class="primary">Choose music folder</button><figcaption>Primary (one per view)</figcaption></figure>
    <figure><span class="deck-badge" style="--accent:var(--deck-a)">A</span><figcaption>Deck badge</figcaption></figure>
    <figure><button class="cue-btn">Cue</button><figcaption>Cue</figcaption></figure>
    <figure><button class="play-btn on">Pause</button><figcaption>Play, playing</figcaption></figure>
  </div>
  <h3>Hot cue pads, set</h3>
  <div class="hotcues" style="max-width:520px">${HOT_CUE_TOKENS.map((t, i) => `<button class="hotcue set" style="--hc:var(--${t})">${String.fromCharCode(65 + i)}</button>`).join('')}</div>
  <h3>Meters and bar position</h3>
  <div class="demo-row">
    <div class="meter">${Array.from({ length: 15 }, (_, i) => `<i class="${i < 2 ? 'red' : i < 5 ? 'amber' : ''} ${i > 3 ? 'lit' : ''}"></i>`).join('')}</div>
    <div class="bar-segs deck-a"><i class="on"></i><i></i><i></i><i></i></div>
    <div class="bar-segs deck-b"><i></i><i></i><i class="on"></i><i></i></div>
  </div>

  <h2>Voice</h2>
  <ul>
    <li>Plain, warm, knowing: a DJ mate showing you the ropes, not software.</li>
    <li>Buttons say what happens: "Choose music folder", "Allow access", "Step back".</li>
    <li>Errors say what happened and what to do: "Deck A is playing on air — pause it or pull its fader down first."</li>
    <li>Sentence case. No exclamation marks or emoji in the product.</li>
  </ul>

  <h2>Social images</h2>
  <p>Generated by <code>npm run brand</code> from a real render of the bedroom under a graphite scrim, with the lock-up, tagline, A/B split bar and URL.</p>
  <div class="social">
    <figure style="margin:0"><img src="/og-image.png" alt="Open Graph image, 1200 by 630" /><figcaption class="note">Open Graph · 1200 × 630</figcaption></figure>
    <figure style="margin:0"><img src="/twitter-card.png" alt="Twitter card, 1200 by 600" /><figcaption class="note">Twitter card · 1200 × 600</figcaption></figure>
  </div>
  <p class="note">Contact: <a href="mailto:contact@crossfaderhero.com">contact@crossfaderhero.com</a></p>
</div>`;
