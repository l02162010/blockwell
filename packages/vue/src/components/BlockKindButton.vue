<script setup lang="ts">
import { computed } from 'vue';
import { keepFocus, useBlockwell } from '../composables.js';
import BwIcon from './BwIcon.vue';

const props = withDefaults(defineProps<{ size?: 'sm' | 'md'; showEnglish?: boolean; source?: 'toolbar' | 'bubble' }>(), { size: 'md', showEnglish: true, source: 'toolbar' });
const emit = defineEmits<{ click: [e: MouseEvent] }>();
const { active, ui, messages } = useBlockwell();
const label = computed(() => messages.blockKinds[active.value?.blockKind ?? 'paragraph']);
const open = computed(() => ui.popover === 'block' && ui.source === (props.source ?? 'toolbar'));
</script>

<template>
  <button
    type="button"
    class="bw-tool bw-tool-kind"
    :class="[`bw-tool-${props.size}`, { 'bw-open': open }]"
    aria-haspopup="menu"
    :aria-expanded="open"
    @mousedown="keepFocus"
    @click="emit('click', $event)"
  >
    <span>{{ label[0] }}</span>
    <span v-if="showEnglish" class="bw-en">{{ label[1] }}</span>
    <BwIcon name="expand_more" :size="size === 'sm' ? 15 : 18" class="bw-muted" />
  </button>
</template>
