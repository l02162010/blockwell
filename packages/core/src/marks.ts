import { spec } from '@blockwell/schema';
import type { Attrs, Entity, Mark } from './types.js';

export const OBJ = '\uFFFC';

const attrsKey = (attrs: Attrs | undefined) => (attrs ? JSON.stringify(Object.entries(attrs).sort()) : '');
export const sameMark = (a: Mark, b: Mark) => a.type === b.type && attrsKey(a.attrs) === attrsKey(b.attrs);

function copy(m: Mark, from: number, to: number): Mark {
  return m.attrs ? { type: m.type, from, to, attrs: m.attrs } : { type: m.type, from, to };
}

/**
 * Canonical form: no empty ranges, ranges of the same type and attributes merged when they
 * touch or overlap, sorted by `from`, then `type`, then `to`.
 */
export function normalizeMarks(marks: readonly Mark[]): Mark[] {
  const groups = new Map<string, Mark[]>();
  for (const m of marks) {
    if (m.to <= m.from) continue;
    const key = m.type + '\0' + attrsKey(m.attrs);
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }
  const out: Mark[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.from - b.from);
    let cur = copy(list[0]!, list[0]!.from, list[0]!.to);
    for (let i = 1; i < list.length; i++) {
      const m = list[i]!;
      if (m.from <= cur.to) cur.to = Math.max(cur.to, m.to);
      else {
        out.push(cur);
        cur = copy(m, m.from, m.to);
      }
    }
    out.push(cur);
  }
  return out.sort((a, b) => a.from - b.from || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) || a.to - b.to);
}

/** Inserts `len` units at `offset`. Marks spanning the point are split around it; `inserted` covers the new text. */
export function insertIntoMarks(marks: readonly Mark[], offset: number, len: number, inserted: readonly Mark[]): Mark[] {
  const out: Mark[] = [];
  for (const m of marks) {
    if (m.to <= offset) out.push(m);
    else if (m.from >= offset) out.push(copy(m, m.from + len, m.to + len));
    else {
      out.push(copy(m, m.from, offset));
      out.push(copy(m, offset + len, m.to + len));
    }
  }
  for (const m of inserted) out.push(copy(m, m.from + offset, m.to + offset));
  return normalizeMarks(out);
}

/** Removes [from, to). Returns the remaining marks and the removed parts, relative to `from`. */
export function deleteFromMarks(marks: readonly Mark[], from: number, to: number): { kept: Mark[]; removed: Mark[] } {
  const len = to - from;
  const kept: Mark[] = [];
  const removed: Mark[] = [];
  for (const m of marks) {
    const a = Math.max(m.from, from), b = Math.min(m.to, to);
    if (a < b) removed.push(copy(m, a - from, b - from));
    if (m.from < from) kept.push(copy(m, m.from, Math.min(m.to, from)));
    if (m.to > to) kept.push(copy(m, Math.max(m.from, to) - len, m.to - len));
  }
  return { kept: normalizeMarks(kept), removed: normalizeMarks(removed) };
}

export function sliceMarks(marks: readonly Mark[], from: number, to: number): Mark[] {
  return deleteFromMarks(marks, from, to).removed;
}

export function insertIntoEntities(entities: readonly Entity[], offset: number, len: number, inserted: readonly Entity[]): Entity[] {
  const out = entities.map((e) => (e.at >= offset ? { ...e, at: e.at + len } : e));
  for (const e of inserted) out.push({ ...e, at: e.at + offset });
  return out.sort((a, b) => a.at - b.at);
}

export function deleteFromEntities(entities: readonly Entity[], from: number, to: number): { kept: Entity[]; removed: Entity[] } {
  const kept: Entity[] = [];
  const removed: Entity[] = [];
  for (const e of entities) {
    if (e.at < from) kept.push(e);
    else if (e.at >= to) kept.push({ ...e, at: e.at - (to - from) });
    else removed.push({ ...e, at: e.at - from });
  }
  return { kept, removed };
}

/** Subtracts every range in `cut` from `ranges`. */
function subtract(ranges: [number, number][], cut: [number, number][]): [number, number][] {
  let out = ranges;
  for (const [cf, ct] of cut) {
    const next: [number, number][] = [];
    for (const [f, t] of out) {
      if (ct <= f || cf >= t) next.push([f, t]);
      else {
        if (f < cf) next.push([f, cf]);
        if (ct < t) next.push([ct, t]);
      }
    }
    out = next;
  }
  return out;
}

/**
 * Sets mark `type` on [from, to) to `attrs`, or clears it when `attrs` is null. Keeps the schema's
 * rules: one range per type at any point, and `excludes: '*'` marks (inline code) never overlap others.
 */
export function setMarkOnRange(
  marks: readonly Mark[],
  type: string,
  from: number,
  to: number,
  attrs: Attrs | null,
): Mark[] {
  const exclusive = spec.marks[type]?.excludes === '*';
  let out: Mark[] = [];
  for (const m of marks) {
    const clears = m.type === type || (attrs !== null && exclusive);
    if (!clears || m.to <= from || m.from >= to) out.push(m);
    else {
      if (m.from < from) out.push(copy(m, m.from, from));
      if (m.to > to) out.push(copy(m, to, m.to));
    }
  }
  if (attrs !== null) {
    let ranges: [number, number][] = [[from, to]];
    if (!exclusive) {
      const blockers = out.filter((m) => spec.marks[m.type]?.excludes === '*').map((m) => [m.from, m.to] as [number, number]);
      ranges = subtract(ranges, blockers);
    }
    const hasAttrs = Object.keys(attrs).length > 0;
    for (const [f, t] of ranges) out.push(hasAttrs ? { type, from: f, to: t, attrs } : { type, from: f, to: t });
  }
  out = normalizeMarks(out);
  return out;
}

/** True when every unit of [from, to) carries mark `type` (any attributes). */
export function rangeHasMark(marks: readonly Mark[], type: string, from: number, to: number): boolean {
  if (from >= to) return false;
  const ranges = marks.filter((m) => m.type === type).map((m) => [m.from, m.to] as [number, number]);
  return subtract([[from, to]], ranges).length === 0;
}

/** The single value of an attribute mark over [from, to): the token, `null` when absent, `'mixed'` otherwise. */
export function rangeMarkValue(marks: readonly Mark[], type: string, from: number, to: number): string | null {
  const values = new Set<string | null>();
  const covered: [number, number][] = [];
  for (const m of marks) {
    if (m.type !== type || m.to <= from || m.from >= to) continue;
    values.add(String(Object.values(m.attrs ?? {})[0] ?? ''));
    covered.push([Math.max(m.from, from), Math.min(m.to, to)]);
  }
  if (subtract([[from, to]], covered).length > 0) values.add(null);
  if (values.size === 1) return [...values][0]!;
  return values.size === 0 ? null : 'mixed';
}

/** Marks that typed text at `offset` inherits: those covering the unit before it (at offset 0, the unit after). */
export function marksAt(marks: readonly Mark[], offset: number): Mark[] {
  const probe = offset > 0 ? offset - 1 : 0;
  return marks.filter(
    (m) =>
      m.from <= probe &&
      probe < m.to &&
      // Links do not grow at their edges.
      !(m.type === 'link' && (m.to === offset || m.from === offset)),
  );
}
