import { spec } from './spec.js';

/** Textual URL check from SPEC.md §5. Identical rules in every language; no URL parser involved. */
export function isSafeUrl(value: unknown, schemes: readonly string[]): boolean {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > spec.limits.maxUrlLength) return false;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f) return false;
    if (c === 0x5c /* \ */ || c === 0x3c /* < */ || c === 0x3e /* > */ || c === 0x22 /* " */) return false;
  }
  const colon = value.indexOf(':');
  if (colon <= 0) return false;
  const scheme = value.slice(0, colon);
  if (!schemes.includes(scheme)) return false;
  switch (scheme) {
    case 'https': {
      if (!value.startsWith('https://')) return false;
      const first = value.charAt('https://'.length);
      return first !== '' && first !== '/' && first !== '?' && first !== '#';
    }
    case 'mailto':
      return value.length > 'mailto:'.length;
    default:
      return false;
  }
}
