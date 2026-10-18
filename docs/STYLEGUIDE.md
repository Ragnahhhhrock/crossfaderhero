# Crossfader Hero — design system and style guide

Live version: **https://crossfaderhero.com/brand** (rendered from the tokens, so it is always current).

Every colour, typeface and measurement in the product comes from **`src/design/tokens.css`**. `test/design-tokens.test.ts` fails the build if:

- a raw colour (`#hex`, `0x…`, `rgb()`, `hsl()`) or a font name appears in any source file outside `src/design/`;
- code references a token that doesn't exist;
- a public asset (`public/*.svg|html|webmanifest|xml`, `index.html`, `brand.html`) or a brand template uses a colour that isn't in the palette.

To change the look, change a token. To add a colour, add a token, then use it.

## 1. Idea

**Club hardware in a bedroom.** The interface is a booth: a graphite chassis, backlit LCD screens and LEDs that only light up when they mean something. The world around it is a warm, slightly scruffy bedroom that grows into bigger venues as the career does.

Principles:

1. **Light means state.** A glowing control is on, playing or needs attention. Never use a signal colour for decoration.
2. **Deck A is ice blue, deck B is amber.** Everything that belongs to a deck — tags, jog ring, waveform playhead, channel label, USB tab — wears its colour. Nothing else does.
3. **The music is the colour.** Surfaces stay neutral graphite so waveforms, LEDs and the room's lights carry the colour.
4. **Real gear vocabulary.** Cue, Sync, Quantize, Trim, Hot cue. Name controls the way a DJ would.
5. **One showpiece per view.** The jog wheels on the decks; the gear on the desk in the room; the setup in social art.

## 2. Logo

- **Mark:** two rings (the two decks, A blue on the left, B amber on the right) joined by a crossfader cap in ink. `public/mark.svg`; on a graphite tile as `public/favicon.svg`.
- **Wordmark:** "Crossfader Hero" in Chakra Petch Bold, sentence case, letter-spacing 0.01–0.02 em. Never all caps, never italic.
- **Lock-up:** mark left of the wordmark, gap ≈ 0.2 × mark height. In the app bar the mark is 26 px with the 17 px wordmark.
- **Clear space:** at least the cap's height (⅛ of the mark) on every side.
- Don't recolour the rings, swap their order, add effects other than the deck glow, or set the mark on busy imagery without the graphite scrim.

## 3. Colour

| Group | Tokens | Use |
| --- | --- | --- |
| Graphite | `--graphite-1000` … `--graphite-400`, `--black`, `--white` | Hardware surfaces, from voids (fader slots) up to fader caps. |
| Ink | `--ink-100`, `--ink-300`, `--ink-500` | Text: primary, secondary, tertiary. Warm white, never pure white for text. |
| LCD | `--lcd-bg`, `--lcd-edge` | Deck screens only. |
| Signals | `--deck-a`, `--deck-b`, `--play`, `--cue`, `--filter`, `--danger`, `--hot-pink`, `--hot-yellow`, `--hot-teal` | LEDs that mean something. Hot cues A–H use play, deck-a, hot-pink, hot-yellow, filter, deck-b, hot-teal, ink-100 in that order. |
| Waveform | `--wave-low`, `--wave-mid`, `--wave-high`, `--wave-played` | Three-band waveforms (lows at the back) and played portions. |
| Gear | `--gear-*` | 3D decks, mixer and speakers. |
| Room | `--room-*` | The 3D bedroom: walls, oak floor, desk, lamp, LED strip, window. |
| Gig print | `--print-*` | Posters, record sleeves, rug and marketing art. Warm paper, signal red, ink, night, magenta, sun. |

**Semantic aliases** (`--surface-*`, `--text*`, `--border*`, `--focus`) are what UI code should use. Reach for a palette step only when no alias fits.

**Translucency** comes in fixed steps: `--shade-10/25/40/55/65/80` (black) and `--tint-3/5/8/12` (white), plus `--glass` and `--glass-strong` for panels over the 3D view. In CSS, tint a signal colour with `color-mix(in srgb, var(--cue) 35%, transparent)`; in canvas code use `alpha('cue', 0.35)`.

**Contrast** (WCAG, on `--surface-page`): `--ink-100` 16.0 : 1, `--ink-300` 8.1 : 1, `--ink-500` 4.0 : 1 (3.4 : 1 on panels), so `--ink-500` is only for non-essential labels. Text on a signal colour is always `--text-on-signal` (graphite-900): 9.6–11.4 : 1 on every signal.

## 4. Type

- **Chakra Petch** (`--font-ui`) for everything: UI, headings, labels, the wordmark. Its squared terminals echo hardware silk-screening.
- **Share Tech Mono** (`--font-lcd`) only for things a device would show on a display: time, BPM, tempo %, key, counts, URLs in art.
- Both are self-hosted from `@fontsource` (no third-party font requests).

| Token | Size | Use |
| --- | --- | --- |
| `--type-micro` | 11 px | Knob labels, units |
| `--type-small` | 12.5 px | Buttons, table meta, notes |
| `--type-body` | 14 px | Default text |
| `--type-strong` | 15 px | Track titles, sub-headings |
| `--type-brand` | 17 px | App-bar wordmark |
| `--type-heading` | 20 px | Panel and dialog headings |
| `--type-readout` | 26 px | LCD time and BPM |
| `--type-display` | 72 px | Marketing and social art |

Weights: 400 regular, 500 medium (buttons), 600 semibold (titles, labels), 700 bold (wordmark, deck letters). Sentence case everywhere; no all-caps labels except the deck letters A and B and printed gig posters in the room.

## 5. Space, shape, depth, motion

- **Spacing:** `--space-1` 2 px through `--space-8` 24 px. Controls sit on a 4 px rhythm; panels pad 10 px; the booth gutters are 12 px.
- **Radius** grows with the object: LEDs 2, chips 3, buttons 5, inputs 6, screens 8, panels 12, round controls 50 %.
- **Depth:** panels use `--shadow-panel` (top highlight + soft drop); round controls `--shadow-control`; floating things `--shadow-pop`; dialogs `--shadow-modal`. Glows are the signal colour at 30–55 % and `--glow-size`.
- **Motion:** `--duration-fast` 0.15 s for presses, `--duration-base` 0.3 s for drawers, `--duration-scene` 0.85 s for camera moves between the room and the decks, easing `--ease-out`. Respect `prefers-reduced-motion` (drawers and overlays snap; blinking warnings hold steady).

## 6. Components

| Component | Notes |
| --- | --- |
| Small button (`.tiny`) | Graphite gradient, `--radius-button`, 12.5 px medium. Active toggles turn `--cue` with `--text-on-signal`. |
| Primary button (`.primary`) | Ink fill, graphite text. One per view, for the main next step ("Choose music folder"). |
| Deck badge | Deck colour square with the letter in graphite. |
| Hot cue pad | Unlit graphite; when set, tinted 22 % of its colour with a 30 % glow. |
| Play / Cue | 66 px round buttons; Play glows `--play` while playing; Cue glows `--cue` while held. |
| Jog wheel | The showpiece: conic graphite ring with a deck-colour glow when playing, rotating marker, artwork in the centre. |
| Faders and knobs | Graphite caps with an ink line; knob arcs fill from the default in the channel's colour (filter knobs in `--filter`). |
| LED meter | Green → amber (top 5) → red (top 2); unlit segments are the colour at 12 % on the void. Clip holds for 1.2 s. |
| Waveforms | Wells in `--surface-well`; bands low/mid/high; beat lines white at 14 %, downbeats 42 %; cue markers `--cue`. |
| Toasts | Raised graphite, 3 px left rule in `--deck-a` (info) or `--cue` (warning). |

## 7. The 3D room

- Materials take their colours from `--gear-*`, `--room-*` and `--print-*` through `hex()` in `src/design/tokens.ts`. LEDs on the gear are emissive signal colours: off is the material, on is the token at intensity ≈ 1.2–1.6.
- Lighting: warm pendant (`--room-lamp`), cool sky fill (`--room-fill-sky`/`--room-fill-ground`) and a violet LED wash (`--room-led`) that breathes with the bass.
- Posters, sleeves and the rug use only the gig-print palette. Posters advertise invented nights; never real artists, labels or brands.

## 8. Voice

Plain, warm, knowing. Talk like a DJ mate showing you the ropes, not like software.

- Use the gear's words: "Load", "Cue", "Sync", "Step up to the decks".
- Buttons say what happens: "Choose music folder", "Allow access", "Step back".
- Errors say what happened and what to do: "Deck A is playing on air — pause it or pull its fader down first."
- Sentence case, no exclamation marks, no emoji in the product.

## 9. Social images and metadata

- `public/og-image.png` (1200 × 630) and `public/twitter-card.png` (1200 × 600) are generated by `npm run brand` from `scripts/brand/social.html`: a real render of the bedroom (`?shot`), a graphite scrim from the left, the mark and wordmark at `--type-display`, the tagline in `--ink-300` with the second sentence in `--ink-100`, the A/B split bar and the URL in `--font-lcd`, and the DJ avatar on the right.
- Tagline: "Mix your own music on virtual decks or vinyl. Start in your bedroom. Finish on the main stage."
- The DJ avatar (`public/avatar.svg`) is a silhouette in headphones and shades at two decks and a mixer, drawn from tokens by `scripts/brand/avatar.mjs`: deck A blue on the left, deck B amber on the right, no other colour. It is regenerated by `npm run brand` and embedded in the social cards.
- Icons (`apple-touch-icon.png`, `icon-192/512.png`, `icon-maskable-512.png`) come from the same script. Regenerate after any token change: `npm run build && npm run brand`.

## 10. Club CFH

**Club CFH** (short for Club Crossfader Hero) is the identity of the game's club venue. It is signage, so it is neon, and it has its own palette so it never competes with the deck colours.

- **Lock-up** (`public/club-cfh.svg`): a cyan border tube, CLUB in cyan above CFH in pink, and a cyan crossfader slot underneath with a white cap. Always on a black board (`--graphite-1000`).
- **Ring mark** (`public/club-cfh-mark.svg`): the C of CFH as a pink ring, open on the right, with the crossfader slot and cap running through the opening. For avatars, icons and the booth.
- **Colour:** `--cfh-pink` (CFH, ring), `--cfh-cyan` (CLUB, border, slot), `--cfh-core` (the hot centre of every lit tube and the cap). No other colour appears in the logo.
- **Type:** hand-bent single-stroke capitals, not a typeface. CLUB and CFH are the one place all caps is correct. Never set the name in Chakra Petch.
- **Clear space:** the height of the CLUB letters on every side.
- **Where it lives:** neon signs on both side walls of the club and the ring mark on the front of the DJ booth; the LED wall's Club CFH visual (the cap swings with the beat); a corner bug on every other visual, and the full sign on the wall for one bar in every eight.
- **The DJ's name** on the club's screens is set in the same neon: upper-cased, bold Chakra Petch letters in `--cfh-pink` and `--cfh-cyan` with a `--cfh-core` hot centre, and the crossfader slot underneath. Four looks (drop, neon, split, wave), eight beats each; they stay inside the Club CFH palette, and the beat only ever drives position, scale and brightness, never new colours.
- **Where it doesn't:** the app's controls and bars. Neon is venue light, not state.
- **Don't:** recolour the tubes, add outlines or drop shadows, rotate or italicise the letters, or put the lock-up on a photo or a light background.

The tube geometry is one file, `src/brand/cfh-logo.json`. The SVG files (`scripts/brand/club.mjs`, run by `npm run brand` or on its own with `node scripts/brand/club.mjs`), the 3D signs and the LED wall (`src/club/neon.ts`) all draw from it, so a change to the logo is one edit.
