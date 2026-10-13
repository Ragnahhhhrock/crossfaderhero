# Turntables and the record crate (later build)

The Battle DJ path is vinyl only. Scratching, beat juggling and battle routines need a real platter and a record under your hand, so this path uses two direct-drive turntables (modelled on the Technics SL-1200) and a battle mixer instead of the CDJs.

## From MP3 folder to record crate

1. The player adds a music folder of MP3s (same folder access as the CDJ USBs; music never leaves their computer).
2. Each track is "pressed" to a virtual vinyl record: a sleeve with the cover art from the ID3 tags (or a generated plain/white-label sleeve), artist and title on the centre label, and the BPM and key written on the sleeve like a DJ's marker notes.
3. The records sit in a **crate** next to the decks in the 3D bedroom (and later in a record bag at gigs and contests).

## Using the crate

- **Flip through the crate** to browse: records tilt forward one at a time, showing the sleeve. Filter or sort by BPM, key, genre or folder.
- **Pull a record**, slide it out of the sleeve and **place it on a turntable**. The record isn't playable until it's on a platter.
- **Swap records** mid-set: lift the needle, take the record off, put it back in its sleeve (or leave it lying on the desk).
- **Doubles:** battle routines often need two copies of the same record. The player can make a second copy of any record for beat juggling.
- **Battle records:** special records with breaks, scratch sounds and samples, earned as rewards or given by contest organisers ("use the organisers' battle record" rounds).

## Turntable functionality

Everything a real direct-drive deck does, played with the mouse, trackpad or (later) a MIDI/DVS controller:

- **Start/Stop** button with real spin-up and brake times (adjustable, like the deck's brake knob), **33/45 RPM** buttons.
- **Platter and record physics:** hand on the record stops it while the slipmat lets the platter keep spinning underneath; let go and it catches up. Forward/back movement plays the audio at that speed and direction (pitch follows speed, as on vinyl).
- **Needle drop:** lift the tonearm and drop it anywhere on the record. The grooves are visible, with breaks and quiet passages showing as lighter bands so you can find them by eye. Stickers on the label mark cue points, the vinyl way.
- **Pitch fader** (±8 %, ±16 % range) with no sync and no key lock. Beatmatching is by ear and by hand: nudge the platter edge, ride the pitch, slow the record with a finger on the edge.
- **Back-spins** and **power-off slowdowns**.
- **Needle skip:** scratching too hard or knocking the deck can make the needle jump grooves (a contest penalty).
- **No waveforms, BPM readouts or hot cues on the deck itself** for the authentic feel. Assist overlays can be switched on in training mode.

## Battle mixer

- Two channels, a light, short-throw **cut-in crossfader** with adjustable curve and **reverse (hamster) switch**.
- Upfaders, 3-band EQ, filter, headphone cue.
- Clean, fast cut-in response so chirps, transformers, flares and crabs sound right.

## Scratching and juggling detection

Needed for the scoring engine and training mode (see [COMPETITIONS.md](COMPETITIONS.md)):

- Record hand movement + crossfader clicks are recorded per frame and matched against scratch patterns (baby, chirp, transformer, flare, crab) for timing on the beat and cleanness.
- Juggles are scored by whether the doubles stay locked to the beat and in phase.

## Build notes

- Replaces the Phase 1 "vinyl mode" jog-wheel scratch with a proper turntable model: platter, slipmat slip, tonearm/needle, motor torque.
- Audio: reuse the Deck audio path but drive playback rate (including reverse) from the record's angular velocity every frame; a reverse-buffer or AudioWorklet is needed for smooth backwards playback.
- Suggested order: crate + record pressing → turntable model and physics → needle drop and groove view → battle mixer → scratch training mode → detection for scoring.
- The in-game decks should use a fictional brand name and design inspired by the SL-1200, not the real name or logo, to avoid trademark issues.
