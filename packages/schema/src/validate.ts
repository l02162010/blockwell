import { spec, type AttrDefs, type BlockDef } from './spec.js';
import { isSafeUrl } from './url.js';
import type { Doc, ErrorCode, ValidationError, ValidationResult } from './types.js';

const OBJ = '￼';
const KEYS = {
  text: ['id', 'type', 'attrs', 'text', 'marks', 'entities'],
  atom: ['id', 'type', 'attrs'],
  children: ['id', 'type', 'attrs', 'children'],
} as const;
const REQUIRED = {
  text: ['id', 'type', 'text'],
  atom: ['id', 'type'],
  children: ['id', 'type', 'children'],
} as const;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const has = (o: Obj, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;
const ptr = (base: string, key: string | number) =>
  `${base}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;

class Ctx {
  errors: ValidationError[] = [];
  ids = new Set<string>();
  count = 0;
  limitReported = false;
  add(code: ErrorCode, path: string) {
    this.errors.push({ code, path });
  }
}

/** Validates a parsed JSON value against SPEC.md. Never repairs anything. */
export function validate(input: unknown): ValidationResult {
  const ctx = new Ctx();
  if (!isObj(input)) {
    ctx.add('invalid_type', '');
    return { ok: false, errors: ctx.errors };
  }
  for (const k of Object.keys(input)) if (k !== 'version' && k !== 'blocks') ctx.add('unknown_key', ptr('', k));
  if (!has(input, 'version')) ctx.add('missing_key', '/version');
  else if (input.version !== spec.version) ctx.add('unsupported_version', '/version');
  if (!has(input, 'blocks')) ctx.add('missing_key', '/blocks');
  else if (!Array.isArray(input.blocks)) ctx.add('invalid_type', '/blocks');
  else validateList(input.blocks, null, '/blocks', ctx);

  return ctx.errors.length === 0 ? { ok: true, doc: input as unknown as Doc } : { ok: false, errors: ctx.errors };
}

function validateList(list: unknown[], parent: BlockDef | null, path: string, ctx: Ctx) {
  let prevIndent: number | null = null; // indent of the previous sibling when it is a valid listItem
  list.forEach((block, i) => {
    const p = ptr(path, i);
    const indent = validateBlock(block, parent, p, ctx, prevIndent);
    prevIndent = indent;
  });
}

/** Returns the block's indent when it is a listItem with a valid indent, else null. */
function validateBlock(block: unknown, parent: BlockDef | null, path: string, ctx: Ctx, prevIndent: number | null): number | null {
  if (!isObj(block)) {
    ctx.add('invalid_type', path);
    return null;
  }
  ctx.count++;
  if (ctx.count > spec.limits.maxBlocks && !ctx.limitReported) {
    ctx.limitReported = true;
    ctx.add('limit_exceeded', path);
  }

  if (!has(block, 'id')) ctx.add('missing_key', ptr(path, 'id'));
  else if (typeof block.id !== 'string' || !spec.idPattern.test(block.id)) ctx.add('invalid_id', ptr(path, 'id'));
  else if (ctx.ids.has(block.id)) ctx.add('duplicate_id', ptr(path, 'id'));
  else ctx.ids.add(block.id);

  if (!has(block, 'type')) {
    ctx.add('missing_key', ptr(path, 'type'));
    return null;
  }
  const type = block.type;
  const def = typeof type === 'string' && has(spec.blocks as Obj, type) ? spec.blocks[type] : undefined;
  if (!def || typeof type !== 'string') {
    ctx.add('unknown_block_type', ptr(path, 'type'));
    return null;
  }

  if (parent === null ? def.nestedOnly === true : !(parent.children ?? []).includes(type)) {
    ctx.add('invalid_child', ptr(path, 'type'));
  }

  const allowed: readonly string[] = KEYS[def.content];
  for (const k of Object.keys(block)) if (!allowed.includes(k)) ctx.add('unknown_key', ptr(path, k));
  for (const k of REQUIRED[def.content]) if (!has(block, k)) ctx.add('missing_key', ptr(path, k));

  const attrs = validateAttrs(block.attrs, def.attrs, ptr(path, 'attrs'), ctx);

  if (def.content === 'text' && has(block, 'text')) validateInline(block, def, path, ctx);

  if (def.content === 'children' && has(block, 'children')) {
    if (!Array.isArray(block.children)) ctx.add('invalid_type', ptr(path, 'children'));
    else {
      if (type === 'table') validateTableShape(block.children, path, ctx);
      validateList(block.children, def, ptr(path, 'children'), ctx);
    }
  }

  if (type !== 'listItem') return null;
  const indent = attrs?.indent ?? 0;
  if (typeof indent !== 'number' || !Number.isInteger(indent)) return null;
  const max = prevIndent === null ? 0 : prevIndent + 1;
  if (indent > max) ctx.add('invalid_indent', ptr(ptr(path, 'attrs'), 'indent'));
  return indent;
}

/** Checks attrs; returns them (as an object) when they are an object, else undefined. */
function validateAttrs(value: unknown, defs: AttrDefs, path: string, ctx: Ctx): Obj | undefined {
  let attrs: Obj = {};
  if (value !== undefined) {
    if (!isObj(value)) {
      ctx.add('invalid_type', path);
      return undefined;
    }
    attrs = value;
  }
  for (const k of Object.keys(attrs)) if (!has(defs as Obj, k)) ctx.add('unknown_attr', ptr(path, k));
  for (const [name, def] of Object.entries(defs)) {
    if (!has(attrs, name)) {
      if (def.required) ctx.add('missing_attr', ptr(path, name));
      continue;
    }
    if (!checkAttr(attrs[name], def)) ctx.add('invalid_attr', ptr(path, name));
  }
  return attrs;
}

function checkAttr(v: unknown, def: AttrDefs[string]): boolean {
  switch (def.type) {
    case 'enum':
      return (typeof v === 'string' || typeof v === 'number') && def.values.includes(v);
    case 'int':
      return typeof v === 'number' && Number.isInteger(v) && v >= def.min && v <= def.max;
    case 'bool':
      return typeof v === 'boolean';
    case 'string':
      return typeof v === 'string' && v.length <= def.maxLength;
    case 'id':
      return typeof v === 'string' && spec.idPattern.test(v);
    case 'url':
      return isSafeUrl(v, def.schemes);
  }
}

function validateTableShape(rows: unknown[], path: string, ctx: Ctx) {
  if (rows.length > spec.limits.maxTableRows) ctx.add('limit_exceeded', ptr(path, 'children'));
  let width: number | null = null;
  rows.forEach((row, i) => {
    if (!isObj(row) || !Array.isArray(row.children)) return; // reported by the row's own checks
    const n = row.children.length;
    if (n > spec.limits.maxTableColumns) ctx.add('limit_exceeded', ptr(ptr(ptr(path, 'children'), i), 'children'));
    if (n === 0 || (width !== null && n !== width)) ctx.add('table_shape', ptr(ptr(path, 'children'), i));
    width ??= n;
  });
}

function validateInline(block: Obj, def: BlockDef, path: string, ctx: Ctx) {
  const text = block.text;
  const tp = ptr(path, 'text');
  if (typeof text !== 'string') {
    ctx.add('invalid_text', tp);
    return;
  }
  if (text.length > spec.limits.maxTextLength) ctx.add('limit_exceeded', tp);
  if (!isCleanText(text, def.newlines === true)) ctx.add('invalid_text', tp);

  // Marks
  type Range = { type: string; from: number; to: number };
  const ranges: Range[] = [];
  if (has(block, 'marks')) {
    const mp = ptr(path, 'marks');
    if (!Array.isArray(block.marks)) ctx.add('invalid_type', mp);
    else {
      if (block.marks.length > spec.limits.maxMarksPerBlock) ctx.add('limit_exceeded', mp);
      block.marks.slice(0, spec.limits.maxMarksPerBlock).forEach((mark, i) => {
        const p = ptr(mp, i);
        if (!isObj(mark)) return ctx.add('invalid_type', p);
        for (const k of Object.keys(mark)) if (!['type', 'from', 'to', 'attrs'].includes(k)) ctx.add('unknown_key', ptr(p, k));
        const mtype = mark.type;
        const mdef = typeof mtype === 'string' && has(spec.marks as Obj, mtype) ? spec.marks[mtype] : undefined;
        if (!mdef || typeof mtype !== 'string') return ctx.add('unknown_mark_type', ptr(p, 'type'));
        if (def.marks !== '*' && !(def.marks ?? []).includes(mtype)) ctx.add('mark_not_allowed', ptr(p, 'type'));
        validateAttrs(mark.attrs, mdef.attrs, ptr(p, 'attrs'), ctx);
        const { from, to } = mark;
        if (
          typeof from !== 'number' || typeof to !== 'number' ||
          !Number.isInteger(from) || !Number.isInteger(to) ||
          from < 0 || from >= to || to > text.length ||
          splitsPair(text, from) || splitsPair(text, to)
        ) {
          return ctx.add('invalid_range', p);
        }
        ranges.push({ type: mtype, from, to });
      });
    }
  }
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i]!, b = ranges[j]!;
      if (a.from >= b.to || b.from >= a.to) continue;
      const exclusive = spec.marks[a.type]?.excludes === '*' || spec.marks[b.type]?.excludes === '*';
      if (a.type === b.type || exclusive) {
        ctx.add('mark_overlap', ptr(ptr(path, 'marks'), j));
      }
    }
  }

  // Entities
  const ep = ptr(path, 'entities');
  const placeholders: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] === OBJ) placeholders.push(i);
  if (def.entities === false) {
    const count = Array.isArray(block.entities) ? block.entities.length : 0;
    if (placeholders.length > 0 || count > 0) ctx.add('entity_mismatch', ep);
    return;
  }
  const seen = new Set<number>();
  let mismatch = false;
  if (has(block, 'entities')) {
    if (!Array.isArray(block.entities)) return ctx.add('invalid_type', ep);
    if (block.entities.length > spec.limits.maxEntitiesPerBlock) ctx.add('limit_exceeded', ep);
    block.entities.slice(0, spec.limits.maxEntitiesPerBlock).forEach((ent, i) => {
      const p = ptr(ep, i);
      if (!isObj(ent)) return ctx.add('invalid_type', p);
      for (const k of Object.keys(ent)) if (!['at', 'type', 'attrs'].includes(k)) ctx.add('unknown_key', ptr(p, k));
      const etype = ent.type;
      const edef = typeof etype === 'string' && has(spec.entities as Obj, etype) ? spec.entities[etype] : undefined;
      if (!edef) ctx.add('unknown_entity_type', ptr(p, 'type'));
      else validateAttrs(ent.attrs, edef.attrs, ptr(p, 'attrs'), ctx);
      const at = ent.at;
      if (typeof at !== 'number' || !Number.isInteger(at) || text[at] !== OBJ || seen.has(at)) mismatch = true;
      else seen.add(at);
    });
  }
  if (seen.size !== placeholders.length) mismatch = true;
  if (mismatch) ctx.add('entity_mismatch', ep);
}

function splitsPair(text: string, offset: number): boolean {
  return offset > 0 && offset < text.length && isHigh(text.charCodeAt(offset - 1)) && isLow(text.charCodeAt(offset));
}

function isCleanText(text: string, newlines: boolean): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x0a) {
      if (!newlines) return false;
      continue;
    }
    if (c === 0x09) continue;
    if (c < 0x20 || c === 0x7f) return false;
    if (isHigh(c)) {
      if (i + 1 >= text.length || !isLow(text.charCodeAt(i + 1))) return false;
      i++;
      continue;
    }
    if (isLow(c)) return false;
  }
  return true;
}
