<script setup lang="ts">
import type { BlockKind } from '@blockwell/core';
import { ref } from 'vue';
import { useBlockwell } from '../composables.js';

/**
 * First-run tips for an empty document. Each tip does what it describes when clicked; they hide
 * once typing starts, or with the hide button (the host can remember that via `onboarding`).
 */
const emit = defineEmits<{ dismiss: [] }>();
const ctx = useBlockwell();
const m = ctx.messages;
const hidden = ref(false);
const KINDS: Record<string, BlockKind> = { '#': 'heading1', '-': 'bullet', '[]': 'todo' };
const run = (key: string) => {
  const ed = ctx.editor.value;
  ed.focus();
  const marker = key.split(' ')[0]!;
  if (marker === '/') ed.startSlash();
  else if (KINDS[marker]) ed.setBlockKind(KINDS[marker]!);
};
const dismiss = () => {
  hidden.value = true;
  emit('dismiss');
  ctx.editor.value.focus();
};
</script>

<template>
  <div v-if="!hidden" class="bw-onboarding" aria-label="Tips">
    <button v-for="[key, zh, en] in m.onboarding.items" :key="key" type="button" class="bw-onboarding-row" @mousedown.prevent @click="run(key)">
      <kbd>{{ key }}</kbd><span>{{ zh }} <span class="bw-en">{{ en }}</span></span>
    </button>
    <button type="button" class="bw-onboarding-dismiss" @mousedown.prevent @click="dismiss">{{ m.onboarding.dismiss }}</button>
  </div>
</template>
