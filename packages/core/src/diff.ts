import type { Block, Doc } from './types.js';

export type BlockChange = 'added' | 'removed' | 'changed';

export interface DocDiff {
  /** Blocks of both versions in reading order: removed blocks sit where they used to be. */
  doc: Doc;
  /** Change per top-level block id; unchanged blocks are absent. */
  changes: Record<string, BlockChange>;
}

/**
 * Compares two versions block by block, matching top-level blocks by id (ids are stable across
 * edits, engine guide §3). For a version-history view; the merged document is for display only.
 */
export function diffDocs(base: Doc, current: Doc): DocDiff {
  const a = base.blocks, b = current.blocks;
  // Longest common subsequence of ids.
  const n = a.length, m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) lcs[i]![j] = a[i]!.id === b[j]!.id ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const blocks: Block[] = [];
  const changes: Record<string, BlockChange> = {};
  const inCurrent = new Set(b.map((x) => x.id));
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i]!.id === b[j]!.id) {
      if (JSON.stringify(a[i]) !== JSON.stringify(b[j])) changes[b[j]!.id] = 'changed';
      blocks.push(b[j]!);
      i++;
      j++;
    } else if (j < m && (i >= n || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) {
      changes[b[j]!.id] = 'added';
      blocks.push(b[j]!);
      j++;
    } else {
      const old = a[i]!;
      // A block moved elsewhere is shown once, where it is now.
      if (!inCurrent.has(old.id)) {
        changes[old.id] = 'removed';
        blocks.push(old);
      }
      i++;
    }
  }
  return { doc: { version: 1, blocks }, changes };
}
