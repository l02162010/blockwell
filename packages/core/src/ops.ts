import { deleteFromEntities, deleteFromMarks, insertIntoEntities, insertIntoMarks, normalizeMarks } from './marks.js';
import { mustLocate, tidy, updateAt, updateChildren } from './model.js';
import type { Doc, Op } from './types.js';

/** Applies one op. Throws when the op does not fit the document (wrong block, out-of-range offset). */
export function applyOp(doc: Doc, op: Op): Doc {
  switch (op.type) {
    case 'insertText': {
      const loc = mustLocate(doc, op.block);
      const text = loc.block.text ?? '';
      if (op.offset < 0 || op.offset > text.length) throw new Error('insertText: offset out of range');
      return updateAt(doc, loc.path, (b) =>
        tidy({
          ...b,
          text: text.slice(0, op.offset) + op.text + text.slice(op.offset),
          marks: insertIntoMarks(b.marks ?? [], op.offset, op.text.length, op.marks),
          entities: insertIntoEntities(b.entities ?? [], op.offset, op.text.length, op.entities),
        }),
      );
    }
    case 'deleteText': {
      const loc = mustLocate(doc, op.block);
      const text = loc.block.text ?? '';
      const to = op.from + op.text.length;
      if (text.slice(op.from, to) !== op.text) throw new Error('deleteText: text mismatch');
      return updateAt(doc, loc.path, (b) =>
        tidy({
          ...b,
          text: text.slice(0, op.from) + text.slice(to),
          marks: deleteFromMarks(b.marks ?? [], op.from, to).kept,
          entities: deleteFromEntities(b.entities ?? [], op.from, to).kept,
        }),
      );
    }
    case 'setMarks': {
      const loc = mustLocate(doc, op.block);
      return updateAt(doc, loc.path, (b) => tidy({ ...b, marks: normalizeMarks(op.after) }));
    }
    case 'setAttrs': {
      const loc = mustLocate(doc, op.block);
      return updateAt(doc, loc.path, (b) => {
        const out = { ...b };
        if (op.after === undefined) delete out.attrs;
        else out.attrs = op.after;
        return tidy(out);
      });
    }
    case 'setType': {
      const loc = mustLocate(doc, op.block);
      if (loc.block.type !== op.before) throw new Error('setType: type mismatch');
      return updateAt(doc, loc.path, (b) => ({ ...b, type: op.after }));
    }
    case 'insertBlock':
      return updateChildren(doc, op.parent, (list) => {
        if (op.index < 0 || op.index > list.length) throw new Error('insertBlock: index out of range');
        return [...list.slice(0, op.index), op.block, ...list.slice(op.index)];
      });
    case 'removeBlock':
      return updateChildren(doc, op.parent, (list) => {
        if (list[op.index]?.id !== op.block.id) throw new Error('removeBlock: block mismatch');
        return [...list.slice(0, op.index), ...list.slice(op.index + 1)];
      });
  }
}

export function invertOp(op: Op): Op {
  switch (op.type) {
    case 'insertText':
      return { type: 'deleteText', block: op.block, from: op.offset, text: op.text, marks: op.marks, entities: op.entities };
    case 'deleteText':
      return { type: 'insertText', block: op.block, offset: op.from, text: op.text, marks: op.marks, entities: op.entities };
    case 'setMarks':
      return { ...op, before: op.after, after: op.before };
    case 'setAttrs':
      return { ...op, before: op.after, after: op.before };
    case 'setType':
      return { ...op, before: op.after, after: op.before };
    case 'insertBlock':
      return { ...op, type: 'removeBlock' };
    case 'removeBlock':
      return { ...op, type: 'insertBlock' };
  }
}

export function invertOps(ops: readonly Op[]): Op[] {
  return ops.map(invertOp).reverse();
}
