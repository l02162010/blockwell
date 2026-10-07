export type ErrorCode =
  | 'invalid_type'
  | 'unsupported_version'
  | 'unknown_key'
  | 'missing_key'
  | 'invalid_id'
  | 'duplicate_id'
  | 'unknown_block_type'
  | 'invalid_child'
  | 'unknown_attr'
  | 'missing_attr'
  | 'invalid_attr'
  | 'table_shape'
  | 'invalid_indent'
  | 'invalid_text'
  | 'unknown_mark_type'
  | 'mark_not_allowed'
  | 'invalid_range'
  | 'mark_overlap'
  | 'unknown_entity_type'
  | 'entity_mismatch'
  | 'limit_exceeded';

export interface ValidationError {
  code: ErrorCode;
  /** JSON pointer to the offending value, e.g. `/blocks/2/marks/0/attrs/value`. */
  path: string;
}

export type ValidationResult = { ok: true; doc: Doc } | { ok: false; errors: ValidationError[] };

export type Attrs = Record<string, string | number | boolean>;

export interface Mark {
  type: string;
  from: number;
  to: number;
  attrs?: Attrs;
}

export interface Entity {
  at: number;
  type: string;
  attrs?: Attrs;
}

export interface Block {
  id: string;
  type: string;
  attrs?: Attrs;
  text?: string;
  marks?: Mark[];
  entities?: Entity[];
  children?: Block[];
}

export interface Doc {
  version: 1;
  blocks: Block[];
}

export type Run =
  | ({ text: string } & Record<string, string | true>)
  | ({ entity: string } & Record<string, string | number | boolean>);

export type FlatBlock = { type: string; runs?: Run[]; children?: FlatBlock[]; rows?: FlatBlock[][][] } & Record<
  string,
  unknown
>;
