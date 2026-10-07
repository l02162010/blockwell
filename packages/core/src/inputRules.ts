import { spec } from '@blockwell/schema';
import { allows, newDivider, setBlockKind, type CommandOptions } from './commands.js';
import { codeLanguage } from './markdown.js';
import { rangeHasMark, setMarkOnRange } from './marks.js';
import { caret, isCollapsed, mustLocate } from './model.js';
import type { Tr } from './state.js';
import type { BlockKind } from './types.js';

interface Rule {
  /** Matches the text from the start of the block to the caret. */
  match: RegExp;
  run: (tr: Tr, o: CommandOptions, m: RegExpMatchArray) => boolean;
  /** Also applies at the start of a list item, switching its kind. */
  list?: true;
}

const kind = (k: BlockKind, extra?: (tr: Tr, id: string) => void): Rule['run'] => (tr, o) => {
  if (!setBlockKind(tr, k, o)) return false;
  const sel = tr.selection;
  if (extra && sel?.type === 'text') extra(tr, sel.focus.block);
  return true;
};

/** ``` (or ```js) becomes a code block; used on Space and on Enter. */
const fence: Rule['run'] = (tr, o, m) => {
  const sel = tr.selection;
  if (sel?.type !== 'text' || !allows(o, 'code')) return false;
  if (!setBlockKind(tr, 'code', o)) return false;
  const lang = codeLanguage(m[1] ?? '');
  if (lang) tr.updateAttrs(sel.focus.block, { language: lang });
  return true;
};
export const FENCE = /^```([\w#+-]*)$/;

/** Markdown-style shortcuts typed at the start of a paragraph (engine guide §4). */
export const INPUT_RULES: Rule[] = [
  { match: /^# $/, run: kind('heading1') },
  { match: /^## $/, run: kind('heading2') },
  { match: /^### $/, run: kind('heading3') },
  { match: /^[-*+] $/, run: kind('bullet'), list: true },
  { match: /^\d{1,9}[.)] $/, run: kind('ordered'), list: true },
  { match: /^\[ ?\] $/, run: kind('todo'), list: true },
  { match: /^\[x\] $/i, run: kind('todo', (tr, id) => tr.updateAttrs(id, { checked: true })), list: true },
  { match: /^> $/, run: kind('quote') },
  { match: /^```([\w#+-]*) $/, run: fence },
  {
    match: /^---$/,
    run: (tr, o) => {
      const sel = tr.selection;
      if (sel?.type !== 'text' || !allows(o, 'divider')) return false;
      const id = sel.focus.block;
      const b = tr.block(id);
      if ((b.text ?? '').length !== 0) return false;
      // The paragraph becomes the line after the divider.
      const loc = mustLocate(tr.doc, id);
      if (loc.parent !== null) return false;
      tr.insertBlock(loc.parent, loc.index, newDivider());
      tr.setSelection(caret(id, 0));
      return true;
    },
  },
];

const LIST_RULES = INPUT_RULES.filter((r) => r.list);

/**
 * Inline shortcuts, matched against the text before the caret when the closing marker is typed.
 * The opening marker must not follow a word character, so `snake_case` and `2*3*4` stay text.
 */
const INLINE: { match: RegExp; mark: string; size: number }[] = [
  { match: /(?:^|[^\w*])(\*\*([^*\s](?:[^*]*[^*\s])?)\*\*)$/, mark: 'bold', size: 2 },
  { match: /(?:^|[^\w_])(__([^_\s](?:[^_]*[^_\s])?)__)$/, mark: 'bold', size: 2 },
  { match: /(?:^|[^\w~])(~~([^~\s](?:[^~]*[^~\s])?)~~)$/, mark: 'strike', size: 2 },
  { match: /(?:^|[^\w*])(\*([^*\s](?:[^*]*[^*\s])?)\*)$/, mark: 'italic', size: 1 },
  { match: /(?:^|[^\w_])(_([^_\s](?:[^_]*[^_\s])?)_)$/, mark: 'italic', size: 1 },
  { match: /(?:^|[^`])(`([^`]+)`)$/, mark: 'code', size: 1 },
];

function runInlineRules(tr: Tr): string | null {
  const sel = tr.selection;
  if (!sel || sel.type !== 'text' || !isCollapsed(sel)) return null;
  const b = tr.block(sel.focus.block);
  if (spec.blocks[b.type]?.marks !== '*') return null;
  const end = sel.focus.offset;
  const before = (b.text ?? '').slice(0, end);
  for (const r of INLINE) {
    const m = before.match(r.match);
    if (!m) continue;
    const whole = m[1]!, inner = m[2]!;
    if (inner.includes('￼')) continue;
    const from = end - whole.length;
    // Inside inline code nothing else applies, and code text is never re-marked.
    if (rangeHasMark(b.marks ?? [], 'code', from, end)) continue;
    tr.deleteText(b.id, end - r.size, end);
    tr.deleteText(b.id, from, from + r.size);
    const to = from + inner.length;
    let marks = tr.block(b.id).marks ?? [];
    if (r.mark === 'code') for (const t of ['bold', 'italic', 'underline', 'strike', 'link', 'color', 'highlight']) marks = setMarkOnRange(marks, t, from, to, null);
    tr.setMarks(b.id, setMarkOnRange(marks, r.mark, from, to, {}));
    tr.setSelection(caret(b.id, to));
    return whole;
  }
  return null;
}

/**
 * Runs after text was typed. When the paragraph's text before the caret matches a rule, the typed
 * marker is removed and the rule applied. Returns the marker (`## `, `**bold**`) when a rule
 * fired; on null the caller must discard `tr`.
 */
export function runInputRules(tr: Tr, o: CommandOptions): string | null {
  const sel = tr.selection;
  if (!sel || sel.type !== 'text' || !isCollapsed(sel)) return null;
  const b = tr.block(sel.focus.block);
  // Block rules on a paragraph; on a list item only the list markers, to switch its kind.
  if (b.type === 'paragraph' || b.type === 'listItem') {
    const loc = mustLocate(tr.doc, b.id);
    if (loc.parent === null || tr.block(loc.parent).type === 'quote') {
      const before = (b.text ?? '').slice(0, sel.focus.offset);
      for (const rule of b.type === 'listItem' ? LIST_RULES : INPUT_RULES) {
        const m = before.match(rule.match);
        if (!m) continue;
        tr.deleteText(b.id, 0, before.length);
        tr.setSelection(caret(b.id, 0));
        return rule.run(tr, o, m) ? m[0] : null;
      }
    }
  }
  return runInlineRules(tr);
}

/** Enter on a paragraph that holds just ``` or ```lang turns it into a code block. */
export function runFenceOnEnter(tr: Tr, o: CommandOptions): boolean {
  const sel = tr.selection;
  if (!sel || sel.type !== 'text' || !isCollapsed(sel)) return false;
  const b = tr.block(sel.focus.block);
  if (b.type !== 'paragraph' || mustLocate(tr.doc, b.id).parent !== null) return false;
  const m = (b.text ?? '').match(FENCE);
  if (!m || sel.focus.offset !== (b.text ?? '').length) return false;
  tr.deleteText(b.id, 0, m[0].length);
  tr.setSelection(caret(b.id, 0));
  return fence(tr, o, m);
}
