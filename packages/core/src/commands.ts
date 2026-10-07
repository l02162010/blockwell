import { isSafeUrl, spec } from '@blockwell/schema';
import { OBJ, marksAt, rangeHasMark, setMarkOnRange, sliceMarks } from './marks.js';
import {
  allBlocks,
  ancestors,
  blocksInRange,
  caret,
  childrenOf,
  emptyParagraph,
  emptyTable,
  isAtom,
  isCollapsed,
  isText,
  locate,
  mustLocate,
  newId,
  selectionRange,
  textBlocks,
  textLength,
  withFreshIds,
} from './model.js';
import type { Tr } from './state.js';
import type { Attrs, Block, BlockKind, Entity, Mark, Pos } from './types.js';

export interface CommandOptions {
  /** Block types the editor may create. `null` allows every type in the schema. */
  allowedBlocks: ReadonlySet<string> | null;
}

export const allows = (o: CommandOptions, type: string) => !o.allowedBlocks || o.allowedBlocks.has(type);

// ---------------------------------------------------------------------------------------------
// Content conversion

export interface Content {
  text: string;
  marks: Mark[];
  entities: Entity[];
}

export function contentOf(b: Block, from = 0, to = textLength(b)): Content {
  const text = (b.text ?? '').slice(from, to);
  return {
    text,
    marks: sliceMarks(b.marks ?? [], from, to),
    entities: (b.entities ?? []).filter((e) => e.at >= from && e.at < to).map((e) => ({ ...e, at: e.at - from })),
  };
}

/** Adapts content to a block type: code keeps plain text only; other text blocks turn newlines into line breaks. */
export function adaptContent(c: Content, type: string): Content {
  const def = spec.blocks[type];
  if (!def || def.content !== 'text') return { text: '', marks: [], entities: [] };
  if (def.newlines) {
    // Into code: line-break entities become newlines, other entities and all marks are dropped.
    let text = '';
    for (let i = 0; i < c.text.length; i++) {
      const ch = c.text[i]!;
      if (ch !== OBJ) text += ch;
      else if (c.entities.find((e) => e.at === i)?.type === 'lineBreak') text += '\n';
    }
    return { text, marks: [], entities: [] };
  }
  if (!c.text.includes('\n')) return c;
  const entities = [...c.entities];
  for (let i = 0; i < c.text.length; i++) if (c.text[i] === '\n') entities.push({ at: i, type: 'lineBreak' });
  return { text: c.text.replace(/\n/g, OBJ), marks: c.marks, entities: entities.sort((a, b) => a.at - b.at) };
}

// ---------------------------------------------------------------------------------------------
// Text editing

/** Deletes the selection. Returns false when there was nothing to delete. */
export function deleteSelection(tr: Tr): boolean {
  const sel = tr.selection;
  if (!sel) return false;
  if (sel.type === 'node') return removeNode(tr, sel.block);
  const r = selectionRange(tr.doc, sel);
  if (!r || isCollapsed(sel)) return false;
  const texts = textBlocks(tr.doc);
  const first = texts[0], last = texts.at(-1);
  const whole = r.from.block === first?.id && r.from.offset === 0 && r.to.block === last?.id && r.to.offset === textLength(last);
  deleteRange(tr, r.from, r.to);
  // Clearing everything leaves a plain paragraph, not an empty copy of the first block's type.
  const left = tr.doc.blocks.length === 1 ? tr.doc.blocks[0]! : null;
  if (whole && left && isText(left) && left.type !== 'paragraph') toParagraph(tr, left.id);
  return true;
}

export function deleteRange(tr: Tr, from: Pos, to: Pos) {
  if (from.block === to.block) {
    tr.deleteText(from.block, from.offset, to.offset);
    tr.setSelection(caret(from.block, from.offset));
    return;
  }
  const order = allBlocks(tr.doc);
  const pos = new Map(order.map((b, i) => [b.id, i]));
  const end = new Map<string, number>();
  const last = (b: Block): number => {
    let e = pos.get(b.id)!;
    for (const c of b.children ?? []) e = last(c);
    end.set(b.id, e);
    return e;
  };
  tr.doc.blocks.forEach(last);
  const ia = pos.get(from.block)!, ib = pos.get(to.block)!;
  const inside = new Set(order.filter((b, i) => i > ia && end.get(b.id)! < ib).map((b) => b.id));
  const maximal = [...inside].filter((id) => {
    const parent = locate(tr.doc, id)!.parent;
    return parent === null || !inside.has(parent);
  });

  tr.deleteText(to.block, 0, to.offset);
  tr.deleteText(from.block, from.offset, textLength(tr.block(from.block)));
  for (const id of maximal) {
    const b = tr.block(id);
    // A cell of a partly covered row is emptied rather than removed, so the table keeps its shape.
    if (b.type === 'tableCell') clearContainer(tr, id);
    else tr.removeBlock(id);
  }

  const la = mustLocate(tr.doc, from.block), lb = mustLocate(tr.doc, to.block);
  if (la.parent === lb.parent && isText(la.block) && isText(lb.block)) mergeInto(tr, from.block, to.block);
  tr.setSelection(caret(from.block, from.offset));
}

function clearContainer(tr: Tr, id: string) {
  const children = tr.block(id).children ?? [];
  children.slice(1).forEach((c) => tr.removeBlock(c.id));
  const first = children[0];
  if (first && isText(first)) {
    tr.deleteText(first.id, 0, textLength(first));
    tr.setMarks(first.id, []);
  }
}

/** Appends `source`'s content to `target` and removes `source`. */
export function mergeInto(tr: Tr, target: string, source: string) {
  const t = tr.block(target), s = tr.block(source);
  const c = adaptContent(contentOf(s), t.type);
  tr.insertText({ block: target, offset: textLength(t) }, c.text, c.marks, c.entities);
  tr.removeBlock(source);
}

function removeNode(tr: Tr, id: string): boolean {
  const list = textBlocks(tr.doc);
  const order = allBlocks(tr.doc);
  const idx = order.findIndex((b) => b.id === id);
  const before = [...list].reverse().find((b) => order.findIndex((x) => x.id === b.id) < idx);
  const after = list.find((b) => order.findIndex((x) => x.id === b.id) > idx);
  tr.removeBlock(id);
  if (before) tr.setSelection(caret(before.id, textLength(tr.block(before.id))));
  else if (after) tr.setSelection(caret(after.id, 0));
  else {
    const p = emptyParagraph();
    tr.insertBlock(null, 0, p);
    tr.setSelection(caret(p.id, 0));
  }
  return true;
}


/**
 * Cuts content that would push a block past `limits.maxTextLength`. The cut-off text is kept on
 * `tr.dropped` so the editor can tell the user and offer to put it in a new paragraph.
 */
function clampContent(tr: Tr, b: Block, c: Content): Content {
  const room = spec.limits.maxTextLength - textLength(b);
  if (c.text.length <= room) return c;
  let at = Math.max(0, room);
  if (at > 0 && at < c.text.length && isLowSurrogate(c.text.charCodeAt(at))) at--;
  const rest = c.text.slice(at).replace(/\uFFFC/g, '');
  tr.dropped = { block: b.id, text: (tr.dropped?.block === b.id ? tr.dropped.text : '') + rest };
  return {
    text: c.text.slice(0, at),
    marks: sliceMarks(c.marks, 0, at),
    entities: c.entities.filter((e) => e.at < at),
  };
}

const isLowSurrogate = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/** Splits text into paragraphs no longer than the block limit. */
export function overflowToBlocks(text: string): Block[] {
  const max = spec.limits.maxTextLength;
  const out: Block[] = [];
  for (const line of textToBlocks(text)) {
    const t = line.text ?? '';
    for (let i = 0; i < Math.max(1, t.length); i += max) out.push({ id: newId(), type: 'paragraph', text: t.slice(i, i + max) });
  }
  return out;
}

/** What converting the selection to `kind` would remove: only code blocks drop marks and mentions. */
export function conversionLoss(tr: Tr, kind: BlockKind): { marks: number; types: string[]; mentions: number } {
  const out = { marks: 0, types: [] as string[], mentions: 0 };
  if (kind !== 'code') return out;
  const types = new Set<string>();
  for (const { block } of segments(tr)) {
    if (block.type === 'code') continue;
    for (const m of block.marks ?? []) {
      out.marks++;
      types.add(m.type);
    }
    out.mentions += (block.entities ?? []).filter((e) => e.type === 'mention').length;
  }
  out.types = [...types];
  return out;
}

/** Inserts text at the selection, replacing any selected content. */
export function insertText(tr: Tr, text: string, stored: Mark[] | null): boolean {
  if (!tr.selection) return false;
  if (tr.selection.type === 'node') return false;
  deleteSelection(tr);
  const sel = tr.selection;
  if (!sel || sel.type !== 'text') return false;
  const pos = sel.focus;
  const b = tr.block(pos.block);
  const def = spec.blocks[b.type]!;
  const c = clampContent(tr, b, adaptContent({ text, marks: [], entities: [] }, b.type));
  let marks: Mark[] = [];
  if (def.marks !== undefined && (def.marks === '*' || def.marks.length > 0) && c.text) {
    const active = stored ?? marksAt(b.marks ?? [], pos.offset);
    marks = active.map((m) => (m.attrs ? { type: m.type, from: 0, to: c.text.length, attrs: m.attrs } : { type: m.type, from: 0, to: c.text.length }));
  }
  tr.insertText(pos, c.text, marks, c.entities);
  tr.setSelection(caret(pos.block, pos.offset + c.text.length));
  return true;
}

export function insertEntity(tr: Tr, type: string, attrs?: Attrs): boolean {
  if (!tr.selection || tr.selection.type !== 'text') return false;
  deleteSelection(tr);
  const pos = (tr.selection as { focus: Pos }).focus;
  const b = tr.block(pos.block);
  if (spec.blocks[b.type]?.entities === false) {
    if (type === 'lineBreak') return insertText(tr, '\n', null);
    return false;
  }
  tr.insertText(pos, OBJ, [], [attrs ? { at: 0, type, attrs } : { at: 0, type }]);
  tr.setSelection(caret(pos.block, pos.offset + 1));
  return true;
}

/** Enter. */
/** Adds an empty paragraph after a top-level block (or after the table/quote holding it) and moves the caret there. */
export function exitBlock(tr: Tr, id: string): boolean {
  const top = [tr.block(id), ...ancestors(tr.doc, id)].pop()!;
  const loc = mustLocate(tr.doc, top.id);
  const next = (loc.parent ? tr.block(loc.parent).children : tr.doc.blocks)?.[loc.index + 1];
  if (next?.type === 'paragraph' && !next.text) {
    tr.setSelection(caret(next.id, 0));
    return true;
  }
  const p = emptyParagraph();
  tr.insertBlock(loc.parent, loc.index + 1, p);
  tr.setSelection(caret(p.id, 0));
  return true;
}

/**
 * The Insert menu and slash commands: an empty text block becomes `kind`; a block with text
 * keeps it and gets a new `kind` block after it (after the table or quote when inside one).
 */
export function insertKind(tr: Tr, kind: BlockKind, opts: CommandOptions): boolean {
  const sel = tr.selection;
  if (sel?.type !== 'text') return setBlockKind(tr, kind, opts);
  const b = tr.block(sel.focus.block);
  if (isText(b) && textLength(b) === 0) return setBlockKind(tr, kind, opts);
  const top = [b, ...ancestors(tr.doc, b.id)].pop()!;
  const loc = mustLocate(tr.doc, top.id);
  const p = emptyParagraph();
  tr.insertBlock(loc.parent, loc.index + 1, p);
  tr.setSelection(caret(p.id, 0));
  return kind === 'paragraph' || setBlockKind(tr, kind, opts);
}

export function splitBlock(tr: Tr): boolean {
  if (tr.selection?.type === 'node') {
    // Enter on a selected image or divider adds a paragraph after it.
    const loc = mustLocate(tr.doc, tr.selection.block);
    const p = emptyParagraph();
    tr.insertBlock(loc.parent, loc.index + 1, p);
    tr.setSelection(caret(p.id, 0));
    return true;
  }
  deleteSelection(tr);
  const sel = tr.selection;
  if (!sel || sel.type !== 'text') return false;
  const pos = sel.focus;
  const b = tr.block(pos.block);
  const loc = mustLocate(tr.doc, b.id);
  const len = textLength(b);

  if (spec.blocks[b.type]?.newlines) {
    // Enter on an empty last line leaves the code block, like a quote.
    if (pos.offset === len && len > 0 && (b.text ?? '').endsWith('\n')) {
      tr.deleteText(b.id, len - 1, len);
      return exitBlock(tr, b.id);
    }
    return insertText(tr, '\n', null);
  }

  if (b.type === 'listItem' && len === 0) {
    const indent = Number(b.attrs?.indent ?? 0);
    if (indent > 0) tr.updateAttrs(b.id, { indent: indent - 1 || undefined });
    else toParagraph(tr, b.id);
    return true;
  }

  const parent = loc.parent ? tr.block(loc.parent) : null;
  if (parent?.type === 'quote' && len === 0 && loc.index === (parent.children?.length ?? 0) - 1 && loc.index > 0) {
    // Enter on an empty last line leaves the quote.
    const ploc = mustLocate(tr.doc, parent.id);
    tr.removeBlock(b.id);
    tr.insertBlock(ploc.parent, ploc.index + 1, { ...b, type: 'paragraph', attrs: {} });
    tr.setSelection(caret(b.id, 0));
    return true;
  }

  const attrs = attrsForSplit(b);
  if (pos.offset === 0 && len > 0) {
    const type = b.type === 'heading' ? 'paragraph' : b.type;
    tr.insertBlock(loc.parent, loc.index, { id: newId(), type, text: '', attrs: type === b.type ? attrs : {} });
    tr.setSelection(caret(b.id, 0));
    return true;
  }
  const tail = contentOf(b, pos.offset, len);
  tr.deleteText(b.id, pos.offset, len);
  const type = b.type === 'heading' && tail.text.length === 0 ? 'paragraph' : b.type;
  const id = newId();
  tr.insertBlock(loc.parent, loc.index + 1, {
    id,
    type,
    attrs: type === b.type ? attrs : {},
    text: tail.text,
    marks: tail.marks,
    entities: tail.entities,
  });
  tr.setSelection(caret(id, 0));
  return true;
}

function attrsForSplit(b: Block): Attrs {
  const a = { ...(b.attrs ?? {}) };
  if (b.type === 'listItem') delete a.checked;
  return a;
}

function toParagraph(tr: Tr, id: string) {
  const b = tr.block(id);
  const align = b.type === 'heading' || b.type === 'paragraph' ? b.attrs?.align : undefined;
  if (spec.blocks[b.type]?.newlines) {
    const c = adaptContent(contentOf(b), 'paragraph');
    tr.deleteText(id, 0, textLength(b));
    tr.setAttrs(id, undefined);
    tr.setType(id, 'paragraph');
    tr.insertText({ block: id, offset: 0 }, c.text, c.marks, c.entities);
    return;
  }
  tr.setAttrs(id, align ? { align } : undefined);
  tr.setType(id, 'paragraph');
}

/** Backspace with a collapsed selection at the start of a block, or with a node selected. */
export function joinBackward(tr: Tr): boolean {
  const sel = tr.selection;
  if (!sel) return false;
  if (sel.type === 'node') return removeNode(tr, sel.block);
  if (!isCollapsed(sel) || sel.focus.offset !== 0) return false;
  const b = tr.block(sel.focus.block);
  const loc = mustLocate(tr.doc, b.id);

  if (b.type === 'listItem') {
    const indent = Number(b.attrs?.indent ?? 0);
    if (indent > 0) tr.updateAttrs(b.id, { indent: indent - 1 || undefined });
    else toParagraph(tr, b.id);
    return true;
  }
  if (b.type === 'heading' || (spec.blocks[b.type]?.newlines && textLength(b) === 0)) {
    toParagraph(tr, b.id);
    return true;
  }
  // A code block with content is never merged away by Backspace at its start.
  if (spec.blocks[b.type]?.newlines) return true;
  const siblings = childrenOf(tr.doc, loc.parent);
  const parent = loc.parent ? tr.block(loc.parent) : null;
  if (loc.index === 0) {
    if (parent?.type === 'quote') {
      const ploc = mustLocate(tr.doc, parent.id);
      tr.removeBlock(b.id);
      tr.insertBlock(ploc.parent, ploc.index, b);
      tr.setSelection(caret(b.id, 0));
    }
    return true;
  }
  const prev = siblings[loc.index - 1]!;
  if (isText(prev)) {
    const at = textLength(prev);
    mergeInto(tr, prev.id, b.id);
    tr.setSelection(caret(prev.id, at));
    return true;
  }
  if (isAtom(prev)) {
    if (textLength(b) === 0) tr.removeBlock(b.id);
    tr.setSelection({ type: 'node', block: prev.id });
    return true;
  }
  if (prev.type === 'quote') {
    const lastChild = prev.children?.[prev.children.length - 1];
    if (lastChild && isText(lastChild)) {
      const at = textLength(lastChild);
      mergeInto(tr, lastChild.id, b.id);
      tr.setSelection(caret(lastChild.id, at));
    }
    return true;
  }
  if (textLength(b) === 0) {
    tr.removeBlock(b.id);
    const cells = textBlocks({ version: 1, blocks: [prev] });
    const target = cells[cells.length - 1];
    if (target) tr.setSelection(caret(target.id, textLength(target)));
  }
  return true;
}

/** Delete with a collapsed selection at the end of a block. */
export function joinForward(tr: Tr): boolean {
  const sel = tr.selection;
  if (!sel) return false;
  if (sel.type === 'node') return removeNode(tr, sel.block);
  if (!isCollapsed(sel)) return false;
  const b = tr.block(sel.focus.block);
  if (sel.focus.offset !== textLength(b)) return false;
  const loc = mustLocate(tr.doc, b.id);
  const next = childrenOf(tr.doc, loc.parent)[loc.index + 1];
  if (!next) return true;
  if (isText(next)) mergeInto(tr, b.id, next.id);
  else if (isAtom(next)) tr.setSelection({ type: 'node', block: next.id });
  else if (next.type === 'quote') {
    const first = next.children?.[0];
    if (first && isText(first)) mergeInto(tr, b.id, first.id);
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Marks

/** Segments of the selection: one [from, to) per text block. */
export function segments(tr: Tr): { block: Block; from: number; to: number }[] {
  const r = selectionRange(tr.doc, tr.selection);
  if (!r) return [];
  return blocksInRange(tr.doc, r.from, r.to).map((b) => ({
    block: b,
    from: b.id === r.from.block ? r.from.offset : 0,
    to: b.id === r.to.block ? r.to.offset : textLength(b),
  }));
}

const markAllowed = (b: Block, type: string) => {
  const m = spec.blocks[b.type]?.marks;
  return m === '*' || (Array.isArray(m) && m.includes(type));
};

/** Toggles a mark without attributes over a non-empty selection. */
export function toggleMark(tr: Tr, type: string): boolean {
  const segs = segments(tr).filter((s) => s.to > s.from && markAllowed(s.block, type));
  if (segs.length === 0) return false;
  const all = segs.every((s) => rangeHasMark(s.block.marks ?? [], type, s.from, s.to));
  for (const s of segs) tr.setMarks(s.block.id, setMarkOnRange(tr.block(s.block.id).marks ?? [], type, s.from, s.to, all ? null : {}));
  return true;
}

/** Sets or clears (`value` null) an attribute mark such as color, highlight or link. */
export function setMarkValue(tr: Tr, type: string, attrs: Attrs | null): boolean {
  const segs = segments(tr).filter((s) => s.to > s.from && markAllowed(s.block, type));
  if (segs.length === 0) return false;
  for (const s of segs) tr.setMarks(s.block.id, setMarkOnRange(tr.block(s.block.id).marks ?? [], type, s.from, s.to, attrs));
  return true;
}

export const LINK_SCHEMES = (spec.marks.link!.attrs.href as { schemes: readonly string[] }).schemes;
export const IMAGE_SCHEMES = (spec.blocks.image!.attrs.src as { schemes: readonly string[] }).schemes;

/** The range of the link around a collapsed caret, if any. */
export function linkAt(b: Block, offset: number): Mark | undefined {
  return (b.marks ?? []).find((m) => m.type === 'link' && m.from <= offset && offset <= m.to && (m.from < offset || offset < m.to));
}

/**
 * Sets the link of the selection. With a collapsed caret inside a link, edits that link; with a
 * collapsed caret elsewhere, inserts the URL as linked text. Unsafe URLs are refused.
 */
export function setLink(tr: Tr, href: string | null): boolean {
  if (href !== null && !isSafeUrl(href, LINK_SCHEMES)) return false;
  const sel = tr.selection;
  if (!sel || sel.type !== 'text') return false;
  if (isCollapsed(sel)) {
    const b = tr.block(sel.focus.block);
    const link = linkAt(b, sel.focus.offset);
    if (link) {
      tr.setMarks(b.id, setMarkOnRange(b.marks ?? [], 'link', link.from, link.to, href === null ? null : { href }));
      return true;
    }
    if (href === null || !markAllowed(b, 'link')) return false;
    const at = sel.focus.offset;
    tr.insertText(sel.focus, href, [{ type: 'link', from: 0, to: href.length, attrs: { href } }]);
    tr.setSelection(caret(b.id, at + href.length));
    return true;
  }
  return setMarkValue(tr, 'link', href === null ? null : { href });
}

// ---------------------------------------------------------------------------------------------
// Blocks

export function kindOf(b: Block | undefined, parent?: Block | null): BlockKind | null {
  if (!b) return null;
  switch (b.type) {
    case 'paragraph':
      return parent?.type === 'quote' ? 'quote' : 'paragraph';
    case 'heading':
      return `heading${Number(b.attrs?.level ?? 1)}` as BlockKind;
    case 'listItem':
      return String(b.attrs?.style ?? 'bullet') as BlockKind;
    case 'code':
      return 'code';
    default:
      return null;
  }
}

/** Paragraphs and headings keep their alignment when converted into each other. */
const keepAlign = (b: Block, extra: Attrs = {}): Attrs => {
  const align = b.type === 'paragraph' || b.type === 'heading' ? b.attrs?.align : undefined;
  return align ? { ...extra, align } : extra;
};

const KIND: Record<Exclude<BlockKind, 'quote'>, { type: string; attrs: (b: Block) => Attrs }> = {
  paragraph: { type: 'paragraph', attrs: (b) => keepAlign(b) },
  heading1: { type: 'heading', attrs: (b) => keepAlign(b, { level: 1 }) },
  heading2: { type: 'heading', attrs: (b) => keepAlign(b, { level: 2 }) },
  heading3: { type: 'heading', attrs: (b) => keepAlign(b, { level: 3 }) },
  bullet: { type: 'listItem', attrs: (b) => listAttrs(b, 'bullet') },
  ordered: { type: 'listItem', attrs: (b) => listAttrs(b, 'ordered') },
  todo: { type: 'listItem', attrs: (b) => listAttrs(b, 'todo') },
  code: { type: 'code', attrs: () => ({}) },
};

function listAttrs(b: Block, style: string): Attrs {
  const a: Attrs = { style };
  if (b.type === 'listItem' && b.attrs?.indent) a.indent = b.attrs.indent;
  if (style === 'todo' && b.type === 'listItem' && b.attrs?.checked) a.checked = true;
  return a;
}

function parentAllows(tr: Tr, id: string, type: string): boolean {
  const loc = mustLocate(tr.doc, id);
  if (loc.parent === null) return true;
  const kids = spec.blocks[tr.block(loc.parent).type]?.children ?? [];
  return kids.includes(type);
}

/** Converts the selected text blocks to `kind`. Quote wraps or unwraps; code joins nothing and clears marks. */
export function setBlockKind(tr: Tr, kind: BlockKind, o: CommandOptions): boolean {
  if (kind === 'quote') return toggleQuote(tr, o);
  const target = KIND[kind];
  if (!allows(o, target.type)) return false;
  const segs = segments(tr);
  let done = false;
  // Out of a quote: "paragraph" means "not quoted", and a quote cannot hold a code block.
  for (const { block } of segs) {
    const loc = mustLocate(tr.doc, block.id);
    const parent = loc.parent ? tr.block(loc.parent) : null;
    if (parent?.type === 'quote' && (kind === 'paragraph' || !parentAllows(tr, block.id, target.type))) {
      liftFromQuote(tr, block.id);
      done = true;
    }
  }
  if (done && kind === 'paragraph') return true;
  for (const { block } of segs) {
    const b = tr.block(block.id);
    if (!parentAllows(tr, b.id, target.type)) continue;
    if (target.type === 'code' || b.type === 'code') {
      if (b.type === target.type) continue;
      const c = adaptContent(contentOf(b), target.type);
      tr.deleteText(b.id, 0, textLength(b));
      tr.setMarks(b.id, []);
      tr.setAttrs(b.id, target.attrs(b));
      tr.setType(b.id, target.type);
      tr.insertText({ block: b.id, offset: 0 }, c.text, c.marks, c.entities);
    } else {
      tr.setAttrs(b.id, target.attrs(b));
      tr.setType(b.id, target.type);
    }
    done = true;
  }
  return done;
}

/** Moves one block out of its quote, splitting the quote around it when needed. */
function liftFromQuote(tr: Tr, id: string) {
  const loc = mustLocate(tr.doc, id);
  const quote = tr.block(loc.parent!);
  const qloc = mustLocate(tr.doc, quote.id);
  const kids = quote.children ?? [];
  const before = kids.slice(0, loc.index), after = kids.slice(loc.index + 1);
  const b = kids[loc.index]!;
  tr.removeBlock(quote.id);
  let at = qloc.index;
  if (before.length) tr.insertBlock(qloc.parent, at++, { ...quote, children: before });
  tr.insertBlock(qloc.parent, at++, b);
  if (after.length) tr.insertBlock(qloc.parent, at, { id: newId(), type: 'quote', children: after });
}

function toggleQuote(tr: Tr, o: CommandOptions): boolean {
  if (!allows(o, 'quote')) return false;
  const segs = segments(tr);
  if (segs.length === 0) return false;
  const firstLoc = mustLocate(tr.doc, segs[0]!.block.id);
  const parent = firstLoc.parent ? tr.block(firstLoc.parent) : null;
  if (parent?.type === 'quote') {
    // Unwrap the whole quote.
    const ploc = mustLocate(tr.doc, parent.id);
    const kids = parent.children ?? [];
    kids.forEach((k) => tr.removeBlock(k.id));
    kids.forEach((k, i) => tr.insertBlock(ploc.parent, ploc.index + 1 + i, k));
    return true;
  }
  // Wrap the selected top-level blocks.
  const top = segs.map((s) => mustLocate(tr.doc, s.block.id)).filter((l) => l.parent === null);
  if (top.length === 0) return false;
  const from = Math.min(...top.map((l) => l.index)), to = Math.max(...top.map((l) => l.index));
  const blocks = tr.doc.blocks.slice(from, to + 1);
  const allowed = spec.blocks.quote!.children ?? [];
  if (!blocks.every((b) => allowed.includes(b.type))) return false;
  blocks.forEach((b) => tr.removeBlock(b.id));
  tr.insertBlock(null, from, { id: newId(), type: 'quote', children: blocks });
  return true;
}

/** Tab / Shift-Tab on list items. Returns false when no item could move (the view shakes). */
export function indentList(tr: Tr, delta: 1 | -1): boolean {
  const items = segments(tr).map((s) => tr.block(s.block.id)).filter((b) => b.type === 'listItem');
  if (items.length === 0) return false;
  let changed = false;
  const done = new Set<string>();
  const level = (b: Block) => Number(b.attrs?.indent ?? 0);
  for (const item of items) {
    if (done.has(item.id)) continue;
    const loc = mustLocate(tr.doc, item.id);
    const siblings = childrenOf(tr.doc, loc.parent);
    const prev = siblings[loc.index - 1];
    const max = prev?.type === 'listItem' ? level(prev) + 1 : 0;
    const cur = level(item);
    const next = Math.max(0, Math.min(6, Math.min(max, cur + delta)));
    if (next === cur) continue;
    // The items nested under this one move with it.
    const group = [item];
    for (let j = loc.index + 1; j < siblings.length && siblings[j]!.type === 'listItem' && level(siblings[j]!) > cur; j++) group.push(siblings[j]!);
    for (const g of group) {
      if (done.has(g.id)) continue;
      done.add(g.id);
      const n = Math.max(0, Math.min(6, level(g) + next - cur));
      tr.updateAttrs(g.id, { indent: n || undefined });
    }
    changed = true;
  }
  return changed;
}

export function toggleChecked(tr: Tr, id: string): boolean {
  const b = tr.block(id);
  if (b.type !== 'listItem' || b.attrs?.style !== 'todo') return false;
  tr.updateAttrs(id, { checked: b.attrs?.checked ? undefined : true });
  return true;
}

export function setAlign(tr: Tr, align: 'left' | 'center' | 'right'): boolean {
  let done = false;
  for (const { block } of segments(tr)) {
    if (block.type !== 'paragraph' && block.type !== 'heading') continue;
    tr.updateAttrs(block.id, { align: align === 'left' ? undefined : align });
    done = true;
  }
  return done;
}

/** Where a block of `type` can go after the focus: the nearest ancestor level that accepts it. */
function insertionPoint(tr: Tr, focus: string, type: string): { parent: string | null; index: number } {
  const chain = [tr.block(focus), ...ancestors(tr.doc, focus)];
  for (const x of chain) {
    const loc = mustLocate(tr.doc, x.id);
    if (loc.parent === null) return { parent: null, index: loc.index + 1 };
    const kids = spec.blocks[tr.block(loc.parent).type]?.children ?? [];
    if (kids.includes(type)) return { parent: loc.parent, index: loc.index + 1 };
  }
  return { parent: null, index: tr.doc.blocks.length };
}

/**
 * Inserts a new block after the selection. An empty paragraph at the caret is replaced. Atoms get
 * a paragraph after them when they would otherwise end the document.
 */
export function insertBlock(tr: Tr, block: Block, o: CommandOptions): boolean {
  if (!allows(o, block.type)) return false;
  const sel = tr.selection;
  const focus = sel ? (sel.type === 'node' ? sel.block : sel.focus.block) : tr.doc.blocks[tr.doc.blocks.length - 1]?.id;
  if (!focus) return false;
  const f = tr.block(focus);
  let { parent, index } = insertionPoint(tr, focus, block.type);
  const floc = mustLocate(tr.doc, focus);
  const replace = f.type === 'paragraph' && textLength(f) === 0 && floc.parent === parent;
  tr.insertBlock(parent, index, block);
  if (replace) {
    tr.removeBlock(focus);
    index -= 1;
  }
  if (isAtom(block)) {
    const after = childrenOf(tr.doc, parent)[index + 1];
    // A divider continues in a fresh paragraph, not at the start of whatever block follows; an
    // image (which stays selected) only needs one when nothing editable follows it.
    const fresh = block.type === 'image' ? !after || !isText(after) : !after || after.type !== 'paragraph' || textLength(after) > 0;
    if (fresh) tr.insertBlock(parent, index + 1, emptyParagraph());
    tr.setSelection(block.type === 'image' ? { type: 'node', block: block.id } : caret(childrenOf(tr.doc, parent)[index + 1]!.id, 0));
  } else {
    const first = textBlocks({ version: 1, blocks: [block] })[0];
    if (first) tr.setSelection(caret(first.id, 0));
  }
  return true;
}

export const newDivider = (): Block => ({ id: newId(), type: 'divider' });
export const newCode = (language?: string): Block => ({ id: newId(), type: 'code', text: '', ...(language ? { attrs: { language } } : {}) });
export const newImage = (attrs: { src: string; alt?: string; width?: number }): Block => {
  const a: Attrs = { src: attrs.src };
  if (attrs.alt) a.alt = attrs.alt;
  if (attrs.width) a.width = Math.round(attrs.width);
  return { id: newId(), type: 'image', attrs: a };
};
export const newTable = (rows = 3, cols = 3) => emptyTable(rows, cols);

// ---------------------------------------------------------------------------------------------
// Tables

/** Finds the table, row index and column index around any block inside a cell. */
export function cellContext(tr: Tr, id: string) {
  const chain = [tr.block(id), ...ancestors(tr.doc, id)];
  const cell = chain.find((b) => b.type === 'tableCell');
  const row = chain.find((b) => b.type === 'tableRow');
  const table = chain.find((b) => b.type === 'table');
  if (!cell || !row || !table) return null;
  return {
    table,
    row: mustLocate(tr.doc, row.id).index,
    col: mustLocate(tr.doc, cell.id).index,
    rows: table.children ?? [],
  };
}

const newCell = (): Block => ({ id: newId(), type: 'tableCell', children: [emptyParagraph()] });

export function addRow(tr: Tr, id: string, side: 'before' | 'after'): boolean {
  const ctx = cellContext(tr, id);
  if (!ctx || ctx.rows.length >= spec.limits.maxTableRows) return false;
  const cols = ctx.rows[0]?.children?.length ?? 1;
  const row: Block = { id: newId(), type: 'tableRow', children: Array.from({ length: cols }, newCell) };
  tr.insertBlock(ctx.table.id, ctx.row + (side === 'after' ? 1 : 0), row);
  tr.setSelection(caret(row.children![Math.min(ctx.col, cols - 1)]!.children![0]!.id, 0));
  return true;
}

export function addColumn(tr: Tr, id: string, side: 'before' | 'after'): boolean {
  const ctx = cellContext(tr, id);
  if (!ctx || (ctx.rows[0]?.children?.length ?? 0) >= spec.limits.maxTableColumns) return false;
  const at = ctx.col + (side === 'after' ? 1 : 0);
  let focus: string | null = null;
  ctx.rows.forEach((r, i) => {
    const cell = newCell();
    tr.insertBlock(r.id, at, cell);
    if (i === ctx.row) focus = cell.children![0]!.id;
  });
  if (focus) tr.setSelection(caret(focus, 0));
  return true;
}

export function deleteRow(tr: Tr, id: string): boolean {
  const ctx = cellContext(tr, id);
  if (!ctx) return false;
  if (ctx.rows.length <= 1) return removeNode(tr, ctx.table.id);
  tr.removeBlock(ctx.rows[ctx.row]!.id);
  const row = tr.block(ctx.table.id).children![Math.min(ctx.row, ctx.rows.length - 2)]!;
  tr.setSelection(caret(textBlocks({ version: 1, blocks: [row.children![Math.min(ctx.col, row.children!.length - 1)]!] })[0]!.id, 0));
  return true;
}

export function deleteColumn(tr: Tr, id: string): boolean {
  const ctx = cellContext(tr, id);
  if (!ctx) return false;
  const cols = ctx.rows[0]?.children?.length ?? 0;
  if (cols <= 1) return removeNode(tr, ctx.table.id);
  ctx.rows.forEach((r) => tr.removeBlock(r.children![ctx.col]!.id));
  const row = tr.block(ctx.table.id).children![ctx.row]!;
  tr.setSelection(caret(textBlocks({ version: 1, blocks: [row.children![Math.min(ctx.col, cols - 2)]!] })[0]!.id, 0));
  return true;
}

/** Moves a column one step left or right. */
export function moveColumn(tr: Tr, id: string, delta: -1 | 1): boolean {
  const ctx = cellContext(tr, id);
  if (!ctx) return false;
  const cols = ctx.rows[0]?.children?.length ?? 0;
  const to = ctx.col + delta;
  if (to < 0 || to >= cols) return false;
  ctx.rows.forEach((r) => tr.moveBlock(r.children![ctx.col]!.id, r.id, to));
  return true;
}

// ---------------------------------------------------------------------------------------------
// Fragments (paste, drop)

/**
 * Inserts blocks at the selection. A single text block is merged into the current line; several
 * blocks split the current one around them. Blocks the destination cannot hold become paragraphs
 * or are dropped.
 */
export function insertFragment(tr: Tr, blocks: Block[], o: CommandOptions): boolean {
  if (blocks.length === 0) return false;
  if (tr.selection?.type === 'node') {
    const loc = mustLocate(tr.doc, tr.selection.block);
    const p = emptyParagraph();
    tr.insertBlock(loc.parent, loc.index + 1, p);
    tr.setSelection(caret(p.id, 0));
  }
  deleteSelection(tr);
  const sel = tr.selection;
  if (!sel || sel.type !== 'text') return false;
  const pos = sel.focus;
  const cur = tr.block(pos.block);
  const loc = mustLocate(tr.doc, cur.id);
  const parentType = loc.parent ? tr.block(loc.parent).type : null;
  const fits = (b: Block) =>
    allows(o, b.type) && (parentType === null ? !spec.blocks[b.type]?.nestedOnly : (spec.blocks[parentType]?.children ?? []).includes(b.type));
  const prepared: Block[] = [];
  for (const raw of blocks) {
    const b = withFreshIds(raw);
    if (fits(b)) prepared.push(b);
    else if (isText(b)) {
      const c = adaptContent(contentOf(b), 'paragraph');
      prepared.push({ id: b.id, type: 'paragraph', text: c.text, marks: c.marks, entities: c.entities });
    } else if (b.children) {
      for (const t of textBlocks({ version: 1, blocks: [b] })) {
        const c = adaptContent(contentOf(t), 'paragraph');
        prepared.push({ id: newId(), type: 'paragraph', text: c.text, marks: c.marks, entities: c.entities });
      }
    }
  }
  if (prepared.length === 0) return false;
  for (const b of prepared) {
    const len = textLength(b);
    if (!isText(b) || len <= spec.limits.maxTextLength) continue;
    const cut = clampContent(tr, { ...b, text: '' }, contentOf(b));
    b.text = cut.text;
    b.marks = cut.marks;
    b.entities = cut.entities;
  }

  const first = prepared[0]!;
  // An empty paragraph takes the type of the first pasted block (a heading stays a heading).
  if (cur.type === 'paragraph' && textLength(cur) === 0 && isText(first) && first.type !== 'paragraph' && fits(first)) {
    tr.setAttrs(cur.id, first.attrs);
    tr.setType(cur.id, first.type);
  }
  const target = tr.block(cur.id);
  if (prepared.length === 1 && isText(first)) {
    const c = clampContent(tr, target, adaptContent(contentOf(first), target.type));
    tr.insertText(pos, c.text, c.marks, c.entities);
    tr.setSelection(caret(cur.id, pos.offset + c.text.length));
    return true;
  }

  // Split off the tail of the current block.
  const len = textLength(cur);
  const tail = contentOf(cur, pos.offset, len);
  // Pasted structure (a heading, a list, code) starts its own block rather than melting into the
  // line the caret is on; plain paragraphs, or more of the same kind, continue that line.
  const merge = isText(first) && (textLength(cur) === 0 || first.type === 'paragraph' || first.type === cur.type);
  if (!merge) {
    tr.deleteText(cur.id, pos.offset, len);
    let at = pos.offset === 0 && len > 0 ? loc.index : loc.index + 1;
    if (pos.offset === 0 && len > 0) tr.insertText({ block: cur.id, offset: 0 }, tail.text, tail.marks, tail.entities);
    let lastId: string | null = null;
    for (const b of prepared) {
      tr.insertBlock(loc.parent, at++, b);
      lastId = b.id;
    }
    if (pos.offset > 0 && pos.offset < len) {
      const c = adaptContent(tail, cur.type);
      tr.insertBlock(loc.parent, at, { id: newId(), type: cur.type, attrs: attrsForSplit(cur), text: c.text, marks: c.marks, entities: c.entities });
    }
    const lastBlock = lastId ? tr.block(lastId) : null;
    if (lastBlock && isText(lastBlock)) tr.setSelection(caret(lastBlock.id, textLength(lastBlock)));
    else if (lastBlock) tr.setSelection({ type: 'node', block: lastBlock.id });
    return true;
  }
  tr.deleteText(cur.id, pos.offset, len);
  let rest = prepared;
  let index = loc.index + 1;
  if (isText(first)) {
    const c = clampContent(tr, tr.block(cur.id), adaptContent(contentOf(first), target.type));
    tr.insertText({ block: cur.id, offset: pos.offset }, c.text, c.marks, c.entities);
    rest = prepared.slice(1);
  }
  let lastText: string | null = rest.length === 0 ? cur.id : null;
  for (const b of rest) {
    tr.insertBlock(loc.parent, index++, b);
    lastText = isText(b) ? b.id : null;
  }
  let caretAt: Pos;
  if (lastText) {
    const at = textLength(tr.block(lastText));
    const c = adaptContent(tail, tr.block(lastText).type);
    tr.insertText({ block: lastText, offset: at }, c.text, c.marks, c.entities);
    caretAt = { block: lastText, offset: at };
  } else {
    const p: Block = { id: newId(), type: 'paragraph', text: tail.text, marks: tail.marks, entities: tail.entities };
    const c = adaptContent(tail, 'paragraph');
    tr.insertBlock(loc.parent, index, { ...p, text: c.text, marks: c.marks, entities: c.entities });
    caretAt = { block: p.id, offset: 0 };
  }
  tr.setSelection(caret(caretAt.block, caretAt.offset));
  return true;
}

/** Plain-text fragment: one paragraph per line. */
export function textToBlocks(text: string): Block[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => ({ id: newId(), type: 'paragraph', text: line.replace(/[\u0000-\u0008\u000B-\u001F\u007F\uFFFC]/g, '') }));
}
