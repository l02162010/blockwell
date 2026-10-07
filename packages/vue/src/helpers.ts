import { caret, getBlock, newId, type Editor } from '@blockwell/core';

/** Puts the caret in an empty paragraph after the top-level block `id`, reusing `id` when it is one. */
export function emptyParagraphAfter(editor: Editor, id: string) {
  const b = getBlock(editor.getJSON(), id);
  if (b?.type === 'paragraph' && !b.text) {
    editor.setSelection(caret(id, 0));
    return;
  }
  editor.run((tr) => {
    const index = tr.doc.blocks.findIndex((x) => x.id === id);
    if (index < 0) return false;
    const p = { id: newId(), type: 'paragraph', text: '' };
    tr.insertBlock(null, index + 1, p);
    tr.setSelection(caret(p.id, 0));
    return true;
  });
}
