// @vitest-environment jsdom
/**
 * The public Editor API, member by member: each call does what its documentation says.
 * (Layout-dependent results — rectangles, scrolling — are covered by the browser tests.)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor, type EditorEvents } from '../src/editor.js';
import { caret } from '../src/model.js';
import type { Block, Doc, Transaction } from '../src/types.js';

const p = (id: string, text: string, extra: Partial<Block> = {}): Block => ({ id, type: 'paragraph', text, ...extra });
const doc = (...blocks: Block[]): Doc => ({ version: 1, blocks });
const at = (block: string, offset: number) => caret(block, offset);
const range = (block: string, from: number, to: number) => ({ type: 'text' as const, anchor: { block, offset: from }, focus: { block, offset: to } });

let editors: Editor[] = [];
function make(d: Doc = doc(p('a', 'hello world')), options: ConstructorParameters<typeof Editor>[0] = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const e = new Editor({ doc: d, ...options });
  e.mount(root);
  editors.push(e);
  return e;
}
const block = (e: Editor, id: string) => e.getJSON().blocks.find((b) => b.id === id) ?? e.getJSON().blocks.flatMap((b) => b.children ?? []).find((b) => b.id === id);
afterEach(() => {
  editors.forEach((e) => e.destroy());
  editors = [];
  document.body.replaceChildren();
});

describe('lifecycle and state', () => {
  it('mount renders the document; destroy stops input handling', () => {
    const e = make();
    expect(e.dom?.classList.contains('bw-editor')).toBe(true);
    expect(e.blockElement('a')?.textContent).toBe('hello world');
    const dom = e.dom!;
    e.destroy();
    expect(e.dom).toBeNull();
    dom.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'x', cancelable: true }));
    expect(e.getJSON().blocks[0]!.text).toBe('hello world');
  });

  it('options, state, getJSON, selection and setSelection', () => {
    const e = make(undefined, { placeholder: 'Write' });
    expect(e.options.placeholder).toBe('Write');
    expect(e.state.doc).toBe(e.getJSON());
    e.setSelection(at('a', 5));
    expect(e.selection).toEqual(at('a', 5));
    expect(e.state.selection).toEqual(at('a', 5));
  });

  it('on() returns an unsubscribe; update and change fire on edits', () => {
    const e = make();
    const changes: EditorEvents['change'][] = [];
    const off = e.on('change', (c) => changes.push(c));
    e.setSelection(at('a', 5));
    e.insertText('!');
    off();
    e.insertText('?');
    expect(changes).toHaveLength(1);
    expect(changes[0]!.doc.blocks[0]!.text).toBe('hello! world');
  });

  it('setDoc replaces the document and refuses invalid ones; replaceContent is undoable', () => {
    const e = make();
    expect(e.setDoc(doc(p('b', 'new')))).toBe(true);
    expect(e.getJSON().blocks[0]!.id).toBe('b');
    expect(e.setDoc({ version: 1, blocks: [{ id: 'x', type: 'script', text: '' }] } as unknown as Doc)).toBe(false);
    expect(e.replaceContent(doc(p('c', 'restored')))).toBe(true);
    expect(e.getJSON().blocks[0]!.text).toBe('restored');
    expect(e.undo()).toBe(true);
    expect(e.getJSON().blocks[0]!.id).toBe('b');
    expect(e.redo()).toBe(true);
    expect(e.getJSON().blocks[0]!.id).toBe('c');
  });

  it('setEditable / isEditable; a read-only editor can still take focus', () => {
    const e = make();
    e.setEditable(false);
    expect(e.isEditable).toBe(false);
    expect(e.dom!.getAttribute('contenteditable')).toBe('false');
    expect(e.dom!.tabIndex).toBe(0);
    e.setSelection(at('a', 0));
    expect(e.insertText('x')).toBe(false);
    e.setEditable(true);
    expect(e.isEditable).toBe(true);
  });

  it('focus and hasFocus', () => {
    const e = make();
    e.dom!.tabIndex = 0; // jsdom does not treat contenteditable as focusable
    e.focus();
    expect(e.hasFocus).toBe(true);
  });

  it('run and dispatch apply transactions', () => {
    const e = make();
    e.setSelection(at('a', 0));
    expect(e.run((tr) => (tr.insertText({ block: 'a', offset: 0 }, '1'), true))).toBe(true);
    const tr = e.state.tr();
    tr.insertText({ block: 'a', offset: 0 }, '2');
    expect(e.dispatch(tr)).toBe(true);
    expect(e.getJSON().blocks[0]!.text).toBe('21hello world');
    expect(e.run(() => false)).toBe(false);
  });

  it('applyRemote applies a collaborator\'s change without entering the local undo history', () => {
    const e = make();
    const other = make();
    let remote: Transaction | null = null;
    other.on('change', (c) => (remote = c.tr));
    other.setSelection(at('a', 11));
    other.insertText('!');
    expect(e.applyRemote(remote!)).toBe(true);
    expect(e.getJSON().blocks[0]!.text).toBe('hello world!');
    expect(e.undo()).toBe(false);
  });

  it('addKeyHandler runs before the editor and can consume a key', () => {
    const e = make();
    const seen: string[] = [];
    const off = e.addKeyHandler((k) => (seen.push(k.key), k.key === 'Tab'));
    const ev = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true });
    e.dom!.dispatchEvent(ev);
    expect(seen).toEqual(['Tab']);
    expect(ev.defaultPrevented).toBe(true);
    off();
  });
});

describe('formatting', () => {
  it('toggleMark, setColor, setHighlight, setLink, linkAtSelection, activeState', () => {
    const e = make();
    e.setSelection(range('a', 0, 5));
    expect(e.toggleMark('bold')).toBe(true);
    expect(e.activeState().marks.bold).toBe(true);
    expect(e.setColor('red')).toBe(true);
    expect(e.setHighlight('yellow')).toBe(true);
    expect(e.setLink('https://example.com')).toBe(true);
    expect(e.linkAtSelection()).toMatchObject({ href: 'https://example.com', block: 'a', from: 0, to: 5 });
    expect(e.setLink('javascript:alert(1)')).toBe(false);
    expect(e.getJSON().blocks[0]!.marks!.map((m) => m.type).sort()).toEqual(['bold', 'color', 'highlight', 'link']);
  });

  it('setBlockKind, toggleBlockKind, insertKind, setAlign', () => {
    const e = make(doc(p('a', 'x'), p('b', '')));
    e.setSelection(at('a', 0));
    expect(e.setBlockKind('heading2')).toBe(true);
    expect(block(e, 'a')).toMatchObject({ type: 'heading', attrs: { level: 2 } });
    expect(e.toggleBlockKind('heading2')).toBe(true);
    expect(block(e, 'a')!.type).toBe('paragraph');
    expect(e.setAlign('center')).toBe(true);
    expect(block(e, 'a')!.attrs).toEqual({ align: 'center' });
    // insertKind on a block with text adds a new block after it.
    expect(e.insertKind('bullet')).toBe(true);
    expect(e.getJSON().blocks.map((b) => b.type)).toEqual(['paragraph', 'listItem', 'paragraph']);
  });

  it('indent, outdent, toggleChecked', () => {
    const e = make(doc(p('a', 'one', { type: 'listItem', attrs: { style: 'todo' } }), p('b', 'two', { type: 'listItem', attrs: { style: 'todo' } })));
    e.setSelection(at('b', 0));
    expect(e.indent()).toBe(true);
    expect(block(e, 'b')!.attrs?.indent).toBe(1);
    expect(e.outdent()).toBe(true);
    expect(block(e, 'b')!.attrs?.indent).toBeUndefined();
    expect(e.toggleChecked('a')).toBe(true);
    expect(block(e, 'a')!.attrs?.checked).toBe(true);
  });

  it('allows and characterCount', () => {
    const e = make(doc(p('a', 'hello')), { allowedBlocks: ['paragraph'] });
    expect(e.allows('paragraph')).toBe(true);
    expect(e.allows('table')).toBe(false);
    expect(e.characterCount()).toBe(5);
  });

  it('conversionLoss reports what turning into code would drop', () => {
    const e = make(doc(p('a', 'bold', { marks: [{ type: 'bold', from: 0, to: 4 }] })));
    e.setSelection(at('a', 0));
    expect(e.conversionLoss('code')).toMatchObject({ marks: 1 });
  });
});

describe('inserting and editing blocks', () => {
  it('insertText, insertMention, insertDivider, insertCode, insertTable', () => {
    const e = make(doc(p('a', 'hi')), { mentions: true });
    e.setSelection(at('a', 2));
    expect(e.insertText(' ')).toBe(true);
    expect(e.insertMention('u_1')).toBe(true);
    expect(block(e, 'a')!.entities).toEqual([{ at: 3, type: 'mention', attrs: { userId: 'u_1' } }]);
    expect(e.insertDivider()).toBe(true);
    expect(e.insertCode('typescript')).toBe(true);
    expect(e.getJSON().blocks.find((b) => b.type === 'code')!.attrs).toEqual({ language: 'typescript' });
    expect(e.insertTable(2, 2)).toBe(true);
    const table = e.getJSON().blocks.find((b) => b.type === 'table')!;
    expect(table.children).toHaveLength(2);
  });

  it('insertImage accepts https and refuses other schemes with feedback; setImageAttrs', () => {
    const e = make();
    const feedback = vi.fn();
    e.on('feedback', feedback);
    e.setSelection(at('a', 11));
    expect(e.insertImage({ src: 'http://insecure.example/a.png' })).toBe(false);
    expect(feedback).toHaveBeenCalledWith(expect.objectContaining({ code: 'image-src' }));
    expect(e.insertImage({ src: 'https://example.com/a.png', alt: 'a' })).toBe(true);
    const img = e.getJSON().blocks.find((b) => b.type === 'image')!;
    expect(e.setImageAttrs(img.id, { align: 'full', alt: 'b' })).toBe(true);
    expect(block(e, img.id)!.attrs).toMatchObject({ align: 'full', alt: 'b' });
  });

  it('insertOverflow adds text that did not fit as paragraphs', () => {
    const e = make();
    expect(e.insertOverflow('a', 'more')).toBe(true);
    expect(e.getJSON().blocks.map((b) => b.text)).toEqual(['hello world', 'more']);
  });

  it('setCodeLanguage', () => {
    const e = make(doc({ id: 'c', type: 'code', text: 'x' }));
    expect(e.setCodeLanguage('c', 'python')).toBe(true);
    expect(block(e, 'c')!.attrs).toEqual({ language: 'python' });
  });

  it('deleteBlock, duplicateBlock, selectNode, selectBlockContent', () => {
    const e = make(doc(p('a', 'one'), p('b', 'two')));
    expect(e.duplicateBlock('a')).toBe(true);
    expect(e.getJSON().blocks.map((b) => b.text)).toEqual(['one', 'one', 'two']);
    expect(e.deleteBlock('b')).toBe(true);
    expect(e.getJSON().blocks.map((b) => b.text)).toEqual(['one', 'one']);
    e.selectNode('a');
    expect(e.selection).toEqual({ type: 'node', block: 'a' });
    e.selectBlockContent('a');
    expect(e.selection).toEqual(range('a', 0, 3));
  });

  it('moveBlock and moveBlockBy, taking nested list items along', () => {
    const li = (id: string, indent?: number): Block => ({ id, type: 'listItem', text: id, attrs: { style: 'bullet', ...(indent ? { indent } : {}) } });
    const e = make(doc(li('a'), li('a1', 1), li('b')));
    expect(e.moveBlockBy('a', 1)).toBe(true);
    expect(e.getJSON().blocks.map((b) => b.id)).toEqual(['b', 'a', 'a1']);
    expect(e.moveBlock('b', 2)).toBe(true);
    expect(e.getJSON().blocks.map((b) => b.id)).toEqual(['a', 'a1', 'b']);
  });
});

describe('tables', () => {
  it('addRow, addColumn, deleteRow, deleteColumn, moveColumn, tableContext', () => {
    const e = make(doc(p('x', '')));
    e.setSelection(at('x', 0));
    e.insertTable(2, 2);
    const first = () => {
      const t = e.getJSON().blocks.find((b) => b.type === 'table')!;
      return t.children![0]!.children![0]!.children![0]!.id;
    };
    const size = () => {
      const t = e.getJSON().blocks.find((b) => b.type === 'table')!;
      return [t.children!.length, t.children![0]!.children!.length];
    };
    expect(e.tableContext(first())).toMatchObject({ row: 0, col: 0, rows: 2, cols: 2 });
    e.addRow(first(), 'after');
    e.addColumn(first(), 'after');
    expect(size()).toEqual([3, 3]);
    e.deleteRow(first());
    e.deleteColumn(first());
    expect(size()).toEqual([2, 2]);
    const id = first();
    e.moveColumn(id, 1);
    expect(e.tableContext(id)).toMatchObject({ col: 1 });
  });
});

describe('menus', () => {
  it('startSlash opens the slash menu; runSlash replaces "/query"; closeSlash removes a button-typed "/"', () => {
    const e = make(doc(p('a', '')));
    e.setSelection(at('a', 0));
    e.startSlash();
    expect(e.slash).toMatchObject({ block: 'a', from: 0 });
    e.runSlash((ed) => ed.setBlockKind('heading1'));
    expect(block(e, 'a')).toMatchObject({ type: 'heading', text: '' });
    e.startSlash();
    e.closeSlash();
    expect(block(e, 'a')!.text).toBe('');
    expect(e.slash).toBeNull();
  });

  it('insertSlashAfter adds a line for the menu; cancelling removes it in one step', () => {
    const e = make(doc(p('a', 'one')));
    e.insertSlashAfter('a');
    expect(e.getJSON().blocks.map((b) => b.text)).toEqual(['one', '/']);
    e.closeSlash();
    expect(e.getJSON().blocks.map((b) => b.text)).toEqual(['one']);
  });

  it('startMention, runMention and closeMention', () => {
    const e = make(doc(p('a', 'hi')), { mentions: true });
    e.setSelection(at('a', 2));
    e.startMention();
    expect(e.mention).toMatchObject({ block: 'a' });
    e.runMention('u_1');
    expect(block(e, 'a')!.entities?.[0]).toMatchObject({ type: 'mention', attrs: { userId: 'u_1' } });
    e.startMention();
    e.closeMention();
    expect(e.mention).toBeNull();
  });
});

describe('uploads', () => {
  it('uploadImages inserts each image when its upload resolves; dismissUpload clears a failure', async () => {
    let fail = false;
    const e = make(undefined, {
      uploadImage: async () => {
        if (fail) throw new Error('nope');
        return { src: 'https://cdn.example/x.png' };
      },
    });
    e.setSelection(at('a', 11));
    e.uploadImages([new File(['x'], 'x.png', { type: 'image/png' })]);
    await vi.waitFor(() => expect(e.getJSON().blocks.some((b) => b.type === 'image')).toBe(true));
    fail = true;
    e.uploadImages([new File(['y'], 'y.png', { type: 'image/png' })]);
    await vi.waitFor(() => expect(e.uploads.some((u) => u.error)).toBe(true));
    e.dismissUpload(e.uploads[0]!.id);
    expect(e.uploads).toHaveLength(0);
  });
});

describe('search', () => {
  it('find, findNext, search, selectSearchMatch, clearSearch', () => {
    const e = make(doc(p('a', 'cat dog cat'), p('b', 'cat')));
    e.find('cat');
    expect(e.search).toMatchObject({ query: 'cat', count: 3, index: 0 });
    e.findNext();
    expect(e.search?.index).toBe(1);
    e.findNext(-1);
    e.findNext(-1);
    expect(e.search?.index).toBe(2);
    expect(e.selectSearchMatch()).toBe(true);
    expect(e.selection).toEqual(range('b', 0, 3));
    expect(e.selectedText()).toBe('cat');
    e.clearSearch();
    expect(e.search).toBeNull();
  });
});

describe('clipboard', () => {
  it('pasteData converts HTML; pasteAsPlainText swaps the last paste for its text', () => {
    const e = make(doc(p('a', '')));
    e.setSelection(at('a', 0));
    // jsdom has no DataTransfer; pasteData only reads data and files.
    const data: Record<string, string> = { 'text/html': '<h2>Title</h2><p><b>bold</b></p>', 'text/plain': 'Title\nbold' };
    e.pasteData({ getData: (t: string) => data[t] ?? '', files: [] } as unknown as DataTransfer);
    expect(e.getJSON().blocks.map((b) => b.type)).toEqual(['heading', 'paragraph']);
    expect(e.pasteAsPlainText()).toBe(true);
    expect(e.getJSON().blocks.map((b) => [b.type, b.text])).toEqual([
      ['paragraph', 'Title'],
      ['paragraph', 'bold'],
    ]);
  });

  it('sliceSelection and Editor.toPlainText', () => {
    const e = make(doc(p('a', 'hello world'), p('b', 'second')), { mentionLabel: (id) => id.toUpperCase() });
    e.setSelection({ type: 'text', anchor: { block: 'a', offset: 6 }, focus: { block: 'b', offset: 3 } });
    const slice = e.sliceSelection()!;
    expect(slice.blocks.map((b) => b.text)).toEqual(['world', 'sec']);
    expect(Editor.toPlainText(slice)).toBe('world\nsec');
  });
});

describe('view helpers', () => {
  it('setHighlights and setBlockClasses decorate without changing the document', () => {
    const e = make(doc(p('a', 'one'), p('b', 'two')));
    const before = e.getJSON();
    e.setHighlights('note', [{ block: 'a', from: 0, to: 3 }]);
    e.setBlockClasses('mark', { b: 'is-marked' });
    expect(e.blockElement('b')!.classList.contains('is-marked')).toBe(true);
    expect(e.getJSON()).toBe(before);
  });

  it('virtual and stats: large documents render only part of the blocks', () => {
    const blocks = Array.from({ length: 50 }, (_, i) => p(`p${i}`, `line ${i}`));
    const e = make(doc(...blocks), { virtualizeAbove: 10 });
    expect(e.virtual).toBe(true);
    expect(e.stats()).toMatchObject({ blocks: 50, topLevel: 50, virtual: true });
  });

  it('revealBlock with select puts the caret in the block; focusEnd goes to the end', () => {
    const e = make(doc(p('a', 'one'), { id: 'c', type: 'code', text: 'x' }));
    e.revealBlock('a', { select: true });
    expect(e.selection).toEqual(at('a', 0));
    e.focusEnd();
    // After a trailing code block, a new paragraph is added for the caret.
    expect(e.getJSON().blocks.at(-1)!.type).toBe('paragraph');
  });

  it('rectAt, selectionRect, selectionBounds and scrollCaretIntoView are safe to call without layout', () => {
    const e = make();
    e.setSelection(at('a', 2));
    expect(() => e.rectAt({ block: 'a', offset: 2 })).not.toThrow();
    expect(() => e.selectionRect()).not.toThrow();
    expect(() => e.selectionBounds()).not.toThrow();
    expect(() => e.scrollCaretIntoView()).not.toThrow();
  });
});
