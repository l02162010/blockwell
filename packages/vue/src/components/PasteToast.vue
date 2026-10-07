<script setup lang="ts">
import type { PasteReport } from '@blockwell/core';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useBlockwell } from '../composables.js';
import BwIcon from './BwIcon.vue';

/**
 * Says what a paste kept and stripped, per source (design §05): generic HTML, Google Docs, Word
 * and Markdown. Offers plain text (or the original Markdown) and undo.
 */
const ctx = useBlockwell();
const m = ctx.messages;
const report = ref<PasteReport | null>(null);
let timer = 0;
let off: (() => void) | null = null;
const hide = () => {
  report.value = null;
  clearTimeout(timer);
};
onMounted(() => {
  off = ctx.editor.value.on('paste', ({ report: r }) => {
    report.value = r;
    clearTimeout(timer);
    timer = window.setTimeout(hide, 9000);
  });
});
onBeforeUnmount(() => {
  off?.();
  clearTimeout(timer);
});

const keptChip = computed(() => {
  const r = report.value;
  if (!r) return '';
  if (r.source === 'markdown') return m.pasteCounts(r.counts, '已轉為');
  if (r.source === 'word') {
    const c = { ...r.counts };
    const parts = [c.table ? `表格 ${c.table}` : '', c.list ? `清單 ${c.list} 項` : '', c.heading ? `標題 ${c.heading}` : ''].filter(Boolean);
    if (parts.length) return `保留 ${parts.join('、')}`;
  }
  const kept = r.kept.map((k) => m.features[k] ?? k);
  return kept.length ? m.pastedKept(kept) : '';
});
const removedChip = computed(() => {
  const r = report.value;
  if (!r || r.source === 'markdown') return '';
  if (r.source === 'gdocs' || r.source === 'word') {
    const names = r.removed.filter((k) => k !== 'color' || r.source === 'gdocs').map((k) => m.removedKinds[k] ?? k);
    return names.length ? `移除 ${names.join('、')}` : '';
  }
  return m.pastedRemoved(r.droppedAttrs, r.unknownElements, r.unsafeUrls);
});
const rich = computed(() => report.value && report.value.source !== 'html');
const plain = () => {
  ctx.editor.value.pasteAsPlainText();
  hide();
  ctx.editor.value.focus();
};
const undo = () => {
  ctx.editor.value.undo();
  hide();
  ctx.editor.value.focus();
};
</script>

<template>
  <Transition name="bw-toast">
    <div v-if="report" class="bw-toast" :class="{ 'bw-toast-stacked': rich }" role="status" aria-live="polite">
      <BwIcon name="content_paste" class="bw-toast-icon" />
      <div class="bw-toast-body">
        <div class="bw-toast-title">{{ m.pasteSources[report.source][0] }} <span class="bw-en">{{ m.pasteSources[report.source][1] }}</span></div>
        <div class="bw-chips">
          <span v-if="keptChip" class="bw-chip">{{ keptChip }}</span>
          <span v-if="removedChip" class="bw-chip bw-chip-dim">{{ removedChip }}</span>
        </div>
        <div v-if="rich" class="bw-toast-actions bw-toast-actions-inline">
          <button type="button" class="bw-toast-btn bw-accent-dark" @click="plain">{{ report.source === 'markdown' ? m.keepSource : m.pasteAsPlain }}</button>
          <button type="button" class="bw-toast-btn" @click="undo">{{ m.pasteUndo }}</button>
        </div>
      </div>
      <div v-if="!rich" class="bw-toast-actions">
        <button type="button" class="bw-toast-btn bw-accent-dark" @click="plain">{{ m.pasteAsPlain }}</button>
        <button type="button" class="bw-toast-btn" @click="undo">{{ m.pasteUndo }}</button>
      </div>
    </div>
  </Transition>
</template>
