import { isSafeUrl, spec } from '@blockwell/schema';
import { LINK_SCHEMES } from './commands.js';
import { OBJ, normalizeMarks } from './marks.js';
import { emptyTable, newId } from './model.js';
import type { Attrs, Block, Entity, Mark } from './types.js';

const BLOCK_LINE = /^(#{1,6}\s+\S|\s*(?:[-*+]|\d{1,3}[.)])\s+\S|>\s?|```|(?:-{3,}|\*{3,}|_{3,})\s*$|\|.*\|\s*$)/;

/**
 * True when pasted plain text looks like Markdown: at least one line uses block syntax and the
 * text either has several lines or starts with that syntax.
 */
export function looksLikeMarkdown(text: string): boolean {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blockLines = lines.filter((l) => BLOCK_LINE.test(l)).length;
  if (blockLines === 0) return false;
  return lines.filter((l) => l.trim()).length > 1 || BLOCK_LINE.test(lines[0] ?? '');
}

export interface MarkdownResult {
  blocks: Block[];
  /** Blocks created per kind: heading, list, code, quote, table, divider. */
  counts: Record<string, number>;
}

const LANG_ALIASES: Record<string, string> = {
  js: 'javascript', ts: 'typescript', sh: 'bash', shell: 'bash', zsh: 'bash', py: 'python', 'c#': 'csharp', cs: 'csharp',
  yml: 'yaml', md: 'markdown', text: 'plaintext', txt: 'plaintext', htm: 'html', golang: 'go', rs: 'rust',
};
const LANGS = (spec.blocks.code!.attrs.language as { values: readonly string[] }).values;

/** Parses CommonMark-style Markdown into schema blocks. Anything unsupported stays as text. */
export function parseMarkdown(text: string): MarkdownResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  const counts: Record<string, number> = {};
  const count = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(textBlock('paragraph', para.join('\n')));
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\s*```\s*([\w#+-]*)\s*$/))) {
      flushPara();
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]!); i++) body.push(lines[i]!);
      const raw = (m[1] ?? '').toLowerCase();
      const lang = LANG_ALIASES[raw] ?? raw;
      const block: Block = { id: newId(), type: 'code', text: body.join('\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F\uFFFC]/g, '') };
      if (LANGS.includes(lang) && lang !== 'plaintext') block.attrs = { language: lang };
      blocks.push(block);
      count('code');
    } else if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
      flushPara();
      blocks.push(textBlock('heading', m[2]!, { level: Math.min(3, m[1]!.length) }));
      count('heading');
    } else if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushPara();
      blocks.push({ id: newId(), type: 'divider' });
      count('divider');
    } else if ((m = line.match(/^(\s*)([-*+]|\d{1,3}[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/))) {
      flushPara();
      const spaces = m[1]!.replace(/\t/g, '    ').length;
      const attrs: Attrs = { style: m[3] !== undefined ? 'todo' : /\d/.test(m[2]!) ? 'ordered' : 'bullet' };
      const indent = Math.min(6, Math.floor(spaces / 2));
      if (indent) attrs.indent = indent;
      if (m[3] && m[3] !== ' ') attrs.checked = true;
      blocks.push(textBlock('listItem', m[4]!, attrs));
      count('list');
    } else if (/^>\s?/.test(line)) {
      flushPara();
      const inner: string[] = [];
      for (; i < lines.length && /^>\s?/.test(lines[i]!); i++) inner.push(lines[i]!.replace(/^>\s?/, ''));
      i--;
      const children = inner.join('\n').split(/\n\s*\n/).filter((p) => p.trim()).map((p) => textBlock('paragraph', p));
      if (children.length) {
        blocks.push({ id: newId(), type: 'quote', children });
        count('quote');
      }
    } else if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      flushPara();
      const rows: string[][] = [splitRow(line)];
      for (i += 2; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]!); i++) rows.push(splitRow(lines[i]!));
      i--;
      const cols = Math.min(spec.limits.maxTableColumns, Math.max(...rows.map((r) => r.length)));
      const table = emptyTable(Math.min(rows.length, spec.limits.maxTableRows), cols);
      table.children!.forEach((row, r) =>
        row.children!.forEach((cell, c) => {
          cell.children = [textBlock('paragraph', rows[r]?.[c] ?? '')];
        }),
      );
      blocks.push(table);
      count('table');
    } else if (!line.trim()) flushPara();
    else para.push(line);
  }
  flushPara();
  return { blocks, counts };
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
}

/** A text block from Markdown inline syntax; line breaks inside become line-break entities. */
function textBlock(type: string, src: string, attrs?: Attrs): Block {
  const { text, marks } = inline(src.replace(/[\u0000-\u0008\u000B-\u001F\u007F\uFFFC]/g, ''));
  const entities: Entity[] = [];
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      entities.push({ at: i, type: 'lineBreak' });
      out += OBJ;
    } else out += text[i];
  }
  const b: Block = { id: newId(), type, text: out };
  if (attrs) b.attrs = attrs;
  const clean = exclusive(normalizeMarks(marks));
  if (clean.length) b.marks = clean;
  if (entities.length) b.entities = entities;
  return b;
}

/** Inline code takes precedence: other marks overlapping it are trimmed away. */
function exclusive(marks: Mark[]): Mark[] {
  const code = marks.filter((m) => m.type === 'code');
  const out: Mark[] = [...code];
  for (const m of marks) {
    if (m.type === 'code') continue;
    let parts: [number, number][] = [[m.from, m.to]];
    for (const c of code) {
      parts = parts.flatMap(([f, t]): [number, number][] =>
        c.to <= f || c.from >= t ? [[f, t]] : [...(f < c.from ? [[f, c.from] as [number, number]] : []), ...(c.to < t ? [[c.to, t] as [number, number]] : [])],
      );
    }
    for (const [f, t] of parts) out.push({ ...m, from: f, to: t });
  }
  return normalizeMarks(out);
}

const INLINE: { re: RegExp; type: string; literal?: boolean; link?: boolean }[] = [
  { re: /`([^`\n]+)`/, type: 'code', literal: true },
  // URLs may contain one level of parentheses, e.g. a Wikipedia link.
  { re: /\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/, type: 'link', link: true },
  { re: /\*\*(\S(?:[^*]*?\S)?)\*\*|__(\S(?:[^_]*?\S)?)__/, type: 'bold' },
  { re: /~~(\S(?:[^~]*?\S)?)~~/, type: 'strike' },
  { re: /\*(\S(?:[^*]*?\S)?)\*|(?<![\w])_(\S(?:[^_]*?\S)?)_(?![\w])/, type: 'italic' },
];

function inline(src: string): { text: string; marks: Mark[] } {
  let text = '';
  const marks: Mark[] = [];
  let rest = src;
  while (rest) {
    let best: { idx: number; m: RegExpMatchArray; rule: (typeof INLINE)[number] } | null = null;
    for (const rule of INLINE) {
      const m = rest.match(rule.re);
      if (m && m.index !== undefined && (!best || m.index < best.idx)) best = { idx: m.index, m, rule };
    }
    if (!best) {
      text += rest;
      break;
    }
    text += rest.slice(0, best.idx);
    const inner = best.m[1] ?? best.m[2] ?? '';
    const from = text.length;
    if (best.rule.literal) text += inner;
    else {
      const sub = inline(inner);
      for (const m of sub.marks) marks.push({ ...m, from: m.from + from, to: m.to + from });
      text += sub.text;
    }
    if (best.rule.link) {
      const href = best.m[2]!;
      if (isSafeUrl(href, LINK_SCHEMES)) marks.push({ type: 'link', from, to: text.length, attrs: { href } });
    } else marks.push({ type: best.rule.type, from, to: text.length });
    rest = rest.slice(best.idx + best.m[0].length);
  }
  return { text, marks: marks.filter((m) => m.to > m.from) };
}
