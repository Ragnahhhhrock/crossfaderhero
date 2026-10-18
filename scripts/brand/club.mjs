/**
 * The Club CFH logo as vector files, built from src/brand/cfh-logo.json (the same
 * tube geometry the 3D club and the LED wall draw) and the --cfh-* tokens.
 *
 *   public/club-cfh.svg         the sign lock-up on a dark board
 *   public/club-cfh-mark.svg    the ring mark on a tile, for avatars and icons
 *
 * `npm run brand` calls this; you can also run it alone: node scripts/brand/club.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const geometry = JSON.parse(readFileSync(join(root, 'src/brand/cfh-logo.json'), 'utf8'));

const ROLE = { pink: 'cfh-pink', cyan: 'cfh-cyan', core: 'cfh-core' };

/** One logo as an SVG: a blurred halo, the coloured glass and a hot white core per tube. */
function logo(t, which, { board, rx }) {
  const g = geometry[which];
  const [w, h] = g.viewBox;
  const blur = which === 'mark' ? 2.2 : 5;
  const halo = g.tubes.map((u) => `<path d="${u.d}" stroke="${t(ROLE[u.role])}" stroke-width="${u.width * 2.2}" opacity="0.55"/>`).join('');
  const glass = g.tubes.map((u) => `<path d="${u.d}" stroke="${t(ROLE[u.role])}" stroke-width="${u.width}"/>`).join('');
  const core = g.tubes.map((u) => `<path d="${u.d}" stroke="${t('cfh-core')}" stroke-width="${+(u.width * 0.32).toFixed(2)}" opacity="0.9"/>`).join('');
  const { track, y, w: cw, h: ch, rx: cr, rest } = g.cap;
  const cx = track[0] + (track[1] - track[0]) * rest;
  const cap = `<rect x="${+(cx - cw / 2).toFixed(2)}" y="${+(y - ch / 2).toFixed(2)}" width="${cw}" height="${ch}" rx="${cr}" fill="${t('cfh-core')}" stroke="${t('cfh-cyan')}" stroke-width="2"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-board} ${-board} ${w + board * 2} ${h + board * 2}">` +
    `<defs><filter id="halo" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>` +
    `<rect x="${-board}" y="${-board}" width="${w + board * 2}" height="${h + board * 2}" rx="${rx}" fill="${t('graphite-1000')}"/>` +
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<g filter="url(#halo)">${halo}</g>${glass}${core}</g>${cap}</svg>\n`
  );
}

export function clubSvgs(t) {
  return {
    'club-cfh.svg': logo(t, 'lockup', { board: 22, rx: 30 }),
    'club-cfh-mark.svg': logo(t, 'mark', { board: 0, rx: 14 }),
  };
}

// run directly: write the files
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const css = readFileSync(join(root, 'src/design/tokens.css'), 'utf8');
  const tokens = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]));
  const t = (n) => {
    if (!tokens[n]) throw new Error(`no token --${n}`);
    return tokens[n];
  };
  for (const [name, svg] of Object.entries(clubSvgs(t))) {
    writeFileSync(join(root, 'public', name), svg);
    console.log('wrote', name);
  }
}
