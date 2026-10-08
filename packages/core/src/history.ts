import { invertOps } from './ops.js';
import type { Op, Selection, Transaction } from './types.js';

interface Entry {
  ops: Op[];
  selectionBefore: Selection | null;
  selectionAfter: Selection | null;
  time: number;
}

/** Typing within this many milliseconds of the previous edit joins the same undo step. */
const MERGE_WINDOW = 500;

export class History {
  private done: Entry[] = [];
  private undone: Entry[] = [];

  constructor(private readonly limit = 200) {}

  get canUndo() {
    return this.done.length > 0;
  }
  get canRedo() {
    return this.undone.length > 0;
  }

  /** Records a user transaction. Remote and history transactions are never recorded. */
  record(tr: Transaction) {
    if (tr.meta.origin !== 'user' || tr.ops.length === 0) return;
    this.undone = [];
    const last = this.done[this.done.length - 1];
    if (last && tr.meta.mergeable && tr.meta.time - last.time < MERGE_WINDOW && sameBlock(last.ops, tr.ops)) {
      last.ops = [...last.ops, ...tr.ops];
      last.selectionAfter = tr.selectionAfter;
      last.time = tr.meta.time;
      return;
    }
    this.done.push({ ops: tr.ops, selectionBefore: tr.selectionBefore, selectionAfter: tr.selectionAfter, time: tr.meta.time });
    if (this.done.length > this.limit) this.done.shift();
  }

  /** Closes the current undo step so the next edit starts a new one. */
  seal() {
    const last = this.done[this.done.length - 1];
    if (last) last.time = 0;
  }

  /** The transaction that undoes the last step, without applying it. */
  undo(): Transaction | null {
    const e = this.done.pop();
    if (!e) return null;
    this.undone.push(e);
    return { ops: invertOps(e.ops), selectionBefore: e.selectionAfter, selectionAfter: e.selectionBefore, meta: { origin: 'history', time: Date.now() } };
  }

  redo(): Transaction | null {
    const e = this.undone.pop();
    if (!e) return null;
    this.done.push({ ...e, time: 0 });
    return { ops: e.ops, selectionBefore: e.selectionBefore, selectionAfter: e.selectionAfter, meta: { origin: 'history', time: Date.now() } };
  }

  /** Puts back an entry when applying its undo/redo failed. */
  restore(kind: 'undo' | 'redo') {
    if (kind === 'undo') {
      const e = this.undone.pop();
      if (e) this.done.push(e);
    } else {
      const e = this.done.pop();
      if (e) this.undone.push(e);
    }
  }

  clear() {
    this.done = [];
    this.undone = [];
  }
}

function sameBlock(a: Op[], b: Op[]): boolean {
  const ids = (ops: Op[]) => new Set(ops.map((o) => ('block' in o && typeof o.block === 'string' ? o.block : '')));
  const x = ids(a), y = ids(b);
  return y.size === 1 && x.has([...y][0]!);
}
