<script setup lang="ts">
import { computed, ref } from 'vue';
import { useBlockwell, useFloating, visibleRect, type PopoverKind } from '../composables.js';
import BlockKindButton from './BlockKindButton.vue';
import ColorButton from './ColorButton.vue';
import ToolButton from './ToolButton.vue';

/** Floating bar over a text selection. */
const props = defineProps<{ comments?: boolean }>();
const emit = defineEmits<{ comment: [] }>();
const ctx = useBlockwell();
const m = ctx.messages;
const ed = () => ctx.editor.value;
const a = computed(() => ctx.active.value);
const inCode = computed(() => !!a.value?.marks.code);

const visible = computed(() => {
  void ctx.version.value;
  const st = a.value;
  if (!st || st.collapsed || st.inCode || !ed().isEditable) return false;
  if (ctx.ui.popover && ctx.ui.source === 'bubble') return true;
  return ed().hasFocus && !ctx.ui.popover && !ed().slash;
});

const el = ref<HTMLElement | null>(null);
/** The selection, as long as it is inside the editor's visible area (not scrolled away or under the toolbar). */
const anchor = () => {
  const r = ed().selectionBounds();
  const clip = visibleRect(ed());
  if (!r || !clip || r.bottom < clip.top || r.top > clip.bottom) return null;
  return r;
};
const { style } = useFloating(el, anchor, () => [ctx.version.value, visible.value], { placement: 'top', offset: 10, bounds: () => visibleRect(ed()) });
const openFrom = (kind: Exclude<PopoverKind, null>, e: MouseEvent) => {
  const target = e.currentTarget as HTMLElement;
  ctx.toggle(kind, () => (target.isConnected ? target.getBoundingClientRect() : null), { source: 'bubble' });
};
</script>

<template>
  <div v-show="visible" ref="el" class="bw-bubble" :style="style" role="toolbar" :aria-label="m.toolbar">
    <BlockKindButton size="sm" source="bubble" :show-english="false" @click="openFrom('block', $event)" />
    <span class="bw-sep" />
    <ToolButton size="sm" icon="format_bold" :icon-size="19" :label="m.bold" :active="a?.marks.bold" :disabled="inCode" @click="ed().toggleMark('bold')" />
    <ToolButton size="sm" icon="format_italic" :icon-size="19" :label="m.italic" :active="a?.marks.italic" :disabled="inCode" @click="ed().toggleMark('italic')" />
    <ToolButton size="sm" icon="format_underlined" :icon-size="19" :label="m.underline" :active="a?.marks.underline" :disabled="inCode" @click="ed().toggleMark('underline')" />
    <ToolButton size="sm" icon="format_strikethrough" :icon-size="19" :label="m.strike" :active="a?.marks.strike" :disabled="inCode" @click="ed().toggleMark('strike')" />
    <ToolButton size="sm" icon="code" :icon-size="19" :label="m.code" :active="a?.marks.code" @click="ed().toggleMark('code')" />
    <ColorButton size="sm" source="bubble" :disabled="inCode" @click="openFrom('color', $event)" />
    <ToolButton size="sm" icon="link" :icon-size="19" :label="m.link" :active="!!a?.link" :disabled="inCode" @click="openFrom('link', $event)" />
    <template v-if="props.comments">
      <span class="bw-sep" />
      <ToolButton size="sm" icon="add_comment" :icon-size="19" label="留言 Comment" @click="emit('comment')" />
    </template>
  </div>
</template>
