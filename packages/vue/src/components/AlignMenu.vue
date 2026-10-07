<script setup lang="ts">
import { getBlock } from '@blockwell/core';
import { computed } from 'vue';
import { keepFocus, useBlockwell } from '../composables.js';
import BwIcon from './BwIcon.vue';
import Popover from './Popover.vue';

const ctx = useBlockwell();
const m = ctx.messages;
const ICONS = { left: 'format_align_left', center: 'format_align_center', right: 'format_align_right' } as const;
const align = computed(() => {
  void ctx.version.value;
  const id = ctx.active.value?.focusBlock;
  return String((id && getBlock(ctx.editor.value.getJSON(), id)?.attrs?.align) || 'left');
});
const choose = (a: 'left' | 'center' | 'right') => {
  ctx.editor.value.setAlign(a);
  ctx.close();
  ctx.editor.value.focus();
};
</script>

<template>
  <Popover role="menu" :label="m.align.join(' ')">
    <div class="bw-menu">
      <button
        v-for="(icon, a) in ICONS"
        :key="a"
        type="button"
        role="menuitemradio"
        class="bw-menu-item"
        :class="{ 'bw-current': align === a }"
        :aria-checked="align === a"
        @mousedown="keepFocus"
        @click="choose(a)"
      >
        <BwIcon :name="icon" :size="18" class="bw-muted" />
        <span>{{ m.alignments[a] }}</span>
        <BwIcon v-if="align === a" name="check" :size="16" class="bw-accent" />
      </button>
    </div>
  </Popover>
</template>
