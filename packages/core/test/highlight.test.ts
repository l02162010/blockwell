import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/highlight.js';

describe('tokenize', () => {
  it('keeps the text intact', () => {
    const src = "export const SafeUrl = (v: string) => {\n  return ['https:', 'mailto:'].includes(x); // ok\n};";
    expect(tokenize(src, 'typescript').map((t) => t.text).join('')).toBe(src);
  });
  it('marks keywords, strings and comments', () => {
    const kinds = tokenize("const a = 'x'; // c", 'javascript').filter((t) => t.kind).map((t) => [t.kind, t.text]);
    expect(kinds).toEqual([
      ['keyword', 'const'],
      ['string', "'x'"],
      ['comment', '// c'],
    ]);
  });
  it('leaves plain text alone', () => {
    expect(tokenize('if x', 'plaintext')).toEqual([{ text: 'if x', kind: null }]);
  });
});
