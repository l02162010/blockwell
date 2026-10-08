<script setup lang="ts">
import { getBlock } from '@blockwell/core';
import { computed, nextTick, ref, watch } from 'vue';
import { keepFocus, useBlockwell, useFloating } from '../composables.js';
import BwIcon from './BwIcon.vue';
import ToolButton from './ToolButton.vue';

/**
 * Bar over a selected image: alignment (left, center, full width), alt text, delete. Width is
 * set by dragging the side handles (16–2000 px).
 */
const ctx = useBlockwell();
const m = ctx.messages;
const ed = () => ctx.editor.value;
const editingAlt = ref(false);
const image = computed(() => {
  void ctx.version.value;
  const sel = ed().selection;
  if (sel?.type !== 'node' || !ed().isEditable) return null;
  // Gone when you click elsewhere on the page; kept while its alt-text field has focus.
  if (!ctx.focused.value && !editingAlt.value) return null;
  const b = getBlock(ed().getJSON(), sel.block);
  return b?.type === 'image' ? b : null;
});
const frameRect = () => {
  const img = image.value && ed().blockElement(image.value.id)?.querySelector('.bw-image-frame');
  return img ? img.getBoundingClientRect() : null;
};
const el = ref<HTMLElement | null>(null);
const { style } = useFloating(el, frameRect, () => [ctx.version.value, image.value?.id], { placement: 'top', align: 'center', offset: 12 });
const altEl = ref<HTMLElement | null>(null);
const { style: altStyle } = useFloating(altEl, frameRect, () => [ctx.version.value, image.value?.id, editingAlt.value], { placement: 'bottom', align: 'start', offset: 14 });

const ALIGNS = [
  ['left', 'format_align_left'],
  ['center', 'format_align_center'],
  ['full', 'fit_width'],
] as const;
const align = computed(() => String(image.value?.attrs?.align ?? 'center'));

const alt = ref('');
const altInput = ref<HTMLInputElement | null>(null);
watch(image, (b, prev) => {
  if (b?.id !== prev?.id) editingAlt.value = false;
  if (!editingAlt.value) alt.value = String(b?.attrs?.alt ?? '');
});
const startAlt = async () => {
  editingAlt.value = !editingAlt.value;
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
  <template v-if="image">
    <div ref="el" class="bw-bubble bw-image-bar" :style="style" role="toolbar" :aria-label="m.image[1]">
      <ToolButton
        v-for="[a, icon] in ALIGNS"
        :key="a"
        size="sm"
        :icon="icon"
        :icon-size="19"
        :label="m.imageAlign[a]"
        :active="align === a"
        @click="ed().setImageAttrs(image.id, { align: a })"
      />
      <span class="bw-sep" />
      <button type="button" class="bw-tool bw-tool-sm bw-tool-text" :class="{ 'bw-active': editingAlt }" :aria-expanded="editingAlt" @mousedown="keepFocus" @click="startAlt">
        {{ m.imageAlt[0] }} {{ m.imageAlt[1] }}
      </button>
      <ToolButton size="sm" icon="delete" :icon-size="19" :label="m.imageDelete" @click="ed().deleteBlock(image.id)" />
    </div>
    <form v-if="editingAlt" ref="altEl" class="bw-popover bw-alt-panel" :style="altStyle" @submit.prevent="saveAlt" @keydown.esc.prevent="(editingAlt = false), ed().focus()">
      <label class="bw-alt-label" for="bw-alt-input">{{ m.imageAlt[0] }} <span class="bw-en">Alt text</span></label>
      <span class="bw-alt-field">
        <input id="bw-alt-input" ref="altInput" v-model="alt" type="text" maxlength="200" :placeholder="m.altPlaceholder" />
        <span class="bw-mono bw-muted">{{ alt.length }} / 200</span>
      </span>
      <span class="bw-alt-help">給螢幕閱讀器與圖片載入失敗時使用。</span>
      <span class="bw-link-actions">
        <span class="bw-spacer" />
        <button type="submit" class="bw-btn bw-btn-primary">{{ m.linkApply }}</button>
      </span>
    </form>
  </template>
</template>
