<script setup lang="ts">
import type { Editor } from '@blockwell/core';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

/** Mounts an editor's content into a div. Use with `useEditor` when building your own UI. */
const props = defineProps<{
  /** An `Editor` (e.g. from `useEditor()`); it is mounted here and destroyed when replaced or unmounted. */
  editor: Editor;
}>();
const el = ref<HTMLElement | null>(null);
onMounted(() => el.value && props.editor.mount(el.value));
watch(
  () => props.editor,
  (next, prev) => {
    prev?.destroy();
    if (el.value) next.mount(el.value);
  },
);
onBeforeUnmount(() => props.editor.destroy());
</script>

<template>
  <div ref="el" />
</template>
