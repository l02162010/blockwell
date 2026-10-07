/**
 * Maps between DOM positions and model offsets inside a text container (the element marked
 * `data-bw-text`). Text nodes count their length, entity elements count 1, fillers count 0.
 */

type Leaf = { node: Node; len: number; kind: 'text' | 'entity' | 'filler' };

function* leaves(root: Node): Generator<Leaf> {
  for (let c = root.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 3) yield { node: c, len: (c.nodeValue ?? '').length, kind: 'text' };
    else if (c.nodeType === 1) {
      const e = c as Element;
      if (e.hasAttribute('data-bw-entity')) yield { node: e, len: 1, kind: 'entity' };
      else if (e.hasAttribute('data-bw-filler')) yield { node: e, len: 0, kind: 'filler' };
      else if (e.getAttribute('contenteditable') === 'false') continue;
      else yield* leaves(e);
    }
  }
}

/** The text a container shows, in model form (entities as U+FFFC). */
export function containerText(container: Element): string {
  let s = '';
  for (const l of leaves(container)) {
    if (l.kind === 'text') s += l.node.nodeValue ?? '';
    else if (l.kind === 'entity') s += '\uFFFC';
  }
  return s;
}

/** Model offset of the DOM point (node, offset), which must lie inside `container`. */
export function domToOffset(container: Element, node: Node, offset: number): number {
  if (!container.contains(node)) return node.compareDocumentPosition(container) & Node.DOCUMENT_POSITION_FOLLOWING ? 0 : containerLength(container);
  const doc = container.ownerDocument;
  const point = doc.createRange();
  point.setStart(node, offset);
  let total = 0;
  for (const l of leaves(container)) {
    if (l.node === node && l.kind === 'text') return total + Math.min(offset, l.len);
    if (l.node === node || l.node.contains(node)) {
      // Inside an entity: before it when at its start, after it otherwise.
      return total + (offset === 0 && (node === l.node || node.parentNode === l.node) ? 0 : l.len);
    }
    const parent = l.node.parentNode!;
    const index = Array.prototype.indexOf.call(parent.childNodes, l.node) as number;
    // Leaf starts at or after the point: the point is before it.
    if (point.comparePoint(parent, index) >= 0) return total;
    total += l.len;
  }
  return total;
}

export function containerLength(container: Element): number {
  let n = 0;
  for (const l of leaves(container)) n += l.len;
  return n;
}

/** DOM point for a model offset inside a container. */
export function offsetToDom(container: Element, offset: number): { node: Node; offset: number } {
  let total = 0;
  let lastText: Leaf | null = null;
  for (const l of leaves(container)) {
    if (l.kind === 'text') {
      if (offset <= total + l.len) return { node: l.node, offset: offset - total };
      lastText = l;
    } else if (offset === total) {
      const parent = l.node.parentNode!;
      return { node: parent, offset: Array.prototype.indexOf.call(parent.childNodes, l.node) as number };
    }
    total += l.len;
  }
  if (lastText && offset >= total) return { node: lastText.node, offset: lastText.len };
  return { node: container, offset: container.childNodes.length };
}

/** The text container of a block element: the element itself or its direct child. */
export function textContainerOf(blockEl: Element): HTMLElement | null {
  if (blockEl.hasAttribute('data-bw-text')) return blockEl as HTMLElement;
  for (const c of Array.from(blockEl.children)) if (c.hasAttribute('data-bw-text')) return c as HTMLElement;
  return null;
}

/** The nearest block element (any element with `data-block-id`) around a node. */
export function blockElementOf(node: Node | null, root: Element): HTMLElement | null {
  let n: Node | null = node;
  while (n && n !== root) {
    if (n.nodeType === 1 && (n as Element).hasAttribute('data-block-id')) return n as HTMLElement;
    n = n.parentNode;
  }
  return null;
}
