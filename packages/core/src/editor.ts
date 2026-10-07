import { isSafeUrl, spec, validate } from '@blockwell/schema';
import * as C from './commands.js';
import { blockElementOf, containerText, domToOffset, offsetToDom, textContainerOf } from './domPos.js';
import { History } from './history.js';
import { runInputRules } from './inputRules.js';
import { OBJ, marksAt, rangeHasMark, rangeMarkValue } from './marks.js';
import {
  allBlocks,
  ancestors,
  caret,
  getBlock,
  isAtom,
  isCollapsed,
  isText,
  locate,
  newId,
  selectionRange,
  textBlocks,
  textLength,
} from './model.js';
import { looksLikeMarkdown, parseMarkdown } from './markdown.js';
import { CLIPBOARD_MIME, emptyReport, parseBlockwell, parseHtml, type PasteReport } from './paste.js';
import { listNumbers, renderBlock, type RenderContext } from './render.js';
import { applyTransaction, EditorState, type Tr } from './state.js';
import type { ActiveState, Attrs, Block, BlockKind, Doc, Mark, Pos, Selection, Transaction } from './types.js';

export interface UploadResult {
  src: string;
  alt?: string;
  width?: number;
}

export interface EditorOptions {
  doc?: Doc;
  editable?: boolean;
  /** Restricts the block types users can create (a comment box might allow only `paragraph`). */
  allowedBlocks?: readonly string[];
  /** Shown in the focused empty paragraph. */
  placeholder?: string;
  /** Shown in other empty blocks by kind, e.g. `{ heading1: 'Heading 1', todo: 'To-do' }`. */
  placeholders?: Partial<Record<BlockKind, string>>;
  /** Text shown on a code block's copy button after copying. */
  copiedLabel?: string;
  /** Shown when the whole document is empty and unfocused. */
  emptyPlaceholder?: string;
  mentionLabel?: (userId: string) => string;
  languageLabel?: (language: string) => string;
  /** Uploads an image file and resolves to an `https:` URL. Without it, pasted or dropped files are ignored. */
  uploadImage?: (file: File, onProgress: (fraction: number) => void) => Promise<UploadResult>;
  /** Top-level block count above which only blocks near the viewport are rendered. Default 2000. */
  virtualizeAbove?: number;
  /** Enables `@` mentions. The picker UI asks the host for members; documents keep only ids. */
  mentions?: boolean;
}

export interface SlashState {
  block: string;
  /** Offset of the `/`. */
  from: number;
  query: string;
}

type TriggerKind = 'slash' | 'mention';
const TRIGGER_CHARS: Record<TriggerKind, string> = { slash: '/', mention: '@' };

export interface Upload {
  id: string;
  name: string;
  progress: number;
  error?: string;
}

export type EditorAction =
  | { type: 'code-language'; block: string }
  | { type: 'link' }
  | { type: 'escape' }
  /** Mod-/ */
  | { type: 'shortcuts' }
  /** Mod-F */
  | { type: 'search' };

export interface EditorEvents {
  /** Any state change: document, selection or editability. */
  update: { editor: Editor };
  /** The document changed. */
  change: { doc: Doc; tr: Transaction };
  selection: { selection: Selection | null };
  focus: Record<string, never>;
  blur: Record<string, never>;
  paste: { report: PasteReport };
  action: EditorAction;
  slash: { slash: SlashState | null };
  /** `@` typed: the mention picker should show members matching `query`. */
  mention: { mention: SlashState | null };
  /** A Markdown shortcut just converted a block; Backspace now reverts it. `null` when that ends. */
  rule: { rule: { block: string; marker: string; kind: BlockKind | null } | null };
  uploads: { uploads: Upload[] };
  /** A command could not do anything (e.g. Tab on a list item already at max depth). */
  refuse: { reason: string; block?: string | undefined };
  /** A transaction failed validation and was dropped. */
  reject: { errors: unknown };
  /**
   * Something the schema blocked or changed, to show next to where it happened (design §04):
   * `reject` refused, `adjust` changed what was asked, `skip` left something out.
   */
  feedback: Feedback;
  search: { search: { query: string; count: number; index: number } | null };
  /** A formatting change, for screen-reader announcements. */
  format: { what: string; on: boolean };
}

type Handler<K extends keyof EditorEvents> = (e: EditorEvents[K]) => void;
export type KeyHandler = (e: KeyboardEvent) => boolean;

export interface Feedback {
  level: 'reject' | 'adjust' | 'skip';
  code: 'length' | 'image-src' | 'unsupported' | 'invalid' | 'link';
  block?: string | undefined;
  count?: number;
  /** For `length`: the text that was not inserted. */
  rest?: string;
}

/** A text range to paint with a named highlight (search results, comment anchors). */
export interface HighlightRange {
  block: string;
  from: number;
  to: number;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);

export class Editor {
  state: EditorState;
  readonly history = new History();
  readonly options: EditorOptions;
  readonly commandOptions: C.CommandOptions;
  dom: HTMLElement | null = null;

  private editable: boolean;
  private storedMarks: Mark[] | null = null;
  private listeners = new Map<string, Set<(e: unknown) => void>>();
  private keyHandlers: KeyHandler[] = [];
  private rendered = new Map<string, { block: Block; el: HTMLElement; num: number | undefined }>();
  private composing = false;
  private renderPending = false;
  private triggers: Record<TriggerKind, SlashState | null> = { slash: null, mention: null };
  private uploadList: Upload[] = [];
  private lastPastePlain: string | null = null;
  private teardown: (() => void)[] = [];
  private placeholderEl: HTMLElement | null = null;
  private resizing = false;
  private ruleArmed: string | null = null;
  private highlightSets = new Map<string, HighlightRange[]>();
  private blockClassSets = new Map<string, Map<string, string>>();

  constructor(options: EditorOptions = {}) {
    this.options = options;
    this.editable = options.editable ?? true;
    this.commandOptions = { allowedBlocks: options.allowedBlocks ? new Set(options.allowedBlocks) : null };
    if (options.doc) {
      const v = validate(options.doc);
      // Rendering an invalid document drops whatever the schema does not allow; say so in development.
      if (!v.ok) console.warn('[blockwell] The initial document does not match the schema:', v.errors.slice(0, 5));
    }
    this.state = EditorState.create(options.doc);
    const first = textBlocks(this.state.doc)[0];
    if (first) this.state = new EditorState(this.state.doc, caret(first.id, 0));
  }

  // -------------------------------------------------------------------------------------------
  // Events

  on<K extends keyof EditorEvents>(event: K, fn: Handler<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn as (e: unknown) => void);
    return () => set!.delete(fn as (e: unknown) => void);
  }

  private emit<K extends keyof EditorEvents>(event: K, payload: EditorEvents[K]) {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }

  /** Registers a keydown handler that runs before the editor's own; return true to consume the key. */
  addKeyHandler(fn: KeyHandler): () => void {
    this.keyHandlers.unshift(fn);
    return () => (this.keyHandlers = this.keyHandlers.filter((h) => h !== fn));
  }

  // -------------------------------------------------------------------------------------------
  // Document

  getJSON(): Doc {
    return this.state.doc;
  }

  /** Replaces the document, e.g. when the bound value changes from outside. Invalid documents are refused. */
  setDoc(doc: Doc, { keepHistory = false } = {}): boolean {
    if (!validate(doc).ok) return false;
    const state = EditorState.create(doc);
    const first = textBlocks(state.doc)[0];
    this.state = new EditorState(state.doc, first ? caret(first.id, 0) : null);
    if (!keepHistory) this.history.clear();
    this.render(true);
    this.emit('update', { editor: this });
    return true;
  }

  get isEditable() {
    return this.editable;
  }

  setEditable(editable: boolean) {
    if (editable === this.editable) return;
    this.editable = editable;
    if (this.dom) {
      this.dom.contentEditable = String(editable);
      this.dom.classList.toggle('bw-readonly', !editable);
      this.render(true);
    }
    this.closeSlash();
    this.emit('update', { editor: this });
  }

  /** Runs a command against a fresh transaction and dispatches it when the command succeeds. */
  run(cmd: (tr: Tr) => boolean, { mergeable = false, seal = false } = {}): boolean {
    if (!this.editable) return false;
    const tr = this.state.tr();
    if (!cmd(tr)) return false;
    tr.mergeable = mergeable;
    if (seal) this.history.seal();
    return this.dispatch(tr);
  }

  dispatch(tr: Tr): boolean {
    if (!tr.changed) {
      if (tr.selection !== this.state.selection) this.setSelection(tr.selection);
      return true;
    }
    const res = tr.finish();
    if (!res.ok) {
      if (typeof console !== 'undefined') console.warn('blockwell: transaction rejected', res.errors);
      this.emit('reject', { errors: res.errors });
      this.emit('feedback', { level: 'reject', code: 'invalid', block: this.focusBlockId() ?? undefined });
      this.render(true);
      return false;
    }
    this.apply(res.state, res.tr);
    this.history.record(res.tr);
    if (tr.dropped) this.emit('feedback', { level: 'adjust', code: 'length', block: tr.dropped.block, count: tr.dropped.text.length, rest: tr.dropped.text });
    return true;
  }

  private apply(state: EditorState, tr: Transaction) {
    this.disarmRule();
    this.state = state;
    this.storedMarks = null;
    this.render();
    this.updateTriggers();
    this.emit('change', { doc: state.doc, tr });
    this.emit('update', { editor: this });
  }

  /** Applies a transaction produced elsewhere (a collaborator). It never enters the local undo history. */
  applyRemote(tr: Transaction): boolean {
    const res = applyTransaction(this.state, { ...tr, selectionAfter: this.state.selection }, 'remote');
    if (!res.ok) return false;
    this.apply(res.state, res.tr);
    return true;
  }

  undo(): boolean {
    return this.replay('undo');
  }

  redo(): boolean {
    return this.replay('redo');
  }

  private replay(kind: 'undo' | 'redo'): boolean {
    if (!this.editable) return false;
    const tr = kind === 'undo' ? this.history.undo() : this.history.redo();
    if (!tr) return false;
    const res = applyTransaction(this.state, tr, 'history');
    if (!res.ok) {
      this.history.restore(kind);
      return false;
    }
    this.apply(res.state, res.tr);
    return true;
  }

  // -------------------------------------------------------------------------------------------
  // Selection

  get selection(): Selection | null {
    return this.state.selection;
  }

  setSelection(sel: Selection | null, { write = true } = {}) {
    this.disarmRule();
    this.state = new EditorState(this.state.doc, sel);
    this.storedMarks = null;
    if (write) this.writeSelection();
    this.updateDecorations();
    this.updateTriggers();
    this.emit('selection', { selection: sel });
    this.emit('update', { editor: this });
  }

  focus() {
    if (!this.dom) return;
    this.dom.focus({ preventScroll: true });
    this.writeSelection(true);
  }

  get hasFocus(): boolean {
    return !!this.dom && this.dom.ownerDocument.activeElement === this.dom;
  }

  /** Bounding rectangle of the current selection, for positioning floating UI. */
  selectionRect(): DOMRect | null {
    if (!this.dom) return null;
    const sel = this.state.selection;
    if (sel?.type === 'node') return this.blockElement(sel.block)?.getBoundingClientRect() ?? null;
    const range = this.domRange();
    if (!range) return null;
    const rects = range.getClientRects();
    if (rects.length > 0) return rects[0]!.width === 0 && rects.length > 1 ? rects[1]! : rects[0]!;
    const r = range.getBoundingClientRect();
    if (r.width || r.height) return r;
    const focus = sel?.type === 'text' ? this.blockElement(sel.focus.block) : null;
    return focus ? (textContainerOf(focus) ?? focus).getBoundingClientRect() : null;
  }

  /** Rectangle around the whole selection (first to last line). */
  selectionBounds(): DOMRect | null {
    const range = this.domRange();
    return range ? range.getBoundingClientRect() : this.selectionRect();
  }

  blockElement(id: string): HTMLElement | null {
    return (this.dom?.querySelector(`[data-block-id="${CSS.escape(id)}"]`) as HTMLElement | null) ?? null;
  }

  private domRange(): Range | null {
    const sel = this.state.selection;
    if (!this.dom || !sel || sel.type !== 'text') return null;
    const a = this.posToDom(sel.anchor), f = this.posToDom(sel.focus);
    if (!a || !f) return null;
    const r = this.dom.ownerDocument.createRange();
    const r2 = selectionRange(this.state.doc, sel)!;
    const from = r2.from === sel.anchor ? a : f, to = r2.from === sel.anchor ? f : a;
    r.setStart(from.node, from.offset);
    r.setEnd(to.node, to.offset);
    return r;
  }

  // -------------------------------------------------------------------------------------------
  // State for toolbars

  activeState(): ActiveState {
    const doc = this.state.doc;
    const sel = this.state.selection;
    const marks = { bold: false, italic: false, underline: false, strike: false, code: false };
    let color: string | null = null, highlight: string | null = null, link: string | null = null;
    let blockKind: BlockKind | null = null;
    let focusBlock: string | null = null, focusType: string | null = null;
    let inTable = false, inCode = false;
    if (sel?.type === 'node') {
      focusType = getBlock(doc, sel.block)?.type ?? null;
    } else if (sel) {
      const r = selectionRange(doc, sel)!;
      const fb = getBlock(doc, sel.focus.block);
      focusBlock = sel.focus.block;
      focusType = fb?.type ?? null;
      const anc = ancestors(doc, sel.focus.block);
      inTable = anc.some((b) => b.type === 'tableCell');
      inCode = fb?.type === 'code';
      blockKind = C.kindOf(fb, anc[0] ?? null);
      if (isCollapsed(sel) && fb) {
        const active = this.storedMarks ?? marksAt(fb.marks ?? [], r.from.offset);
        for (const k of Object.keys(marks) as (keyof typeof marks)[]) marks[k] = active.some((m) => m.type === k);
        color = String(active.find((m) => m.type === 'color')?.attrs?.value ?? '') || null;
        highlight = String(active.find((m) => m.type === 'highlight')?.attrs?.value ?? '') || null;
        const l = C.linkAt(fb, r.from.offset);
        link = l ? String(l.attrs?.href ?? '') : null;
      } else {
        const tr = this.state.tr();
        const segs = C.segments(tr).filter((s) => s.to > s.from);
        for (const k of Object.keys(marks) as (keyof typeof marks)[])
          marks[k] = segs.length > 0 && segs.every((s) => rangeHasMark(s.block.marks ?? [], k, s.from, s.to));
        const vals = (type: string) => {
          const v = new Set(segs.map((s) => rangeMarkValue(s.block.marks ?? [], type, s.from, s.to)));
          return v.size === 1 ? [...v][0]! : v.size === 0 ? null : 'mixed';
        };
        color = vals('color');
        highlight = vals('highlight');
        link = vals('link');
      }
    }
    return {
      marks,
      color,
      highlight,
      link,
      blockKind,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      collapsed: !sel || sel.type === 'node' || isCollapsed(sel),
      focusBlock,
      focusType,
      inTable,
      inCode,
    };
  }

  /** Visible plain text length (entities count as one character). */
  characterCount(): number {
    return textBlocks(this.state.doc).reduce((n, b) => n + textLength(b), 0);
  }

  // -------------------------------------------------------------------------------------------
  // Commands

  allows(type: string) {
    return C.allows(this.commandOptions, type);
  }

  toggleMark(type: 'bold' | 'italic' | 'underline' | 'strike' | 'code'): boolean {
    const sel = this.state.selection;
    if (sel?.type === 'text' && isCollapsed(sel)) {
      // No range: toggle the marks the next typed text gets.
      const b = getBlock(this.state.doc, sel.focus.block);
      if (!b || b.type === 'code') return false;
      const current = this.storedMarks ?? marksAt(b.marks ?? [], sel.focus.offset);
      const has = current.some((m) => m.type === type);
      let next = has ? current.filter((m) => m.type !== type) : [...current, { type, from: 0, to: 0 }];
      if (!has && type === 'code') next = next.filter((m) => m.type === 'code');
      this.storedMarks = next;
      this.emit('format', { what: type, on: !has });
      this.emit('update', { editor: this });
      return true;
    }
    const was = this.activeState().marks[type];
    const ok = this.run((tr) => C.toggleMark(tr, type));
    if (ok) this.emit('format', { what: type, on: !was });
    return ok;
  }

  /** Sets text color to a palette token, or clears it with null. */
  setColor(token: string | null): boolean {
    return this.setTokenMark('color', token);
  }

  setHighlight(token: string | null): boolean {
    return this.setTokenMark('highlight', token);
  }

  private setTokenMark(type: 'color' | 'highlight', token: string | null): boolean {
    if (token !== null && !spec.palette.includes(token)) return false;
    const sel = this.state.selection;
    if (sel?.type === 'text' && isCollapsed(sel)) {
      const b = getBlock(this.state.doc, sel.focus.block);
      if (!b || b.type === 'code') return false;
      const current = (this.storedMarks ?? marksAt(b.marks ?? [], sel.focus.offset)).filter((m) => m.type !== type);
      this.storedMarks = token ? [...current, { type, from: 0, to: 0, attrs: { value: token } }] : current;
      this.emit('update', { editor: this });
      return true;
    }
    const ok = this.run((tr) => C.setMarkValue(tr, type, token ? { value: token } : null));
    if (ok) this.emit('format', { what: token ? `${type}:${token}` : type, on: !!token });
    return ok;
  }

  /** Sets the link on the selection. Returns false for URLs that fail the scheme check. */
  setLink(href: string | null): boolean {
    return this.run((tr) => C.setLink(tr, href));
  }

  /** The href of the link at the selection and the range it covers, for link editing UI. */
  linkAtSelection(): { href: string; block: string; from: number; to: number } | null {
    const sel = this.state.selection;
    if (sel?.type !== 'text') return null;
    const b = getBlock(this.state.doc, sel.focus.block);
    if (!b) return null;
    const m = C.linkAt(b, sel.focus.offset);
    return m ? { href: String(m.attrs?.href ?? ''), block: b.id, from: m.from, to: m.to } : null;
  }

  setBlockKind(kind: BlockKind): boolean {
    const ok = this.run((tr) => C.setBlockKind(tr, kind, this.commandOptions), { seal: true });
    if (ok) this.emit('format', { what: kind, on: true });
    return ok;
  }

  /** Converts back to a paragraph when every selected block already has `kind`. */
  toggleBlockKind(kind: BlockKind): boolean {
    return this.activeState().blockKind === kind && kind !== 'paragraph' ? this.setBlockKind(kind === 'quote' ? 'quote' : 'paragraph') : this.setBlockKind(kind);
  }

  setAlign(align: 'left' | 'center' | 'right'): boolean {
    return this.run((tr) => C.setAlign(tr, align));
  }

  indent(): boolean {
    const ok = this.run((tr) => C.indentList(tr, 1));
    if (!ok) this.emit('refuse', { reason: 'indent', block: this.focusBlockId() ?? undefined });
    return ok;
  }

  outdent(): boolean {
    return this.run((tr) => C.indentList(tr, -1));
  }

  toggleChecked(block: string): boolean {
    return this.run((tr) => C.toggleChecked(tr, block));
  }

  insertDivider(): boolean {
    return this.run((tr) => C.insertBlock(tr, C.newDivider(), this.commandOptions), { seal: true });
  }

  insertCode(language?: string): boolean {
    return this.run((tr) => C.insertBlock(tr, C.newCode(language), this.commandOptions), { seal: true });
  }

  insertTable(rows = 3, cols = 3): boolean {
    return this.run((tr) => C.insertBlock(tr, C.newTable(rows, cols), this.commandOptions), { seal: true });
  }

  /** Inserts an image. `src` must pass the image URL check (https only). */
  insertImage(attrs: UploadResult & { align?: 'left' | 'center' | 'full' }): boolean {
    if (!isSafeUrl(attrs.src, C.IMAGE_SCHEMES)) {
      this.emit('feedback', { level: 'reject', code: 'image-src', block: this.focusBlockId() ?? undefined });
      return false;
    }
    return this.run((tr) => C.insertBlock(tr, C.newImage(attrs), this.commandOptions), { seal: true });
  }

  insertMention(userId: string): boolean {
    return this.run((tr) => C.insertEntity(tr, 'mention', { userId }));
  }

  insertText(text: string): boolean {
    return this.run((tr) => C.insertText(tr, text, this.storedMarks));
  }

  /** Inserts text that did not fit (see the `length` feedback) as paragraphs after `block`. */
  insertOverflow(block: string, text: string): boolean {
    return this.run((tr) => {
      const loc = locate(tr.doc, block);
      if (!loc) return false;
      const blocks = C.overflowToBlocks(text);
      blocks.forEach((b, i) => tr.insertBlock(loc.parent, loc.index + 1 + i, b));
      const last = blocks[blocks.length - 1];
      if (last) tr.setSelection(caret(last.id, textLength(last)));
      return blocks.length > 0;
    }, { seal: true });
  }

  /** Marks and mentions that converting the selection to `kind` would remove. */
  conversionLoss(kind: BlockKind) {
    return C.conversionLoss(this.state.tr(), kind);
  }

  setCodeLanguage(block: string, language: string): boolean {
    return this.run((tr) => (tr.updateAttrs(block, { language: language === 'plaintext' ? undefined : language }), true));
  }

  setImageAttrs(block: string, patch: { alt?: string; width?: number | null; align?: 'left' | 'center' | 'full' }): boolean {
    return this.run((tr) => {
      const p: Record<string, string | number | undefined> = {};
      if (patch.alt !== undefined) p.alt = patch.alt || undefined;
      if (patch.align !== undefined) p.align = patch.align === 'center' ? undefined : patch.align;
      if (patch.width !== undefined) p.width = patch.width === null ? undefined : Math.round(Math.max(16, Math.min(2000, patch.width)));
      tr.updateAttrs(block, p);
      return true;
    });
  }

  deleteBlock(block: string): boolean {
    return this.run((tr) => {
      tr.setSelection({ type: 'node', block });
      return C.deleteSelection(tr);
    });
  }

  selectNode(block: string) {
    this.setSelection({ type: 'node', block });
  }

  /** Selects a whole block: atoms as a node, text blocks from start to end, containers across their text. */
  selectBlockContent(block: string) {
    const b = getBlock(this.state.doc, block);
    if (!b) return;
    if (isAtom(b)) return this.setSelection({ type: 'node', block });
    const texts = textBlocks({ version: 1, blocks: [b] });
    const first = texts[0], last = texts[texts.length - 1];
    if (!first || !last) return;
    this.setSelection({ type: 'text', anchor: { block: first.id, offset: 0 }, focus: { block: last.id, offset: textLength(last) } });
  }

  /** Moves a top-level block so that it ends up at `index` among the top-level blocks. */
  moveBlock(block: string, index: number): boolean {
    const loc = locate(this.state.doc, block);
    if (!loc || loc.parent !== null) return false;
    const target = Math.max(0, Math.min(this.state.doc.blocks.length - 1, index));
    if (target === loc.index) return false;
    return this.run((tr) => (tr.moveBlock(block, null, target), true), { seal: true });
  }

  /** Viewport rectangle of a caret at `pos` (zero width), e.g. for drawing a collaborator's cursor. */
  rectAt(pos: Pos): DOMRect | null {
    const p = this.posToDom(pos);
    if (!p || !this.dom) return null;
    const r = this.dom.ownerDocument.createRange();
    r.setStart(p.node, p.offset);
    r.collapse(true);
    const rects = r.getClientRects();
    if (rects.length) return rects[0]!;
    const el = p.node.nodeType === 1 ? (p.node as Element) : p.node.parentElement;
    const box = el?.getBoundingClientRect();
    return box ? new DOMRect(box.left, box.top, 0, box.height) : null;
  }

  addRow(block: string, side: 'before' | 'after') {
    return this.run((tr) => C.addRow(tr, block, side));
  }
  addColumn(block: string, side: 'before' | 'after') {
    return this.run((tr) => C.addColumn(tr, block, side));
  }
  deleteRow(block: string) {
    return this.run((tr) => C.deleteRow(tr, block));
  }
  deleteColumn(block: string) {
    return this.run((tr) => C.deleteColumn(tr, block));
  }
  moveColumn(block: string, delta: -1 | 1) {
    return this.run((tr) => C.moveColumn(tr, block, delta));
  }

  /** Row, column and table of the cell holding the caret. */
  tableContext(block = this.focusBlockId()) {
    if (!block) return null;
    const ctx = C.cellContext(this.state.tr(), block);
    return ctx ? { table: ctx.table.id, row: ctx.row, col: ctx.col, rows: ctx.rows.length, cols: ctx.rows[0]?.children?.length ?? 0 } : null;
  }

  private focusBlockId(): string | null {
    const sel = this.state.selection;
    return sel?.type === 'text' ? sel.focus.block : sel?.type === 'node' ? sel.block : null;
  }

  private disarmRule() {
    if (!this.ruleArmed) return;
    this.ruleArmed = null;
    this.emit('rule', { rule: null });
  }

  // -------------------------------------------------------------------------------------------
  // Decorations

  /**
   * Paints ranges with the CSS Custom Highlight API under the name `bw-<name>` (style it with
   * `::highlight(bw-<name>)`). Nothing is added to the DOM, so editing and offsets are unaffected.
   * Pass an empty list to clear.
   */
  setHighlights(name: string, ranges: HighlightRange[]) {
    if (ranges.length) this.highlightSets.set(name, ranges);
    else this.highlightSets.delete(name);
    this.paintHighlights();
  }

  /** Adds `className` to the elements of the given blocks (e.g. diff or comment markers). */
  setBlockClasses(name: string, classes: Record<string, string>) {
    const entries = Object.entries(classes);
    if (entries.length) this.blockClassSets.set(name, new Map(entries));
    else this.blockClassSets.delete(name);
    this.paintBlockClasses();
  }

  private paintHighlights() {
    if (!this.dom) return;
    const mine = new Map<string, Range[]>();
    for (const [name, list] of this.highlightSets) {
      const ranges: Range[] = [];
      for (const h of list) {
        const a = this.posToDom({ block: h.block, offset: h.from });
        const b = this.posToDom({ block: h.block, offset: h.to });
        if (!a || !b) continue;
        const r = this.dom.ownerDocument.createRange();
        r.setStart(a.node, a.offset);
        r.setEnd(b.node, b.offset);
        ranges.push(r);
      }
      mine.set(name, ranges);
    }
    publishHighlights(this, mine);
  }

  private paintBlockClasses() {
    if (!this.dom) return;
    this.dom.querySelectorAll('[data-bw-deco]').forEach((e) => {
      for (const c of (e.getAttribute('data-bw-deco') ?? '').split(' ')) if (c) e.classList.remove(c);
      e.removeAttribute('data-bw-deco');
    });
    for (const map of this.blockClassSets.values()) {
      for (const [id, cls] of map) {
        const e = this.blockElement(id);
        if (!e) continue;
        e.classList.add(...cls.split(' ').filter(Boolean));
        e.setAttribute('data-bw-deco', `${e.getAttribute('data-bw-deco') ?? ''} ${cls}`.trim());
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  // Typed triggers: `/` opens the block menu, `@` the mention picker

  get slash(): SlashState | null {
    return this.triggers.slash;
  }

  get mention(): SlashState | null {
    return this.triggers.mention;
  }

  closeSlash() {
    this.closeTrigger('slash');
  }

  closeMention() {
    this.closeTrigger('mention');
  }

  private closeTrigger(kind: TriggerKind) {
    if (!this.triggers[kind]) return;
    this.triggers[kind] = null;
    this.emit(kind, { [kind]: null } as never);
  }

  /** Removes the typed trigger and query, leaving the caret where the trigger was. */
  private consumeTrigger(kind: TriggerKind): SlashState | null {
    const s = this.triggers[kind];
    if (!s) return null;
    this.closeTrigger(kind);
    const sel = this.state.selection;
    const end = sel?.type === 'text' && sel.focus.block === s.block ? sel.focus.offset : s.from + 1 + s.query.length;
    this.run(
      (tr) => {
        tr.deleteText(s.block, s.from, end);
        tr.setSelection(caret(s.block, s.from));
        return true;
      },
      { seal: true },
    );
    return s;
  }

  /** Removes the typed `/query` and runs `fn` (a block conversion or insertion). */
  runSlash(fn: (editor: Editor) => void) {
    if (this.consumeTrigger('slash')) fn(this);
  }

  /** Replaces the typed `@query` with a mention of `userId`. Documents store the id only. */
  runMention(userId: string) {
    if (!this.consumeTrigger('mention')) return;
    this.insertMention(userId);
    this.insertText(' ');
  }

  /** Types `/` at the caret and opens the slash menu, as if the user had typed it. */
  startSlash() {
    if (!this.insertText('/')) return;
    this.maybeOpenTrigger();
  }

  private updateTriggers() {
    for (const kind of ['slash', 'mention'] as const) {
      const s = this.triggers[kind];
      if (!s) continue;
      const sel = this.state.selection;
      const b = getBlock(this.state.doc, s.block);
      const ok =
        this.editable &&
        sel?.type === 'text' &&
        isCollapsed(sel) &&
        sel.focus.block === s.block &&
        !!b &&
        (b.text ?? '')[s.from] === TRIGGER_CHARS[kind] &&
        sel.focus.offset > s.from;
      if (!ok) {
        this.closeTrigger(kind);
        continue;
      }
      const query = (b.text ?? '').slice(s.from + 1, sel.focus.offset);
      if (query.length > 32 || /[\n\uFFFC]/.test(query) || /\s{2}/.test(query) || (kind === 'mention' && /\s/.test(query))) {
        this.closeTrigger(kind);
        continue;
      }
      if (query !== s.query) {
        this.triggers[kind] = { ...s, query };
        this.emit(kind, { [kind]: this.triggers[kind] } as never);
      }
    }
  }

  private maybeOpenTrigger() {
    const sel = this.state.selection;
    if (sel?.type !== 'text' || !isCollapsed(sel)) return;
    const b = getBlock(this.state.doc, sel.focus.block);
    if (!b || b.type === 'code') return;
    const at = sel.focus.offset - 1;
    const text = b.text ?? '';
    const kind = (Object.keys(TRIGGER_CHARS) as TriggerKind[]).find((k) => TRIGGER_CHARS[k] === text[at]);
    if (!kind || (at > 0 && !/\s/.test(text[at - 1]!))) return;
    if (kind === 'mention' && !this.options.mentions) return;
    if (kind === 'slash' && this.commandOptions.allowedBlocks?.size === 1) return;
    this.triggers[kind] = { block: b.id, from: at, query: '' };
    this.emit(kind, { [kind]: this.triggers[kind] } as never);
  }

  // -------------------------------------------------------------------------------------------
  // Uploads

  get uploads(): readonly Upload[] {
    return this.uploadList;
  }

  /** Uploads image files through `options.uploadImage` and inserts each one when done. */
  uploadImages(files: File[]) {
    const upload = this.options.uploadImage;
    if (!upload || !this.allows('image')) return;
    for (const file of files.filter((f) => f.type.startsWith('image/'))) {
      const item: Upload = { id: newId(), name: file.name, progress: 0 };
      const anchor = this.state.selection;
      this.uploadList = [...this.uploadList, item];
      this.emit('uploads', { uploads: this.uploadList });
      const patch = (p: Partial<Upload>) => {
        this.uploadList = this.uploadList.map((u) => (u.id === item.id ? { ...u, ...p } : u));
        this.emit('uploads', { uploads: this.uploadList });
      };
      upload(file, (progress) => patch({ progress }))
        .then((res) => {
          this.uploadList = this.uploadList.filter((u) => u.id !== item.id);
          this.emit('uploads', { uploads: this.uploadList });
          if (anchor && !this.state.selection) this.setSelection(anchor, { write: false });
          if (!this.insertImage({ ...res, alt: res.alt ?? file.name.replace(/\.[^.]+$/, '') })) patch({ error: 'rejected' });
        })
        .catch((e: unknown) => patch({ error: String((e as Error)?.message ?? e) }));
    }
  }

  dismissUpload(id: string) {
    this.uploadList = this.uploadList.filter((u) => u.id !== id);
    this.emit('uploads', { uploads: this.uploadList });
  }

  // -------------------------------------------------------------------------------------------
  // Paste helpers for the paste notice

  /** Undoes the last paste and inserts its plain text instead. */
  pasteAsPlainText(): boolean {
    const plain = this.lastPastePlain;
    if (plain === null || !this.undo()) return false;
    this.lastPastePlain = null;
    return this.run((tr) => C.insertFragment(tr, C.textToBlocks(plain), this.commandOptions));
  }

  // -------------------------------------------------------------------------------------------
  // View

  mount(root: HTMLElement) {
    if (this.dom) this.destroy();
    this.dom = root;
    root.classList.add('bw-editor');
    root.classList.toggle('bw-readonly', !this.editable);
    root.contentEditable = String(this.editable);
    root.setAttribute('role', 'textbox');
    root.setAttribute('aria-multiline', 'true');
    root.setAttribute('translate', 'no');
    root.spellcheck = true;
    root.replaceChildren();
    this.rendered.clear();
    this.render(true);

    const on = <K extends keyof HTMLElementEventMap>(target: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.teardown.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    const doc = root.ownerDocument;
    on(root, 'beforeinput', (e: InputEvent) => this.onBeforeInput(e));
    on(root, 'input', (e: InputEvent) => this.onInput(e));
    on(root, 'keydown', (e: KeyboardEvent) => this.onKeyDown(e));
    on(root, 'compositionstart', () => this.onCompositionStart());
    on(root, 'compositionend', () => this.onCompositionEnd());
    on(root, 'copy', (e: ClipboardEvent) => this.onCopy(e, false));
    on(root, 'cut', (e: ClipboardEvent) => this.onCopy(e, true));
    on(root, 'paste', (e: ClipboardEvent) => this.onPaste(e));
    on(root, 'drop', (e: DragEvent) => this.onDrop(e));
    // Text is moved with cut and paste, blocks with their drag handles; native drags would duplicate.
    on(root, 'dragstart', (e: DragEvent) => e.preventDefault());
    on(root, 'dragover', (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    });
    on(root, 'mousedown', (e: MouseEvent) => this.onMouseDown(e));
    on(root, 'click', (e: MouseEvent) => this.onClick(e));
    on(root, 'focus', () => {
      this.updateDecorations();
      this.emit('focus', {});
      this.emit('update', { editor: this });
    });
    on(root, 'blur', () => {
      this.updateDecorations();
      this.emit('blur', {});
      this.emit('update', { editor: this });
    });
    on(doc, 'selectionchange', () => this.onSelectionChange());
    on(window, 'scroll', () => this.onScroll(), { capture: true, passive: true });
    on(window, 'beforeprint', () => {
      this.printing = true;
      this.render();
    });
    on(window, 'afterprint', () => {
      this.printing = false;
      this.render();
    });
  }

  destroy() {
    publishHighlights(this, null);
    this.teardown.forEach((f) => f());
    this.teardown = [];
    if (this.dom) {
      this.dom.replaceChildren();
      this.dom.removeAttribute('contenteditable');
      this.dom.classList.remove('bw-editor', 'bw-readonly');
    }
    this.dom = null;
    this.rendered.clear();
  }

  private ctx(): RenderContext {
    return {
      editable: this.editable,
      numbers: new Map(),
      ...(this.options.mentionLabel ? { mentionLabel: this.options.mentionLabel } : {}),
      ...(this.options.languageLabel ? { languageLabel: this.options.languageLabel } : {}),
    };
  }

  /** Brings the DOM in line with the state. Unchanged top-level blocks keep their elements. */
  private render(full = false) {
    const root = this.dom;
    if (!root) return;
    if (this.composing) {
      this.renderPending = true;
      return;
    }
    this.renderPending = false;
    if (full) this.rendered.clear();
    const ctx = this.ctx();
    const numbers = listNumbers(this.state.doc.blocks);
    const next = new Map<string, { block: Block; el: HTMLElement; num: number | undefined }>();
    const desired: HTMLElement[] = [];
    const blocks = this.state.doc.blocks;
    const [start, end] = this.windowRange();
    if (start > 0) desired.push(this.spacer('top', this.heightOf(0, start)));
    for (let i = start; i < end; i++) {
      const block = blocks[i]!;
      const num = numbers.get(block.id);
      let entry = this.rendered.get(block.id);
      if (!entry || entry.block !== block || entry.num !== num) entry = { block, el: renderBlock(block, { ...ctx, numbers }), num };
      next.set(block.id, entry);
      desired.push(entry.el);
    }
    if (end < blocks.length) desired.push(this.spacer('bottom', this.heightOf(end, blocks.length)));
    // Drop stale blocks and anything the browser inserted, then put the rest in order.
    const keep = new Set<Node>(desired);
    for (const n of Array.from(root.childNodes)) if (!keep.has(n)) n.remove();
    let cursor: ChildNode | null = root.firstChild;
    for (const el of desired) {
      if (el === cursor) cursor = cursor.nextSibling;
      else root.insertBefore(el, cursor);
    }
    this.rendered = next;
    if (this.virtual) this.scheduleMeasure();
    this.updateDecorations();
    this.paintBlockClasses();
    this.paintHighlights();
    this.writeSelection();
  }

  // -------------------------------------------------------------------------------------------
  // Large documents: render only the blocks near the viewport (engine guide §8)

  private heights = new Map<string, number>();
  private spacers: Partial<Record<'top' | 'bottom', HTMLElement>> = {};
  private printing = false;
  private pinned: number | null = null;
  private measureFrame = 0;
  private scrollFrame = 0;

  /** True while only part of the document is in the DOM. */
  get virtual(): boolean {
    return !this.printing && this.state.doc.blocks.length > (this.options.virtualizeAbove ?? 2000);
  }

  /** Block counts for status displays. */
  stats() {
    return { blocks: allBlocks(this.state.doc).length, topLevel: this.state.doc.blocks.length, virtual: this.virtual, rendered: this.rendered.size };
  }

  private estimate(id: string) {
    return this.heights.get(id) ?? 36;
  }

  private heightOf(from: number, to: number) {
    let h = 0;
    const blocks = this.state.doc.blocks;
    for (let i = from; i < to; i++) h += this.estimate(blocks[i]!.id);
    return h;
  }

  private spacer(side: 'top' | 'bottom', height: number): HTMLElement {
    let el = this.spacers[side];
    if (!el) {
      el = document.createElement('div');
      el.className = 'bw-virtual-spacer';
      el.setAttribute('contenteditable', 'false');
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('data-bw-spacer', side);
      this.spacers[side] = el;
    }
    el.style.height = `${Math.round(height)}px`;
    return el;
  }

  private scrollParent(): HTMLElement | null {
    let n = this.dom?.parentElement ?? null;
    while (n) {
      const o = getComputedStyle(n).overflowY;
      if (o === 'auto' || o === 'scroll') return n;
      n = n.parentElement;
    }
    return null;
  }

  /** Indices [start, end) of the top-level blocks to render. */
  private windowRange(): [number, number] {
    const blocks = this.state.doc.blocks;
    if (!this.virtual || !this.dom) return [0, blocks.length];
    const root = this.dom.getBoundingClientRect();
    const sp = this.scrollParent();
    const view = sp ? sp.getBoundingClientRect() : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const screen = view.height || window.innerHeight;
    const top = view.top - root.top - screen;
    const bottom = view.bottom - root.top + screen;
    let y = 0, start = 0, end = blocks.length;
    for (let i = 0; i < blocks.length; i++) {
      const h = this.estimate(blocks[i]!.id);
      if (y + h < top) start = i + 1;
      if (y > bottom) {
        end = i;
        break;
      }
      y += h;
    }
    // Keep the caret's block and a block being revealed in the DOM.
    const keep = [this.pinned, this.topIndexOf(this.focusBlockId())].filter((i): i is number => i !== null && i >= 0);
    for (const i of keep) {
      if (i < start && start - i < 400) start = i;
      if (i >= end && i - end < 400) end = i + 1;
    }
    return [Math.min(start, end), end];
  }

  private topIndexOf(id: string | null): number | null {
    if (!id) return null;
    const chain = [getBlock(this.state.doc, id), ...ancestors(this.state.doc, id)].filter(Boolean) as Block[];
    const top = chain[chain.length - 1];
    return top ? (locate(this.state.doc, top.id)?.index ?? null) : null;
  }

  private scheduleMeasure() {
    cancelAnimationFrame(this.measureFrame);
    this.measureFrame = requestAnimationFrame(() => {
      const els = [...this.rendered.values()].map((v) => v.el);
      for (let i = 0; i < els.length; i++) {
        const el = els[i]!, next = els[i + 1];
        const h = next ? next.offsetTop - el.offsetTop : el.offsetHeight + 14;
        if (h > 0) this.heights.set(el.getAttribute('data-block-id')!, h);
      }
    });
  }

  private onScroll() {
    if (!this.virtual || this.scrollFrame) return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = 0;
      const [start, end] = this.windowRange();
      const blocks = this.state.doc.blocks;
      if (this.rendered.has(blocks[start]?.id ?? '') && this.rendered.has(blocks[end - 1]?.id ?? '') && this.rendered.size === end - start) return;
      this.render();
    });
  }

  /** Scrolls a block into view, rendering it first when the document is virtualized. */
  revealBlock(id: string, opts: { select?: boolean } = {}) {
    const index = this.topIndexOf(id);
    if (index === null) return;
    this.pinned = index;
    this.render();
    this.blockElement(id)?.scrollIntoView({ block: 'center' });
    requestAnimationFrame(() => {
      this.render();
      this.pinned = null;
    });
    if (opts.select) {
      const b = getBlock(this.state.doc, id);
      if (b && isText(b)) this.setSelection(caret(id, 0));
      else if (b && isAtom(b)) this.setSelection({ type: 'node', block: id });
    }
  }

  // -------------------------------------------------------------------------------------------
  // Search runs on the model, so it also finds blocks that are not rendered

  private searchState: { query: string; matches: HighlightRange[]; index: number } | null = null;

  get search() {
    const s = this.searchState;
    return s ? { query: s.query, count: s.matches.length, index: s.index } : null;
  }

  /** Finds `query` (case-insensitive) in all text, highlights the matches and shows the first. */
  find(query: string) {
    if (!query) return this.clearSearch();
    const q = query.toLocaleLowerCase();
    const matches: HighlightRange[] = [];
    for (const b of textBlocks(this.state.doc)) {
      const text = (b.text ?? '').toLocaleLowerCase();
      for (let i = text.indexOf(q); i >= 0 && matches.length < 10_000; i = text.indexOf(q, i + q.length)) matches.push({ block: b.id, from: i, to: i + q.length });
    }
    this.searchState = { query, matches, index: matches.length ? 0 : -1 };
    this.showMatch();
  }

  findNext(dir: 1 | -1 = 1) {
    const s = this.searchState;
    if (!s || !s.matches.length) return;
    s.index = (s.index + dir + s.matches.length) % s.matches.length;
    this.showMatch();
  }

  clearSearch() {
    this.searchState = null;
    this.setHighlights('search', []);
    this.setHighlights('search-current', []);
    this.emit('search', { search: null });
  }

  private showMatch() {
    const s = this.searchState!;
    const cur = s.matches[s.index];
    if (cur) this.revealBlock(cur.block);
    this.setHighlights('search', s.matches);
    this.setHighlights('search-current', cur ? [cur] : []);
    this.emit('search', { search: this.search });
  }

  /** Placeholder, node-selection highlight and empty-document state. */
  private updateDecorations() {
    const root = this.dom;
    if (!root) return;
    root.querySelectorAll('.bw-selected').forEach((e) => e.classList.remove('bw-selected'));
    this.placeholderEl?.classList.remove('bw-placeholder');
    this.placeholderEl?.removeAttribute('data-placeholder');
    this.placeholderEl = null;
    const sel = this.state.selection;
    if (sel?.type === 'node') this.blockElement(sel.block)?.classList.add('bw-selected');
    if (!this.editable) return;
    const blocks = this.state.doc.blocks;
    const onlyEmpty = blocks.length === 1 && blocks[0]!.type === 'paragraph' && !blocks[0]!.text;
    let target: HTMLElement | null = null;
    let text: string | undefined;
    if (onlyEmpty && (!this.hasFocus || !this.options.placeholder)) {
      target = this.blockElement(blocks[0]!.id);
      text = this.options.emptyPlaceholder ?? this.options.placeholder;
    } else if (this.hasFocus && sel?.type === 'text' && isCollapsed(sel)) {
      const b = getBlock(this.state.doc, sel.focus.block);
      const parent = locate(this.state.doc, sel.focus.block)?.parent;
      const inCell = parent ? getBlock(this.state.doc, parent)?.type === 'tableCell' : false;
      if (b && isText(b) && !b.text && !inCell && b.type !== 'code') {
        const kind = C.kindOf(b, parent ? getBlock(this.state.doc, parent) : null);
        target = this.blockElement(b.id);
        text = b.type === 'paragraph' && kind !== 'quote' ? this.options.placeholder : (kind && this.options.placeholders?.[kind]) || undefined;
      }
    }
    if (target && text) {
      const c = textContainerOf(target) ?? target;
      c.classList.add('bw-placeholder');
      c.setAttribute('data-placeholder', text);
      this.placeholderEl = c;
    }
  }

  private posToDom(pos: Pos): { node: Node; offset: number } | null {
    const blockEl = this.blockElement(pos.block);
    const c = blockEl && textContainerOf(blockEl);
    return c ? offsetToDom(c, pos.offset) : null;
  }

  /** Writes the model selection into the DOM when the editor has focus (or `force`). */
  private writeSelection(force = false) {
    const root = this.dom;
    if (!root || this.composing || this.resizing) return;
    if (!force && !this.hasFocus) return;
    const domSel = root.ownerDocument.getSelection();
    if (!domSel) return;
    const sel = this.state.selection;
    if (!sel) return;
    if (sel.type === 'node') {
      const e = this.blockElement(sel.block);
      if (!e) return;
      const r = root.ownerDocument.createRange();
      r.selectNode(e);
      domSel.removeAllRanges();
      domSel.addRange(r);
      return;
    }
    const a = this.posToDom(sel.anchor), f = this.posToDom(sel.focus);
    if (!a || !f) return;
    if (domSel.anchorNode === a.node && domSel.anchorOffset === a.offset && domSel.focusNode === f.node && domSel.focusOffset === f.offset) return;
    try {
      domSel.setBaseAndExtent(a.node, a.offset, f.node, f.offset);
    } catch {
      /* the DOM may be mid-update */
    }
  }

  /** Maps a DOM point to a model position or a node selection. */
  private resolvePoint(node: Node, offset: number): Pos | { node: string } | null {
    const root = this.dom!;
    const doc = this.state.doc;
    const blockEl = blockElementOf(node, root);
    if (blockEl) {
      const id = blockEl.getAttribute('data-block-id')!;
      const b = getBlock(doc, id);
      if (b && isText(b)) {
        const c = textContainerOf(blockEl);
        if (!c) return { block: id, offset: 0 };
        if (c === node || c.contains(node)) return { block: id, offset: domToOffset(c, node, offset) };
        // In a marker or bar: before the text or after it.
        return { block: id, offset: c.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING ? 0 : textLength(b) };
      }
      if (b && isAtom(b)) return { node: id };
    }
    // Between blocks: the nearest text container in document order.
    const containers = Array.from(root.querySelectorAll('[data-bw-text]'));
    if (containers.length === 0) return null;
    const point = root.ownerDocument.createRange();
    point.setStart(node, Math.min(offset, node.childNodes.length || (node.nodeValue ?? '').length));
    for (const c of containers) {
      if (point.comparePoint(c, 0) >= 0) {
        const id = blockElementOf(c, root)!.getAttribute('data-block-id')!;
        return { block: id, offset: 0 };
      }
    }
    const last = containers[containers.length - 1]!;
    const id = blockElementOf(last, root)!.getAttribute('data-block-id')!;
    return { block: id, offset: textLength(getBlock(doc, id)) };
  }

  /** Reads the DOM selection into the model. Returns the new selection. */
  private readSelection(): Selection | null {
    const root = this.dom;
    if (!root) return null;
    const ds = root.ownerDocument.getSelection();
    if (!ds || !ds.anchorNode || !ds.focusNode || !root.contains(ds.anchorNode) || !root.contains(ds.focusNode)) return null;
    // A node selection written by us maps back to itself.
    const cur = this.state.selection;
    if (cur?.type === 'node' && ds.rangeCount > 0) {
      const e = this.blockElement(cur.block);
      const r = ds.getRangeAt(0);
      if (e && r.startContainer === e.parentNode && r.endContainer === e.parentNode) return cur;
    }
    const a = this.resolvePoint(ds.anchorNode, ds.anchorOffset);
    const f = this.resolvePoint(ds.focusNode, ds.focusOffset);
    if (!a || !f) return null;
    if ('node' in a && 'node' in f && a.node === f.node) return { type: 'node', block: a.node };
    const toPos = (p: Pos | { node: string }, edge: 'start' | 'end'): Pos | null => {
      if (!('node' in p)) return p;
      // A range touching an atom snaps to the nearest text.
      const list = textBlocks(this.state.doc);
      const order = allBlocks(this.state.doc);
      const idx = order.findIndex((b) => b.id === p.node);
      const near = edge === 'start' ? list.find((b) => order.findIndex((x) => x.id === b.id) > idx) : [...list].reverse().find((b) => order.findIndex((x) => x.id === b.id) < idx);
      return near ? { block: near.id, offset: edge === 'start' ? 0 : textLength(near) } : null;
    };
    const ap = toPos(a, 'start'), fp = toPos(f, 'end');
    if (!ap || !fp) return null;
    return { type: 'text', anchor: ap, focus: fp };
  }

  private onSelectionChange() {
    if (!this.dom || this.composing || this.resizing) return;
    const ds = this.dom.ownerDocument.getSelection();
    if (!ds?.anchorNode || !this.dom.contains(ds.anchorNode)) return;
    const sel = this.readSelection();
    if (!sel || sameSelection(sel, this.state.selection)) return;
    this.setSelection(sel, { write: false });
  }

  private syncSelection() {
    const sel = this.readSelection();
    if (sel && !sameSelection(sel, this.state.selection)) {
      this.state = new EditorState(this.state.doc, sel);
      this.storedMarks = null;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Input

  private onBeforeInput(e: InputEvent) {
    if (!this.editable) {
      e.preventDefault();
      return;
    }
    if (this.composing || e.isComposing || e.inputType === 'insertCompositionText' || e.inputType === 'deleteCompositionText') return;
    this.syncSelection();
    const t = e.inputType;
    switch (t) {
      case 'insertText':
      case 'insertReplacementText': {
        e.preventDefault();
        const data = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
        if (t === 'insertReplacementText') this.selectTargetRange(e);
        this.typeText(data);
        return;
      }
      case 'insertParagraph':
        e.preventDefault();
        this.closeSlash();
        this.run((tr) => C.splitBlock(tr), { seal: true });
        return;
      case 'insertLineBreak':
        e.preventDefault();
        this.run((tr) => C.insertEntity(tr, 'lineBreak'));
        return;
      case 'formatBold':
      case 'formatItalic':
      case 'formatUnderline':
      case 'formatStrikeThrough': {
        e.preventDefault();
        const map: Record<string, 'bold' | 'italic' | 'underline' | 'strike'> = {
          formatBold: 'bold',
          formatItalic: 'italic',
          formatUnderline: 'underline',
          formatStrikeThrough: 'strike',
        };
        this.toggleMark(map[t]!);
        return;
      }
      case 'historyUndo':
        e.preventDefault();
        this.undo();
        return;
      case 'historyRedo':
        e.preventDefault();
        this.redo();
        return;
      default:
        if (t.startsWith('delete')) {
          e.preventDefault();
          this.handleDelete(e);
          return;
        }
        // Paste, drop and cut arrive through their own events; anything else is not ours to allow.
        e.preventDefault();
    }
  }

  private selectTargetRange(e: InputEvent) {
    const r = e.getTargetRanges?.()[0];
    if (!r) return;
    const a = this.resolvePoint(r.startContainer, r.startOffset), b = this.resolvePoint(r.endContainer, r.endOffset);
    if (a && b && !('node' in a) && !('node' in b)) this.state = new EditorState(this.state.doc, { type: 'text', anchor: a, focus: b });
  }

  private typeText(data: string) {
    if (!data) return;
    const sel = this.state.selection;
    if (sel?.type === 'node') {
      // Typing on a selected atom starts a paragraph after it.
      if (!this.run((tr) => C.splitBlock(tr))) return;
    }
    const collapsed = isCollapsed(this.state.selection);
    if (!this.run((tr) => C.insertText(tr, data, this.storedMarks), { mergeable: collapsed && data.length === 1 && data !== ' ' })) return;
    if (data === '/' || data === '@') this.maybeOpenTrigger();
    const tr = this.state.tr();
    const marker = runInputRules(tr, this.commandOptions);
    if (marker) {
      this.closeSlash();
      this.history.seal();
      if (this.dispatch(tr)) {
        const sel = this.state.selection;
        const block = sel?.type === 'text' ? sel.focus.block : null;
        // Backspace right away turns the block back into text with the marker (engine guide §4).
        this.ruleArmed = block;
        this.emit('rule', { rule: block ? { block, marker, kind: this.activeState().blockKind } : null });
      }
      this.history.seal();
    }
  }

  private handleDelete(e: InputEvent) {
    const sel = this.state.selection;
    if (!sel) return;
    const backward = e.inputType.includes('Backward') || e.inputType === 'deleteByCut' || e.inputType === 'deleteContent';
    if (sel.type === 'node' || !isCollapsed(sel)) {
      this.run((tr) => C.deleteSelection(tr), { seal: true });
      return;
    }
    const pos = sel.focus;
    const b = getBlock(this.state.doc, pos.block);
    if (!b) return;
    const len = textLength(b);
    // The browser's idea of the range (a word, a grapheme cluster), when it stays inside this block.
    const r = e.getTargetRanges?.()[0];
    if (r) {
      const a = this.resolvePoint(r.startContainer, r.startOffset), z = this.resolvePoint(r.endContainer, r.endOffset);
      if (a && z && !('node' in a) && !('node' in z) && a.block === pos.block && z.block === pos.block && z.offset > a.offset) {
        this.run((tr) => (C.deleteRange(tr, a, z), true), { mergeable: true });
        return;
      }
    }
    if (backward && pos.offset === 0 && this.ruleArmed === pos.block) {
      this.undo();
      return;
    }
    if (backward && pos.offset === 0) {
      this.run((tr) => C.joinBackward(tr), { seal: true });
      return;
    }
    if (!backward && pos.offset === len) {
      this.run((tr) => C.joinForward(tr), { seal: true });
      return;
    }
    const text = b.text ?? '';
    let from = pos.offset, to = pos.offset;
    if (backward) {
      from = pos.offset - 1;
      if (from > 0 && isLow(text.charCodeAt(from)) && isHigh(text.charCodeAt(from - 1))) from--;
    } else {
      to = pos.offset + 1;
      if (to < len && isHigh(text.charCodeAt(pos.offset)) && isLow(text.charCodeAt(to))) to++;
    }
    this.run((tr) => (C.deleteRange(tr, { block: b.id, offset: from }, { block: b.id, offset: to }), true), { mergeable: true });
  }

  /** DOM changed without a cancelable beforeinput (some Android keyboards, spellcheck): adopt the change. */
  private onInput(e: InputEvent) {
    if (this.composing || e.isComposing) return;
    this.reconcile();
  }

  private onCompositionStart() {
    if (!this.editable) return;
    this.syncSelection();
    const sel = this.state.selection;
    if (sel?.type === 'text' && !isCollapsed(sel) && sel.anchor.block !== sel.focus.block) {
      // Engine guide §7: replace a multi-block selection before the IME writes into the DOM.
      this.run((tr) => C.deleteSelection(tr), { seal: true });
    }
    this.composing = true;
  }

  private onCompositionEnd() {
    // Safari fires compositionend before the last input event, Chrome after it. Reading the DOM
    // on the next task works for both: by then the browser has written the final text.
    setTimeout(() => {
      this.composing = false;
      this.reconcile();
      if (this.renderPending) this.render();
    }, 0);
  }

  /**
   * Compares the focused block's DOM text with the model and turns the difference into an
   * insert/delete. This is how IME composition and unexpected DOM edits enter the model.
   */
  private reconcile() {
    const root = this.dom;
    if (!root) return;
    const ds = root.ownerDocument.getSelection();
    const focusEl = ds?.focusNode ? blockElementOf(ds.focusNode, root) : null;
    const ids = new Set<string>();
    if (focusEl) ids.add(focusEl.getAttribute('data-block-id')!);
    const cur = this.state.selection;
    if (cur?.type === 'text') ids.add(cur.focus.block);
    let changed = false;
    const tr = this.state.tr();
    let caretPos: Pos | null = null;
    for (const id of ids) {
      const b = getBlock(this.state.doc, id);
      const e = this.blockElement(id);
      const c = e && textContainerOf(e);
      if (!b || !isText(b) || !c) continue;
      const domText = containerText(c);
      const model = b.text ?? '';
      if (ds?.focusNode && c.contains(ds.focusNode)) caretPos = { block: id, offset: domToOffset(c, ds.focusNode, ds.focusOffset) };
      if (domText === model) continue;
      let p = 0;
      while (p < domText.length && p < model.length && domText[p] === model[p]) p++;
      let s = 0;
      while (s < domText.length - p && s < model.length - p && domText[domText.length - 1 - s] === model[model.length - 1 - s]) s++;
      const removedTo = model.length - s;
      const inserted = domText.slice(p, domText.length - s).replace(new RegExp(OBJ, 'g'), '');
      tr.deleteText(id, p, removedTo);
      if (inserted) {
        const block = tr.block(id);
        const def = spec.blocks[block.type]!;
        const c2 = C.adaptContent({ text: inserted, marks: [], entities: [] }, block.type);
        const active = def.marks === '*' ? marksAt(block.marks ?? [], p) : [];
        tr.insertText(
          { block: id, offset: p },
          c2.text,
          active.map((m) => ({ ...m, from: 0, to: c2.text.length })),
          c2.entities,
        );
      }
      changed = true;
    }
    if (!changed) return;
    if (caretPos) tr.setSelection(caret(caretPos.block, Math.min(caretPos.offset, textLength(tr.block(caretPos.block)))));
    // The DOM already shows the text; re-render the block anyway so its structure is ours again.
    for (const id of ids) {
      const top = [getBlock(this.state.doc, id), ...ancestors(this.state.doc, id)].filter(Boolean).pop();
      if (top) this.rendered.delete(top.id);
    }
    this.dispatch(tr);
    if (caretPos) this.maybeOpenTrigger();
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.isComposing || e.keyCode === 229) return;
    for (const h of this.keyHandlers) {
      if (h(e)) {
        e.preventDefault();
        return;
      }
    }
    const mod = isMac ? e.metaKey : e.ctrlKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const sel = this.state.selection;

    if (e.key === 'Escape') {
      this.emit('action', { type: 'escape' });
      return;
    }
    if (mod && !e.altKey && (key === '/' || (key === 'f' && !e.shiftKey))) {
      e.preventDefault();
      this.emit('action', { type: key === '/' ? 'shortcuts' : 'search' });
      return;
    }
    if (!this.editable) return;

    if (mod && !e.altKey) {
      const marks: Record<string, 'bold' | 'italic' | 'underline' | 'code'> = { b: 'bold', i: 'italic', u: 'underline', e: 'code' };
      if (marks[key] && !e.shiftKey) {
        e.preventDefault();
        this.toggleMark(marks[key]!);
        return;
      }
      if (key === 'x' && e.shiftKey) {
        e.preventDefault();
        this.toggleMark('strike');
        return;
      }
      if (key === 'k') {
        e.preventDefault();
        this.emit('action', { type: 'link' });
        return;
      }

      if (key === 'z' || key === 'y') {
        e.preventDefault();
        if (key === 'y' || e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if (e.shiftKey && ['7', '8', '9', '&', '*', '('].includes(e.key)) {
        e.preventDefault();
        const k = ({ '7': 'ordered', '&': 'ordered', '8': 'bullet', '*': 'bullet', '9': 'todo', '(': 'todo' } as const)[e.key as '7'];
        this.toggleBlockKind(k);
        return;
      }
    }
    if (mod && e.altKey && /^Digit[0-3]$/.test(e.code)) {
      e.preventDefault();
      const n = Number(e.code.slice(5));
      this.setBlockKind(n === 0 ? 'paragraph' : (`heading${n}` as BlockKind));
      return;
    }

    if (e.key === 'Tab' && !mod && !e.altKey) {
      const st = this.activeState();
      if (st.blockKind === 'bullet' || st.blockKind === 'ordered' || st.blockKind === 'todo') {
        e.preventDefault();
        if (e.shiftKey) this.outdent();
        else this.indent();
        return;
      }
      if (st.inCode && !e.shiftKey) {
        e.preventDefault();
        this.insertText('  ');
        return;
      }
      if (st.inTable && st.focusBlock) {
        e.preventDefault();
        this.moveCell(st.focusBlock, e.shiftKey ? -1 : 1);
        return;
      }
      return;
    }

    if (sel?.type === 'text' && isCollapsed(sel)) {
      const b = getBlock(this.state.doc, sel.focus.block);
      const top = b && [b, ...ancestors(this.state.doc, b.id)].pop()!;
      const inBox = !!top && (top.type === 'code' || top.type === 'table' || top.type === 'quote');
      // Mod-Enter leaves a code block, table or quote; so does ArrowDown on the document's last line.
      if (inBox && e.key === 'Enter' && mod && !e.shiftKey) {
        e.preventDefault();
        this.run((tr) => C.exitBlock(tr, b!.id), { seal: true });
        return;
      }
      if (inBox && (e.key === 'ArrowDown' || e.key === 'ArrowRight') && !e.shiftKey && !mod && top === this.state.doc.blocks.at(-1) && this.atDocEnd(b!, sel.focus.offset, e.key)) {
        e.preventDefault();
        this.run((tr) => C.exitBlock(tr, b!.id), { seal: true });
        return;
      }
    }

    if (sel?.type === 'node') {
      const order = textBlocks(this.state.doc);
      const all = allBlocks(this.state.doc);
      const idx = all.findIndex((b) => b.id === sel.block);
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        this.run((tr) => C.deleteSelection(tr), { seal: true });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.run((tr) => C.splitBlock(tr), { seal: true });
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        const next = order.find((b) => all.findIndex((x) => x.id === b.id) > idx);
        if (next) this.setSelection(caret(next.id, 0));
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = [...order].reverse().find((b) => all.findIndex((x) => x.id === b.id) < idx);
        if (prev) this.setSelection(caret(prev.id, textLength(prev)));
      }
    }
  }

  /**
   * Puts the caret at the end of the document, the way a click in the empty space below the
   * content should: into the last paragraph, or a new one after a trailing code block, table,
   * quote, image or divider.
   */
  focusEnd() {
    if (!this.hasFocus) this.dom?.focus({ preventScroll: true });
    const last = this.state.doc.blocks.at(-1);
    if (!last || !this.editable) return;
    if (last.type === 'paragraph') this.setSelection(caret(last.id, textLength(last)));
    else this.run((tr) => C.exitBlock(tr, last.id), { seal: true });
  }

  /** Whether the caret is on the last visual line of the last text block (any column for ArrowDown). */
  private atDocEnd(b: Block, offset: number, key: string): boolean {
    if (textBlocks(this.state.doc).at(-1)?.id !== b.id) return false;
    const text = b.text ?? '';
    if (key === 'ArrowRight') return offset === textLength(b);
    if (text.slice(offset).includes('\n')) return false;
    const caretRect = this.rectAt({ block: b.id, offset });
    const blockRect = this.blockElement(b.id)?.querySelector('[data-bw-text]')?.getBoundingClientRect();
    return !caretRect || !blockRect || caretRect.bottom > blockRect.bottom - caretRect.height;
  }

  private moveCell(block: string, delta: 1 | -1) {
    const ctx = this.tableContext(block);
    if (!ctx) return;
    const table = getBlock(this.state.doc, ctx.table)!;
    const cells = textBlocks({ version: 1, blocks: [table] });
    const cellOf = (id: string) => ancestors(this.state.doc, id).find((b) => b.type === 'tableCell')?.id;
    const firsts = cells.filter((c, i) => i === 0 || cellOf(cells[i - 1]!.id) !== cellOf(c.id));
    const i = firsts.findIndex((c) => cellOf(c.id) === cellOf(block));
    const target = firsts[i + delta];
    if (target) this.setSelection(caret(target.id, delta > 0 ? 0 : textLength(target)));
    else if (delta > 0 && this.addRow(block, 'after')) {
      /* Tab in the last cell adds a row, like most editors. */
    }
  }

  private onMouseDown(e: MouseEvent) {
    const target = e.target as Element;
    const action = target.closest?.('[data-bw-action]');
    const blockEl = target.closest?.('[data-block-id]') as HTMLElement | null;
    if (action) {
      e.preventDefault();
      const name = action.getAttribute('data-bw-action');
      const owner = (action.closest('[data-type="code"], [data-type="listItem"], [data-type="image"], [data-type="table"]') as HTMLElement | null)?.getAttribute('data-block-id');
      if (!owner) return;
      if (name === 'resize' && this.editable) this.startResize(e, owner, action.getAttribute('data-side') === 'left');
      return;
    }
    if (!blockEl && this.editable && target === this.dom) {
      // A click in the empty space below the content puts the caret in a trailing paragraph.
      const last = this.state.doc.blocks.at(-1);
      const lastEl = last && this.blockElement(last.id);
      if (last && lastEl && e.clientY > lastEl.getBoundingClientRect().bottom) {
        e.preventDefault();
        this.focusEnd();
        return;
      }
    }
    if (blockEl && this.editable) {
      const b = getBlock(this.state.doc, blockEl.getAttribute('data-block-id')!);
      if (b && isAtom(b)) {
        e.preventDefault();
        if (!this.hasFocus) this.dom?.focus({ preventScroll: true });
        this.setSelection({ type: 'node', block: b.id });
      }
    }
  }

  private onClick(e: MouseEvent) {
    const target = e.target as Element;
    const action = target.closest?.('[data-bw-action]');
    if (action) {
      const name = action.getAttribute('data-bw-action');
      const owner = (action.closest('[data-type="code"], [data-type="listItem"], [data-type="table"]') as HTMLElement | null)?.getAttribute('data-block-id');
      if (!owner) return;
      e.preventDefault();
      if (name === 'toggle-check') this.toggleChecked(owner);
      else if (name === 'code-language' && this.editable) this.emit('action', { type: 'code-language', block: owner });
      else if (name === 'code-copy') {
        const text = getBlock(this.state.doc, owner)?.text ?? '';
        void navigator.clipboard?.writeText(text);
        action.classList.add('bw-copied');
        action.textContent = this.options.copiedLabel ?? '';
        setTimeout(() => {
          action.classList.remove('bw-copied');
          action.textContent = '';
        }, 1600);
      } else if (name === 'table-add-row' || name === 'table-add-col') {
        const table = getBlock(this.state.doc, owner);
        const rows = table?.children ?? [];
        const lastRow = rows[rows.length - 1];
        const lastCell = lastRow?.children?.[lastRow.children.length - 1];
        const p = lastCell?.children?.[0];
        if (!p) return;
        if (name === 'table-add-row') this.addRow(p.id, 'after');
        else this.addColumn(p.id, 'after');
        this.focus();
      }
      return;
    }
    // Links open on Cmd/Ctrl-click while editing, and on plain click when read-only (target=_blank).
    const a = target.closest?.('a.bw-link') as HTMLAnchorElement | null;
    if (a && this.editable) {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) window.open(a.href, '_blank', 'noopener,noreferrer');
    }
  }

  private startResize(e: MouseEvent, block: string, left: boolean) {
    const fig = this.blockElement(block);
    const frame = fig?.querySelector('.bw-image-frame') as HTMLElement | null;
    const label = fig?.querySelector('.bw-image-size') as HTMLElement | null;
    if (!frame) return;
    this.setSelection({ type: 'node', block });
    this.resizing = true;
    const startX = e.clientX;
    const startW = frame.getBoundingClientRect().width;
    const max = Math.min(2000, (fig!.parentElement?.getBoundingClientRect().width ?? 2000) || 2000);
    let width = startW;
    const move = (ev: MouseEvent) => {
      // The image is centered, so each side moves half the width change.
      const dx = (ev.clientX - startX) * (left ? -2 : 2);
      width = Math.round(Math.max(16, Math.min(max, startW + dx)));
      frame.style.width = `${width}px`;
      if (label) label.textContent = `${width} px`;
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      this.resizing = false;
      if (label) label.textContent = '';
      this.setImageAttrs(block, { width });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  // -------------------------------------------------------------------------------------------
  // Clipboard

  /** The selected content as a standalone document. */
  sliceSelection(): Doc | null {
    const doc = this.state.doc;
    const sel = this.state.selection;
    if (!sel) return null;
    if (sel.type === 'node') {
      const b = getBlock(doc, sel.block);
      return b ? { version: 1, blocks: [b] } : null;
    }
    const r = selectionRange(doc, sel);
    if (!r || isCollapsed(sel)) return null;
    const slice = (b: Block, from: number, to: number): Block => {
      const c = C.contentOf(b, from, to);
      return { ...b, text: c.text, marks: c.marks, entities: c.entities };
    };
    if (r.from.block === r.to.block) {
      const b = getBlock(doc, r.from.block)!;
      const part: Block = { ...slice(b, r.from.offset, r.to.offset), type: b.type === 'code' ? 'code' : 'paragraph' };
      if (b.type !== 'code') delete part.attrs;
      return { version: 1, blocks: [tidyBlock(part)] };
    }
    const order = allBlocks(doc);
    const ia = order.findIndex((b) => b.id === r.from.block), ib = order.findIndex((b) => b.id === r.to.block);
    const end = new Map<string, number>();
    const last = (b: Block): number => {
      let e = order.indexOf(b);
      for (const c of b.children ?? []) e = last(c);
      end.set(b.id, e);
      return e;
    };
    doc.blocks.forEach(last);
    const out: Block[] = [];
    let skipUntil = -1;
    for (let i = ia; i <= ib; i++) {
      const b = order[i]!;
      if (i <= skipUntil) continue;
      if (i === ia) out.push(tidyBlock(slice(b, r.from.offset, textLength(b))));
      else if (i === ib) out.push(tidyBlock(slice(b, 0, r.to.offset)));
      else if (end.get(b.id)! < ib && !spec.blocks[b.type]?.nestedOnly) {
        out.push(b);
        skipUntil = end.get(b.id)!;
      } else if (isText(b)) out.push(b.type === 'paragraph' || b.type === 'heading' || b.type === 'listItem' || b.type === 'code' ? b : { ...b, type: 'paragraph' });
    }
    // Clean up list indents so the slice is valid on its own.
    let prev: number | null = null;
    const fixed = out.map((b) => {
      if (b.type !== 'listItem') {
        prev = null;
        return b;
      }
      const indent = Math.min(Number(b.attrs?.indent ?? 0), prev === null ? 0 : prev + 1);
      prev = indent;
      return { ...b, attrs: { ...b.attrs, indent } };
    });
    return { version: 1, blocks: fixed.map(tidyBlock) };
  }

  /** Plain text of a document: blocks on their own lines, line breaks as newlines. */
  static toPlainText(doc: Doc, mentionLabel?: (id: string) => string): string {
    return textBlocks(doc)
      .map((b) => {
        const ents = new Map((b.entities ?? []).map((e) => [e.at, e]));
        let s = '';
        const t = b.text ?? '';
        for (let i = 0; i < t.length; i++) {
          if (t[i] !== OBJ) s += t[i];
          else {
            const e = ents.get(i);
            if (e?.type === 'lineBreak') s += '\n';
            else if (e?.type === 'mention') s += '@' + (mentionLabel?.(String(e.attrs?.userId)) ?? String(e.attrs?.userId));
          }
        }
        return s;
      })
      .join('\n');
  }

  private onCopy(e: ClipboardEvent, cut: boolean) {
    const slice = this.sliceSelection();
    if (!slice || !e.clipboardData) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', Editor.toPlainText(slice, this.options.mentionLabel));
    e.clipboardData.setData(CLIPBOARD_MIME, JSON.stringify(slice));
    const holder = document.createElement('div');
    const numbers = listNumbers(slice.blocks);
    for (const b of slice.blocks) holder.append(renderBlock(b, { ...this.ctx(), editable: false, numbers }));
    holder.querySelectorAll('[contenteditable], [data-bw-action], [data-block-id]').forEach((n) => {
      n.removeAttribute('contenteditable');
      n.removeAttribute('data-block-id');
      if (n.hasAttribute('data-bw-action') && n.tagName === 'BUTTON') n.remove();
    });
    e.clipboardData.setData('text/html', holder.innerHTML);
    if (cut && this.editable) this.run((tr) => C.deleteSelection(tr), { seal: true });
  }

  private onPaste(e: ClipboardEvent) {
    e.preventDefault();
    if (!this.editable || !e.clipboardData) return;
    this.syncSelection();
    this.pasteData(e.clipboardData);
  }

  /**
   * Inserts clipboard or drag data: Blockwell JSON first, then HTML (with Google Docs and Word
   * rules), then Markdown-looking text, then plain text (engine guide §5).
   */
  pasteData(data: DataTransfer) {
    const files = Array.from(data.files ?? []);
    if (files.length && files.every((f) => f.type.startsWith('image/'))) {
      this.uploadImages(files);
      return;
    }
    const plain = data.getData('text/plain');
    const focus = this.state.selection?.type === 'text' ? getBlock(this.state.doc, this.state.selection.focus.block) : null;
    if (focus?.type === 'code') {
      this.run((tr) => C.insertText(tr, plain.replace(/\r\n?/g, '\n'), null), { seal: true });
      return;
    }
    const own = data.getData(CLIPBOARD_MIME);
    let parsed = own ? parseBlockwell(own) : null;
    const html = data.getData('text/html');
    // Code editors put styled spans on the clipboard; Markdown text says more than that HTML.
    const structured = /<(h[1-6]|ul|ol|li|table|pre|blockquote|strong|b|em|i|a|img|hr)\b/i.test(html);
    if (!parsed && html && (structured || !looksLikeMarkdown(plain))) parsed = parseHtml(html);
    if ((!parsed || parsed.blocks.length === 0) && looksLikeMarkdown(plain)) {
      const md = parseMarkdown(plain);
      parsed = { blocks: md.blocks, report: { ...emptyReport('markdown'), counts: md.counts } };
    }
    if (!parsed || parsed.blocks.length === 0) parsed = { blocks: C.textToBlocks(plain), report: emptyReport('text') };
    const { blocks, report: r } = parsed;
    const ok = this.run((tr) => C.insertFragment(tr, blocks, this.commandOptions), { seal: true });
    this.history.seal();
    if (!ok) return;
    this.lastPastePlain = plain;
    const noteworthy =
      r.source === 'gdocs' || r.source === 'word' || r.source === 'markdown' || (r.source === 'html' && (r.droppedAttrs.length > 0 || r.unknownElements > 0 || r.unsafeUrls > 0));
    if (noteworthy) this.emit('paste', { report: r });
    const sel = this.state.selection;
    const block = sel?.type === 'text' ? sel.focus.block : undefined;
    if (r.skipped) this.emit('feedback', { level: 'skip', code: 'unsupported', count: r.skipped, block });
    if (r.issues.some((i) => i.code === 'unsafe-image')) this.emit('feedback', { level: 'reject', code: 'image-src', block });
  }

  private onDrop(e: DragEvent) {
    const data = e.dataTransfer;
    if (!data) return;
    const hasFiles = Array.from(data.files ?? []).some((f) => f.type.startsWith('image/'));
    const external = !hasFiles && (data.types.includes('text/html') || data.types.includes('text/plain')) && !data.types.includes(CLIPBOARD_MIME);
    if (!hasFiles && !external) return;
    e.preventDefault();
    if (!this.editable) return;
    const doc = this.dom!.ownerDocument as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
    const range = doc.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (range) {
      const p = this.resolvePoint(range.startContainer, range.startOffset);
      if (p && !('node' in p)) this.setSelection(caret(p.block, p.offset), { write: false });
    }
    this.pasteData(data);
  }
}

/** Highlight ranges per editor; several editors on a page share the global registry. */
const highlightOwners = new Map<Editor, Map<string, Range[]>>();

function publishHighlights(owner: Editor, ranges: Map<string, Range[]> | null) {
  if (ranges) highlightOwners.set(owner, ranges);
  else highlightOwners.delete(owner);
  const registry = typeof CSS !== 'undefined' ? (CSS as unknown as { highlights?: Map<string, unknown> }).highlights : undefined;
  const HighlightCtor = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  if (!registry || !HighlightCtor) return;
  const names = new Set<string>();
  for (const m of highlightOwners.values()) for (const n of m.keys()) names.add(n);
  for (const key of [...registry.keys()]) if (key.startsWith('bw-') && !names.has(key.slice(3))) registry.delete(key);
  for (const n of names) {
    const all: Range[] = [];
    for (const m of highlightOwners.values()) all.push(...(m.get(n) ?? []));
    registry.set(`bw-${n}`, new HighlightCtor(...all));
  }
}

function tidyBlock(b: Block): Block {
  const out: Block = { ...b };
  if (!out.marks?.length) delete out.marks;
  if (!out.entities?.length) delete out.entities;
  if (!out.attrs || Object.keys(out.attrs).length === 0) delete out.attrs;
  else {
    const attrs: Attrs = {};
    for (const [k, v] of Object.entries(out.attrs)) if (v !== undefined && !(k === 'indent' && v === 0)) attrs[k] = v;
    if (Object.keys(attrs).length) out.attrs = attrs;
    else delete out.attrs;
  }
  return out;
}

function sameSelection(a: Selection | null, b: Selection | null): boolean {
  if (!a || !b) return a === b;
  if (a.type === 'node' || b.type === 'node') return a.type === b.type && (a as { block: string }).block === (b as { block: string }).block;
  return a.anchor.block === b.anchor.block && a.anchor.offset === b.anchor.offset && a.focus.block === b.focus.block && a.focus.offset === b.focus.offset;
}

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;
