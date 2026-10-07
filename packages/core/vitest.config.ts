import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@blockwell/schema': fileURLToPath(new URL('../schema/src/index.ts', import.meta.url)) },
  },
});
