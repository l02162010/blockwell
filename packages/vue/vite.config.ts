import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { blockwellPalette } from './vite.palette.js';

export default defineConfig({
  plugins: [vue(), blockwellPalette()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: 'index',
      cssFileName: 'blockwell',
    },
    rollupOptions: { external: ['vue', '@blockwell/core', '@blockwell/schema'] },
  },
});
