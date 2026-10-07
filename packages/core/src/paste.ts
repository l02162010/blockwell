import { isSafeUrl, spec, validate } from '@blockwell/schema';
import { IMAGE_SCHEMES, LINK_SCHEMES } from './commands.js';
import { OBJ, normalizeMarks } from './marks.js';
import { emptyTable, newId, withFreshIds } from './model.js';
import type { Attrs, Block, Doc, Entity, Mark } from './types.js';

/** MIME type of Blockwell's own clipboard format: a document JSON. */
export const CLIPBOARD_MIME = 'application/x-blockwell+json';

export interface PasteReport {
  /** Schema features the paste kept, e.g. `heading`, `bold`, `link`. */
  kept: string[];
  /** Number of elements whose tag is unknown; their text is kept. */
  unknownElements: number;
  /** Attributes that were dropped, by name (`style`, `class`, `on*`). */
  droppedAttrs: string[];
  /** Links or images whose URL failed the check. */
  unsafeUrls: number;
  source: 'blockwell' | 'html' | 'text';
}

export interface ParsedPaste {
  blocks: Block[];
  report: PasteReport;
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'IMG', 'TABLE', 'UL', 'OL', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'FIGURE', 'FIGCAPTION', 'TR', 'TD', 'TH', 'TBODY', 'THEAD', 'TFOOT', 'DL', 'DT', 'DD', 'ADDRESS']);
const INLINE_MARK: Record<string, string> = { B: 'bold', STRONG: 'bold', I: 'italic', EM: 'italic', U: 'underline', S: 'strike', DEL: 'strike', STRIKE: 'strike', CODE: 'code', KBD: 'code', SAMP: 'code' };
const KNOWN = new Set([...BLOCK_TAGS, ...Object.keys(INLINE_MARK), 'A', 'BR', 'SPAN', 'BODY', 'HTML', 'HEAD', 'MARK', 'SUB', 'SUP', 'SMALL', 'FONT', 'LABEL', 'INPUT', 'META', 'COLGROUP', 'COL', 'CAPTION', 'TT', 'Q', 'CITE', 'ABBR', 'TIME', 'WBR']);
/** Elements whose content is never text. */
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'CANVAS', 'VIDEO', 'AUDIO', 'TITLE', 'HEAD', 'BUTTON', 'SELECT', 'TEXTAREA']);

const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F\uFFFC]/g;

/** Text run builder for one text block. */
class Line {
  text = '';
  marks: Mark[] = [];
  entities: Entity[] = [];
  add(text: string, active: Mark[]) {
    const clean = text.replace(CONTROL, '');
    if (!clean) return;
    const from = this.text.length;
    this.text += clean;
    for (const m of active) this.marks.push({ ...m, from, to: this.text.length });
  }
  lineBreak() {
    this.entities.push({ at: this.text.length, type: 'lineBreak' });
    this.text += OBJ;
  }
  get empty() {
    return this.text.replace(/[\s\uFFFC]/g, '') === '';
  }
  toBlock(type: string, attrs?: Attrs): Block {
    // Collapse whitespace like a browser would, keeping offsets of marks and entities in step.
    const b: Block = { id: newId(), type, text: this.text };
    if (attrs && Object.keys(attrs).length) b.attrs = attrs;
    const marks = normalizeMarks(this.marks.filter((m) => m.to > m.from));
    if (marks.length) b.marks = enforceExclusive(marks);
    if (this.entities.length) b.entities = this.entities;
    return trimBlock(b);
  }
}

function enforceExclusive(marks: Mark[]): Mark[] {
  const code = marks.filter((m) => m.type === 'code');
  if (code.length === 0) return marks;
  return marks.filter((m) => m.type === 'code' || !code.some((c) => m.from < c.to && c.from < m.to));
}

/** Trims leading/trailing whitespace and collapses runs of whitespace, shifting marks and entities. */
function trimBlock(b: Block): Block {
  const text = b.text ?? '';
  const keep: number[] = [];
  let out = '';
  let prevSpace = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const space = /[ \t\n\r\f]/.test(ch);
    if (space && prevSpace) continue;
    keep[i] = out.length;
    out += space ? ' ' : ch;
    prevSpace = space || ch === OBJ;
  }
  while (out.endsWith(' ')) out = out.slice(0, -1);
  const map = (i: number) => {
    for (let j = i; j < text.length; j++) if (keep[j] !== undefined) return Math.min(keep[j]!, out.length);
    return out.length;
  };
  const marks = (b.marks ?? []).map((m) => ({ ...m, from: map(m.from), to: map(m.to) })).filter((m) => m.to > m.from);
  const entities = (b.entities ?? []).filter((e) => keep[e.at] !== undefined && keep[e.at]! < out.length).map((e) => ({ ...e, at: keep[e.at]! }));
  const res: Block = { ...b, text: out };
  if (marks.length) res.marks = normalizeMarks(marks);
  else delete res.marks;
  if (entities.length) res.entities = entities;
  else delete res.entities;
  return res;
}

/**
 * Parses pasted HTML into schema blocks. The HTML is parsed into an inert document that is never
 * attached to the page; only element names, text, `href` and `src` are read, and URLs are checked.
 */
export function parseHtml(html: string, parser: DOMParser = new DOMParser()): ParsedPaste {
  const dom = parser.parseFromString(html, 'text/html');
  const report: PasteReport = { kept: [], unknownElements: 0, droppedAttrs: [], unsafeUrls: 0, source: 'html' };
  const kept = new Set<string>();
  const dropped = new Set<string>();
  const blocks: Block[] = [];

  const noteAttrs = (el: Element) => {
    for (const a of Array.from(el.attributes)) {
      const n = a.name.toLowerCase();
      if (n === 'href' || n === 'src' || n === 'alt') continue;
      dropped.add(n.startsWith('on') ? 'on*' : n.startsWith('data-') ? 'data-*' : n);
    }
  };

  // Block context: the block being built and its type.
  let line: Line | null = null;
  let lineType = 'paragraph';
  let lineAttrs: Attrs = {};
  let list: { style: string; depth: number }[] = [];
  let quote: Block[] | null = null;

  const push = (b: Block) => (quote && ['paragraph', 'heading', 'listItem'].includes(b.type) ? quote.push(b) : blocks.push(b));
  const flush = () => {
    if (line && (!line.empty || lineType === 'code')) {
      if (lineType === 'code') {
        push({ id: newId(), type: 'code', text: line.text.replace(/\n$/, '') });
      } else push(line.toBlock(lineType, lineAttrs));
    }
    line = null;
  };
  const open = (type: string, attrs: Attrs = {}) => {
    flush();
    line = new Line();
    lineType = type;
    lineAttrs = attrs;
    if (type !== 'paragraph') kept.add(type === 'listItem' ? 'list' : type);
  };
  const cur = () => {
    if (!line) open(list.length ? 'listItem' : 'paragraph', list.length ? listAttrs() : {});
    return line!;
  };
  const listAttrs = (): Attrs => {
    const top = list[list.length - 1]!;
    const a: Attrs = { style: top.style };
    if (top.depth > 0) a.indent = Math.min(6, top.depth);
    return a;
  };

  const walk = (node: Node, active: Mark[], pre: boolean) => {
    if (node.nodeType === 3) {
      const text = node.nodeValue ?? '';
      if (pre) cur().add(text.replace(/\r\n?/g, '\n'), []);
      else if (text.trim() || line) cur().add(text, active);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (SKIP.has(tag)) {
      if (tag !== 'HEAD' && tag !== 'TITLE') report.unknownElements++;
      return;
    }
    noteAttrs(el);
    if (!KNOWN.has(tag)) report.unknownElements++;

    const kids = () => Array.from(el.childNodes).forEach((c) => walk(c, active, pre));
    const kidsWith = (marks: Mark[]) => Array.from(el.childNodes).forEach((c) => walk(c, marks, pre));

    switch (tag) {
      case 'BR':
        if (pre) cur().add('\n', []);
        else cur().lineBreak();
        return;
      case 'H1':
      case 'H2':
      case 'H3':
      case 'H4':
      case 'H5':
      case 'H6':
        open('heading', { level: Math.min(3, Number(tag[1])) });
        kids();
        flush();
        return;
      case 'P':
      case 'DIV':
      case 'SECTION':
      case 'ARTICLE':
      case 'HEADER':
      case 'FOOTER':
      case 'MAIN':
      case 'ASIDE':
      case 'NAV':
      case 'FIGURE':
      case 'FIGCAPTION':
      case 'ADDRESS':
      case 'DT':
      case 'DD':
        if (list.length && line && (line as Line).empty) {
          kids();
          return;
        }
        open(list.length ? 'listItem' : 'paragraph', list.length ? listAttrs() : {});
        kids();
        flush();
        return;
      case 'UL':
      case 'OL': {
        flush();
        list = [...list, { style: tag === 'OL' ? 'ordered' : 'bullet', depth: list.length }];
        kids();
        flush();
        list = list.slice(0, -1);
        return;
      }
      case 'LI': {
        if (!list.length) list = [{ style: 'bullet', depth: 0 }];
        const attrs = listAttrs();
        const box = el.querySelector(':scope > input[type=checkbox]');
        if (box) {
          attrs.style = 'todo';
          if (box.hasAttribute('checked')) attrs.checked = true;
        }
        open('listItem', attrs);
        kids();
        flush();
        return;
      }
      case 'BLOCKQUOTE': {
        flush();
        if (quote) {
          kids();
          flush();
          return;
        }
        quote = [];
        kids();
        flush();
        const children = quote as Block[];
        quote = null;
        if (children.length) {
          blocks.push({ id: newId(), type: 'quote', children });
          kept.add('quote');
        }
        return;
      }
      case 'PRE':
        open('code');
        Array.from(el.childNodes).forEach((c) => walk(c, [], true));
        flush();
        return;
      case 'HR':
        flush();
        blocks.push({ id: newId(), type: 'divider' });
        kept.add('divider');
        return;
      case 'IMG': {
        const src = el.getAttribute('src') ?? '';
        if (!isSafeUrl(src, IMAGE_SCHEMES)) {
          report.unsafeUrls++;
          return;
        }
        flush();
        const attrs: Attrs = { src };
        const alt = (el.getAttribute('alt') ?? '').replace(CONTROL, '').slice(0, spec.limits.maxAltLength);
        if (alt) attrs.alt = alt;
        blocks.push({ id: newId(), type: 'image', attrs });
        kept.add('image');
        return;
      }
      case 'TABLE': {
        flush();
        const rows = Array.from(el.querySelectorAll('tr')).filter((tr) => tr.closest('table') === el);
        const cells = rows.map((r) => Array.from(r.children).filter((c) => c.tagName === 'TD' || c.tagName === 'TH'));
        const cols = Math.min(spec.limits.maxTableColumns, Math.max(1, ...cells.map((c) => c.length)));
        if (rows.length === 0) return;
        const table = emptyTable(Math.min(rows.length, spec.limits.maxTableRows), cols);
        table.children!.forEach((row, ri) =>
          row.children!.forEach((cell, ci) => {
            const src = cells[ri]?.[ci];
            if (!src) return;
            const inner = new Line();
            collectInline(src, inner, [], kept, report);
            cell.children = [inner.toBlock('paragraph')].map((b) => ({ ...b, id: newId() }));
          }),
        );
        blocks.push(table);
        kept.add('table');
        return;
      }
      case 'A': {
        const href = el.getAttribute('href') ?? '';
        if (isSafeUrl(href, LINK_SCHEMES)) {
          kept.add('link');
          kidsWith([...active.filter((m) => m.type !== 'link'), { type: 'link', from: 0, to: 0, attrs: { href } }]);
        } else {
          if (href) report.unsafeUrls++;
          kids();
        }
        return;
      }
      case 'INPUT':
        return;
      default: {
        const mark = INLINE_MARK[tag];
        if (mark) {
          kept.add(mark);
          kidsWith(active.some((m) => m.type === mark) ? active : [...active, { type: mark, from: 0, to: 0 }]);
        } else kids();
      }
    }
  };

  walk(dom.body, [], false);
  flush();
  report.kept = [...kept];
  report.droppedAttrs = [...dropped];
  return { blocks: sanitize(blocks), report };
}

function collectInline(el: Element, line: Line, active: Mark[], kept: Set<string>, report: PasteReport) {
  for (const c of Array.from(el.childNodes)) {
    if (c.nodeType === 3) line.add(c.nodeValue ?? '', active);
    else if (c.nodeType === 1) {
      const e = c as Element;
      const tag = e.tagName.toUpperCase();
      if (SKIP.has(tag)) continue;
      if (tag === 'BR') line.add(' ', active);
      else if (tag === 'A' && isSafeUrl(e.getAttribute('href') ?? '', LINK_SCHEMES)) {
        kept.add('link');
        collectInline(e, line, [...active, { type: 'link', from: 0, to: 0, attrs: { href: e.getAttribute('href')! } }], kept, report);
      } else if (INLINE_MARK[tag]) {
        kept.add(INLINE_MARK[tag]!);
        collectInline(e, line, [...active, { type: INLINE_MARK[tag]!, from: 0, to: 0 }], kept, report);
      } else collectInline(e, line, active, kept, report);
    }
  }
}

/**
 * Fixes list indentation (each item at most one level deeper than the previous) and keeps only
 * blocks that pass validation on their own, as defence in depth.
 */
function sanitize(blocks: Block[]): Block[] {
  const fixIndents = (list: Block[]): Block[] => {
    let prev: number | null = null;
    return list.map((b) => {
      if (b.type === 'quote' && b.children) return { ...b, children: fixIndents(b.children) };
      if (b.type !== 'listItem') {
        prev = null;
        return b;
      }
      const max = prev === null ? 0 : prev + 1;
      const indent = Math.min(Number(b.attrs?.indent ?? 0), max);
      prev = indent;
      const attrs = { ...b.attrs };
      if (indent) attrs.indent = indent;
      else delete attrs.indent;
      return { ...b, attrs };
    });
  };
  const alone = (b: Block): Block => {
    if (b.type !== 'listItem' || !b.attrs?.indent) return b;
    const attrs = { ...b.attrs };
    delete attrs.indent;
    return { ...b, attrs };
  };
  return fixIndents(blocks).filter((b) => validate({ version: 1, blocks: [alone(b)] }).ok);
}

/** Reads Blockwell's own clipboard JSON. Invalid documents are rejected whole. */
export function parseBlockwell(json: string): ParsedPaste | null {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return null;
  }
  const res = validate(doc);
  if (!res.ok) return null;
  return {
    blocks: (doc as Doc).blocks.map(withFreshIds),
    report: { kept: [], unknownElements: 0, droppedAttrs: [], unsafeUrls: 0, source: 'blockwell' },
  };
}
