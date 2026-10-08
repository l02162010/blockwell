<script setup lang="ts">
import { defaultMessages } from '../messages.js';

/** Save state, always in the same place in the top bar (design §06). */
withDefaults(
  defineProps<{
    /** Where the last save stands. Shown with the matching icon and colour. */
    status: 'saving' | 'saved' | 'offline' | 'error';
    /** `inline` for a top bar, `chip` for a compact pill. */
    variant?: 'inline' | 'chip';
    /** Replaces the default text for this status. */
    label?: string;
  }>(),
  { variant: 'inline' },
);
const m = defaultMessages;
</script>

<template>
  <span class="bw-save" :class="[`bw-save-${status}`, `bw-save-${variant}`]" role="status" aria-live="polite">
    <span v-if="status === 'saving'" class="bw-spinner" aria-hidden="true" />
    <span v-else class="bw-save-dot" aria-hidden="true" />
    {{ label ?? m.saveStatus[status] }}
  </span>
</template>
