<script setup lang="ts">
import { getBlock, type BlockKind } from '@blockwell/core';
import { computed } from 'vue';
import { keepFocus, useBlockwell } from '../composables.js';
import { BLOCK_KIND_ICONS } from '../messages.js';
import BwIcon from './BwIcon.vue';
import Popover from './Popover.vue';

/** "Turn into": block conversions, with a warning when converting would drop formatting. */
const ctx = useBlockwell();
const m = ctx.messages;
const ed = () => ctx.editor.value;
const TYPES: Record<BlockKind, string> = {
  paragraph: 'paragraph', heading1: 'heading', heading2: 'heading', heading3: 'heading',
  bullet: 'listItem', ordered: 'listItem', todo: 'listItem', quote: 'quote', code: 'code',
};
const kinds = computed(() => (Object.keys(TYPES) as BlockKind[]).filter((k) => ed().allows(TYPES[k])));
const current = computed(() => ctx.active.value?.blockKind ?? null);
const loss = computed(() => {
  void ctx.version.value;
  return ed().conversionLoss('code');
});
const warn = (k: BlockKind) => k === 'code' && current.value !== 'code' && (loss.value.marks > 0 || loss.value.mentions > 0);
const alignable = computed(() => {
  void ctx.version.value;
  const id = ctx.active.value?.focusBlock;
  const b = id ? getBlock(ed().getJSON(), id) : null;
  return b?.type === 'paragraph' || b?.type === 'heading';
});
const align = computed(() => {
  void ctx.version.value;
  const id = ctx.active.value?.focusBlock;
  return String((id && getBlock(ed().getJSON(), id)?.attrs?.align) || 'left');
});
const choose = (k: BlockKind) => {
  ctx.close();
  ed().setBlockKind(k);
  ed().focus();
};
const ALIGN_ICONS = { left: 'format_align_left', center: 'format_align_center', right: 'format_align_right' } as const;
</script>

<template>
  <Popover role="menu" :label="m.turnInto.join(' ')">
    <div class="bw-menu bw-turn">
      <div class="bw-menu-head">{{ m.turnInto[0] }} · {{ m.turnInto[1] }}</div>
      <div v-for="k in kinds" :key="k" class="bw-turn-item" :class="{ 'bw-warn-item': warn(k) }">
        <button
          type="button"
          role="menuitemradio"
          class="bw-menu-item"
          :class="{ 'bw-current': current === k }"
          :aria-checked="current === k"
          @mousedown="keepFocus"
          @click="choose(k)"
        >
          <BwIcon :name="BLOCK_KIND_ICONS[k]" :size="18" class="bw-ink-2" />
          <span class="bw-turn-label">{{ m.blockKinds[k][0] }} <span class="bw-en">{{ m.blockKinds[k][1] }}</span></span>
          <BwIcon v-if="current === k" name="check" :size="16" class="bw-accent" />
          <BwIcon v-else-if="warn(k)" name="warning" :size="16" class="bw-warn-ink" />
        </button>
        <p v-if="warn(k)" class="bw-turn-warning">
          {{ m.conversionWarning(loss.marks, loss.types, loss.mentions)[0] }}<br />{{ m.conversionWarning(loss.marks, loss.types, loss.mentions)[1] }}
        </p>
      </div>
      <template v-if="alignable">
        <div class="bw-menu-sep" />
        <div class="bw-turn-align">
          <span>{{ m.align[0] }} {{ m.align[1] }}</span>
          <span class="bw-segmented" role="radiogroup" :aria-label="m.align.join(' ')">
            <button
              v-for="(icon, a) in ALIGN_ICONS"
              :key="a"
              type="button"
              role="radio"
              :aria-checked="align === a"
              :aria-label="m.alignments[a]"
              :title="m.alignments[a]"
              :class="{ 'bw-current': align === a }"
              @mousedown="keepFocus"
              @click="ed().setAlign(a)"
            >
              <BwIcon :name="icon" :size="16" />
            </button>
          </span>
        </div>
      </template>
    </div>
  </Popover>
</template>
