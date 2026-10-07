import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { blockwellPalette } from '../../packages/vue/vite.palette.js';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// BASE is set by the Pages workflow (e.g. /blockwell/).
export default defineConfig({
  base: process.env.BASE ?? '/',
  plugins: [vue(), blockwellPalette()],
  resolve: {
    alias: {
      '@blockwell/schema': src('../../packages/schema/src/index.ts'),
      '@blockwell/core': src('../../packages/core/src/index.ts'),
      '@blockwell/vue': src('../../packages/vue/src/index.ts'),
    },
  },
});
