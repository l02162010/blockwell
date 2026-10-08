<script setup lang="ts">
import { getBlock } from '@blockwell/core';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useBlockwell, visibleRect } from '../composables.js';
import BwIcon from './BwIcon.vue';

/** "+" and drag handle in the left gutter of the hovered top-level block. */
const ctx = useBlockwell();
const m = ctx.messages;
const ed = () => ctx.editor.value;
const hovered = ref<{ id: string; top: number; left: number } | null>(null);
const drop = ref<{ top: number; left: number; width: number } | null>(null);
const ghost = ref<{ x: number; y: number; text: string; todo: boolean } | null>(null);
let dragging: { id: string; index: number } | null = null;

const topBlockAt = (y: number): HTMLElement | null => {
  const root = ed().dom;
  if (!root) return null;
  const kids = Array.from(root.children) as HTMLElement[];
  for (const k of kids) {
    const r = k.getBoundingClientRect();
    if (y >= r.top - 4 && y <= r.bottom + 4) return k;
  }
  return null;
};
const place = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const line = parseFloat(style.lineHeight) || 24;
  const pad = parseFloat(style.paddingTop) || 0;
  const offset = ['P', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE'].includes(el.tagName) ? pad + Math.max(0, (line - 24) / 2) : 0;
  hovered.value = { id: el.getAttribute('data-block-id')!, top: r.top + offset, left: (ed().dom?.getBoundingClientRect().left ?? r.left) - 52 };
};

const onMove = (e: MouseEvent) => {
  if (!ed().isEditable || dragging || ctx.ui.popover === 'blockActions') return;
  const root = ed().dom;
  if (!root) return;
  const box = root.getBoundingClientRect();
  // Only where the editor is actually visible: its scroll area clips the content.
  const view = visibleRect(ed()) ?? box;
  const top = Math.max(box.top, view.top), bottom = Math.min(box.bottom, view.bottom);
  if (e.clientX < box.left - 72 || e.clientX > box.right || e.clientY < top || e.clientY > bottom) {
    if (!(e.target as Element)?.closest?.('.bw-handles')) hovered.value = null;
    return;
  }
  const el = topBlockAt(e.clientY);
  if (el && el.getBoundingClientRect().top >= view.top - 4) place(el);
  else hovered.value = null;
};
const onScroll = () => (hovered.value = null);
// Re-place after edits: the hovered block may have moved or changed type.
watch(ctx.version, () => {
  const id = hovered.value?.id;
  const el = id ? ed().blockElement(id) : null;
  if (el && el.parentElement === ed().dom) place(el);
  else hovered.value = null;
});
onMounted(() => {
  document.addEventListener('mousemove', onMove);
  window.addEventListener('scroll', onScroll, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onMove);
  window.removeEventListener('scroll', onScroll, true);
});

const add = () => {
  const id = hovered.value?.id;
  if (!id) return;
  ed().focus();
  const b = getBlock(ed().getJSON(), id);
  // An empty paragraph takes the menu itself; otherwise a new line is added for it.
  if (b?.type === 'paragraph' && !b.text) {
    ed().setSelection({ type: 'text', anchor: { block: id, offset: 0 }, focus: { block: id, offset: 0 } });
    ed().startSlash();
  } else ed().insertSlashAfter(id);
};

/** The menu hangs off the block's gutter, which stays put even when the handles hide. */
const menuAnchor = (id: string) => () => {
  const r = ed().blockElement(id)?.getBoundingClientRect();
  const left = ed().dom?.getBoundingClientRect().left ?? r?.left ?? 0;
  return r ? new DOMRect(left - 30, r.top, 24, 24) : null;
};
const openMenu = () => {
  const id = hovered.value?.id;
  if (id) ctx.toggle('blockActions', menuAnchor(id), { block: id, source: 'editor' });
};

const startDrag = (e: PointerEvent) => {
  const id = hovered.value?.id;
  const root = ed().dom;
  if (!id || !root) return;
  e.preventDefault();
  const startY = e.clientY;
  let moved = false;
  const blocks = () => Array.from(root.children) as HTMLElement[];
  const from = blocks().findIndex((b) => b.getAttribute('data-block-id') === id);
  dragging = { id, index: from };
  const source = root.children[from] as HTMLElement | undefined;
  const label = (source?.textContent ?? '').trim().slice(0, 60) || source?.getAttribute('data-type') || '';
  const todo = source?.classList.contains('bw-li-todo') ?? false;
  // Scroll the editor while dragging near its top or bottom edge.
  const scroller = root.closest('.bw-scroll') as HTMLElement | null;
  let lastY = startY, autoscroll = 0;
  const tick = () => {
    autoscroll = 0;
    if (!dragging || !moved || !scroller) return;
    const v = scroller.getBoundingClientRect();
    const dy = lastY < v.top + 48 ? -12 : lastY > v.bottom - 48 ? 12 : 0;
    if (dy) {
      scroller.scrollTop += dy;
      autoscroll = requestAnimationFrame(tick);
    }
  };
  const move = (ev: PointerEvent) => {
    lastY = ev.clientY;
    if (!autoscroll) autoscroll = requestAnimationFrame(tick);
    if (Math.abs(ev.clientY - startY) > 4 && !moved) {
      moved = true;
      ed().setBlockClasses('drag', { [id]: 'bw-dragging' });
    }
    if (!moved) return;
    ghost.value = { x: ev.clientX + 8, y: ev.clientY + 10, text: label, todo };
    const list = blocks();
    let index = list.length;
    for (let i = 0; i < list.length; i++) {
      const r = list[i]!.getBoundingClientRect();
      if (ev.clientY < r.top + r.height / 2) {
        index = i;
        break;
      }
    }
    dragging!.index = index;
    const box = root.getBoundingClientRect();
    const ref = list[index] ?? list[list.length - 1]!;
    const r = ref.getBoundingClientRect();
    drop.value = { top: index < list.length ? r.top - 3 : r.bottom + 1, left: box.left, width: box.width };
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('keydown', cancel, true);
    const d = dragging;
    dragging = null;
    drop.value = null;
    ghost.value = null;
    ed().setBlockClasses('drag', {});
    cancelAnimationFrame(autoscroll);
    if (!d) return;
    if (!moved) {
      // A click (no drag) opens the block menu.
      ctx.toggle('blockActions', menuAnchor(d.id), { block: d.id, source: 'editor' });
      return;
    }
    const target = d.index > from ? d.index - 1 : d.index;
    ed().moveBlock(d.id, target);
    // Keep working where the block went.
    ed().revealBlock(d.id, { select: true });
  };
  // Escape drops the drag where it started.
  const cancel = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || !dragging) return;
    ev.preventDefault();
    ev.stopPropagation();
    dragging = null;
    up();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('keydown', cancel, true);
};
</script>

<template>
  <div v-if="hovered && ed().isEditable" class="bw-handles" :style="{ top: `${hovered.top}px`, left: `${hovered.left}px` }">
    <button type="button" class="bw-handle" tabindex="-1" :aria-label="m.addBlock" :title="m.addBlock" @mousedown.prevent @click="add"><BwIcon name="add" :size="18" /></button>
    <button type="button" class="bw-handle bw-grab" tabindex="-1" :aria-label="m.dragBlock" :title="m.dragBlock" aria-haspopup="menu" :aria-expanded="ctx.ui.popover === 'blockActions'" @pointerdown="startDrag" @keydown.enter.prevent="openMenu" @keydown.space.prevent="openMenu"><BwIcon name="drag_indicator" :size="18" /></button>
  </div>
  <div v-if="drop" class="bw-drop-line" :style="{ top: `${drop.top}px`, left: `${drop.left}px`, width: `${drop.width}px` }" />
  <div v-if="ghost" class="bw-drag-ghost" :style="{ top: `${ghost.y}px`, left: `${ghost.x}px` }" aria-hidden="true">
    <BwIcon name="drag_indicator" :size="18" class="bw-muted" /><span v-if="ghost.todo" class="bw-ghost-check" />{{ ghost.text }}
  </div>
</template>
