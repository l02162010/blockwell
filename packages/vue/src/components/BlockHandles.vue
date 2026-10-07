<script setup lang="ts">
import { emptyParagraphAfter } from '../helpers.js';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useBlockwell } from '../composables.js';
import BwIcon from './BwIcon.vue';

/** "+" and drag handle in the left gutter of the hovered top-level block. */
const ctx = useBlockwell();
const m = ctx.messages;
const ed = () => ctx.editor.value;
const hovered = ref<{ id: string; top: number; left: number } | null>(null);
const drop = ref<{ top: number; left: number; width: number } | null>(null);
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
  if (!ed().isEditable || dragging) return;
  const root = ed().dom;
  if (!root) return;
  const box = root.getBoundingClientRect();
  if (e.clientX < box.left - 72 || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) {
    if (!(e.target as Element)?.closest?.('.bw-handles')) hovered.value = null;
    return;
  }
  const el = topBlockAt(e.clientY);
  if (el) place(el);
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
  emptyParagraphAfter(ed(), id);
  ed().startSlash();
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
  const move = (ev: PointerEvent) => {
    if (Math.abs(ev.clientY - startY) > 4) moved = true;
    if (!moved) return;
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
    const d = dragging;
    dragging = null;
    drop.value = null;
    if (!d) return;
    if (!moved) {
      ed().focus();
      ed().selectBlockContent(d.id);
      return;
    }
    const target = d.index > from ? d.index - 1 : d.index;
    ed().moveBlock(d.id, target);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
};
</script>

<template>
  <div v-if="hovered && ed().isEditable" class="bw-handles" :style="{ top: `${hovered.top}px`, left: `${hovered.left}px` }">
    <button type="button" class="bw-handle" :aria-label="m.addBlock" :title="m.addBlock" @mousedown.prevent @click="add"><BwIcon name="add" :size="18" /></button>
    <button type="button" class="bw-handle bw-grab" :aria-label="m.dragBlock" :title="m.dragBlock" @pointerdown="startDrag"><BwIcon name="drag_indicator" :size="18" /></button>
  </div>
  <div v-if="drop" class="bw-drop-line" :style="{ top: `${drop.top}px`, left: `${drop.left}px`, width: `${drop.width}px` }" />
</template>
