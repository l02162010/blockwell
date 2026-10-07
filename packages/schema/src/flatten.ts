import { spec } from './spec.js';
import type { Block, Doc, FlatBlock, Run } from './types.js';

const OBJ = '￼';

/**
 * Turns a valid document into the intermediate form every renderer consumes (SPEC.md §6).
 * Call `validate` first: behaviour on invalid input is undefined.
 */
export function flatten(doc: Doc): FlatBlock[] {
  return flattenList(doc.blocks);
}

function flattenList(blocks: Block[]): FlatBlock[] {
  // Ordered-list counters per indent level; see "Ordered numbering" in SPEC.md §6.
  const counter: number[] = [];
  const style: (string | undefined)[] = [];

  return blocks.map((block) => {
    const out = flattenBlock(block);
    if (block.type !== 'listItem') {
      counter.length = 0;
      style.length = 0;
      return out;
    }
    const n = out.indent as number;
    const s = out.style as string;
    counter.length = Math.min(counter.length, n + 1);
    style.length = Math.min(style.length, n + 1);
    if (s === 'ordered') {
      counter[n] = (style[n] === 'ordered' ? counter[n] ?? 0 : 0) + 1;
      out.number = counter[n];
    } else {
      counter[n] = 0;
    }
    style[n] = s;
    return out;
  });
}

function flattenBlock(block: Block): FlatBlock {
  const def = spec.blocks[block.type]!;
  const out: FlatBlock = { type: block.type };
  for (const [name, attr] of Object.entries(def.attrs)) {
    const value = block.attrs?.[name] ?? attr.default;
    if (value !== undefined) out[name] = value;
  }
  if (def.content === 'text') out.runs = toRuns(block);
  if (def.content === 'children') {
    if (block.type === 'table') {
      out.rows = (block.children ?? []).map((row) => (row.children ?? []).map((cell) => flattenList(cell.children ?? [])));
    } else {
      out.children = flattenList(block.children ?? []);
    }
  }
  return out;
}

function toRuns(block: Block): Run[] {
  const text = block.text ?? '';
  const marks = block.marks ?? [];
  const entities = new Map((block.entities ?? []).map((e) => [e.at, e]));

  const cuts = new Set<number>([0, text.length]);
  for (const m of marks) {
    cuts.add(m.from);
    cuts.add(m.to);
  }
  for (const at of entities.keys()) {
    cuts.add(at);
    cuts.add(at + 1);
  }
  const points = [...cuts].sort((a, b) => a - b);

  const runs: Run[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const from = points[i]!, to = points[i + 1]!;
    if (from === to) continue;
    const entity = entities.get(from);
    if (entity && text[from] === OBJ) {
      runs.push({ entity: entity.type, ...(entity.attrs ?? {}) });
      continue;
    }
    const run: Record<string, string | true> = { text: text.slice(from, to) };
    for (const m of marks) {
      if (m.from > from || m.to < to) continue;
      const values = Object.values(m.attrs ?? {});
      run[m.type] = values.length === 1 ? String(values[0]) : true;
    }
    runs.push(run as Run);
  }
  return runs;
}
