import { spec, validate } from '@blockwell/schema';
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
import { CLIPBOARD_MIME, parseBlockwell, parseHtml, type PasteReport } from './paste.js';
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
  /** Shown when the whole document is empty and unfocused. */
  emptyPlaceholder?: string;
  mentionLabel?: (userId: string) => string;
  languageLabel?: (language: string) => string;
  /** Uploads an image file and resolves to an `https:` URL. Without it, pasted or dropped files are ignored. */
  uploadImage?: (file: File, onProgress: (fraction: number) => void) => Promise<UploadResult>;
}

export interface SlashState {
  block: string;
  /** Offset of the `/`. */
  from: number;
  query: string;
}

export interface Upload {
  id: string;
  name: string;
  progress: number;
  error?: string;
}

export type EditorAction =
  | { type: 'code-language'; block: string }
  | { type: 'link' }
  | { type: 'escape' };

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
  uploads: { uploads: Upload[] };
  /** A command could not do anything (e.g. Tab on a list item already at max depth). */
  refuse: { reason: string; block?: string | undefined };
  /** A transaction failed validation and was dropped. */
  reject: { errors: unknown };
}

type Handler<K extends keyof EditorEvents> = (e: EditorEvents[K]) => void;
export type KeyHandler = (e: KeyboardEvent) => boolean;

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
  private slashState: SlashState | null = null;
  private uploadList: Upload[] = [];
  private lastPastePlain: string | null = null;
  private teardown: (() => void)[] = [];
  private placeholderEl: HTMLElement | null = null;
  private resizing = false;

  constructor(options: EditorOptions = {}) {
    this.options = options;
    this.editable = options.editable ?? true;
    this.commandOptions = { allowedBlocks: options.allowedBlocks ? new Set(options.allowedBlocks) : null };
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
      this.render(true);
      return false;
    }
    this.apply(res.state, res.tr);
    this.history.record(res.tr);
    return true;
  }

  private apply(state: EditorState, tr: Transaction) {
    this.state = state;
    this.storedMarks = null;
    this.render();
    this.updateSlash();
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
    this.state = new EditorState(this.state.doc, sel);
    this.storedMarks = null;
    if (write) this.writeSelection();
    this.updateDecorations();
    this.updateSlash();
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
      this.emit('update', { editor: this });
      return true;
    }
    return this.run((tr) => C.toggleMark(tr, type));
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
    return this.run((tr) => C.setMarkValue(tr, type, token ? { value: token } : null));
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
    return this.run((tr) => C.setBlockKind(tr, kind, this.commandOptions), { seal: true });
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
  insertImage(attrs: UploadResult): boolean {
    if (!C.IMAGE_SCHEMES.length) return false;
    return this.run((tr) => C.insertBlock(tr, C.newImage(attrs), this.commandOptions), { seal: true });
  }

  insertMention(userId: string): boolean {
    return this.run((tr) => C.insertEntity(tr, 'mention', { userId }));
  }

  insertText(text: string): boolean {
    return this.run((tr) => C.insertText(tr, text, this.storedMarks));
  }

  setCodeLanguage(block: string, language: string): boolean {
    return this.run((tr) => (tr.updateAttrs(block, { language: language === 'plaintext' ? undefined : language }), true));
  }

  setImageAttrs(block: string, patch: { alt?: string; width?: number | null }): boolean {
    return this.run((tr) => {
      const p: Record<string, string | number | undefined> = {};
      if (patch.alt !== undefined) p.alt = patch.alt || undefined;
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

  // -------------------------------------------------------------------------------------------
  // Slash menu

  get slash(): SlashState | null {
    return this.slashState;
  }

  closeSlash() {
    if (!this.slashState) return;
    this.slashState = null;
    this.emit('slash', { slash: null });
  }

  /** Removes the typed `/query` and runs `fn` (a block conversion or insertion). */
  runSlash(fn: (editor: Editor) => void) {
    const s = this.slashState;
    if (!s) return;
    this.closeSlash();
    const sel = this.state.selection;
    const end = sel?.type === 'text' && sel.focus.block === s.block ? sel.focus.offset : s.from + 1 + s.query.length;
    this.run((tr) => {
      tr.deleteText(s.block, s.from, end);
      tr.setSelection(caret(s.block, s.from));
      return true;
    }, { seal: true });
    fn(this);
  }

  /** Types `/` at the caret and opens the slash menu, as if the user had typed it. */
  startSlash() {
    if (!this.insertText('/')) return;
    this.maybeOpenSlash();
  }

  private updateSlash() {
    const s = this.slashState;
    if (!s) return;
    const sel = this.state.selection;
    const b = getBlock(this.state.doc, s.block);
    const ok =
      this.editable &&
      sel?.type === 'text' &&
      isCollapsed(sel) &&
      sel.focus.block === s.block &&
      !!b &&
      (b.text ?? '')[s.from] === '/' &&
      sel.focus.offset > s.from;
    if (!ok) return this.closeSlash();
    const query = (b.text ?? '').slice(s.from + 1, sel.focus.offset);
    if (query.length > 32 || /[\n\uFFFC]/.test(query) || /\s{2}/.test(query)) return this.closeSlash();
    if (query !== s.query) {
      this.slashState = { ...s, query };
      this.emit('slash', { slash: this.slashState });
    }
  }

  private maybeOpenSlash() {
    const sel = this.state.selection;
    if (sel?.type !== 'text' || !isCollapsed(sel)) return;
    const b = getBlock(this.state.doc, sel.focus.block);
    if (!b || b.type === 'code') return;
    const at = sel.focus.offset - 1;
    const text = b.text ?? '';
    if (text[at] !== '/' || (at > 0 && !/\s/.test(text[at - 1]!))) return;
    this.slashState = { block: b.id, from: at, query: '' };
    this.emit('slash', { slash: this.slashState });
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
  }

  destroy() {
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
    for (const block of this.state.doc.blocks) {
      const num = numbers.get(block.id);
      let entry = this.rendered.get(block.id);
      if (!entry || entry.block !== block || entry.num !== num) entry = { block, el: renderBlock(block, { ...ctx, numbers }), num };
      next.set(block.id, entry);
      desired.push(entry.el);
    }
    // Drop stale blocks and anything the browser inserted, then put the rest in order.
    const keep = new Set<Node>(desired);
    for (const n of Array.from(root.childNodes)) if (!keep.has(n)) n.remove();
    let cursor: ChildNode | null = root.firstChild;
    for (const el of desired) {
      if (el === cursor) cursor = cursor.nextSibling;
      else root.insertBefore(el, cursor);
    }
    this.rendered = next;
    this.updateDecorations();
    this.writeSelection();
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
      if (b && b.type === 'paragraph' && !b.text && !inCell) {
        target = this.blockElement(b.id);
        text = this.options.placeholder;
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
    if (data === '/') this.maybeOpenSlash();
    const tr = this.state.tr();
    if (runInputRules(tr, this.commandOptions)) {
      this.closeSlash();
      this.history.seal();
      this.dispatch(tr);
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
    if (caretPos) this.maybeOpenSlash();
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
        setTimeout(() => action.classList.remove('bw-copied'), 1200);
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
    if (!this.editable) return;
    const data = e.clipboardData;
    if (!data) return;
    this.syncSelection();
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
    if (!parsed && html) parsed = parseHtml(html);
    if (!parsed || parsed.blocks.length === 0) parsed = { blocks: C.textToBlocks(plain), report: { kept: [], unknownElements: 0, droppedAttrs: [], unsafeUrls: 0, source: 'text' } };
    const blocks = parsed.blocks;
    const ok = this.run((tr) => C.insertFragment(tr, blocks, this.commandOptions), { seal: true });
    this.history.seal();
    if (!ok) return;
    this.lastPastePlain = plain;
    const r = parsed.report;
    if (r.source === 'html' && (r.droppedAttrs.length || r.unknownElements || r.unsafeUrls)) this.emit('paste', { report: r });
  }

  private onDrop(e: DragEvent) {
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    if (!this.editable) return;
    const doc = this.dom!.ownerDocument as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
    const range = doc.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (range) {
      const p = this.resolvePoint(range.startContainer, range.startOffset);
      if (p && !('node' in p)) this.setSelection(caret(p.block, p.offset), { write: false });
    }
    this.uploadImages(files);
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
