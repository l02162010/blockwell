<script setup lang="ts">
import { getBlock, locate } from '@blockwell/core';
import { computed } from 'vue';
import { keepFocus, useBlockwell } from '../composables.js';
import BwIcon from './BwIcon.vue';
import Popover from './Popover.vue';

/** Opened by clicking the drag handle: what you can do with the whole block. */
const ctx = useBlockwell();
const m = ctx.messages;
const ed = () => ctx.editor.value;
const id = ctx.ui.block!;
const anchor = ctx.ui.anchor;
const index = computed(() => {
  void ctx.version.value;
  return locate(ed().getJSON(), id)?.index ?? -1;
});
const count = computed(() => {
  void ctx.version.value;
  return ed().getJSON().blocks.length;
});
const convertible = computed(() => {
  void ctx.version.value;
  const b = getBlock(ed().getJSON(), id);
  return !!b && !['divider', 'image', 'table'].includes(b.type);
});
const done = () => {
  ctx.close();
  ed().focus();
};
const turnInto = () => {
  ed().focus();
  ed().selectBlockContent(id);
  ctx.open('block', anchor, { source: 'editor' });
};
const duplicate = () => {
  ed().duplicateBlock(id);
  done();
};
const move = (d: 1 | -1) => {
  ed().moveBlockBy(id, d);
  ed().revealBlock(id);
};
const remove = () => {
  ed().deleteBlock(id);
  done();
};
</script>

<template>
  <Popover role="menu" :label="m.blockActions.menu">
    <div class="bw-menu">
      <button v-if="convertible" type="button" role="menuitem" class="bw-menu-item" @mousedown="keepFocus" @click="turnInto">
        <BwIcon name="autorenew" :size="18" class="bw-muted" /><span>{{ m.turnInto[0] }} <span class="bw-en">{{ m.turnInto[1] }}</span></span>
      </button>
      <button type="button" role="menuitem" class="bw-menu-item" @mousedown="keepFocus" @click="duplicate">
        <BwIcon name="content_copy" :size="18" class="bw-muted" /><span>{{ m.blockActions.duplicate }}</span>
      </button>
      <button type="button" role="menuitem" class="bw-menu-item" :disabled="index <= 0" @mousedown="keepFocus" @click="move(-1)">
        <BwIcon name="arrow_upward" :size="18" class="bw-muted" /><span>{{ m.blockActions.moveUp }}</span>
      </button>
      <button type="button" role="menuitem" class="bw-menu-item" :disabled="index < 0 || index >= count - 1" @mousedown="keepFocus" @click="move(1)">
        <BwIcon name="arrow_downward" :size="18" class="bw-muted" /><span>{{ m.blockActions.moveDown }}</span>
      </button>
      <div class="bw-menu-sep" />
      <button type="button" role="menuitem" class="bw-menu-item bw-danger-item" @mousedown="keepFocus" @click="remove">
        <BwIcon name="delete" :size="18" /><span>{{ m.blockActions.delete }}</span>
      </button>
    </div>
  </Popover>
</template>
