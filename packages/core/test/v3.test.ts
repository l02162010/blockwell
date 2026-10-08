// @vitest-environment jsdom
import { validate } from '@blockwell/schema';
import { describe, expect, it } from 'vitest';
import * as C from '../src/commands.js';
import { diffDocs } from '../src/diff.js';
import { looksLikeMarkdown, parseMarkdown } from '../src/markdown.js';
import { convertHtml, parseHtml } from '../src/paste.js';
import { EditorState } from '../src/state.js';
import type { Block, Doc } from '../src/types.js';

const strip = (blocks: Block[]): unknown =>
  blocks.map(({ id: _id, children, ...rest }) => (children ? { ...rest, children: strip(children) } : rest));

describe('markdown', () => {
  it('detects block syntax but not ordinary prose', () => {
    expect(looksLikeMarkdown('# Title\nbody')).toBe(true);
    expect(looksLikeMarkdown('- a\n- b')).toBe(true);
    expect(looksLikeMarkdown('Just a sentence with a * star.')).toBe(false);
    expect(looksLikeMarkdown('one\ntwo')).toBe(false);
  });

  it('converts blocks and inline marks', () => {
    const { blocks, counts } = parseMarkdown(
      '## Plan\n\n- [x] **done** item\n  - nested `code`\n1. first\n\n> quoted\n\n```ts\nconst a = 1;\n```\n\n---\n\nSee [docs](https://x.y/d) and [bad](javascript:alert(1)).',
    );
    expect(strip(blocks)).toEqual([
      { type: 'heading', attrs: { level: 2 }, text: 'Plan' },
      { type: 'listItem', attrs: { style: 'todo', checked: true }, text: 'done item', marks: [{ type: 'bold', from: 0, to: 4 }] },
      { type: 'listItem', attrs: { style: 'bullet', indent: 1 }, text: 'nested code', marks: [{ type: 'code', from: 7, to: 11 }] },
      { type: 'listItem', attrs: { style: 'ordered' }, text: 'first' },
      { type: 'quote', children: [{ type: 'paragraph', text: 'quoted' }] },
      { type: 'code', attrs: { language: 'typescript' }, text: 'const a = 1;' },
      { type: 'divider' },
      { type: 'paragraph', text: 'See docs and bad.', marks: [{ type: 'link', from: 4, to: 8, attrs: { href: 'https://x.y/d' } }] },
    ]);
    expect(counts).toEqual({ heading: 1, list: 3, quote: 1, code: 1, divider: 1 });
    expect(validate({ version: 1, blocks }).ok).toBe(true);
  });

  it('builds tables', () => {
    const { blocks } = parseMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(blocks[0]!.type).toBe('table');
    expect(validate({ version: 1, blocks }).ok).toBe(true);
  });
});

describe('paste sources', () => {
  it('reads Google Docs formatting from inline style only', () => {
    const html =
      '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-abc"><p dir="ltr" style="line-height:1.38"><span style="font-size:11pt;font-family:Arial;font-weight:700">Bold</span><span style="font-family:Arial"> and </span><span style="font-style:italic">italic</span></p></b>';
    const { blocks, report } = parseHtml(html);
    expect(report.source).toBe('gdocs');
    expect(strip(blocks)).toEqual([
      { type: 'paragraph', text: 'Bold and italic', marks: [{ type: 'bold', from: 0, to: 4 }, { type: 'italic', from: 9, to: 15 }] },
    ]);
    expect(report.removed.sort()).toEqual(['font', 'line-height']);
  });

  it('turns Word list paragraphs into list items', () => {
    const html =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><p class=MsoListParagraphCxSpFirst style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.<span>  </span></span>One<o:p></o:p></p><p class=MsoListParagraphCxSpLast style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">·<span> </span></span>Two</p><!--[if gte mso 9]>x<![endif]--></body></html>';
    const { blocks, report } = parseHtml(html);
    expect(report.source).toBe('word');
    expect(strip(blocks)).toEqual([
      { type: 'listItem', attrs: { style: 'ordered' }, text: 'One' },
      { type: 'listItem', attrs: { style: 'bullet', indent: 1 }, text: 'Two' },
    ]);
    expect(report.removed).toContain('mso');
    expect(report.unknownElements).toBe(0);
  });

  it('reports what a migration must review', () => {
    const { ok, report } = convertHtml(
      '<h2>2023 年度報告</h2><p><font color="#ff0000">營收成長 12%</font></p><p><a href="javascript:void(0)">下載</a></p><table><tr><td colspan="2">x</td></tr></table><iframe src="https://v.example"></iframe>',
    );
    expect(ok).toBe(true);
    expect(report.issues.map((i) => i.code).sort()).toEqual(['color-dropped', 'embed', 'merged-cells', 'unsafe-link']);
    expect(report.skipped).toBe(1);
  });
});

describe('length limit', () => {
  it('cuts text at the block limit and keeps the rest for the user', () => {
    const doc = { version: 1 as const, blocks: [{ id: 'a', type: 'paragraph', text: 'x'.repeat(9_990) }] };
    const tr = new EditorState(doc, { type: 'text', anchor: { block: 'a', offset: 9_990 }, focus: { block: 'a', offset: 9_990 } }).tr();
    C.insertText(tr, 'y'.repeat(25), null);
    const res = tr.finish();
    expect(res.ok).toBe(true);
    expect(tr.block('a').text!.length).toBe(10_000);
    expect(tr.dropped).toEqual({ block: 'a', text: 'y'.repeat(15) });
    expect(C.overflowToBlocks('y'.repeat(15))).toHaveLength(1);
  });
});

describe('diffDocs', () => {
  it('marks added, removed and changed blocks in reading order, removed before added', () => {
    const p = (id: string, text: string): Block => ({ id, type: 'paragraph', text });
    const base = { version: 1 as const, blocks: [p('a', 'one'), p('b', 'two'), p('c', 'three')] };
    const cur = { version: 1 as const, blocks: [p('a', 'one!'), p('n', 'new'), p('c', 'three')] };
    const d = diffDocs(base, cur);
    expect(d.doc.blocks.map((b) => b.id)).toEqual(['a_was', 'a', 'b', 'n', 'c']);
    expect(d.changes).toEqual({ a_was: 'removed', a: 'changed', n: 'added', b: 'removed' });
  });
});

describe('turning quoted text into something else', () => {
  const p = (id: string, text: string): Block => ({ id, type: 'paragraph', text });
  const quoted = (): Doc => ({ version: 1, blocks: [{ id: 'q', type: 'quote', children: [p('a', 'one'), p('b', 'two'), p('c', 'three')] }] });
  it('paragraph lifts the line out, splitting the quote', () => {
    const s = new EditorState(quoted(), { type: 'text', anchor: { block: 'b', offset: 0 }, focus: { block: 'b', offset: 0 } });
    const tr = s.tr();
    expect(C.setBlockKind(tr, 'paragraph', { allowedBlocks: null })).toBe(true);
    const r = tr.finish();
    expect(r.ok).toBe(true);
    expect(tr.doc.blocks.map((b) => [b.type, b.children?.map((c) => c.id) ?? b.id])).toEqual([
      ['quote', ['a']],
      ['paragraph', 'b'],
      ['quote', ['c']],
    ]);
  });
  it('code lifts the line out before converting', () => {
    const s = new EditorState(quoted(), { type: 'text', anchor: { block: 'c', offset: 0 }, focus: { block: 'c', offset: 0 } });
    const tr = s.tr();
    expect(C.setBlockKind(tr, 'code', { allowedBlocks: null })).toBe(true);
    expect(tr.finish().ok).toBe(true);
    expect(tr.doc.blocks.map((b) => b.type)).toEqual(['quote', 'code']);
  });
});

describe('convertHtml details', () => {
  it('drops script, svg and meta with their content and says so', () => {
    const { doc, report } = convertHtml('<p>a<meta http-equiv="refresh" content="0"><script>x()</script><svg><a>s</a></svg>b</p>');
    expect(doc.blocks.map((b) => b.text)).toEqual(['ab']);
    expect(report.removedElements.sort()).toEqual(['meta', 'script', 'svg']);
    expect(report.droppedAttrs).toEqual([]);
    expect(report.unknownElements).toBe(0);
  });
  it('turns <mark> into the yellow highlight', () => {
    const { doc } = convertHtml('<p>a <mark>b</mark></p>');
    expect(doc.blocks[0]!.marks).toEqual([{ type: 'highlight', from: 2, to: 3, attrs: { value: 'yellow' } }]);
  });
  it('keeps a code block language from its class', () => {
    const { doc } = convertHtml('<pre><code class="language-js">let a = 1;</code></pre>');
    expect(doc.blocks[0]).toMatchObject({ type: 'code', attrs: { language: 'javascript' }, text: 'let a = 1;' });
  });
});

describe('palette names in pasted HTML', () => {
  it('keeps <font color="red"> as the red token', () => {
    const { doc, report } = convertHtml('<p><font color="red">紅</font>字</p>');
    expect(doc.blocks[0]!.marks).toEqual([{ type: 'color', from: 0, to: 1, attrs: { value: 'red' } }]);
    expect(report.issues).toEqual([]);
  });
});
