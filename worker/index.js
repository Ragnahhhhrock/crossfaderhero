/**
 * Crossfader Hero Worker.
 *
 * Static assets are served straight from `dist/` (see wrangler.jsonc). Only
 * requests under the Google tag gateway measurement path reach this script:
 * they're proxied first-party to Google's gateway for the GA4 tag, so gtag.js
 * and its collection hits load from crossfaderhero.com instead of
 * googletagmanager.com / google-analytics.com.
 *
 * /api/cover looks up album art for tracks without embedded pictures (see cover.js).
 *
 * Health checks: /k7q2m/healthy and /k7q2m/?validate_geo=healthy both return "ok".
 */

import { COVER_PATH, handleCover } from './cover.js';

const TAG_ID = 'G-R8RG80E41X';
const MEASUREMENT_PATH = '/k7q2m';

async function tagGateway(request) {
  const url = new URL(request.url);
  url.protocol = 'https:';
  url.hostname = `${TAG_ID}.fps.goog`;
  url.port = '';

  const headers = new Headers(request.headers);
  // never trust geo headers from the client; set our own from Cloudflare's lookup
  for (const h of ['X-Forwarded-CountryRegion', 'X-Forwarded-Country', 'X-Forwarded-Region', 'X-Forwarded-Geolocation']) headers.delete(h);
  headers.delete('Host');

  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) headers.append('X-Forwarded-For', ip);

  const cf = request.cf || {};
  if (cf.country && cf.country !== 'T1' && cf.country !== 'XX') {
    if (cf.regionCode) headers.set('X-Forwarded-CountryRegion', `${cf.country}-${cf.regionCode}`);
    else headers.set('X-Forwarded-Country', cf.country);
  }
  if (cf.latitude && cf.longitude) {
    headers.set('X-Forwarded-Geolocation', `latlong=${cf.latitude},${cf.longitude};city=${cf.city || ''}`);
  }

  return fetch(url, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === MEASUREMENT_PATH || pathname.startsWith(`${MEASUREMENT_PATH}/`)) {
      try {
        return await tagGateway(request);
      } catch {
        return new Response('gateway error', { status: 502 });
      }
    }
    if (pathname === COVER_PATH) {
      if (request.method !== 'GET') return new Response('method not allowed', { status: 405 });
      try {
        return await handleCover(request);
      } catch {
        return new Response('cover lookup failed', { status: 502 });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
