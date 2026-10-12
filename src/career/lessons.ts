import { camelotCompatible, inPhase, type Counters, type Snap } from './rules';

export interface Step {
  title: string;
  text: string;
  tip?: string;
  /** Condition to finish the step. Counters count from the start of the step. */
  done: (s: Snap, c: Counters) => boolean;
  /** Seconds the condition must hold without a break. */
  hold?: number;
  /** If true, the step's counters restart and the player sees `restartMessage`. */
  restartOn?: (s: Snap, c: Counters) => boolean;
  restartMessage?: string;
}

export interface Lesson {
  id: string;
  tier: number;
  title: string;
  summary: string;
  rep: number;
  steps: Step[];
}

const noSync = {
  restartOn: (_s: Snap, c: Counters) => c.syncs > 0,
  restartMessage: 'No Sync in this lesson — match it by ear and eye.',
};

const either = (s: Snap, f: (d: Snap['A'], id: 'A' | 'B') => boolean) => f(s.A, 'A') || f(s.B, 'B');

export const LESSONS: Lesson[] = [
  // ---------- Bedroom: the fundamentals ----------
  {
    id: 'gear',
    tier: 0,
    title: 'Meet the decks',
    summary: 'Load a track, play it and get it out of the speakers.',
    rep: 20,
    steps: [
      {
        title: 'Load a track on deck A',
        text: 'Open the USB browser in the top bar, choose a folder of MP3s and press Load A on any track.',
        tip: 'Pick something with a steady kick drum — house or techno is easiest to learn on.',
        done: (s) => s.A.loaded,
      },
      {
        title: 'Press Play',
        text: 'Hit Play on deck A (or press X).',
        done: (s) => s.A.playing,
      },
      {
        title: 'Put it on air',
        text: "Raise channel A's fader and keep the crossfader on the left or in the middle, so deck A comes out of the speakers.",
        tip: 'The channel meter shows the signal even when the fader is down. The master meters only move when it is on air.',
        done: (s) => s.A.playing && s.mix.onAir.A && s.mix.fader.A > 0.6,
      },
      {
        title: 'Read the waveform',
        text: 'The scrolling waveform shows bass in blue, mids in orange and highs in white. The bar.beat counter tells you where you are. Let it play for a few bars.',
        done: (s) => s.A.playing,
        hold: 6,
      },
    ],
  },
  {
    id: 'cue',
    tier: 0,
    title: 'Cue points',
    summary: 'Set a starting point and launch a track exactly on the beat.',
    rep: 20,
    steps: [
      {
        title: 'Pause deck A',
        text: 'Press Play again (or X) to pause.',
        done: (s) => s.A.loaded && !s.A.playing,
      },
      {
        title: 'Set a cue',
        text: 'Turn the jog wheel to find a kick at the start of a phrase, then press Cue while paused to mark it.',
        tip: 'With Quantize on, the cue snaps to the nearest beat.',
        done: (_s, c) => c.cueSets > 0,
      },
      {
        title: 'Preview from the cue',
        text: 'Press and hold Cue (or Z): the track plays while you hold and jumps back when you let go.',
        done: (_s, c) => c.cuePreviews > 0,
      },
      {
        title: 'Launch and return',
        text: 'Press Play to start from the cue, then press Cue while it plays to snap back to your mark.',
        done: (_s, c) => c.cueReturns > 0,
      },
    ],
  },
  {
    id: 'counting',
    tier: 0,
    title: 'Beats, bars and phrases',
    summary: 'Count like a DJ: 4 beats to a bar, 8 or 16 bars to a phrase.',
    rep: 25,
    steps: [
      {
        title: 'Count along',
        text: 'Play deck A and watch the four lights next to the phase meter. Count 1-2-3-4 with them — that is one bar. Tracks change every 8, 16 or 32 bars.',
        done: (s) => s.A.playing,
        hold: 10,
      },
      {
        title: 'Mark a downbeat',
        text: 'Set hot cue A on a "1" — the first beat of a bar (bar.beat reads x.1). Delete it with Shift-click and try again if it lands elsewhere.',
        tip: 'Phrases start on a 1, so that is where mixes start too.',
        done: (s) => s.A.hotCueBeat[0] === 0,
      },
      {
        title: 'Jump in phrases',
        text: 'Use the ◂◂ and ▸▸ beat-jump buttons twice. Jumps keep you on the beat, so the count never breaks.',
        done: (_s, c) => c.beatJumps >= 2,
      },
    ],
  },
  {
    id: 'tempo',
    tier: 0,
    title: 'Matching tempo',
    summary: 'Set the second track to the same speed by hand.',
    rep: 25,
    steps: [
      {
        title: 'Load a second track on deck B',
        text: 'Keep deck A playing and load another track on deck B.',
        done: (s) => s.A.loaded && s.B.loaded,
      },
      {
        title: 'Cue B in your headphones',
        text: "Press CUE on channel B and turn on Split cue: B plays in your left ear, the master in your right. Keep B's fader down so the room can't hear it yet.",
        done: (s) => s.mix.cue.B,
      },
      {
        title: 'Match the BPM',
        text: "Play deck B and move its tempo fader (or O / P) until both BPM readouts match to within 0.05.",
        tip: "If B's BPM is miles off, it may be at double or half time — check the Grid menu.",
        done: (s) => s.A.playing && s.B.playing && s.tempoDiff < 0.05,
        hold: 2,
        ...noSync,
      },
    ],
  },
  {
    id: 'beatmatch',
    tier: 0,
    title: 'Beatmatching',
    summary: 'Line up the kicks and keep them locked.',
    rep: 30,
    steps: [
      {
        title: 'Same speed',
        text: 'Play both decks at the same BPM using the tempo faders.',
        done: (s) => s.A.playing && s.B.playing && s.tempoDiff < 0.05,
        ...noSync,
      },
      {
        title: 'Line up the kicks',
        text: "Drag deck B's jog wheel (or hold K / L) to push it ahead or pull it back until the phase meter turns green.",
        tip: 'Listen for a "galloping" double kick — that means the beats are apart.',
        done: (s) => inPhase(s, 10),
        hold: 3,
        ...noSync,
      },
      {
        title: 'Keep it locked',
        text: 'Hold the beats together for 16 seconds. If they drift, nudge the jog and make a tiny tempo correction.',
        done: (s) => inPhase(s, 20),
        hold: 16,
        ...noSync,
      },
    ],
  },
  {
    id: 'blend',
    tier: 0,
    title: 'EQ and the blend',
    summary: 'Bring a track in without two basslines fighting.',
    rep: 30,
    steps: [
      {
        title: "Kill B's bass",
        text: "With both decks beatmatched, turn channel B's LOW knob all the way down.",
        done: (s) => s.mix.low.B < -0.8 && inPhase(s, 20),
      },
      {
        title: 'Bring B in',
        text: "Raise B's fader and centre the crossfader so both tracks are on air — B's highs and mids join A's groove.",
        done: (s) => s.mix.onAir.A && s.mix.onAir.B && s.mix.low.B < -0.8 && inPhase(s, 20),
        hold: 2,
      },
      {
        title: 'Swap the bass',
        text: "On the start of a phrase, turn A's LOW down and B's LOW back up — one bassline hands over to the other.",
        done: (s) => s.mix.onAir.A && s.mix.onAir.B && s.mix.low.A < -0.7 && s.mix.low.B > -0.2 && inPhase(s, 20),
      },
      {
        title: 'Fade A out',
        text: "Pull A's fader down or move the crossfader to B. B now carries the room.",
        done: (s) => !s.mix.onAir.A && s.mix.onAir.B && s.B.playing,
      },
    ],
  },
  {
    id: 'firstmix',
    tier: 0,
    title: 'Your first full mix',
    summary: 'Put it all together — no Sync.',
    rep: 40,
    steps: [
      {
        title: 'Mix from one track into the next',
        text: 'Beatmatch by hand, blend both tracks on air for at least 8 seconds and finish with only the new track playing.',
        tip: 'Keep the beats green during the blend — if they drift for 2 seconds it counts as a trainwreck.',
        done: (_s, c) => c.manualMixes > 0,
      },
    ],
  },

  // ---------- House parties ----------
  {
    id: 'loops',
    tier: 1,
    title: 'Loops to buy time',
    summary: 'Extend an intro, build tension and land back on the 1.',
    rep: 60,
    steps: [
      {
        title: 'Set a 4-beat loop',
        text: 'While a deck plays, press the 4 loop button (E or I).',
        done: (s, c) => c.loopsSet > 0 && either(s, (d) => d.loopActive && d.playing),
      },
      {
        title: 'Halve it twice',
        text: 'Press ½× twice: 4 beats → 2 → 1. Shorter loops build tension.',
        done: (_s, c) => c.loopHalves >= 2,
      },
      {
        title: 'Exit on the 1',
        text: 'Double back up with 2×, then press Exit just before the downbeat so the track carries on.',
        done: (_s, c) => c.loopDoubles >= 1 && c.loopExits >= 1,
      },
    ],
  },
  {
    id: 'filter',
    tier: 1,
    title: 'Filter transitions',
    summary: 'Use the filter to make room for the next track.',
    rep: 60,
    steps: [
      {
        title: 'Low-pass sweep',
        text: 'With a deck on air, turn its FILTER knob left past halfway — the highs melt away.',
        done: (s) => either(s, (d, id) => s.mix.onAir[id] && d.playing && s.mix.filter[id] < -0.5),
      },
      {
        title: 'High-pass sweep',
        text: 'Now turn it right past halfway — the bass drops out.',
        done: (s) => either(s, (d, id) => s.mix.onAir[id] && d.playing && s.mix.filter[id] > 0.5),
      },
      {
        title: 'Filter handover',
        text: 'Beatmatch both decks on air. High-pass the outgoing track while the incoming one plays clean.',
        done: (s) =>
          s.mix.onAir.A &&
          s.mix.onAir.B &&
          inPhase(s, 20) &&
          ((s.mix.filter.A > 0.4 && Math.abs(s.mix.filter.B) < 0.1) || (s.mix.filter.B > 0.4 && Math.abs(s.mix.filter.A) < 0.1)),
        hold: 2,
      },
    ],
  },
  {
    id: 'harmonic',
    tier: 1,
    title: 'Harmonic mixing',
    summary: 'Mix tracks in compatible keys so melodies sit together.',
    rep: 70,
    steps: [
      {
        title: 'Pick compatible keys',
        text: 'The key readout uses the Camelot wheel. Compatible: the same code, one number up or down (8A → 7A or 9A), or switching letter (8A ↔ 8B). Load two compatible tracks.',
        done: (s) => s.A.loaded && s.B.loaded && camelotCompatible(s.A.camelot, s.B.camelot),
      },
      {
        title: 'Blend them',
        text: 'Beatmatch and keep both on air for 8 seconds. Hear how the melodies agree?',
        done: (s) => s.mix.onAir.A && s.mix.onAir.B && inPhase(s, 20) && camelotCompatible(s.A.camelot, s.B.camelot),
        hold: 8,
      },
    ],
  },

  // ---------- Bar residency ----------
  {
    id: 'hotcues',
    tier: 2,
    title: 'Hot-cue tricks',
    summary: 'Map out a track and play it like an instrument.',
    rep: 90,
    steps: [
      {
        title: 'Map four hot cues',
        text: 'Set at least four hot cues on one deck: the intro, a breakdown, the drop and a vocal.',
        done: (s) => either(s, (d) => d.hotCuesSet >= 4),
      },
      {
        title: 'Drum the cues',
        text: 'With the deck playing, trigger hot cues 8 times in rhythm. Quantize keeps every jump on the beat.',
        done: (_s, c) => c.hotCueJumps.A + c.hotCueJumps.B >= 8,
      },
    ],
  },
  {
    id: 'doubledrop',
    tier: 2,
    title: 'Double drop',
    summary: 'Land two drops at exactly the same moment.',
    rep: 110,
    steps: [
      {
        title: 'Cue both drops',
        text: 'Set a hot cue at the drop of each track — one on deck A and one on deck B.',
        done: (s) => s.A.hotCuesSet > 0 && s.B.hotCuesSet > 0,
      },
      {
        title: 'Line up the bars',
        text: 'Beatmatch so both decks hit beat 1 together — the bar lights either side of the phase meter should match.',
        done: (s) => inPhase(s, 15) && s.A.beatInBar === s.B.beatInBar,
        hold: 4,
      },
      {
        title: 'Drop them together',
        text: 'Both decks on air with their bass up for 8 seconds. Pull the mids and highs back a touch so it stays clean.',
        done: (s) =>
          s.mix.onAir.A && s.mix.onAir.B && s.mix.low.A > -0.2 && s.mix.low.B > -0.2 && inPhase(s, 20) && s.A.beatInBar === s.B.beatInBar,
        hold: 8,
      },
    ],
  },

  // ---------- Club ----------
  {
    id: 'scratch',
    tier: 3,
    title: 'Scratching 101',
    summary: 'Baby scratches and chirps with vinyl mode.',
    rep: 140,
    steps: [
      {
        title: 'Switch to vinyl mode',
        text: 'Press Vinyl on a deck. Now holding the jog wheel grabs the record.',
        done: (s) => either(s, (d) => d.vinyl && d.loaded),
      },
      {
        title: 'Baby scratch',
        text: 'Find a short sound — a vocal stab or a snare. Hold the platter and push it forward and back in time with the beat. 12 back-and-forths.',
        tip: 'Small, even movements. Keep the other deck playing a beat underneath if you like.',
        done: (_s, c) => c.scratchFlips >= 12,
      },
      {
        title: 'Sharp crossfader',
        text: 'Switch the crossfader curve to Sharp — scratch DJs need it to cut in instantly.',
        done: (s) => s.mix.curve === 'sharp',
      },
      {
        title: 'Chirps',
        text: 'Scratch the record and snap the crossfader open and closed as it moves. 8 cuts while scratching.',
        done: (_s, c) => c.scratchCuts >= 8,
      },
    ],
  },
  {
    id: 'juggle',
    tier: 3,
    title: 'Beat juggling',
    summary: 'Rebuild a beat live from two copies of the same track.',
    rep: 160,
    steps: [
      {
        title: 'Same track on both decks',
        text: 'Load the same track on deck A and deck B.',
        done: (s) => !!s.A.trackKey && s.A.trackKey === s.B.trackKey,
      },
      {
        title: 'Mark the same beat',
        text: 'Set hot cue A on the same downbeat on both decks.',
        done: (s) => s.A.hotCueBeat[0] === 0 && s.B.hotCueBeat[0] === 0,
      },
      {
        title: 'Sharp crossfader',
        text: 'Set the crossfader curve to Sharp.',
        done: (s) => s.mix.curve === 'sharp',
      },
      {
        title: 'Juggle',
        text: 'Play one deck, cut across to the other and restart the silent one from hot cue A while the other plays. Do it on each side — 3 restarts per deck and 8 crossfader cuts.',
        tip: 'Classic pattern: let deck A play 2 beats, cut to B, restart A from its cue, cut back. Repeat.',
        done: (_s, c) => c.hotCueJumps.A >= 3 && c.hotCueJumps.B >= 3 && c.xfCuts >= 8,
      },
    ],
  },

  // ---------- Festival ----------
  {
    id: 'transformer',
    tier: 4,
    title: 'Transformers and combos',
    summary: 'Fast crossfader work over a moving record.',
    rep: 200,
    steps: [
      {
        title: 'Set up',
        text: 'Vinyl mode on and a sharp crossfader curve.',
        done: (s) => s.mix.curve === 'sharp' && either(s, (d) => d.vinyl && d.loaded),
      },
      {
        title: 'Transformer',
        text: 'Drag the record slowly while tapping the crossfader open and shut rapidly. 16 cuts while scratching.',
        done: (_s, c) => c.scratchCuts >= 16,
      },
      {
        title: 'Combo',
        text: 'Mix it up: baby scratches, chirps and transformers. 24 back-and-forths and 24 cuts in one go.',
        done: (_s, c) => c.scratchFlips >= 24 && c.scratchCuts >= 24,
      },
    ],
  },
  {
    id: 'mainstage',
    tier: 4,
    title: 'Main-stage run',
    summary: 'Three clean hand-matched mixes back to back.',
    rep: 250,
    steps: [
      {
        title: 'Three clean mixes',
        text: 'Mix three tracks in a row without Sync and without a trainwreck.',
        done: (_s, c) => c.manualMixes >= 3,
        restartOn: (_s, c) => c.syncs > 0 || c.trainwrecks > 0,
        restartMessage: 'Run reset — no Sync and no trainwrecks on the main stage.',
      },
    ],
  },
];

export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);

export const isUnlocked = (lesson: Lesson, tier: number) => lesson.tier <= tier;

/** The next lesson to do: first unfinished one you have unlocked. */
export function nextLesson(completed: string[], tier: number): Lesson | null {
  return LESSONS.find((l) => isUnlocked(l, tier) && !completed.includes(l.id)) ?? null;
}
