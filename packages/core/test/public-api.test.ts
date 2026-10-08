// @vitest-environment jsdom
/** The document helpers and constants exported by @blockwell/core, through the public entry. */
import { validate } from '@blockwell/schema';
import { describe, expect, it } from 'vitest';
import {
  EditorState,
  IMAGE_SCHEMES,
  LINK_SCHEMES,
  PALETTE_COLORS,
  Tr,
  allBlocks,
  ancestors,
  caret,
  convertHtml,
  diffDocs,
  getBlock,
  locate,
  newId,
  paletteCss,
  parseMarkdown,
  textBlocks,
  type Doc,
} from '../src/index.js';

const doc: Doc = {
  version: 1,
  blocks: [
    { id: 'p', type: 'paragraph', text: 'one' },
    { id: 'q', type: 'quote', children: [{ id: 'q1', type: 'paragraph', text: 'quoted' }] },
    { id: 'img', type: 'image', attrs: { src: 'https://cdn.example/a.png' } },
  ],
};

describe('document helpers', () => {
  it('getBlock and locate find nested blocks', () => {
    expect(getBlock(doc, 'q1')!.text).toBe('quoted');
    expect(locate(doc, 'q1')).toMatchObject({ parent: 'q', index: 0 });
    expect(getBlock(doc, 'missing')).toBeUndefined();
  });
  it('textBlocks lists blocks with text in reading order; allBlocks every block', () => {
    expect(textBlocks(doc).map((b) => b.id)).toEqual(['p', 'q1']);
    expect(allBlocks(doc).map((b) => b.id)).toEqual(['p', 'q', 'q1', 'img']);
  });
  it('ancestors goes from the parent up', () => {
    expect(ancestors(doc, 'q1').map((b) => b.id)).toEqual(['q']);
  });
  it('newId makes ids the schema accepts, different each time', () => {
    const a = newId(), b = newId();
    expect(a).not.toBe(b);
    expect(validate({ version: 1, blocks: [{ id: a, type: 'paragraph', text: '' }] }).ok).toBe(true);
  });
  it('caret is a collapsed text selection', () => {
    expect(caret('p', 2)).toEqual({ type: 'text', anchor: { block: 'p', offset: 2 }, focus: { block: 'p', offset: 2 } });
  });
  it('EditorState and Tr build a validated change', () => {
    const tr = new EditorState(doc, caret('p', 3)).tr();
    expect(tr).toBeInstanceOf(Tr);
    tr.insertText({ block: 'p', offset: 3 }, '!');
    const r = tr.finish();
    expect(r.ok && getBlock(r.state.doc, 'p')!.text).toBe('one!');
  });
});

describe('content in and out', () => {
  it('convertHtml, parseMarkdown and diffDocs', () => {
    expect(convertHtml('<h2>T</h2>').doc.blocks[0]!.type).toBe('heading');
    expect(parseMarkdown('# T').blocks[0]!.type).toBe('heading');
    expect(diffDocs(doc, { version: 1, blocks: doc.blocks.slice(1) }).changes).toEqual({ p: 'removed' });
  });
});

describe('constants', () => {
  it('LINK_SCHEMES and IMAGE_SCHEMES list the allowed URL schemes', () => {
    expect(LINK_SCHEMES).toContain('https');
    expect(LINK_SCHEMES).not.toContain('javascript');
    expect(IMAGE_SCHEMES).toContain('https');
  });
  it('PALETTE_COLORS and paletteCss: every token gets a light and dark variable', () => {
    expect(PALETTE_COLORS.cyan).toMatchObject({ light: { text: expect.any(String), bg: expect.any(String) } });
    const css = paletteCss();
    for (const t of Object.keys(PALETTE_COLORS)) {
      expect(css).toContain(`--editor-color-${t}`);
      expect(css).toContain(`.bw-c-${t}`);
    }
    expect(css).toContain('[data-theme="dark"]');
  });
});
