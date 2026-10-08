import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';
import { blockwellPalette } from './vite.palette.js';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [vue(), blockwellPalette()],
  resolve: {
    alias: {
      '@blockwell/schema': src('../schema/src/index.ts'),
      '@blockwell/core': src('../core/src/index.ts'),
    },
  },
  test: { environment: 'jsdom', setupFiles: ['test/setup.ts'], css: false },
});
