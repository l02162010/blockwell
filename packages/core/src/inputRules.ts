import { allows, newDivider, setBlockKind, type CommandOptions } from './commands.js';
import { caret, isCollapsed, mustLocate } from './model.js';
import type { Tr } from './state.js';
import type { BlockKind } from './types.js';

interface Rule {
  /** Matches the text from the start of the block to the caret. */
  match: RegExp;
  run: (tr: Tr, o: CommandOptions, m: RegExpMatchArray) => boolean;
}

const kind = (k: BlockKind, extra?: (tr: Tr, id: string) => void): Rule['run'] => (tr, o) => {
  if (!setBlockKind(tr, k, o)) return false;
  const sel = tr.selection;
  if (extra && sel?.type === 'text') extra(tr, sel.focus.block);
  return true;
};

/** Markdown-style shortcuts typed at the start of a paragraph (engine guide §4). */
export const INPUT_RULES: Rule[] = [
  { match: /^# $/, run: kind('heading1') },
  { match: /^## $/, run: kind('heading2') },
  { match: /^### $/, run: kind('heading3') },
  { match: /^[-*] $/, run: kind('bullet') },
  { match: /^1[.)] $/, run: kind('ordered') },
  { match: /^\[ ?\] $/, run: kind('todo') },
  { match: /^\[x\] $/i, run: kind('todo', (tr, id) => tr.updateAttrs(id, { checked: true })) },
  { match: /^> $/, run: kind('quote') },
  {
    match: /^```$/,
    run: (tr, o) => {
      const sel = tr.selection;
      if (sel?.type !== 'text' || !allows(o, 'code')) return false;
      return setBlockKind(tr, 'code', o);
    },
  },
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

/**
 * Runs after text was typed. When the paragraph's text before the caret matches a rule, the typed
 * marker is removed and the rule applied. Returns the marker (`## `) when a rule fired; on null
 * the caller must discard `tr`.
 */
export function runInputRules(tr: Tr, o: CommandOptions): string | null {
  const sel = tr.selection;
  if (!sel || sel.type !== 'text' || !isCollapsed(sel)) return null;
  const b = tr.block(sel.focus.block);
  if (b.type !== 'paragraph') return null;
  const loc = mustLocate(tr.doc, b.id);
  if (loc.parent !== null && tr.block(loc.parent).type !== 'quote') return null;
  const before = (b.text ?? '').slice(0, sel.focus.offset);
  for (const rule of INPUT_RULES) {
    const m = before.match(rule.match);
    if (!m) continue;
    tr.deleteText(b.id, 0, before.length);
    tr.setSelection(caret(b.id, 0));
    return rule.run(tr, o, m) ? m[0] : null;
  }
  return null;
}
