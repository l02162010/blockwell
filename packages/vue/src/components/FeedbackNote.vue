<script setup lang="ts">
import type { Feedback } from '@blockwell/core';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useBlockwell, visibleRect } from '../composables.js';
import BwIcon from './BwIcon.vue';

/**
 * One component for everything the schema blocks or changes (design §04): shown next to where it
 * happened, says why, offers one next step, never a dialog. Levels: reject, adjust, skip.
 */
const ctx = useBlockwell();
const m = ctx.messages;
const fb = shallowRef<Feedback | null>(null);
const showList = ref(false);
const tick = ref(0);
let timer = 0;
const offs: (() => void)[] = [];
const bump = () => tick.value++;
const note = ref<HTMLElement | null>(null);
/** Gone on Escape, a click elsewhere, or when you carry on typing. */
const onPointer = (e: PointerEvent) => {
  if (fb.value && !note.value?.contains(e.target as Node)) fb.value = null;
};
onMounted(() => {
  const ed = ctx.editor.value;
  offs.push(
    ed.on('feedback', (f) => {
      fb.value = f;
      showList.value = false;
      clearTimeout(timer);
      timer = window.setTimeout(() => (fb.value = null), 9000);
      // Show where it happened, e.g. the end of a long paste.
      requestAnimationFrame(() => ed.scrollCaretIntoView());
    }),
    ed.addKeyHandler((e) => {
      if (!fb.value || ['Shift', 'Control', 'Meta', 'Alt', 'CapsLock'].includes(e.key)) return false;
      fb.value = null;
      return e.key === 'Escape';
    }),
  );
  window.addEventListener('scroll', bump, true);
  document.addEventListener('pointerdown', onPointer, true);
});
onBeforeUnmount(() => {
  offs.forEach((f) => f());
  clearTimeout(timer);
  window.removeEventListener('scroll', bump, true);
  document.removeEventListener('pointerdown', onPointer, true);
});

const ICONS = { reject: 'error', adjust: 'content_cut', skip: 'info' } as const;
const text = computed((): [string, string] => {
  const f = fb.value;
  if (!f) return ['', ''];
  switch (f.code) {
    case 'length':
      return m.feedback.length(f.count ?? 0);
    case 'image-src':
      return m.feedback.imageSrc;
    case 'unsupported':
      return m.feedback.unsupported(f.count ?? 1);
    case 'link':
      return m.linkInvalid;
    default:
      return m.feedback.invalid;
  }
});
const action = computed(() => {
  const f = fb.value;
  if (f?.code === 'length' && f.rest) return m.feedback.lengthAction;
  if (f?.code === 'image-src' && ctx.editor.value.options.uploadImage) return m.feedback.imageSrcAction;
  if (f?.code === 'unsupported') return m.feedback.unsupportedAction;
  return null;
});
const run = () => {
  const f = fb.value;
  if (!f) return;
  if (f.code === 'length' && f.block && f.rest) {
    ctx.editor.value.insertOverflow(f.block, f.rest);
    fb.value = null;
    requestAnimationFrame(() => ctx.editor.value.scrollCaretIntoView());
  } else if (f.code === 'image-src') {
    ctx.pickImage();
    fb.value = null;
  } else showList.value = !showList.value;
};
const pos = computed(() => {
  void tick.value;
  void ctx.version.value;
  const f = fb.value;
  if (!f) return null;
  const ed = ctx.editor.value;
  const el = (f.block && ed.blockElement(f.block)) || ed.dom;
  const box = el?.getBoundingClientRect();
  const clip = visibleRect(ed);
  if (!box || !clip) return null;
  // Under the caret when it is in that block (long blocks), else under the block; always on screen.
  const sel = ed.selection;
  const caret = sel?.type === 'text' && sel.focus.block === f.block ? ed.selectionRect() : null;
  const anchor = caret ?? box;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const h = note.value?.offsetHeight ?? 96;
  const top = Math.min(Math.max(anchor.bottom + 6, clip.top + 8, 8), Math.min(clip.bottom, vh) - h - 8);
  const width = Math.min(Math.max(box.width, 280), 520);
  return { top, left: Math.max(8, Math.min(box.left, window.innerWidth - width - 8)), width };
});
</script>

<template>
  <div
    v-if="fb && pos"
    ref="note"
    class="bw-feedback bw-feedback-float"
    :class="`bw-feedback-${fb.level}`"
    :style="{ top: `${pos.top}px`, left: `${pos.left}px`, width: `${pos.width}px` }"
    role="status"
    aria-live="polite"
  >
    <BwIcon :name="ICONS[fb.level]" :size="16" class="bw-feedback-icon" />
    <span class="bw-feedback-text">
      {{ text[0] }}<br /><span class="bw-en">{{ text[1] }}</span>
      <span v-if="showList" class="bw-feedback-list">{{ m.feedback.supported }}</span>
    </span>
    <button v-if="action" type="button" class="bw-feedback-action" @mousedown.prevent @click="run">{{ action }}</button>
    <button type="button" class="bw-mini" :aria-label="m.close" @mousedown.prevent @click="fb = null"><BwIcon name="close" :size="14" /></button>
  </div>
</template>
