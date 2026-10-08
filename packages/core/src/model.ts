import { spec } from '@blockwell/schema';
import type { Block, Doc, Pos, Selection } from './types.js';

export interface Location {
  block: Block;
  parent: string | null;
  index: number;
  /** Indices from the document root down to this block. */
  path: number[];
}

const indexCache = new WeakMap<Doc, Map<string, Location>>();

function buildIndex(doc: Doc): Map<string, Location> {
  const map = new Map<string, Location>();
  const walk = (list: Block[], parent: string | null, base: number[]) => {
    list.forEach((block, index) => {
      const path = [...base, index];
      map.set(block.id, { block, parent, index, path });
      if (block.children) walk(block.children, block.id, path);
    });
  };
  walk(doc.blocks, null, []);
  return map;
}

function index(doc: Doc): Map<string, Location> {
  let map = indexCache.get(doc);
  if (!map) {
    map = buildIndex(doc);
    indexCache.set(doc, map);
  }
  return map;
}

export function locate(doc: Doc, id: string): Location | undefined {
  return index(doc).get(id);
}

export function getBlock(doc: Doc, id: string): Block | undefined {
  return index(doc).get(id)?.block;
}

export function mustLocate(doc: Doc, id: string): Location {
  const loc = locate(doc, id);
  if (!loc) throw new Error(`blockwell: no block ${id}`);
  return loc;
}

export function childrenOf(doc: Doc, parent: string | null): Block[] {
  if (parent === null) return doc.blocks;
  return getBlock(doc, parent)?.children ?? [];
}

export const isText = (b: Block | undefined) => !!b && spec.blocks[b.type]?.content === 'text';
export const isAtom = (b: Block | undefined) => !!b && spec.blocks[b.type]?.content === 'atom';
export const textLength = (b: Block | undefined) => b?.text?.length ?? 0;

/** Replaces the block at `path` with `fn(block)`, copying only the blocks along the path. */
export function updateAt(doc: Doc, path: number[], fn: (b: Block) => Block): Doc {
  const rec = (list: Block[], depth: number): Block[] => {
    const i = path[depth]!;
    const copy = list.slice();
    if (depth === path.length - 1) copy[i] = fn(list[i]!);
    else copy[i] = { ...list[i]!, children: rec(list[i]!.children ?? [], depth + 1) };
    return copy;
  };
  return { ...doc, blocks: rec(doc.blocks, 0) };
}

/** Replaces the child list of `parent` (null = the document root). */
export function updateChildren(doc: Doc, parent: string | null, fn: (list: Block[]) => Block[]): Doc {
  if (parent === null) return { ...doc, blocks: fn(doc.blocks) };
  const loc = mustLocate(doc, parent);
  return updateAt(doc, loc.path, (b) => ({ ...b, children: fn(b.children ?? []) }));
}

/** All blocks in document (pre-)order. */
export function allBlocks(doc: Doc): Block[] {
  const out: Block[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      out.push(b);
      if (b.children) walk(b.children);
    }
  };
  walk(doc.blocks);
  return out;
}

/** Text blocks in document order: where a caret can be. */
export function textBlocks(doc: Doc): Block[] {
  return allBlocks(doc).filter(isText);
}

function comparePos(doc: Doc, a: Pos, b: Pos): number {
  if (a.block === b.block) return a.offset - b.offset;
  const order = allBlocks(doc);
  return order.findIndex((x) => x.id === a.block) - order.findIndex((x) => x.id === b.block);
}

/** The selection as an ordered [from, to] pair, or null for node selections. */
export function selectionRange(doc: Doc, sel: Selection | null): { from: Pos; to: Pos } | null {
  if (!sel || sel.type !== 'text') return null;
  return comparePos(doc, sel.anchor, sel.focus) <= 0
    ? { from: sel.anchor, to: sel.focus }
    : { from: sel.focus, to: sel.anchor };
}

export const caret = (block: string, offset: number): Selection => ({
  type: 'text',
  anchor: { block, offset },
  focus: { block, offset },
});

export const isCollapsed = (sel: Selection | null) =>
  !!sel && sel.type === 'text' && sel.anchor.block === sel.focus.block && sel.anchor.offset === sel.focus.offset;

/** Text blocks touched by [from, to], in order. */
export function blocksInRange(doc: Doc, from: Pos, to: Pos): Block[] {
  const list = textBlocks(doc);
  const a = list.findIndex((b) => b.id === from.block);
  const b = list.findIndex((x) => x.id === to.block);
  if (a < 0 || b < 0) return [];
  return list.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/** Ancestors of a block, nearest first. */
export function ancestors(doc: Doc, id: string): Block[] {
  const out: Block[] = [];
  let loc = locate(doc, id);
  while (loc && loc.parent !== null) {
    const parent = locate(doc, loc.parent);
    if (!parent) break;
    out.push(parent.block);
    loc = parent;
  }
  return out;
}

let counter = 0;
const rand = () => Math.random().toString(36).slice(2, 8);

/** A fresh block id matching `spec.idPattern`. */
export function newId(): string {
  counter = (counter + 1) % 1_679_616;
  return `b_${rand()}${counter.toString(36)}`;
}

/** A copy of `block` and its descendants with fresh ids. */
export function withFreshIds(block: Block): Block {
  const out: Block = { ...block, id: newId() };
  if (block.children) out.children = block.children.map(withFreshIds);
  return out;
}

export function emptyParagraph(id = newId()): Block {
  return { id, type: 'paragraph', text: '' };
}

/** Drops empty `marks` / `entities` / `attrs` so equal documents compare equal. */
export function tidy(block: Block): Block {
  const out: Block = { ...block };
  if (out.marks && out.marks.length === 0) delete out.marks;
  if (out.entities && out.entities.length === 0) delete out.entities;
  if (out.attrs && Object.keys(out.attrs).length === 0) delete out.attrs;
  return out;
}

export function emptyTable(rows: number, cols: number): Block {
  return {
    id: newId(),
    type: 'table',
    children: Array.from({ length: rows }, () => ({
      id: newId(),
      type: 'tableRow',
      children: Array.from({ length: cols }, () => ({ id: newId(), type: 'tableCell', children: [emptyParagraph()] })),
    })),
  };
}
