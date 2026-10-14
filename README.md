# Crossfader Hero

A browser DJ career simulator. Plug your own music into two virtual CDJs or press it to vinyl for two turntables, mix on a two-channel mixer, and (in later phases) pick one of two career paths (see [docs/CAREER-PATHS.md](docs/CAREER-PATHS.md)):

- **Pro DJ** — start as a bedroom DJ and work up to headlining major festivals in packed stadiums.
- **Battle DJ** — start as a bedroom turntablist, play vinyl on turntables (your MP3s become records in a crate, see [docs/TURNTABLES.md](docs/TURNTABLES.md)), win local mixing contests, then the national and international championships to be crowned the best DJ in the world (see [docs/COMPETITIONS.md](docs/COMPETITIONS.md)).

Play it at **https://crossfaderhero.com**. Contact: contact@crossfaderhero.com

## Your bedroom (3D)

You start in a small bedroom: a desk against the wall with two media players, a mixer and a pair of monitor speakers, posters, a record crate and an LED strip.

- **Walk** with W A S D or the arrow keys (Shift to hurry), **drag** to look around.
- **Press buttons on the gear itself**: Play, Cue (hold to preview), Sync, the 4-beat loop and the hot-cue pads are all clickable when you're within arm's reach.
- **Step up to the decks** with E when you're at the desk (or the "Go to the decks" button). The full controls slide up under a view of your setup; Esc steps back.
- The 3D gear mirrors the decks: platters spin, the jog rings and buttons light up, the screens show the track, time and BPM, the mixer's faders, knobs and meters move, and the speaker cones pump with the bass.
- Sound comes out of the two speakers as positioned sources, so it changes as you walk around the room.
- Add `?no3d` to the URL to skip the room and go straight to the decks.

## The record store (3D shop)

**https://crossfaderhero.com/store** — go crate digging. A shop with bins of vinyl filed by genre and alphabetically by artist, stocked from your own music folders. Flip through a crate, pick records up, try them on the listening station (slide the vinyl out of its sleeve, put it on the platter, drop the needle), add the ones you want to your record bag and pay the clerk at the counter. Bought records land in a "Record store finds" crate in your collection. Details and what's next: [docs/RECORD-STORE.md](docs/RECORD-STORE.md). Code: `src/store/`. **Record store** in the top bar of the bedroom and the club gets you there.

## The club (3D venue)

**https://crossfaderhero.com/club** — the first venue: a nightclub with a stage, DJ booth (the same CDJs and mixer as your bedroom), a 9 × 7 m LED dance floor that holds 50, PA stacks, a bar, and a lighting rig on three trusses. Everything runs to a beat clock and every element is on the control desk (side panel on desktop, bottom sheet on phones):

- **Crowd** slider (0–50, the floor fills from the front) and **podium dancers** on four lit podiums.
- **Lighting**: wash, chase, pulse or moving heads; five colour palettes (Club, Sunset, Ice, Jungle, Rainbow); intensity.
- **Scanners** (gobo dots thrown across the floor, speed), **strobes** (every beat, 8ths, 16ths; off by default), **lasers** (green, red, blue or RGB; fan, sweep or tunnel), **smoke** (density; beams show up more in haze).
- **LED wall** behind the DJ: tunnel, spectrum, kaleidoscope, plasma, retro grid or the Crossfader Hero logo, with speed.
- **Drop**: a two-bar build then eight bars of everything; the crowd jumps. Plus tempo, LED floor and house-light toggles, all on / blackout / reset, camera views (floor, DJ booth, back, side), auto orbit and glow.
- **Jump on the decks** (button, top bar or `E`): the resident DJ steps aside and you're behind the booth with the full decks, mixer, USB browser and record crates, looking over your gear at the crowd. Your gear choice (CDJs, turntables or both) is on the booth and mirrors the decks. `Esc` or **Onto the floor** steps back down; the music keeps playing out of the PA.
- **The room follows your mix.** While a deck is on air, the lights, lasers, LED wall and dancers lock to that deck's beat grid and tempo (the light desk shows `BPM · deck A`). The crowd's energy follows the bass: they ease off in breakdowns, and when the bass slams back after two bars or more the club fires its drop. With nothing on air they stand and wait, and the lights run on the desk's own tempo.
- **Look around while you mix.** Drag in the view above the controls: in **Eyes** (the DJ's point of view) you turn your head left, right, up and down; in **Behind** a camera circles your DJ at the decks (scroll to zoom). `V` switches view, `R` or a double-click resets it. The choice is remembered.
- **Light desk** in the top bar opens the controls as a drawer while you're on the decks.
- Settings persist in the browser. Code: `src/club/` (scene in `Club.ts`, instanced crowd in `people.ts`, LED wall in `screen.ts`, controls in `panel.ts`, the React wrapper in `ClubView.tsx`). The page is the game itself (`<App venue="club" />`), so lessons, rep and keys work the same; **The club** / **Bedroom** in the top bar switch venues.

## Phase 1 — playable decks

- **USB = your folders.** Each deck has a USB slot. "Choose music folder" grants read-only access to a folder of MP3s; add as many folders per USB as you like. Chrome and Edge remember the folders between visits (one click to re-allow); other browsers fall back to picking the folder each visit. Music never leaves your computer.
- **Track analysis** in a background worker, cached in IndexedDB: BPM, beat grid and downbeat, musical key (Camelot), and a three-band waveform. Genre tags steer the tempo range (e.g. Drum & Bass → 155–185 BPM) to avoid half/double-time mistakes, and the deck's **Grid** menu has ×2 / ÷2 and ±5 ms grid fixes.
- **Two CDJs:** play/pause, CDJ-style CUE (set when paused, return when playing, hold to preview), 8 hot cues, beat-quantized auto loops (½–16 beats) with halve/double/exit/reloop, beat jump, tempo fader with ±6/10/16 % ranges, jog wheel (nudge while playing, search while paused), sync, quantize, scrolling and overview waveforms, bar.beat counter, end-of-track warning.
- **Mixer:** trim, 3-band EQ (−26 dB kill to +6 dB), one-knob low/high-pass filter, channel faders, crossfader with smooth/sharp curves, pre-fader channel meters and master meters with clip hold, and **split cue** for headphones on a single output (cued channel left ear, master right ear).
- **Phase meter** between the waveforms shows where each deck sits in its bar and how many milliseconds apart the beats are.
- **Keyboard:** press `?` in the app for the full map.

## Your gear: CDJs, turntables or both

At the start you choose what's on the desk (change it any time with **Gear** in the top bar):

- **CDJs** — two media players and a club mixer (above).
- **Vinyl turntables** — two direct-drive turntables (modelled on the classic battle deck, fictional make) and a battle mixer.
- **Both** — two CDJs and two turntables on a wider desk. Each mixer channel gets a **CD / Phono** input switch, so you can mix a CDJ into a record or scratch over a track.

**Record crates.** "Choose a folder for a crate" turns a folder of MP3s into a crate of vinyl records: each track gets a sleeve (its cover art, or a generated design), a centre label, and its BPM and key marked on the corner once it's been pressed (analysed). Each folder is its own crate, shown on the floor of the bedroom — click one to open it. Flip through, sort by BPM, key, title, artist or genre, pull a record out and put it on turntable A or B (double-click puts it on a free one). The same record on both decks makes a double for beat juggling.

**Sort your music** (**Sort into USBs** in the USB browser, **Sort into crates** in the record crates). Every track from every folder you've plugged in is one collection; sort it into:

- **USB drives** for the CDJs — as many as you like (Warm-up, Peak time, Back-up…), each a stick of 8–128 GB with a fill gauge; copying stops when it's full. Each drive gets its own tab in the USB browser, next to USB A / B.
- **Labelled crates** for the turntables — labelled by **genre**, **artist**, **period** (decade, from the year tag) or your own **category** (Battle tools, Warm-up…). **Auto-sort** makes one crate per genre, artist or decade in one go; a crate labelled with a genre/artist/period offers to pull in every matching record. Labelled crates show as tabs in the crates panel and stand on the bedroom floor.

Tick tracks (filter by genre/artist/period, or "Not sorted yet") and add them, or drag them onto a drive or crate. A track can live in several places; deleting a drive or crate never touches your files. The sorting is saved in the browser and comes back when the folders are plugged in again. Code: `src/library/sorting.ts`, `src/state/collection.ts`, `src/ui/Organizer.tsx`.

**Turntables** — simulated in an AudioWorklet that reads the record sample by sample at whatever speed the platter physics gives it:

- Start/Stop with real spin-up and electronic brake (both adjustable), and a power switch for the slow power-down.
- 33 / 45 RPM and a pitch fader (±8 / ±16 %). No sync and no key lock: beatmatch by ear and hand.
- The record sits on a slipmat: hold it and it stops under your hand while the platter keeps turning; drag it round to scratch (forwards and backwards, locked to your hand); let go and it's pulled back up to speed. Fling it backwards for a back-spin.
- Drag the platter edge (or scroll) to nudge it slower or faster.
- Drag the tonearm onto the record to cue it by eye — the grooves are drawn from the track, with quiet passages and breaks as lighter bands — and let go to drop the needle. **Drop / Lift** is the cue lever. A soft needle-drop thump and a touch of surface noise.
- Strobe dots on the platter edge stand still at exactly 33⅓ or 45 with the pitch at 0.
- **Assist** shows BPM, time and waveforms; switch it off for the real by-ear experience.
- The mixer gains a crossfader **Rev** (hamster) switch; the turntable-only setup starts with a sharp cut-in curve.
- Keys at a turntable: hold `Z`/`M` = hand on the record, `X`/`,` = Start/Stop, `1`/`7` = needle drop/lift, `Q W`/`O P` = pitch, hold `A S`/`K L` = drag/push the platter, `E`/`I` = 33/45.

## Lessons and career progression

- **Beginner mode.** First visit asks if you're new to DJing. Beginner mode runs guided lessons in a coach card that checks your work on the actual decks (no clicking "next") and offers the next lesson when you finish. Toggle it any time in **Lessons** (top bar).
- **Fundamentals (Bedroom DJ):** meet the decks, cue points, beats/bars/phrases, matching tempo by ear, beatmatching, EQ and the bass swap, your first full mix. Sync is off-limits in these.
- **Rep and promotions.** Lessons award rep; so do clean practice mixes anywhere (blend in phase ≥ 8 s, then finish on the new track: +20 by hand, +8 with Sync; drifting for 2 s is a trainwreck). Tiers: Bedroom DJ → House-party DJ (150) → Bar resident (400) → Club DJ (800) → Festival headliner (1500).
- **Unlockable lessons:** loops, filter transitions, harmonic mixing (house party); hot-cue tricks, double drops (bar); scratching 101, beat juggling (club); transformers and combos, main-stage run (festival).
- **Vinyl mode** (per deck): hold the jog wheel to grab the record and scratch backwards and forwards.
- Progress is saved in the browser (localStorage).

The lesson ladder is a single rep track for now; it will hang off the two career paths ([docs/CAREER-PATHS.md](docs/CAREER-PATHS.md)) once those are built.

Not yet built (see the build plan): key lock / master tempo, scoring, the two career paths, the battle championships and scratch scoring, venues and crowds, the SoundCloud-style platform.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # analysis, ID3, mixer and grid unit tests
npm run build      # type-check + production build into dist/
```

Requires Node 18+. Use Chrome or Edge on desktop for the full folder-access experience.

## Deploy

**Live at https://crossfaderhero.com.** The `crossfaderhero` Cloudflare Worker is connected to this repo with Workers Builds: every push to `main` runs `npm run build` then `npx wrangler deploy` (static assets from `dist/`, see `wrangler.jsonc`). Pull-request branches get preview builds.

## Analytics

GA4 (`G-R8RG80E41X`) loads through **Google tag gateway**: `worker/index.js` proxies `/k7q2m/*` on crossfaderhero.com to Google, so the tag and its hits are first-party. Health checks: `/k7q2m/healthy` and `/k7q2m/?validate_geo=healthy` return `ok`. The tag only loads on crossfaderhero.com (not dev or preview builds); add `?ga_debug` to see events in GA4 DebugView.

Gameplay events (track loads/plays/finishes, mixes, lessons, promotions, feature use, a per-session summary) are wired in `src/analytics/` — the full list is at the top of `src/analytics/events.ts`. No track titles, artists or file names are ever sent.

## Brand and design system

Every colour, typeface and measurement comes from `src/design/tokens.css`; `npm test` fails if anything else hard-codes one. The guide is `docs/STYLEGUIDE.md` and live at https://crossfaderhero.com/brand. After changing tokens, regenerate the favicon, icons, DJ avatar (`public/avatar.svg`) and social images with `npm run build && npm run brand` (needs `npx playwright install chromium` once).

## Layout

```
src/
  audio/      engine (AudioContext), Deck (CDJ transport), Turntable + its AudioWorklet and platter physics, Mixer (channels, CD/Phono inputs, EQ, filter, crossfader, room speakers), grid maths
  room/       the 3D bedroom (three.js): scene, gear models (CDJs, mixer, turntables, crates), procedural textures, first-person view
  career/     lessons, tiers and rep, the live coach that checks lesson steps and scores practice mixes
  library/    USB and crate folder access + scanning, ID3 tags, BPM/beat-grid/key/waveform analysis, worker, record sleeves/labels/grooves
  state/      zustand stores for the library, gear setup and toasts
  ui/         deck, mixer, browser, waveforms, knobs and faders
test/         vitest unit tests with synthetic audio
```
