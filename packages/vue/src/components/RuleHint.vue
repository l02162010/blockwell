<script setup lang="ts">
import { getBlock, type BlockKind } from '@blockwell/core';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useBlockwell } from '../composables.js';

/** After a Markdown shortcut converts a block: "## turned into Heading 2 · ⌫ back to text". */
const ctx = useBlockwell();
const m = ctx.messages;
const rule = shallowRef<{ block: string; marker: string; kind: BlockKind | null } | null>(null);
const tick = ref(0);
let off: (() => void) | null = null;
onMounted(() => {
  off = ctx.editor.value.on('rule', (e) => (rule.value = e.rule));
  window.addEventListener('scroll', bump, true);
});
onBeforeUnmount(() => {
  off?.();
  window.removeEventListener('scroll', bump, true);
});
const bump = () => tick.value++;
const pos = computed(() => {
  void tick.value;
  void ctx.version.value;
  const r = rule.value;
  if (!r) return null;
  const el = ctx.editor.value.blockElement(r.block);
  const text = el?.querySelector('[data-bw-text]') ?? el;
  if (!text) return null;
  const box = text.getBoundingClientRect();
  // After the block's text, or after its placeholder when it is empty.
  const len = getBlock(ctx.editor.value.getJSON(), r.block)?.text?.length ?? 0;
  const end = ctx.editor.value.rectAt({ block: r.block, offset: len });
  const placeholder = text.getAttribute('data-placeholder');
  let left = end?.left ?? box.left;
  if (!len && placeholder) left = box.left + measure(placeholder, getComputedStyle(text).font);
  return { top: box.top + Math.min(box.height, parseFloat(getComputedStyle(text).lineHeight) || box.height) / 2, left: left + 12 };
});
let canvas: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string) {
  canvas ??= document.createElement('canvas').getContext('2d');
  if (!canvas) return text.length * 12;
  canvas.font = font;
  return canvas.measureText(text).width;
}
const label = computed(() => (rule.value?.kind ? m.blockKinds[rule.value.kind][0] : ''));
</script>

<template>
  <div v-if="rule && pos" class="bw-rule-hint" :style="{ top: `${pos.top}px`, left: `${pos.left}px` }" role="status">
    <kbd>{{ rule.marker.trim() }}</kbd>{{ m.ruleApplied(label) }}<span class="bw-dot">·</span><kbd>⌫</kbd>{{ m.ruleRevert }}
  </div>
</template>
