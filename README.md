# Crossfader Hero

A browser DJ career simulator. Plug your own music into two virtual CDJs, mix on a two-channel mixer, and (in later phases) work your way from bedroom practice to headlining a festival — and climb the DJ mixing championships from local heats to the World Final to be crowned the best DJ in the world (see [docs/COMPETITIONS.md](docs/COMPETITIONS.md)).

Domain: crossfaderhero.com. Contact: contact@crossfaderhero.com

## Your bedroom (3D)

You start in a small bedroom: a desk against the wall with two media players, a mixer and a pair of monitor speakers, posters, a record crate and an LED strip.

- **Walk** with W A S D or the arrow keys (Shift to hurry), **drag** to look around.
- **Press buttons on the gear itself**: Play, Cue (hold to preview), Sync, the 4-beat loop and the hot-cue pads are all clickable when you're within arm's reach.
- **Step up to the decks** with E when you're at the desk (or the "Go to the decks" button). The full controls slide up under a view of your setup; Esc steps back.
- The 3D gear mirrors the decks: platters spin, the jog rings and buttons light up, the screens show the track, time and BPM, the mixer's faders, knobs and meters move, and the speaker cones pump with the bass.
- Sound comes out of the two speakers as positioned sources, so it changes as you walk around the room.
- Add `?no3d` to the URL to skip the room and go straight to the decks.

## Phase 1 — playable decks

- **USB = your folders.** Each deck has a USB slot. "Choose music folder" grants read-only access to a folder of MP3s; add as many folders per USB as you like. Chrome and Edge remember the folders between visits (one click to re-allow); other browsers fall back to picking the folder each visit. Music never leaves your computer.
- **Track analysis** in a background worker, cached in IndexedDB: BPM, beat grid and downbeat, musical key (Camelot), and a three-band waveform. Genre tags steer the tempo range (e.g. Drum & Bass → 155–185 BPM) to avoid half/double-time mistakes, and the deck's **Grid** menu has ×2 / ÷2 and ±5 ms grid fixes.
- **Two CDJs:** play/pause, CDJ-style CUE (set when paused, return when playing, hold to preview), 8 hot cues, beat-quantized auto loops (½–16 beats) with halve/double/exit/reloop, beat jump, tempo fader with ±6/10/16 % ranges, jog wheel (nudge while playing, search while paused), sync, quantize, scrolling and overview waveforms, bar.beat counter, end-of-track warning.
- **Mixer:** trim, 3-band EQ (−26 dB kill to +6 dB), one-knob low/high-pass filter, channel faders, crossfader with smooth/sharp curves, pre-fader channel meters and master meters with clip hold, and **split cue** for headphones on a single output (cued channel left ear, master right ear).
- **Phase meter** between the waveforms shows where each deck sits in its bar and how many milliseconds apart the beats are.
- **Keyboard:** press `?` in the app for the full map.

Not in phase 1 (see the build plan): key lock / master tempo, scoring, career mode, the mixing championships, venues and crowds, the SoundCloud-style platform.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # analysis, ID3, mixer and grid unit tests
npm run build      # type-check + production build into dist/
```

Requires Node 18+. Use Chrome or Edge on desktop for the full folder-access experience.

## Deploy to Cloudflare

The site is static. `wrangler.jsonc` serves `dist/` as Worker static assets:

```bash
npm run build
npx wrangler deploy
```

Then attach the `crossfaderhero.com` custom domain to the `crossfaderhero` Worker in the Cloudflare dashboard (Workers & Pages → crossfaderhero → Settings → Domains & Routes).

## Layout

```
src/
  audio/      engine (AudioContext), Deck (CDJ transport), Mixer (channels, EQ, filter, crossfader, room speakers), grid maths
  room/       the 3D bedroom (three.js): scene, gear models, procedural textures, first-person view
  library/    USB folder access + scanning, ID3 tags, BPM/beat-grid/key/waveform analysis, worker
  state/      zustand stores for the library and toasts
  ui/         deck, mixer, browser, waveforms, knobs and faders
test/         vitest unit tests with synthetic audio
```
