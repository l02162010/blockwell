import { validate, type ValidationError } from '@blockwell/schema';
import { deleteFromEntities, deleteFromMarks, normalizeMarks } from './marks.js';
import { emptyParagraph, getBlock, mustLocate, tidy } from './model.js';
import { applyOp } from './ops.js';
import type { Attrs, Block, Doc, Entity, Mark, Op, Origin, Pos, Selection, Transaction } from './types.js';

export class EditorState {
  constructor(
    readonly doc: Doc,
    readonly selection: Selection | null,
  ) {}

  static create(doc?: Doc): EditorState {
    const d = doc && doc.blocks.length > 0 ? doc : { version: 1 as const, blocks: [emptyParagraph()] };
    return new EditorState(d, null);
  }

  tr(origin: Origin = 'user'): Tr {
    return new Tr(this, origin);
  }
}

export type ApplyResult =
  | { ok: true; state: EditorState; tr: Transaction }
  | { ok: false; errors: ValidationError[] | string };

/**
 * Builds a transaction step by step. Every helper applies its op immediately, so later steps see
 * the result of earlier ones and each op records the exact data its inverse needs.
 */
export class Tr {
  doc: Doc;
  ops: Op[] = [];
  selection: Selection | null;
  mergeable = false;
  /** Text a command could not insert because the block hit `limits.maxTextLength`. */
  dropped: { block: string; text: string } | null = null;

  constructor(
    readonly before: EditorState,
    readonly origin: Origin,
  ) {
    this.doc = before.doc;
    this.selection = before.selection;
  }

  step(op: Op): this {
    this.doc = applyOp(this.doc, op);
    this.ops.push(op);
    return this;
  }

  get changed(): boolean {
    return this.ops.length > 0;
  }

  block(id: string): Block {
    return mustLocate(this.doc, id).block;
  }

  insertText(pos: Pos, text: string, marks: Mark[] = [], entities: Entity[] = []): this {
    if (!text) return this;
    return this.step({ type: 'insertText', block: pos.block, offset: pos.offset, text, marks, entities });
  }

  deleteText(block: string, from: number, to: number): this {
    if (to <= from) return this;
    const b = this.block(block);
    const text = (b.text ?? '').slice(from, to);
    return this.step({
      type: 'deleteText',
      block,
      from,
      text,
      marks: deleteFromMarks(b.marks ?? [], from, to).removed,
      entities: deleteFromEntities(b.entities ?? [], from, to).removed,
    });
  }

  setMarks(block: string, after: Mark[]): this {
    const before = this.block(block).marks ?? [];
    const next = normalizeMarks(after);
    if (JSON.stringify(before) === JSON.stringify(next)) return this;
    return this.step({ type: 'setMarks', block, before, after: next });
  }

  setAttrs(block: string, after: Attrs | undefined): this {
    const before = this.block(block).attrs;
    const clean = after && Object.keys(after).length > 0 ? after : undefined;
    if (JSON.stringify(before ?? null) === JSON.stringify(clean ?? null)) return this;
    return this.step({ type: 'setAttrs', block, before, after: clean });
  }

  updateAttrs(block: string, patch: Record<string, string | number | boolean | undefined>): this {
    const next: Attrs = { ...(this.block(block).attrs ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    return this.setAttrs(block, next);
  }

  setType(block: string, type: string): this {
    const before = this.block(block).type;
    if (before === type) return this;
    return this.step({ type: 'setType', block, before, after: type });
  }

  insertBlock(parent: string | null, index: number, block: Block): this {
    return this.step({ type: 'insertBlock', parent, index, block: tidy(block) });
  }

  removeBlock(id: string): this {
    const loc = mustLocate(this.doc, id);
    return this.step({ type: 'removeBlock', parent: loc.parent, index: loc.index, block: loc.block });
  }

  /** Moves a block by removing and re-inserting it. */
  moveBlock(id: string, parent: string | null, index: number): this {
    const block = this.block(id);
    this.removeBlock(id);
    return this.insertBlock(parent, index, block);
  }

  setSelection(sel: Selection | null): this {
    this.selection = sel;
    return this;
  }

  /** Keeps structural invariants that individual edits can break, then validates. */
  finish(): ApplyResult {
    this.fixStructure();
    const result = validate(this.doc);
    if (!result.ok) return { ok: false, errors: result.errors };
    let selection = this.selection;
    if (selection && !selectionFits(this.doc, selection)) selection = null;
    const tr: Transaction = {
      ops: this.ops,
      selectionBefore: this.before.selection,
      selectionAfter: selection,
      meta: { origin: this.origin, time: Date.now(), mergeable: this.mergeable },
    };
    return { ok: true, state: new EditorState(this.doc, selection), tr };
  }

  private fixStructure() {
    // Containers that lost all their children.
    let again = true;
    while (again) {
      again = false;
      const visit = (list: Block[]) => {
        for (const b of list) {
          if (again) return;
          if (b.type === 'tableCell' && (b.children ?? []).length === 0) {
            this.insertBlock(b.id, 0, emptyParagraph());
            again = true;
          } else if ((b.type === 'quote' || b.type === 'table' || b.type === 'tableRow') && (b.children ?? []).length === 0) {
            this.removeBlock(b.id);
            again = true;
          } else if (b.children) visit(b.children);
        }
      };
      visit(this.doc.blocks);
    }
    if (this.doc.blocks.length === 0) this.insertBlock(null, 0, emptyParagraph());
    // Spec §2.3: a list item is at most one level deeper than the one before it.
    const fixList = (list: Block[]) => {
      let prev: number | null = null;
      for (const b of list) {
        if (b.type === 'listItem') {
          const max: number = prev === null ? 0 : prev + 1;
          const indent = Number(b.attrs?.indent ?? 0);
          if (indent > max) {
            this.updateAttrs(b.id, { indent: max || undefined });
            prev = max;
          } else prev = indent;
        } else prev = null;
        if (b.type === 'quote' && b.children) fixList(this.block(b.id).children ?? []);
      }
    };
    fixList(this.doc.blocks);
  }
}

function selectionFits(doc: Doc, sel: Selection): boolean {
  if (sel.type === 'node') return !!getBlock(doc, sel.block);
  const ok = (p: Pos) => {
    const b = getBlock(doc, p.block);
    return !!b && b.text !== undefined && p.offset >= 0 && p.offset <= b.text.length;
  };
  return ok(sel.anchor) && ok(sel.focus);
}

/** Applies a finished transaction (for example an undo, or a remote change) to a state. */
export function applyTransaction(state: EditorState, tr: Transaction, origin: Origin): ApplyResult {
  const t = state.tr(origin);
  try {
    for (const op of tr.ops) t.step(op);
  } catch (e) {
    return { ok: false, errors: String(e) };
  }
  t.setSelection(tr.selectionAfter);
  return t.finish();
}
