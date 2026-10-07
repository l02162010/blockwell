<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useBlockwell } from '../composables.js';

/** Polite live region: "已套用粗體", "已轉為標題 2" (design §07). Visually hidden. */
const ctx = useBlockwell();
const message = ref('');
let off: (() => void) | null = null;
let timer = 0;
onMounted(() => {
  off = ctx.editor.value.on('format', ({ what, on }) => {
    // Clear first so repeating the same change is announced again.
    message.value = '';
    clearTimeout(timer);
    timer = window.setTimeout(() => (message.value = ctx.messages.announce(what, on)), 30);
  });
});
onBeforeUnmount(() => {
  off?.();
  clearTimeout(timer);
});
</script>

<template>
  <div class="bw-sr-only" role="status" aria-live="polite" aria-atomic="true">{{ message }}</div>
</template>
