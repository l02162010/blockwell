import type { Attrs, Block, Doc, Entity, Mark } from '@blockwell/schema';

export type { Attrs, Block, Doc, Entity, Mark };

/** A position inside a text block. `offset` counts UTF-16 code units, like JS string indices. */
export interface Pos {
  block: string;
  offset: number;
}

export type Selection =
  | { type: 'text'; anchor: Pos; focus: Pos }
  /** An atom block (image, divider) selected as a whole. */
  | { type: 'node'; block: string };

/**
 * Every change to a document is one of these. Each op carries what its inverse needs, so
 * `invertOp` never reads the document. Mark and entity offsets inside `insertText` / `deleteText`
 * are relative to the inserted or removed text.
 */
export type Op =
  | { type: 'insertText'; block: string; offset: number; text: string; marks: Mark[]; entities: Entity[] }
  | { type: 'deleteText'; block: string; from: number; text: string; marks: Mark[]; entities: Entity[] }
  | { type: 'setMarks'; block: string; before: Mark[]; after: Mark[] }
  | { type: 'setAttrs'; block: string; before: Attrs | undefined; after: Attrs | undefined }
  | { type: 'setType'; block: string; before: string; after: string }
  | { type: 'insertBlock'; parent: string | null; index: number; block: Block }
  | { type: 'removeBlock'; parent: string | null; index: number; block: Block };

export type Origin = 'user' | 'history' | 'remote';

export interface Transaction {
  ops: Op[];
  selectionBefore: Selection | null;
  selectionAfter: Selection | null;
  meta: { origin: Origin; time: number; /** Ops that may merge with the previous history entry. */ mergeable?: boolean };
}

/** Block kinds offered by toolbars and the slash menu. */
export type BlockKind =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'ordered'
  | 'todo'
  | 'quote'
  | 'code';

export interface ActiveState {
  /** Marks without attributes that cover the whole selection. */
  marks: { bold: boolean; italic: boolean; underline: boolean; strike: boolean; code: boolean };
  /** Palette token when the whole selection has one color, `null` for none, `'mixed'` otherwise. */
  color: string | null;
  highlight: string | null;
  link: string | null;
  blockKind: BlockKind | null;
  canUndo: boolean;
  canRedo: boolean;
  collapsed: boolean;
  /** Text block that holds the focus, when there is one. */
  focusBlock: string | null;
  /** Block type of the focused block, or of the selected node. */
  focusType: string | null;
  inTable: boolean;
  inCode: boolean;
}
