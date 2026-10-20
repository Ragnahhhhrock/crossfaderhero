import { DurableObject } from 'cloudflare:workers';
import { emptyTotals, FIELDS } from './stats.js';

/** The one global counter. Durable Objects run one request at a time, so adds never race. */
export class StatsCounter extends DurableObject {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const totals = { ...emptyTotals(), ...((await this.ctx.storage.get('totals')) || {}) };
    if (pathname === '/add' && request.method === 'POST') {
      const delta = await request.json();
      for (const f of FIELDS) totals[f] += Number(delta[f]) || 0;
      await this.ctx.storage.put('totals', totals);
    }
    return Response.json(totals);
  }
}
