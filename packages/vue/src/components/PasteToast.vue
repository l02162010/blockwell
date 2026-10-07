<script setup lang="ts">
import type { PasteReport } from '@blockwell/core';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useBlockwell } from '../composables.js';
import BwIcon from './BwIcon.vue';

/** Tells the user what a paste kept and what it stripped, with a way back to plain text. */
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
    timer = window.setTimeout(hide, 8000);
  });
});
onBeforeUnmount(() => {
  off?.();
  clearTimeout(timer);
});
const kept = (r: PasteReport) => r.kept.map((k) => m.features[k] ?? k);
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
    <div v-if="report" class="bw-toast" role="status" aria-live="polite">
      <BwIcon name="content_paste" class="bw-toast-icon" />
      <div class="bw-toast-body">
        <div class="bw-toast-title">{{ m.pastedTitle[0] }} <span class="bw-en">{{ m.pastedTitle[1] }}</span></div>
        <div class="bw-chips">
          <span v-if="report.kept.length" class="bw-chip">{{ m.pastedKept(kept(report)) }}</span>
          <span class="bw-chip bw-chip-dim">{{ m.pastedRemoved(report.droppedAttrs, report.unknownElements, report.unsafeUrls) }}</span>
        </div>
      </div>
      <div class="bw-toast-actions">
        <button type="button" class="bw-toast-btn bw-accent-dark" @click="plain">{{ m.pasteAsPlain }}</button>
        <button type="button" class="bw-toast-btn" @click="undo">{{ m.pasteUndo }}</button>
      </div>
    </div>
  </Transition>
</template>
