<script setup lang="ts">
import type { Pos } from '@blockwell/core';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useBlockwell, visibleRect } from '../composables.js';

export interface RemoteCursor {
  name: string;
  /** A CSS colour for the caret and label, e.g. a palette text colour. */
  color: string;
  pos: Pos;
}

/** Draws other people's carets. Positions come from your collaboration layer (e.g. Yjs awareness). */
const props = defineProps<{ cursors: RemoteCursor[] }>();
const ctx = useBlockwell();
const tick = ref(0);
const bump = () => tick.value++;
onMounted(() => {
  window.addEventListener('scroll', bump, true);
  window.addEventListener('resize', bump);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', bump, true);
  window.removeEventListener('resize', bump);
});
const placed = computed(() => {
  void tick.value;
  void ctx.version.value;
  const clip = visibleRect(ctx.editor.value);
  return props.cursors
    .map((c) => ({ c, r: ctx.editor.value.rectAt(c.pos) }))
    .filter((x): x is { c: RemoteCursor; r: DOMRect } => !!x.r && !!clip && x.r.top >= clip.top + 16 && x.r.bottom <= clip.bottom);
});
</script>

<template>
  <div v-for="{ c, r } in placed" :key="c.name" class="bw-remote" :style="{ top: `${r.top}px`, left: `${r.left - 1}px`, height: `${r.height}px`, background: c.color }">
    <span class="bw-remote-label" :style="{ background: c.color }">{{ c.name }}</span>
  </div>
</template>
