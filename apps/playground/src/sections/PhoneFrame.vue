<script setup lang="ts">
import type { Doc, Editor, UploadResult } from '@blockwell/core';
import { BlockwellEditor } from '@blockwell/vue';
import { onBeforeUnmount, ref, shallowRef } from 'vue';

/**
 * A phone around a mobile-layout editor. The nav bar works: ‹ resets the demo, ↶ undoes, 完成
 * ends editing. The keyboard mock shows while the editor has focus, like a real one.
 */
const props = defineProps<{ doc: () => Doc; small?: boolean; uploadImage?: (f: File, p: (n: number) => void) => Promise<UploadResult> }>();
const model = shallowRef<Doc>(props.doc());
const editor = shallowRef<Editor | null>(null);
const focused = ref(false);
const canUndo = ref(false);
const key = ref(0);
let offs: (() => void)[] = [];
const ready = (e: Editor) => {
  editor.value = e;
  offs.forEach((f) => f());
  offs = [
    e.on('focus', () => (focused.value = true)),
    e.on('blur', () => (focused.value = false)),
    e.on('update', () => (canUndo.value = e.activeState().canUndo)),
  ];
};
onBeforeUnmount(() => offs.forEach((f) => f()));
const reset = () => {
  model.value = props.doc();
  key.value++;
  canUndo.value = false;
};
const done = () => {
  (document.activeElement as HTMLElement | null)?.blur();
  focused.value = false;
};
</script>

<template>
  <div class="phone" :class="{ 'phone-sm': small }">
    <div class="phone-status" />
    <div class="phone-nav">
      <button type="button" class="phone-btn" aria-label="重設範例 Reset" title="重設範例 Reset" @click="reset"><span class="material-symbols-rounded">chevron_left</span></button>
      <span class="phone-actions">
        <button type="button" class="phone-btn" aria-label="復原 Undo" :disabled="!canUndo" @mousedown.prevent @click="editor?.undo()"><span class="material-symbols-rounded">undo</span></button>
        <button type="button" class="phone-btn phone-done" :disabled="!focused" @mousedown.prevent @click="done">完成</button>
      </span>
    </div>
    <BlockwellEditor :key="key" v-model="model" class="phone-editor" layout="mobile" :upload-image="uploadImage" @ready="ready" />
    <div v-if="focused" class="keyboard" :class="{ 'keyboard-sm': small }">系統鍵盤 · system keyboard</div>
  </div>
</template>
