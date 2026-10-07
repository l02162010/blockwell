import { flatten, isSafeUrl, spec } from '@blockwell/schema';
import { IMAGE_SCHEMES, LINK_SCHEMES } from './commands.js';
import { tokenize } from './highlight.js';
import { OBJ } from './marks.js';
import type { Block, Mark } from './types.js';

export interface RenderOptions {
  editable: boolean;
  /** Display text for a mention entity. */
  mentionLabel?: (userId: string) => string;
  /** Label shown for a code block's language. */
  languageLabel?: (language: string) => string;
}

/** Mark nesting order, outermost first. */
const MARK_ORDER = ['link', 'code', 'bold', 'italic', 'underline', 'strike', 'color', 'highlight'];

type Child = Node | string;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const c of children) e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}

function wrap(child: Node, mark: Mark, editable: boolean): Node {
  switch (mark.type) {
    case 'bold':
      return el('strong', {}, child);
    case 'italic':
      return el('em', {}, child);
    case 'underline':
      return el('u', {}, child);
    case 'strike':
      return el('s', {}, child);
    case 'code':
      return el('code', { class: 'bw-inline-code' }, child);
    case 'link': {
      const href = String(mark.attrs?.href ?? '');
      // Re-checked at render time: stored data may predate a rule change or be tampered with.
      if (!isSafeUrl(href, LINK_SCHEMES)) return child;
      const a = el('a', { href, rel: 'noopener noreferrer nofollow', class: 'bw-link' }, child);
      if (!editable) a.setAttribute('target', '_blank');
      return a;
    }
    case 'color':
    case 'highlight': {
      const token = String(mark.attrs?.value ?? '');
      if (!spec.palette.includes(token)) return child;
      return el('span', { class: `bw-${mark.type === 'color' ? 'c' : 'bg'}-${token}` }, child);
    }
    default:
      return child;
  }
}

/** Fills a text container with the block's runs. Text only ever becomes text nodes. */
export function renderText(container: HTMLElement, block: Block, o: RenderOptions) {
  container.replaceChildren();
  const text = block.text ?? '';
  const marks = block.marks ?? [];
  const entities = new Map((block.entities ?? []).map((e) => [e.at, e]));
  const cuts = new Set<number>([0, text.length]);
  for (const m of marks) cuts.add(m.from).add(m.to);
  for (const at of entities.keys()) cuts.add(at).add(at + 1);
  const points = [...cuts].sort((a, b) => a - b);

  for (let i = 0; i + 1 < points.length; i++) {
    const from = points[i]!, to = points[i + 1]!;
    if (from >= to) continue;
    const entity = entities.get(from);
    if (entity && text[from] === OBJ) {
      if (entity.type === 'lineBreak') container.append(el('br', { 'data-bw-entity': 'lineBreak' }));
      else if (entity.type === 'mention') {
        const id = String(entity.attrs?.userId ?? '');
        const label = o.mentionLabel?.(id) ?? id;
        container.append(el('span', { class: 'bw-mention', contenteditable: 'false', 'data-bw-entity': 'mention', 'data-user-id': id }, '@' + label));
      }
      continue;
    }
    let node: Node = document.createTextNode(text.slice(from, to));
    const active = marks.filter((m) => m.from <= from && m.to >= to);
    active.sort((a, b) => MARK_ORDER.indexOf(b.type) - MARK_ORDER.indexOf(a.type));
    for (const m of active) node = wrap(node, m, o.editable);
    container.append(node);
  }
  // A caret cannot sit in an empty line or after a trailing break without a filler.
  const last = text[text.length - 1];
  const trailingBreak = last === '\n' || (last === OBJ && entities.get(text.length - 1)?.type === 'lineBreak');
  if (text.length === 0 || trailingBreak) container.append(el('br', { 'data-bw-filler': '' }));
}

export interface RenderContext extends RenderOptions {
  /** Ordered list numbers by block id, computed per list run. */
  numbers: Map<string, number>;
}

/** Ordered-list numbers for a block list, using the spec's flatten rules (SPEC.md §6). */
export function listNumbers(blocks: Block[]): Map<string, number> {
  const out = new Map<string, number>();
  const flat = flatten({ version: 1, blocks });
  blocks.forEach((b, i) => {
    const n = flat[i]?.number;
    if (typeof n === 'number') out.set(b.id, n);
  });
  return out;
}

const ORDER_STYLES = [(n: number) => `${n}.`, (n: number) => `${alpha(n)}.`, (n: number) => `${roman(n)}.`];
function alpha(n: number): string {
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}
function roman(n: number): string {
  const t: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let s = '';
  for (const [v, r] of t) while (n >= v) (s += r), (n -= v);
  return s;
}
const BULLETS = ['•', '◦', '▪'];

/** Renders one block (and its children) to a fresh element. */
export function renderBlock(block: Block, ctx: RenderContext): HTMLElement {
  const id = block.id;
  const base = { 'data-block-id': id, 'data-type': block.type };
  switch (block.type) {
    case 'paragraph':
    case 'heading': {
      const tag = block.type === 'heading' ? (`h${Number(block.attrs?.level ?? 1)}` as 'h1') : 'p';
      const e = el(tag, { ...base, class: `bw-block bw-${block.type === 'heading' ? 'h' : 'p'}`, 'data-bw-text': '' });
      const align = block.attrs?.align;
      if (align === 'center' || align === 'right') e.classList.add(`bw-align-${align}`);
      renderText(e, block, ctx);
      return e;
    }
    case 'listItem': {
      const style = String(block.attrs?.style ?? 'bullet');
      const indent = Number(block.attrs?.indent ?? 0);
      const checked = !!block.attrs?.checked;
      const e = el('div', { ...base, class: `bw-block bw-li bw-li-${style}` });
      e.style.setProperty('--bw-indent', String(indent));
      if (checked) e.classList.add('bw-checked');
      let marker: HTMLElement;
      if (style === 'todo') {
        marker = el('span', {
          class: 'bw-li-marker bw-check',
          contenteditable: 'false',
          role: 'checkbox',
          'aria-checked': String(checked),
          'data-bw-action': 'toggle-check',
          tabindex: '-1',
        });
      } else {
        const n = ctx.numbers.get(id) ?? 1;
        marker = el('span', { class: 'bw-li-marker', contenteditable: 'false' }, style === 'ordered' ? ORDER_STYLES[indent % 3]!(n) : BULLETS[indent % 3]!);
      }
      const text = el('div', { class: 'bw-li-text', 'data-bw-text': '' });
      renderText(text, block, ctx);
      e.append(marker, text);
      if (indent > 0) e.append(el('span', { class: 'bw-li-guide', contenteditable: 'false' }));
      return e;
    }
    case 'code': {
      const language = String(block.attrs?.language ?? 'plaintext');
      const e = el('div', { ...base, class: 'bw-block bw-code' });
      const bar = el('div', { class: 'bw-code-bar', contenteditable: 'false' });
      if (ctx.editable) {
        bar.append(
          el('button', { type: 'button', class: 'bw-code-lang', 'data-bw-action': 'code-language', tabindex: '-1' }, ctx.languageLabel?.(language) ?? language),
        );
      } else bar.append(el('span', { class: 'bw-code-lang' }, ctx.languageLabel?.(language) ?? language));
      bar.append(el('button', { type: 'button', class: 'bw-code-copy', 'data-bw-action': 'code-copy', 'aria-label': 'Copy', title: 'Copy', tabindex: '-1' }));
      const pre = el('pre', { class: 'bw-code-text', 'data-bw-text': '', spellcheck: 'false' });
      pre.setAttribute('data-language', language);
      const text = block.text ?? '';
      for (const t of tokenize(text, language)) pre.append(t.kind ? el('span', { class: `bw-tok-${t.kind}` }, t.text) : document.createTextNode(t.text));
      if (text.length === 0 || text.endsWith('\n')) pre.append(el('br', { 'data-bw-filler': '' }));
      e.append(bar, pre);
      return e;
    }
    case 'divider':
      return el('div', { ...base, class: 'bw-block bw-divider', contenteditable: 'false' }, el('hr'));
    case 'image': {
      const src = String(block.attrs?.src ?? '');
      const alt = String(block.attrs?.alt ?? '');
      const width = block.attrs?.width;
      const align = block.attrs?.align === 'left' || block.attrs?.align === 'full' ? block.attrs.align : 'center';
      const e = el('figure', { ...base, class: `bw-block bw-image bw-image-${align}`, contenteditable: 'false' });
      const frame = el('div', { class: 'bw-image-frame' });
      if (typeof width === 'number' && align !== 'full') frame.style.width = `${width}px`;
      const missing = () => el('span', { class: 'bw-image-missing' }, alt || 'image');
      if (isSafeUrl(src, IMAGE_SCHEMES)) {
        const img = el('img', { src, alt, draggable: 'false', loading: 'lazy' });
        img.addEventListener('error', () => img.replaceWith(missing()), { once: true });
        frame.append(img);
      } else frame.append(missing());
      if (ctx.editable) {
        frame.append(
          el('span', { class: 'bw-resize bw-resize-l', 'data-bw-action': 'resize', 'data-side': 'left' }),
          el('span', { class: 'bw-resize bw-resize-r', 'data-bw-action': 'resize', 'data-side': 'right' }),
          el('span', { class: 'bw-image-size' }),
        );
      }
      e.append(frame);
      return e;
    }
    case 'quote': {
      const e = el('blockquote', { ...base, class: 'bw-block bw-quote' });
      const nums = listNumbers(block.children ?? []);
      for (const c of block.children ?? []) e.append(renderBlock(c, { ...ctx, numbers: nums }));
      return e;
    }
    case 'table': {
      const e = el('div', { ...base, class: 'bw-block bw-table' });
      const scroll = el('div', { class: 'bw-table-scroll' });
      const table = el('table');
      const body = el('tbody');
      for (const row of block.children ?? []) {
        const tr = el('tr', { 'data-block-id': row.id, 'data-type': 'tableRow' });
        for (const cell of row.children ?? []) {
          const td = el('td', { 'data-block-id': cell.id, 'data-type': 'tableCell' });
          for (const p of cell.children ?? []) td.append(renderBlock(p, { ...ctx, numbers: new Map() }));
          tr.append(td);
        }
        body.append(tr);
      }
      table.append(body);
      scroll.append(table);
      e.append(scroll);
      if (ctx.editable) {
        e.append(
          el('button', { type: 'button', class: 'bw-table-add bw-table-add-row', contenteditable: 'false', 'data-bw-action': 'table-add-row', 'aria-label': 'Add row', tabindex: '-1' }),
          el('button', { type: 'button', class: 'bw-table-add bw-table-add-col', contenteditable: 'false', 'data-bw-action': 'table-add-col', 'aria-label': 'Add column', tabindex: '-1' }),
        );
      }
      return e;
    }
    default: {
      // Unknown types cannot pass validation; render nothing but keep the id for mapping.
      return el('div', { ...base, class: 'bw-block', contenteditable: 'false' });
    }
  }
}
