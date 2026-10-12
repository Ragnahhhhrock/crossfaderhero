# DJ Mixing Championships

The competition circuit is the spine of career mode. Gigs build skill, money and reputation; contests are how you climb. **The end goal of the game is to win the World Final and be crowned the best DJ in the world.**

## The ladder

| Tier | Event | Field | Advance by |
|---|---|---|---|
| 1 | **Local heat** (a club night in your city) | 8–12 DJs | Win the night |
| 2 | **Regional final** | Local heat winners in the region | Top 2 |
| 3 | **National final** | Regional qualifiers | Win = national champion |
| 4 | **International rounds** (continental qualifiers) | National champions | Top 4 |
| 5 | **World Final** | 8 finalists | Win = World Champion — game's win state |

- Each season runs the full ladder once. Losing knocks you out until next season's local heats, so the career keeps going between attempts.
- Entering the first local heat needs a minimum reputation from gigs, so the bedroom and early gigs come first.
- Each tier is a bigger venue, bigger crowd and louder pressure than the last: back room → club → arena stage → world-final stage.

## Rounds and format

- **Set length** grows with the tier: ~6 min (heats) → 10 → 15 → 20 min (World Final).
- **Rules per round** keep it fresh, e.g. "own music only", "set BPM window", "must include a set track the organisers hand you", "genre switch mid-set", "two decks, no sync".
- Later tiers run **multiple rounds per event** (heat → semi → final), each with its own rule.
- Players use their own MP3 folders, as everywhere else in the game.

## Judging

A panel of 3 judges scores each set; each judge weights the criteria a little differently (one is a technical purist, one is all about the crowd, etc.).

| Criterion | Measured from |
|---|---|
| Beatmatching | Phase drift between decks during overlaps (phase meter data) |
| Transitions & phrasing | Mixes landing on phrase boundaries, EQ/filter handling, no clashing basslines |
| Track selection & flow | Key compatibility (Camelot), energy curve, BPM changes |
| Technique | Loops, hot cues, effects, cutting — used well, not spammed |
| Crowd response | Live crowd energy over the set |
| Penalties | Dead air, trainwrecks, clipping into the red, breaking round rules |

Scores are shown at the end with judge comments so the player knows what to work on.

## Rivals

- A recurring cast of rival DJs with names, styles and skill ratings who show up through the tiers.
- AI rivals' sets are simulated scores (not audio), shaped by their style and a bit of randomness.
- A nemesis rival who beat you once reappears higher up the ladder.

## Rewards

- **Prize money, reputation and followers** (feeds the SoundCloud-style platform and manager offers).
- **Booking boost**: a title unlocks bigger venues and fees (e.g. "National Champion" on your flyers).
- **Gear and trophies** that appear in the bedroom / studio.
- **World Champion** ends the main story with a finale; the career stays open for defending the title.

## Build notes

- Depends on: scoring engine (phase drift, phrase/key analysis already available from Phase 1 analysis), crowd simulation, career state.
- Suggested order: scoring engine → single local heat → full ladder and seasons → rivals → judging flavour and finale.
