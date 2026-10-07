<script setup lang="ts">
import type { BlockKind } from '@blockwell/core';
import { computed } from 'vue';
import { keepFocus, useBlockwell } from '../composables.js';
import { BLOCK_KIND_ICONS } from '../messages.js';
import BwIcon from './BwIcon.vue';
import Popover from './Popover.vue';

const ctx = useBlockwell();
const m = ctx.messages;
const TYPES: Record<BlockKind, string> = {
  paragraph: 'paragraph', heading1: 'heading', heading2: 'heading', heading3: 'heading',
  bullet: 'listItem', ordered: 'listItem', todo: 'listItem', quote: 'quote', code: 'code',
};
const kinds = computed(() => (Object.keys(TYPES) as BlockKind[]).filter((k) => ctx.editor.value.allows(TYPES[k])));
const choose = (k: BlockKind) => {
  ctx.close();
  ctx.editor.value.setBlockKind(k);
  ctx.editor.value.focus();
};
</script>

<template>
  <Popover role="menu" :label="m.blockKinds.paragraph[1]">
    <div class="bw-menu">
      <button
        v-for="k in kinds"
        :key="k"
        type="button"
        role="menuitemradio"
        class="bw-menu-item"
        :class="{ 'bw-current': ctx.active.value?.blockKind === k }"
        :aria-checked="ctx.active.value?.blockKind === k"
        @mousedown="keepFocus"
        @click="choose(k)"
      >
        <BwIcon :name="BLOCK_KIND_ICONS[k]" :size="18" class="bw-muted" />
        <span>{{ m.blockKinds[k][0] }}</span>
        <span class="bw-menu-en">{{ m.blockKinds[k][1] }}</span>
        <BwIcon v-if="ctx.active.value?.blockKind === k" name="check" :size="16" class="bw-accent" />
      </button>
    </div>
  </Popover>
</template>
