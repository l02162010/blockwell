// @vitest-environment jsdom
import { validate } from '@blockwell/schema';
import { describe, expect, it } from 'vitest';
import { parseBlockwell, parseHtml } from '../src/paste.js';
import { renderBlock } from '../src/render.js';
import type { Block } from '../src/types.js';

const strip = (blocks: Block[]): unknown =>
  blocks.map(({ id: _id, children, ...rest }) => (children ? { ...rest, children: strip(children) } : rest));

describe('parseHtml', () => {
  it('maps headings, marks and links to the schema', () => {
    const { blocks, report } = parseHtml('<h2 style="color:red" class="x">Title</h2><p><b>Bold</b> and <a href="https://a.b/c" onclick="x()">link</a></p>');
    expect(strip(blocks)).toEqual([
      // "red" is a palette name, so it stays as the red token.
      { type: 'heading', attrs: { level: 2 }, text: 'Title', marks: [{ type: 'color', from: 0, to: 5, attrs: { value: 'red' } }] },
      {
        type: 'paragraph',
        text: 'Bold and link',
        marks: [
          { type: 'bold', from: 0, to: 4 },
          { type: 'link', from: 9, to: 13, attrs: { href: 'https://a.b/c' } },
        ],
      },
    ]);
    expect(report.kept.sort()).toEqual(['bold', 'color', 'heading', 'link']);
    expect(report.droppedAttrs.sort()).toEqual(['class', 'on*', 'style']);
  });

  it('builds flat lists with indents and to-dos', () => {
    const { blocks } = parseHtml('<ul><li>a<ul><li>b</li></ul></li><li><input type="checkbox" checked>c</li></ul><ol><li>d</li></ol>');
    expect(strip(blocks)).toEqual([
      { type: 'listItem', attrs: { style: 'bullet' }, text: 'a' },
      { type: 'listItem', attrs: { style: 'bullet', indent: 1 }, text: 'b' },
      { type: 'listItem', attrs: { style: 'todo', checked: true }, text: 'c' },
      { type: 'listItem', attrs: { style: 'ordered' }, text: 'd' },
    ]);
  });

  it('keeps code text and quotes', () => {
    const { blocks } = parseHtml('<pre><code>a &lt; b\nc</code></pre><blockquote><p>q</p></blockquote>');
    expect(strip(blocks)).toEqual([
      { type: 'code', text: 'a < b\nc' },
      { type: 'quote', children: [{ type: 'paragraph', text: 'q' }] },
    ]);
  });

  it('produces documents that validate', () => {
    const { blocks } = parseHtml('<table><tr><th>a</th><th>b</th></tr><tr><td>1</td></tr></table><hr><img src="https://cdn.x/a.png" alt="A">');
    expect(validate({ version: 1, blocks }).ok).toBe(true);
    expect(blocks.map((b) => b.type)).toEqual(['table', 'divider', 'image']);
  });

  // Engine guide §11: payloads must never yield anything executable.
  const corpus = [
    '<a href="javascript:alert(1)">x</a>',
    '<a href="JaVaScRiPt:alert(1)">x</a>',
    '<a href="  javascript:alert(1)">x</a>',
    '<a href="java&#x09;script:alert(1)">x</a>',
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    '<a href="vbscript:msgbox(1)">x</a>',
    '<a href="https:\\\\evil.com">x</a>',
    '<img src="x" onerror="alert(1)">',
    '<img src="javascript:alert(1)">',
    '<img src="http://insecure.example/a.png">',
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"></svg>',
    '<style>body{background:url(javascript:alert(1))}</style>',
    '<script>alert(1)</script>',
    '<iframe src="https://evil.example"></iframe>',
    '<p onmouseover="alert(1)" style="background:url(x)">hover</p>',
    '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
    '<form action="javascript:alert(1)"><button>go</button></form>',
    '<object data="javascript:alert(1)"></object>',
    '<a href="mailto:a@b.c">mail</a>',
  ];

  for (const html of corpus) {
    it(`neutralises ${html.slice(0, 50)}`, () => {
      const { blocks } = parseHtml(html);
      expect(validate({ version: 1, blocks }).ok).toBe(true);
      const json = JSON.stringify(blocks);
      expect(json).not.toMatch(/javascript:|vbscript:|data:|onerror|onload|onmouseover|<script|http:\/\//i);
      const holder = document.createElement('div');
      for (const b of blocks) holder.append(renderBlock(b, { editable: false, numbers: new Map() }));
      expect(holder.querySelector('script, iframe, svg, object, style, [onerror], [onload], [style*="url"]')).toBeNull();
      for (const a of Array.from(holder.querySelectorAll('a'))) expect(a.getAttribute('href')).toMatch(/^(https:\/\/|mailto:)/);
    });
  }
});

describe('parseBlockwell', () => {
  it('rejects invalid documents whole', () => {
    expect(parseBlockwell(JSON.stringify({ version: 1, blocks: [{ id: 'a', type: 'paragraph', text: 'x', marks: [{ type: 'link', from: 0, to: 1, attrs: { href: 'javascript:x' } }] }] }))).toBeNull();
    expect(parseBlockwell('not json')).toBeNull();
  });

  it('gives pasted blocks fresh ids', () => {
    const res = parseBlockwell(JSON.stringify({ version: 1, blocks: [{ id: 'a', type: 'paragraph', text: 'x' }] }));
    expect(res!.blocks[0]!.id).not.toBe('a');
  });
});
