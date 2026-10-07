<script setup lang="ts">
import { diffDocs, Editor, type Doc } from '@blockwell/core';
import { markRaw, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useBlockwell } from '../composables.js';

/** Read-only view of `current` against `base`: added blocks green, removed ones struck through. */
const props = defineProps<{ base: Doc; current: Doc; mentionLabel?: (id: string) => string }>();
const { messages } = useBlockwell();
const el = ref<HTMLElement | null>(null);
let editor: Editor | null = null;
const show = () => {
  editor?.destroy();
  const { doc, changes } = diffDocs(props.base, props.current);
  editor = markRaw(
    new Editor({ doc, editable: false, languageLabel: (l) => messages.languages[l] ?? l, ...(props.mentionLabel ? { mentionLabel: props.mentionLabel } : {}) }),
  );
  if (!el.value) return;
  editor.mount(el.value);
  const classes: Record<string, string> = {};
  for (const [id, c] of Object.entries(changes)) classes[id] = c === 'removed' ? 'bw-diff-removed' : 'bw-diff-added';
  editor.setBlockClasses('diff', classes);
};
onMounted(show);
watch(() => [props.base, props.current], show);
onBeforeUnmount(() => editor?.destroy());
</script>

<template>
  <div ref="el" class="bw-content bw-diff" />
</template>
