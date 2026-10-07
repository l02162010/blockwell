<script setup lang="ts">
import { computed } from 'vue';
import { useBlockwell, useLayoutTick, visibleRect } from '../composables.js';
import BwIcon from './BwIcon.vue';

/** Comment counts at the right edge of commented blocks. */
const props = defineProps<{ counts: Record<string, number> }>();
const emit = defineEmits<{ open: [block: string] }>();
const ctx = useBlockwell();
const tick = useLayoutTick(() => ctx.editor.value);
/** In the right margin when there is room; otherwise just above the block's top-right corner. */
const place = (r: DOMRect) => {
  const clip = visibleRect(ctx.editor.value);
  const right = clip?.right ?? window.innerWidth;
  if (r.right + 44 <= right) return { top: `${r.top + 4}px`, left: `${r.right + 8}px` };
  return { top: `${Math.max(r.top - 22, (clip?.top ?? 0) + 2)}px`, left: `${right - 44}px` };
};
const badges = computed(() => {
  void tick.value;
  void ctx.version.value;
  const clip = visibleRect(ctx.editor.value);
  return Object.entries(props.counts)
    .map(([id, n]) => ({ id, n, r: ctx.editor.value.blockElement(id)?.getBoundingClientRect() }))
    .filter((b) => b.n > 0 && b.r && clip && b.r.top >= clip.top && b.r.top <= clip.bottom - 24);
});
</script>

<template>
  <button
    v-for="b in badges"
    :key="b.id"
    type="button"
    class="bw-comment-badge"
    :style="place(b.r!)"
    :aria-label="`${b.n} comments`"
    @mousedown.prevent
    @click="emit('open', b.id)"
  >
    <BwIcon name="chat_bubble" :size="14" />{{ b.n }}
  </button>
</template>
