import type { Look, Outfit } from '../club/people';
import type { Body, Character, Gender, Tattoo } from './options';

/** Shoulders, chest depth and limb thickness for each build. */
const BUILD: Record<Body, { w: number; d: number; bulk: number }> = {
  slim: { w: 0.88, d: 0.19, bulk: 0.86 },
  average: { w: 1, d: 0.22, bulk: 1 },
  athletic: { w: 1.1, d: 0.235, bulk: 1.14 },
  heavy: { w: 1.18, d: 0.3, bulk: 1.26 },
};

const SHOULDERS: Record<Gender, number> = { male: 0.42, female: 0.35, nonbinary: 0.385 };
const TORSO_H: Record<Gender, number> = { male: 0.62, female: 0.58, nonbinary: 0.6 };
const TAT: Record<Tattoo, number> = { none: 0, half: 0.4, sleeve: 1 };

/** Standing height of a figure at scale 1, in centimetres. */
export const FIGURE_CM = 172;

/** The player's DJ as a club figure: their look, their outfit and how tall they stand. */
export function characterLook(c: Character): { look: Look; outfit: Outfit; scale: number } {
  const b = BUILD[c.body];
  const ears = c.earrings;
  const look: Look = {
    skin: c.skin,
    hair: c.hairColour,
    cut: c.hairStyle,
    legH: 0.85,
    torsoW: SHOULDERS[c.gender] * b.w,
    torsoH: TORSO_H[c.gender],
    torsoD: b.d,
    headS: 1,
    armS: 1,
    eyeGap: 0.04,
    eyeS: 1,
    noseS: [1, 1],
    mouthW: 1,
    brows: true,
    browTilt: 0,
    facial: c.facialHair,
    glasses: false,
    studs: [ears === 'left' || ears === 'both', ears === 'right' || ears === 'both', c.piercings.nose, c.piercings.eyebrow, c.piercings.lip],
    metal: c.metal === 'gold' ? 'print-gold' : 'tt-chrome',
    tatL: TAT[c.tattoos.left],
    tatR: TAT[c.tattoos.right],
    ink: c.ink,
    vigour: 1,
    hoops: c.earringStyle === 'hoop',
    bulk: b.bulk,
  };
  const outfit: Outfit = {
    top: c.topColour,
    topW: c.top === 'hoodie' ? 1.12 : c.top === 'tank' ? 0.98 : 1.03,
    sleeves: c.top === 'tank' ? 'none' : c.top === 'tee' ? 'short' : 'long',
    legs: c.pantsColour,
    shorts: c.pants === 'shorts',
    baggy: c.pants === 'baggy',
    shoes: c.shoesColour,
    hat: c.hat,
    hatC: c.hatColour,
    shades: c.shades,
    hood: c.top === 'hoodie',
    boots: c.shoes === 'boots',
  };
  return { look, outfit, scale: c.height / FIGURE_CM };
}
