<script setup lang="ts">
import { computed } from 'vue';
import { keepFocus, useBlockwell } from '../composables.js';
import BwIcon from './BwIcon.vue';

const props = defineProps<{ size?: 'sm' | 'md'; source?: 'toolbar' | 'bubble' }>();
const emit = defineEmits<{ click: [e: MouseEvent] }>();
const { active, ui, messages } = useBlockwell();
const swatch = (token: string | null | undefined, kind: 'color' | 'bg') =>
  token && token !== 'mixed' ? `var(--editor-${kind}-${token})` : undefined;
const text = computed(() => swatch(active.value?.color, 'color'));
const bar = computed(() => swatch(active.value?.highlight, 'bg') ?? swatch(active.value?.color, 'color'));
const open = computed(() => ui.popover === 'color' && ui.source === (props.source ?? 'toolbar'));
</script>

<template>
  <button
    type="button"
    class="bw-tool bw-tool-color"
    :class="[`bw-tool-${props.size ?? 'md'}`, { 'bw-open': open }]"
    :aria-label="messages.color"
    :title="messages.color"
    aria-haspopup="dialog"
    :aria-expanded="open"
    @mousedown="keepFocus"
    @click="emit('click', $event)"
  >
    <span class="bw-color-glyph">
      <span class="bw-color-a" :style="{ color: text }">A</span>
      <span class="bw-color-bar" :style="{ background: bar }"></span>
    </span>
    <BwIcon name="expand_more" :size="16" class="bw-muted" />
  </button>
</template>
