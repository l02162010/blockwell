<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useBlockwell, useFloating, useOutside, type FloatingOptions } from '../composables.js';

/** A floating panel placed against `ui.anchor`. Closes on outside clicks and Escape. */
const props = defineProps<{ placement?: FloatingOptions['placement']; align?: FloatingOptions['align']; role?: string; label?: string }>();
const ctx = useBlockwell();
const el = ref<HTMLElement | null>(null);
const anchor = () => ctx.ui.anchor?.() ?? null;
const { style } = useFloating(el, anchor, () => [ctx.version.value, ctx.ui.popover, ctx.ui.block], {
  placement: props.placement ?? 'bottom',
  align: props.align ?? 'start',
});
useOutside(
  () => [el.value, ...(Array.from(document.querySelectorAll('[aria-expanded="true"]')) as HTMLElement[])],
  () => ctx.close(),
);
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    ctx.close();
    ctx.editor.value.focus();
  }
};
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div ref="el" class="bw-popover" :style="style" :role="role ?? 'dialog'" :aria-label="label">
    <slot />
  </div>
</template>
