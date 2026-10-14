import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { COVER_PATH, handleCover } from './worker/cover.js';

/** Serve /api/cover in `npm run dev` the same way the Worker does in production. */
const coverApi = (): Plugin => ({
  name: 'cover-api',
  configureServer(server) {
    server.middlewares.use(COVER_PATH, async (req, res) => {
      try {
        const r: Response = await handleCover(new Request(`http://localhost${COVER_PATH}${req.url?.replace(/^\/?/, '') ?? ''}`));
        res.statusCode = r.status;
        r.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await r.arrayBuffer()));
      } catch {
        res.statusCode = 502;
        res.end('cover lookup failed');
      }
    });
  },
});

export default defineConfig({
  plugins: [react(), coverApi()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: { input: { main: 'index.html', brand: 'brand.html', club: 'club.html', store: 'store.html' } },
  },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
} as never);
