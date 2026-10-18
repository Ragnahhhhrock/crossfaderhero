/** Everything the club's control panel can change. The scene reads this each frame. */

export type LightMode = 'wash' | 'chase' | 'pulse' | 'movers';
export type Palette = 'club' | 'sunset' | 'ice' | 'jungle' | 'rainbow';
export type LaserColour = 'green' | 'red' | 'blue' | 'rgb';
export type LaserPattern = 'fan' | 'sweep' | 'tunnel';
export type ScreenMode = 'tunnel' | 'spectrum' | 'kaleido' | 'plasma' | 'grid' | 'logo' | 'name';
/** What the extra screens round the room show: their own visuals, or the main screen's. */
export type ExtraScreens = 'mix' | 'follow';
export type StrobeRate = 1 | 2 | 4;
export type CameraView = 'floor' | 'booth' | 'balcony' | 'side';

export interface ClubSettings {
  bpm: number;
  playing: boolean;
  crowd: number;
  lights: boolean;
  lightMode: LightMode;
  palette: Palette;
  intensity: number;
  scanners: boolean;
  scannerSpeed: number;
  strobes: boolean;
  strobeRate: StrobeRate;
  lasers: boolean;
  laserColour: LaserColour;
  laserPattern: LaserPattern;
  smoke: boolean;
  smokeDensity: number;
  screen: boolean;
  screenMode: ScreenMode;
  screenSpeed: number;
  /** The screens on the side walls and over the bar. */
  extraScreens: boolean;
  extraMode: ExtraScreens;
  dancers: boolean;
  floorLeds: boolean;
  houseLights: boolean;
  glow: boolean;
  autoOrbit: boolean;
}

export const CAPACITY = 50;

export const DEFAULTS: ClubSettings = {
  bpm: 128,
  playing: true,
  crowd: 36,
  lights: true,
  lightMode: 'movers',
  palette: 'club',
  intensity: 0.8,
  scanners: true,
  scannerSpeed: 0.6,
  strobes: false,
  strobeRate: 2,
  lasers: true,
  laserColour: 'green',
  laserPattern: 'fan',
  smoke: true,
  smokeDensity: 0.55,
  screen: true,
  screenMode: 'tunnel',
  screenSpeed: 0.6,
  extraScreens: true,
  extraMode: 'mix',
  dancers: true,
  floorLeds: true,
  houseLights: false,
  glow: true,
  autoOrbit: false,
};

/** Light palettes as token names; 'rainbow' cycles hues instead. */
export const PALETTES: Record<Exclude<Palette, 'rainbow'>, string[]> = {
  club: ['print-magenta', 'deck-a', 'print-violet'],
  sunset: ['deck-b', 'print-red', 'hot-pink'],
  ice: ['deck-a', 'club-laser-blue', 'ink-100'],
  jungle: ['play', 'hot-teal', 'hot-yellow'],
};

const KEY = 'cfh.club.v1';

export function loadSettings(): ClubSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ClubSettings>) };
  } catch {
    /* storage blocked: use defaults */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: ClubSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: settings just won't persist */
  }
}
