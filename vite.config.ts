import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: { input: { main: 'index.html', brand: 'brand.html' } },
  },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
} as never);
