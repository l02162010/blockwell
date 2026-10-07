import type { Plugin } from 'vite';
import { paletteCss } from '../core/src/palette.js';

/**
 * Serves `virtual:blockwell-palette.css`: palette custom properties and classes generated from
 * spec/palette.json at build time, so no inline <style> is injected at runtime (CSP friendly).
 */
export function blockwellPalette(): Plugin {
  const id = 'virtual:blockwell-palette.css';
  return {
    name: 'blockwell-palette',
    resolveId: (source) => (source === id ? '\0' + id : null),
    load: (resolved) => (resolved === '\0' + id ? paletteCss() : null),
  };
}
