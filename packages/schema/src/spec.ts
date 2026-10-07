import raw from '../../../spec/schema.json';

export type AttrDef =
  | { type: 'enum'; values: readonly (string | number)[]; required?: boolean; default?: unknown }
  | { type: 'int'; min: number; max: number; required?: boolean; default?: unknown }
  | { type: 'bool'; required?: boolean; default?: unknown }
  | { type: 'string'; maxLength: number; required?: boolean; default?: unknown }
  | { type: 'url'; schemes: readonly string[]; required?: boolean; default?: unknown }
  | { type: 'id'; required?: boolean; default?: unknown };

export type AttrDefs = Readonly<Record<string, AttrDef>>;

export interface BlockDef {
  content: 'text' | 'atom' | 'children';
  attrs: AttrDefs;
  marks?: '*' | readonly string[];
  entities?: boolean;
  newlines?: boolean;
  children?: readonly string[];
  nestedOnly?: boolean;
}

export interface MarkDef {
  attrs: AttrDefs;
  excludes?: '*';
}

export interface EntityDef {
  attrs: AttrDefs;
}

export interface Spec {
  version: number;
  limits: {
    maxBlocks: number;
    maxTextLength: number;
    maxUrlLength: number;
    maxAltLength: number;
    maxIdLength: number;
    maxTableColumns: number;
    maxTableRows: number;
    maxMarksPerBlock: number;
    maxEntitiesPerBlock: number;
  };
  idPattern: RegExp;
  palette: readonly string[];
  blocks: Readonly<Record<string, BlockDef>>;
  marks: Readonly<Record<string, MarkDef>>;
  entities: Readonly<Record<string, EntityDef>>;
}

/** Follows a "$a.b" reference into schema.json; any other value is returned as is. */
function resolve(value: unknown): unknown {
  if (typeof value !== 'string' || !value.startsWith('$')) return value;
  let node: unknown = raw;
  for (const key of value.slice(1).split('.')) {
    node = (node as Record<string, unknown>)[key];
    if (node === undefined) throw new Error(`schema.json: unresolved reference ${value}`);
  }
  return node;
}

function resolveAttrs(attrs: Record<string, Record<string, unknown>> | undefined): AttrDefs {
  const out: Record<string, AttrDef> = {};
  for (const [name, def] of Object.entries(attrs ?? {})) {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(def)) resolved[k] = resolve(v);
    out[name] = resolved as unknown as AttrDef;
  }
  return out;
}

function build(): Spec {
  const blocks: Record<string, BlockDef> = {};
  for (const [name, def] of Object.entries(raw.blocks as Record<string, Record<string, unknown>>)) {
    blocks[name] = { ...def, attrs: resolveAttrs(def.attrs as never) } as BlockDef;
  }
  const marks: Record<string, MarkDef> = {};
  for (const [name, def] of Object.entries(raw.marks as Record<string, Record<string, unknown>>)) {
    marks[name] = { ...def, attrs: resolveAttrs(def.attrs as never) } as MarkDef;
  }
  const entities: Record<string, EntityDef> = {};
  for (const [name, def] of Object.entries(raw.entities as Record<string, Record<string, unknown>>)) {
    entities[name] = { attrs: resolveAttrs(def.attrs as never) };
  }
  return {
    version: raw.version,
    limits: raw.limits,
    idPattern: new RegExp(raw.idPattern),
    palette: raw.palette,
    blocks,
    marks,
    entities,
  };
}

export const spec: Spec = build();
