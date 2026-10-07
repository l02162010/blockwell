import { validate } from '@blockwell/schema';
import { describe, expect, it } from 'vitest';
import * as C from '../src/commands.js';
import { runInputRules } from '../src/inputRules.js';
import { insertIntoMarks, normalizeMarks, setMarkOnRange } from '../src/marks.js';
import { caret } from '../src/model.js';
import { applyOp, invertOps } from '../src/ops.js';
import { EditorState, Tr } from '../src/state.js';
import type { Block, Doc, Selection } from '../src/types.js';

const o: C.CommandOptions = { allowedBlocks: null };
const doc = (...blocks: Block[]): Doc => ({ version: 1, blocks });
const p = (id: string, text: string, extra: Partial<Block> = {}): Block => ({ id, type: 'paragraph', text, ...extra });
const sel = (a: [string, number], f: [string, number] = a): Selection => ({
  type: 'text',
  anchor: { block: a[0], offset: a[1] },
  focus: { block: f[0], offset: f[1] },
});

/** Runs a command, checks the result validates and that inverting all ops restores the input. */
function run(d: Doc, s: Selection, cmd: (tr: Tr) => boolean) {
  const tr = new EditorState(d, s).tr();
  const ok = cmd(tr);
  const res = tr.finish();
  if (!res.ok) throw new Error('invalid: ' + JSON.stringify(res.errors));
  let back = res.state.doc;
  for (const op of invertOps(res.tr.ops)) back = applyOp(back, op);
  expect(back).toEqual(d);
  return { ok, doc: res.state.doc, selection: res.state.selection };
}

describe('marks', () => {
  it('merges touching ranges of the same mark', () => {
    expect(normalizeMarks([{ type: 'bold', from: 3, to: 5 }, { type: 'bold', from: 0, to: 3 }])).toEqual([{ type: 'bold', from: 0, to: 5 }]);
  });

  it('keeps different colors apart', () => {
    const m = setMarkOnRange([{ type: 'color', from: 0, to: 6, attrs: { value: 'red' } }], 'color', 2, 4, { value: 'blue' });
    expect(m).toEqual([
      { type: 'color', from: 0, to: 2, attrs: { value: 'red' } },
      { type: 'color', from: 2, to: 4, attrs: { value: 'blue' } },
      { type: 'color', from: 4, to: 6, attrs: { value: 'red' } },
    ]);
  });

  it('inline code clears other marks and blocks new ones', () => {
    const withCode = setMarkOnRange([{ type: 'bold', from: 0, to: 6 }], 'code', 2, 4, {});
    expect(withCode).toEqual([
      { type: 'bold', from: 0, to: 2 },
      { type: 'code', from: 2, to: 4 },
      { type: 'bold', from: 4, to: 6 },
    ]);
    expect(setMarkOnRange(withCode, 'italic', 0, 6, {}).filter((m) => m.type === 'italic')).toEqual([
      { type: 'italic', from: 0, to: 2 },
      { type: 'italic', from: 4, to: 6 },
    ]);
  });

  it('splits marks around inserted text that does not carry them', () => {
    expect(insertIntoMarks([{ type: 'bold', from: 0, to: 4 }], 2, 1, [])).toEqual([
      { type: 'bold', from: 0, to: 2 },
      { type: 'bold', from: 3, to: 5 },
    ]);
  });
});

describe('text editing', () => {
  it('types with the marks of the previous character', () => {
    const d = doc(p('a', 'ab', { marks: [{ type: 'bold', from: 0, to: 2 }] }));
    const r = run(d, sel(['a', 2]), (tr) => C.insertText(tr, 'c', null));
    expect(r.doc.blocks[0]).toEqual(p('a', 'abc', { marks: [{ type: 'bold', from: 0, to: 3 }] }));
  });

  it('does not extend a link at its end', () => {
    const d = doc(p('a', 'ab', { marks: [{ type: 'link', from: 0, to: 2, attrs: { href: 'https://x.y' } }] }));
    const r = run(d, sel(['a', 2]), (tr) => C.insertText(tr, 'c', null));
    expect(r.doc.blocks[0]!.marks).toEqual([{ type: 'link', from: 0, to: 2, attrs: { href: 'https://x.y' } }]);
  });

  it('splits a block and keeps the id on the first half', () => {
    const d = doc(p('a', 'hello world', { marks: [{ type: 'bold', from: 4, to: 7 }] }));
    const r = run(d, sel(['a', 5]), (tr) => C.splitBlock(tr));
    expect(r.doc.blocks).toHaveLength(2);
    expect(r.doc.blocks[0]).toEqual(p('a', 'hello', { marks: [{ type: 'bold', from: 4, to: 5 }] }));
    expect(r.doc.blocks[1]).toMatchObject({ type: 'paragraph', text: ' world', marks: [{ type: 'bold', from: 0, to: 2 }] });
    expect(r.selection).toEqual(caret(r.doc.blocks[1]!.id, 0));
  });

  it('Enter at the end of a heading starts a paragraph', () => {
    const d = doc({ id: 'h', type: 'heading', attrs: { level: 2 }, text: 'Title' });
    const r = run(d, sel(['h', 5]), (tr) => C.splitBlock(tr));
    expect(r.doc.blocks[1]).toMatchObject({ type: 'paragraph', text: '' });
  });

  it('Enter on an empty list item outdents, then leaves the list', () => {
    const d = doc(
      { id: 'a', type: 'listItem', attrs: { style: 'bullet' }, text: 'one' },
      { id: 'b', type: 'listItem', attrs: { style: 'bullet', indent: 1 }, text: '' },
    );
    const r1 = run(d, sel(['b', 0]), (tr) => C.splitBlock(tr));
    expect(r1.doc.blocks[1]).toEqual({ id: 'b', type: 'listItem', attrs: { style: 'bullet' }, text: '' });
    const r2 = run(r1.doc, sel(['b', 0]), (tr) => C.splitBlock(tr));
    expect(r2.doc.blocks[1]).toEqual({ id: 'b', type: 'paragraph', text: '' });
  });

  it('Backspace at the start merges into the previous block', () => {
    const d = doc(p('a', 'foo', { marks: [{ type: 'italic', from: 0, to: 3 }] }), p('b', 'bar', { marks: [{ type: 'bold', from: 0, to: 3 }] }));
    const r = run(d, sel(['b', 0]), (tr) => C.joinBackward(tr));
    expect(r.doc.blocks).toEqual([
      p('a', 'foobar', {
        marks: [
          { type: 'italic', from: 0, to: 3 },
          { type: 'bold', from: 3, to: 6 },
        ],
      }),
    ]);
    expect(r.selection).toEqual(caret('a', 3));
  });

  it('Backspace after an image selects it', () => {
    const d = doc({ id: 'i', type: 'image', attrs: { src: 'https://cdn.example/x.png' } }, p('b', 'x'));
    const r = run(d, sel(['b', 0]), (tr) => C.joinBackward(tr));
    expect(r.selection).toEqual({ type: 'node', block: 'i' });
  });

  it('deletes across blocks and merges the ends', () => {
    const d = doc(p('a', 'hello'), { id: 'd', type: 'divider' }, p('b', 'middle'), p('c', 'world'));
    const r = run(d, sel(['a', 2], ['c', 3]), (tr) => C.deleteSelection(tr));
    expect(r.doc.blocks).toEqual([p('a', 'held')]);
  });

  it('deleting a range inside a table empties cells instead of breaking rows', () => {
    const t = C.newTable(2, 2);
    const cells = t.children!.flatMap((r) => r.children!.map((c) => c.children![0]!.id));
    t.children![0]!.children![0]!.children![0]!.text = 'a1';
    t.children![0]!.children![1]!.children![0]!.text = 'b1';
    t.children![1]!.children![0]!.children![0]!.text = 'a2';
    const d = doc(t);
    const r = run(d, sel([cells[0]!, 1], [cells[2]!, 1]), (tr) => C.deleteSelection(tr));
    expect(validate(r.doc).ok).toBe(true);
    const texts = r.doc.blocks[0]!.children!.flatMap((row) => row.children!.map((c) => c.children![0]!.text));
    expect(texts).toEqual(['a', '', '2', '']);
  });
});

describe('marks commands', () => {
  it('toggles bold across two blocks', () => {
    const d = doc(p('a', 'one'), p('b', 'two'));
    const r = run(d, sel(['a', 1], ['b', 2]), (tr) => C.toggleMark(tr, 'bold'));
    expect(r.doc.blocks[0]!.marks).toEqual([{ type: 'bold', from: 1, to: 3 }]);
    expect(r.doc.blocks[1]!.marks).toEqual([{ type: 'bold', from: 0, to: 2 }]);
    const r2 = run(r.doc, sel(['a', 1], ['b', 2]), (tr) => C.toggleMark(tr, 'bold'));
    expect(r2.doc).toEqual(d);
  });

  it('refuses unsafe links', () => {
    const d = doc(p('a', 'click'));
    const tr = new EditorState(d, sel(['a', 0], ['a', 5])).tr();
    expect(C.setLink(tr, 'javascript:alert(1)')).toBe(false);
    expect(C.setLink(tr, 'HTTPS://x.y')).toBe(false);
    expect(C.setLink(tr, 'https://docs.example.com/editor#schema')).toBe(true);
  });

  it('sets and clears a palette color', () => {
    const d = doc(p('a', 'color'));
    const r = run(d, sel(['a', 0], ['a', 5]), (tr) => C.setMarkValue(tr, 'color', { value: 'red' }));
    expect(r.doc.blocks[0]!.marks).toEqual([{ type: 'color', from: 0, to: 5, attrs: { value: 'red' } }]);
  });
});

describe('block commands', () => {
  it('converts to code, dropping marks and turning line breaks into newlines', () => {
    const d = doc(
      p('a', 'x\uFFFCy', {
        marks: [{ type: 'bold', from: 0, to: 1 }],
        entities: [{ at: 1, type: 'lineBreak' }],
      }),
    );
    const r = run(d, sel(['a', 0]), (tr) => C.setBlockKind(tr, 'code', o));
    expect(r.doc.blocks[0]).toEqual({ id: 'a', type: 'code', text: 'x\ny' });
  });

  it('wraps blocks in a quote and unwraps them again', () => {
    const d = doc(p('a', 'one'), p('b', 'two'));
    const r = run(d, sel(['a', 0], ['b', 1]), (tr) => C.setBlockKind(tr, 'quote', o));
    expect(r.doc.blocks).toHaveLength(1);
    expect(r.doc.blocks[0]!.type).toBe('quote');
    const r2 = run(r.doc, sel(['a', 0]), (tr) => C.setBlockKind(tr, 'quote', o));
    expect(r2.doc.blocks).toEqual(d.blocks);
  });

  it('indents a list item at most one level deeper than the previous one', () => {
    const d = doc(
      { id: 'a', type: 'listItem', attrs: { style: 'bullet' }, text: 'one' },
      { id: 'b', type: 'listItem', attrs: { style: 'bullet', indent: 1 }, text: 'two' },
    );
    const tr = new EditorState(d, sel(['b', 0])).tr();
    expect(C.indentList(tr, 1)).toBe(false);
  });

  it('fixes indents after the parent item is removed', () => {
    const d = doc(
      p('x', 'para'),
      { id: 'a', type: 'listItem', attrs: { style: 'bullet' }, text: '' },
      { id: 'b', type: 'listItem', attrs: { style: 'bullet', indent: 1 }, text: 'child' },
    );
    const r = run(d, sel(['a', 0]), (tr) => (tr.removeBlock('a'), true));
    expect(r.doc.blocks[1]).toEqual({ id: 'b', type: 'listItem', attrs: { style: 'bullet' }, text: 'child' });
  });

  it('inserts an image after the caret and replaces an empty paragraph', () => {
    const d = doc(p('a', 'text'), p('b', ''));
    const img = C.newImage({ src: 'https://cdn.example/a.png', alt: 'a' });
    const r = run(d, sel(['b', 0]), (tr) => C.insertBlock(tr, img, o));
    expect(r.doc.blocks.map((b) => b.type)).toEqual(['paragraph', 'image', 'paragraph']);
    expect(r.selection).toEqual({ type: 'node', block: img.id });
  });

  it('does not insert a divider inside a quote, but after it', () => {
    const d = doc({ id: 'q', type: 'quote', children: [p('a', 'quoted')] });
    const r = run(d, sel(['a', 6]), (tr) => C.insertBlock(tr, C.newDivider(), o));
    expect(r.doc.blocks.map((b) => b.type)).toEqual(['quote', 'divider', 'paragraph']);
  });

  it('respects allowedBlocks', () => {
    const tr = new EditorState(doc(p('a', '')), sel(['a', 0])).tr();
    expect(C.setBlockKind(tr, 'heading1', { allowedBlocks: new Set(['paragraph']) })).toBe(false);
  });

  it('adds and removes table rows and columns', () => {
    const t = C.newTable(2, 2);
    const first = t.children![0]!.children![0]!.children![0]!.id;
    let r = run(doc(t), sel([first, 0]), (tr) => C.addColumn(tr, first, 'after'));
    expect(r.doc.blocks[0]!.children!.map((row) => row.children!.length)).toEqual([3, 3]);
    r = run(r.doc, sel([first, 0]), (tr) => C.addRow(tr, first, 'before'));
    expect(r.doc.blocks[0]!.children!).toHaveLength(3);
    r = run(r.doc, sel([first, 0]), (tr) => C.deleteColumn(tr, first));
    expect(r.doc.blocks[0]!.children!.map((row) => row.children!.length)).toEqual([2, 2, 2]);
  });
});

describe('input rules', () => {
  const cases: [string, Partial<Block>][] = [
    ['# ', { type: 'heading', attrs: { level: 1 } }],
    ['### ', { type: 'heading', attrs: { level: 3 } }],
    ['- ', { type: 'listItem', attrs: { style: 'bullet' } }],
    ['1. ', { type: 'listItem', attrs: { style: 'ordered' } }],
    ['[] ', { type: 'listItem', attrs: { style: 'todo' } }],
    ['[x] ', { type: 'listItem', attrs: { style: 'todo', checked: true } }],
    ['```', { type: 'code' }],
  ];
  for (const [typed, expected] of cases) {
    it(`"${typed}"`, () => {
      const d = doc(p('a', typed));
      const r = run(d, sel(['a', typed.length]), (tr) => !!runInputRules(tr, o));
      expect(r.ok).toBe(true);
      expect(r.doc.blocks[0]).toMatchObject({ ...expected, text: '' });
    });
  }

  it('"> " wraps in a quote', () => {
    const r = run(doc(p('a', '> ')), sel(['a', 2]), (tr) => !!runInputRules(tr, o));
    expect(r.doc.blocks[0]!.type).toBe('quote');
  });

  it('"---" adds a divider', () => {
    const r = run(doc(p('a', '---')), sel(['a', 3]), (tr) => !!runInputRules(tr, o));
    expect(r.doc.blocks.map((b) => b.type)).toEqual(['divider', 'paragraph']);
  });

  it('only fires at the start of a paragraph', () => {
    const tr = new EditorState(doc(p('a', 'x # ')), sel(['a', 4])).tr();
    expect(runInputRules(tr, o)).toBeNull();
  });
});

describe('fragments', () => {
  it('pastes a single paragraph inline', () => {
    const d = doc(p('a', 'ac'));
    const r = run(d, sel(['a', 1]), (tr) => C.insertFragment(tr, [p('x', 'b', { marks: [{ type: 'bold', from: 0, to: 1 }] })], o));
    expect(r.doc.blocks[0]).toEqual(p('a', 'abc', { marks: [{ type: 'bold', from: 1, to: 2 }] }));
  });

  it('pastes several blocks around the caret', () => {
    const d = doc(p('a', 'start|end'));
    const r = run(d, sel(['a', 6]), (tr) =>
      C.insertFragment(tr, [p('x', 'one'), { id: 'h', type: 'heading', attrs: { level: 2 }, text: 'two' }], o),
    );
    expect(r.doc.blocks.map((b) => [b.type, b.text])).toEqual([
      ['paragraph', 'start|one'],
      ['heading', 'twoend'],
    ]);
  });

  it('pastes only paragraphs into a table cell', () => {
    const t = C.newTable(1, 1);
    const cell = t.children![0]!.children![0]!.children![0]!.id;
    const r = run(doc(t), sel([cell, 0]), (tr) => C.insertFragment(tr, [{ id: 'h', type: 'heading', attrs: { level: 1 }, text: 'T' }, { id: 'd', type: 'divider' }, p('x', 'u')], o));
    const blocks = r.doc.blocks[0]!.children![0]!.children![0]!.children!;
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'paragraph']);
  });
});
