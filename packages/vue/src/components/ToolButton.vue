<script setup lang="ts">
import { keepFocus } from '../composables.js';
import BwIcon from './BwIcon.vue';

withDefaults(
  defineProps<{
    icon?: string;
    label: string;
    active?: boolean;
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg';
    iconSize?: number;
  }>(),
  { size: 'md' },
);
defineEmits<{ click: [e: MouseEvent] }>();
</script>

<template>
  <button
    type="button"
    class="bw-tool"
    :class="[`bw-tool-${size}`, { 'bw-active': active }]"
    :aria-label="label"
    :title="label"
    :aria-pressed="active === undefined ? undefined : active"
    :disabled="disabled"
    @mousedown="keepFocus"
    @click="$emit('click', $event)"
  >
    <BwIcon v-if="icon" :name="icon" :size="iconSize ?? (size === 'sm' ? 18 : size === 'lg' ? 22 : 20)" />
    <slot />
  </button>
</template>
