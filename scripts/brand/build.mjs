/**
 * Builds every brand asset from src/design/tokens.css:
 *   public/favicon.svg, public/mark.svg          (vector, palette colours inlined)
 *   public/apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png
 *   public/og-image.png (1200×630), public/twitter-card.png (1200×600)
 * The social images are a real render of the 3D bedroom (?shot) under the
 * token-styled template in scripts/brand/social.html.
 *
 * Usage: npm run build && npm run brand   (needs: npx playwright install chromium)
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pub = join(root, 'public');
const cache = join(root, 'scripts/brand/.cache');
mkdirSync(cache, { recursive: true });

// ---- tokens ----
const css = readFileSync(join(root, 'src/design/tokens.css'), 'utf8');
const tokens = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]));
const t = (n) => {
  if (!tokens[n]) throw new Error(`no token --${n}`);
  return tokens[n];
};

// ---- vector marks ----
const mark = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${bg ? `<rect width="64" height="64" rx="14" fill="${t('graphite-900')}"/>` : ''}<circle cx="20" cy="32" r="13" fill="none" stroke="${t('deck-a')}" stroke-width="5"/><circle cx="44" cy="32" r="13" fill="none" stroke="${t('deck-b')}" stroke-width="5"/><rect x="25" y="28" width="14" height="8" rx="2" fill="${t('ink-100')}"/></svg>\n`;
writeFileSync(join(pub, 'favicon.svg'), mark(true));
writeFileSync(join(pub, 'mark.svg'), mark(false));
console.log('wrote favicon.svg, mark.svg');

// ---- serve the built app ----
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) throw new Error('Run `npm run build` first.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(dist, path === '/' ? 'index.html' : path);
  if (!file.startsWith(dist) || !existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  // ---- 3D renders ----
  for (const [name, w, h] of [['room-1200x630', 1200, 630], ['room-1200x600', 1200, 600]]) {
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.goto(`http://localhost:${port}/?shot`);
    await p.waitForFunction(() => document.documentElement.classList.contains('shot'), null, { timeout: 30000 });
    await p.waitForTimeout(4000); // let fonts land in the screen textures and a few frames render
    await p.screenshot({ path: join(cache, `${name}.png`) });
    await p.close();
  }
  // ---- social cards ----
  const tpl = pathToFileURL(join(root, 'scripts/brand/social.html')).href;
  for (const [out, w, h, bg] of [['og-image.png', 1200, 630, 'room-1200x630'], ['twitter-card.png', 1200, 600, 'room-1200x600']]) {
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.goto(`${tpl}?w=${w}&h=${h}&bg=${encodeURIComponent(pathToFileURL(join(cache, `${bg}.png`)).href)}`);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.screenshot({ path: join(pub, out) });
    await p.close();
    console.log(`wrote ${out}`);
  }
  // ---- raster icons ----
  const icon = async (out, size, padding) => {
    const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const inner = padding ? mark(false) : mark(true);
    await p.setContent(`<html><body style="margin:0;background:${padding ? t('graphite-900') : 'transparent'};display:grid;place-items:center;width:${size}px;height:${size}px">${inner.replace('<svg ', `<svg width="${Math.round(size * (padding ? 0.7 : 1))}" height="${Math.round(size * (padding ? 0.7 : 1))}" `)}</body></html>`);
    await p.screenshot({ path: join(pub, out), omitBackground: !padding });
    await p.close();
    console.log(`wrote ${out}`);
  };
  await icon('apple-touch-icon.png', 180, true);
  await icon('icon-192.png', 192, false);
  await icon('icon-512.png', 512, false);
  await icon('icon-maskable-512.png', 512, true);
} finally {
  await browser.close();
  server.close();
}
