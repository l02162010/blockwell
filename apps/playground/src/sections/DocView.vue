<script setup lang="ts">
import { Editor, type Doc } from '@blockwell/core';
import { markRaw, onBeforeUnmount, onMounted, ref } from 'vue';

/** Shows a saved document read-only, the way a sent comment is displayed. */
const props = defineProps<{ doc: Doc }>();
const el = ref<HTMLElement | null>(null);
let editor: Editor | null = null;
onMounted(() => {
  editor = markRaw(new Editor({ doc: props.doc, editable: false }));
  if (el.value) editor.mount(el.value);
});
onBeforeUnmount(() => editor?.destroy());
</script>

<template>
  <div ref="el" class="doc-view bw-content" />
</template>
