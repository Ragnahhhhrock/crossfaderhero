/**
 * The player's DJ: who they are and what they wear. Pure data, no DOM, so the
 * builder, the club and the tests can all share it.
 */

export type Gender = 'male' | 'female' | 'nonbinary';
export type Body = 'slim' | 'average' | 'athletic' | 'heavy';
export type HairStyle = 'short' | 'long' | 'afro' | 'bun' | 'ponytail' | 'mohawk' | 'buzz' | 'bald';
export type FacialHair = 'none' | 'stubble' | 'moustache' | 'goatee' | 'beard';
export type Earrings = 'none' | 'left' | 'right' | 'both';
export type EarringStyle = 'stud' | 'hoop';
export type Metal = 'silver' | 'gold';
export type Tattoo = 'none' | 'half' | 'sleeve';
export type TopStyle = 'tee' | 'tank' | 'longsleeve' | 'hoodie';
export type PantsStyle = 'slim' | 'baggy' | 'shorts';
export type ShoeStyle = 'sneakers' | 'boots';
export type HatStyle = 'none' | 'cap' | 'beanie' | 'bucket';

export interface Character {
  djName: string;
  gender: Gender;
  /** Centimetres. */
  height: number;
  body: Body;
  skin: string;
  hairStyle: HairStyle;
  hairColour: string;
  facialHair: FacialHair;
  earrings: Earrings;
  earringStyle: EarringStyle;
  metal: Metal;
  piercings: { nose: boolean; eyebrow: boolean; lip: boolean };
  tattoos: { left: Tattoo; right: Tattoo };
  ink: string;
  top: TopStyle;
  topColour: string;
  pants: PantsStyle;
  pantsColour: string;
  shoes: ShoeStyle;
  shoesColour: string;
  hat: HatStyle;
  hatColour: string;
  shades: boolean;
}

export const HEIGHT = { min: 150, max: 205 };
export const NAME_MAX = 24;

/** A design token and how it's named in the builder. */
export interface Swatch {
  token: string;
  label: string;
}

export const SKIN_TONES: Swatch[] = [
  { token: 'club-skin-6', label: 'Very fair' },
  { token: 'club-skin-1', label: 'Fair' },
  { token: 'club-skin-7', label: 'Light' },
  { token: 'club-skin-2', label: 'Light medium' },
  { token: 'club-skin-8', label: 'Medium' },
  { token: 'club-skin-3', label: 'Tan' },
  { token: 'club-skin-9', label: 'Brown' },
  { token: 'club-skin-4', label: 'Dark brown' },
  { token: 'club-skin-5', label: 'Deep' },
  { token: 'club-skin-10', label: 'Very deep' },
];

export const HAIR_COLOURS: Swatch[] = [
  { token: 'club-hair-1', label: 'Black' },
  { token: 'club-hair-2', label: 'Brown' },
  { token: 'club-hair-12', label: 'Light brown' },
  { token: 'club-hair-3', label: 'Blonde' },
  { token: 'club-hair-6', label: 'Platinum' },
  { token: 'club-hair-11', label: 'Ginger' },
  { token: 'club-hair-5', label: 'Auburn' },
  { token: 'club-hair-4', label: 'Grey' },
  { token: 'club-hair-13', label: 'White' },
  { token: 'club-hair-7', label: 'Pink' },
  { token: 'print-red', label: 'Red' },
  { token: 'club-hair-8', label: 'Blue' },
  { token: 'club-hair-9', label: 'Green' },
  { token: 'club-hair-10', label: 'Purple' },
];

export const INK_COLOURS: Swatch[] = [
  { token: 'club-ink', label: 'Black' },
  { token: 'club-ink-red', label: 'Red' },
  { token: 'club-ink-blue', label: 'Blue' },
  { token: 'club-ink-green', label: 'Green' },
];

export const CLOTH_COLOURS: Swatch[] = [
  { token: 'print-ink', label: 'Black' },
  { token: 'graphite-600', label: 'Charcoal' },
  { token: 'graphite-400', label: 'Grey' },
  { token: 'sleeve-white', label: 'White' },
  { token: 'print-paper', label: 'Cream' },
  { token: 'club-denim', label: 'Denim' },
  { token: 'club-khaki', label: 'Khaki' },
  { token: 'club-camel', label: 'Camel' },
  { token: 'club-olive', label: 'Olive' },
  { token: 'club-burgundy', label: 'Burgundy' },
  { token: 'print-red', label: 'Red' },
  { token: 'hot-pink', label: 'Pink' },
  { token: 'print-sun', label: 'Yellow' },
  { token: 'deck-b', label: 'Orange' },
  { token: 'play', label: 'Green' },
  { token: 'hot-teal', label: 'Teal' },
  { token: 'deck-a', label: 'Sky blue' },
  { token: 'print-violet', label: 'Violet' },
  { token: 'print-plum', label: 'Plum' },
  { token: 'print-gold', label: 'Gold' },
];

export const GENDERS: { id: Gender; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'nonbinary', label: 'Non-binary' },
];
export const BODIES: { id: Body; label: string }[] = [
  { id: 'slim', label: 'Slim' },
  { id: 'average', label: 'Average' },
  { id: 'athletic', label: 'Athletic' },
  { id: 'heavy', label: 'Heavy' },
];
export const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'short', label: 'Short' },
  { id: 'long', label: 'Long' },
  { id: 'ponytail', label: 'Ponytail' },
  { id: 'bun', label: 'Bun' },
  { id: 'afro', label: 'Afro' },
  { id: 'mohawk', label: 'Mohawk' },
  { id: 'buzz', label: 'Buzz cut' },
  { id: 'bald', label: 'Bald' },
];
export const FACIAL_HAIR: { id: FacialHair; label: string }[] = [
  { id: 'none', label: 'Clean shaven' },
  { id: 'stubble', label: 'Stubble' },
  { id: 'moustache', label: 'Moustache' },
  { id: 'goatee', label: 'Goatee' },
  { id: 'beard', label: 'Full beard' },
];
export const EARRINGS: { id: Earrings; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'left', label: 'Left ear' },
  { id: 'right', label: 'Right ear' },
  { id: 'both', label: 'Both ears' },
];
export const EARRING_STYLES: { id: EarringStyle; label: string }[] = [
  { id: 'stud', label: 'Studs' },
  { id: 'hoop', label: 'Hoops' },
];
export const METALS: { id: Metal; label: string }[] = [
  { id: 'silver', label: 'Silver' },
  { id: 'gold', label: 'Gold' },
];
export const TATTOOS: { id: Tattoo; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'half', label: 'Half sleeve' },
  { id: 'sleeve', label: 'Full sleeve' },
];
export const TOPS: { id: TopStyle; label: string }[] = [
  { id: 'tee', label: 'T-shirt' },
  { id: 'tank', label: 'Tank top' },
  { id: 'longsleeve', label: 'Long sleeve' },
  { id: 'hoodie', label: 'Hoodie' },
];
export const PANTS: { id: PantsStyle; label: string }[] = [
  { id: 'slim', label: 'Slim fit' },
  { id: 'baggy', label: 'Baggy' },
  { id: 'shorts', label: 'Shorts' },
];
export const SHOES: { id: ShoeStyle; label: string }[] = [
  { id: 'sneakers', label: 'Sneakers' },
  { id: 'boots', label: 'Boots' },
];
export const HATS: { id: HatStyle; label: string }[] = [
  { id: 'none', label: 'No hat' },
  { id: 'cap', label: 'Cap' },
  { id: 'beanie', label: 'Beanie' },
  { id: 'bucket', label: 'Bucket hat' },
];

const NAME_A = ['Midnight', 'Neon', 'Bass', 'Vinyl', 'Static', 'Velvet', 'Solar', 'Lunar', 'Electric', 'Disco', 'Funk', 'Crate', 'Echo', 'Sub', 'Groove', 'Cosmic'];
const NAME_B = ['Fox', 'Ghost', 'Kid', 'Theory', 'Rider', 'Prophet', 'Machine', 'Digger', 'Pulse', 'Wave', 'Hound', 'Selecta', 'Signal', 'Ritual', 'Saint', 'Junkie'];

/** A made-up DJ name, for the Suggest button. */
export function suggestName(rand: () => number = Math.random): string {
  const pick = <T,>(l: T[]) => l[Math.floor(rand() * l.length)];
  const n = `${pick(NAME_A)} ${pick(NAME_B)}`;
  return rand() < 0.25 ? `DJ ${n}` : n;
}

export function defaultCharacter(): Character {
  return {
    djName: '',
    gender: 'male',
    height: 176,
    body: 'average',
    skin: 'club-skin-7',
    hairStyle: 'short',
    hairColour: 'club-hair-2',
    facialHair: 'none',
    earrings: 'none',
    earringStyle: 'stud',
    metal: 'silver',
    piercings: { nose: false, eyebrow: false, lip: false },
    tattoos: { left: 'none', right: 'none' },
    ink: 'club-ink',
    top: 'tee',
    topColour: 'print-ink',
    pants: 'slim',
    pantsColour: 'club-denim',
    shoes: 'sneakers',
    shoesColour: 'sleeve-white',
    hat: 'none',
    hatColour: 'print-ink',
    shades: false,
  };
}

/** A random DJ: everything rolled except the name you've typed. */
export function randomCharacter(rand: () => number = Math.random, djName = ''): Character {
  const pick = <T,>(l: T[]) => l[Math.floor(rand() * l.length)];
  const id = <T,>(l: { id: T }[]) => pick(l).id;
  const tok = (l: Swatch[]) => pick(l).token;
  const gender = id(GENDERS);
  const male = gender === 'male';
  const female = gender === 'female';
  const mean = male ? 178 : female ? 165 : 171;
  const height = Math.round(Math.min(HEIGHT.max, Math.max(HEIGHT.min, mean + (rand() + rand() + rand() - 1.5) * 14)));
  const hairStyle: HairStyle = female
    ? pick<HairStyle>(['long', 'long', 'ponytail', 'bun', 'short', 'afro', 'buzz', 'mohawk'])
    : male
      ? pick<HairStyle>(['short', 'short', 'buzz', 'long', 'afro', 'mohawk', 'bald', 'ponytail', 'bun'])
      : id(HAIR_STYLES);
  const dyed = rand() < 0.2;
  const natural = HAIR_COLOURS.slice(0, 9);
  return {
    djName,
    gender,
    height,
    body: id(BODIES),
    skin: tok(SKIN_TONES),
    hairStyle,
    hairColour: dyed ? tok(HAIR_COLOURS.slice(9)) : tok(natural),
    facialHair: male ? (rand() < 0.5 ? 'none' : id(FACIAL_HAIR)) : gender === 'nonbinary' && rand() < 0.2 ? 'stubble' : 'none',
    earrings: rand() < 0.45 ? 'none' : id(EARRINGS),
    earringStyle: id(EARRING_STYLES),
    metal: id(METALS),
    piercings: { nose: rand() < 0.2, eyebrow: rand() < 0.1, lip: rand() < 0.1 },
    tattoos: { left: rand() < 0.6 ? 'none' : id(TATTOOS), right: rand() < 0.6 ? 'none' : id(TATTOOS) },
    ink: tok(INK_COLOURS),
    top: id(TOPS),
    topColour: tok(CLOTH_COLOURS),
    pants: id(PANTS),
    pantsColour: tok(CLOTH_COLOURS),
    shoes: id(SHOES),
    shoesColour: tok(CLOTH_COLOURS),
    hat: rand() < 0.55 ? 'none' : id(HATS),
    hatColour: tok(CLOTH_COLOURS),
    shades: rand() < 0.2,
  };
}

/** Fill in anything missing from an older save. */
export function normalise(c: Partial<Character> | null | undefined): Character | null {
  if (!c) return null;
  const d = defaultCharacter();
  return {
    ...d,
    ...c,
    piercings: { ...d.piercings, ...c.piercings },
    tattoos: { ...d.tattoos, ...c.tattoos },
    height: Math.min(HEIGHT.max, Math.max(HEIGHT.min, Math.round(c.height ?? d.height))),
    djName: (c.djName ?? '').slice(0, NAME_MAX),
  };
}
