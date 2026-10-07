<script setup lang="ts">
import { getBlock } from '@blockwell/core';
import { computed, nextTick, ref, watch } from 'vue';
import { keepFocus, useBlockwell, useFloating } from '../composables.js';
import ToolButton from './ToolButton.vue';

/**
 * Bar over a selected image: fit to width, alt text, delete. Width is set by dragging the
 * image's side handles (16–2000 px); the schema has no alignment for images.
 */
const ctx = useBlockwell();
const m = ctx.messages;
const ed = () => ctx.editor.value;
const image = computed(() => {
  void ctx.version.value;
  const sel = ed().selection;
  if (sel?.type !== 'node' || !ed().isEditable) return null;
  const b = getBlock(ed().getJSON(), sel.block);
  return b?.type === 'image' ? b : null;
});
const el = ref<HTMLElement | null>(null);
const anchor = () => {
  const img = image.value && ed().blockElement(image.value.id)?.querySelector('.bw-image-frame');
  return img ? img.getBoundingClientRect() : null;
};
const { style } = useFloating(el, anchor, () => [ctx.version.value, image.value?.id], { placement: 'top', align: 'center', offset: 12 });

const editingAlt = ref(false);
const alt = ref('');
const altInput = ref<HTMLInputElement | null>(null);
watch(image, (b) => {
  editingAlt.value = false;
  alt.value = String(b?.attrs?.alt ?? '');
});
const startAlt = async () => {
  editingAlt.value = true;
  alt.value = String(image.value?.attrs?.alt ?? '');
  await nextTick();
  altInput.value?.focus();
};
const saveAlt = () => {
  const id = image.value?.id;
  if (!id) return;
  ed().setImageAttrs(id, { alt: alt.value.slice(0, 200) });
  editingAlt.value = false;
  ed().selectNode(id);
  ed().focus();
};
</script>

<template>
  <div v-if="image" ref="el" class="bw-bubble bw-image-bar" :style="style" role="toolbar" :aria-label="m.image[1]">
    <template v-if="!editingAlt">
      <ToolButton size="sm" icon="fit_width" :icon-size="19" :label="m.imageFit" :active="image.attrs?.width === undefined" @click="ed().setImageAttrs(image.id, { width: null })" />
      <span class="bw-sep" />
      <button type="button" class="bw-tool bw-tool-sm bw-tool-text" @mousedown="keepFocus" @click="startAlt">{{ m.imageAlt[0] }} {{ m.imageAlt[1] }}</button>
      <ToolButton size="sm" icon="delete" :icon-size="19" :label="m.imageDelete" @click="ed().deleteBlock(image.id)" />
    </template>
    <form v-else class="bw-alt-form" @submit.prevent="saveAlt">
      <input ref="altInput" v-model="alt" type="text" maxlength="200" :placeholder="m.altPlaceholder" @keydown.esc.prevent="editingAlt = false" />
      <button type="submit" class="bw-btn bw-btn-primary">{{ m.linkApply }}</button>
    </form>
  </div>
</template>
