<script setup lang="ts">
import { computed, ref } from 'vue';
import { useBlockwell, useFloating, type PopoverKind } from '../composables.js';
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

const visible = computed(() => {
  void ctx.version.value;
  const st = a.value;
  if (!st || st.collapsed || st.inCode || !ed().isEditable) return false;
  if (ctx.ui.popover && ctx.ui.source === 'bubble') return true;
  return ed().hasFocus && !ctx.ui.popover && !ed().slash;
});

const el = ref<HTMLElement | null>(null);
const { style } = useFloating(el, () => ed().selectionBounds(), () => [ctx.version.value, visible.value], { placement: 'top', offset: 10 });
const openFrom = (kind: Exclude<PopoverKind, null>, e: MouseEvent) => {
  const target = e.currentTarget as HTMLElement;
  ctx.toggle(kind, () => (target.isConnected ? target.getBoundingClientRect() : null), { source: 'bubble' });
};
</script>

<template>
  <div v-show="visible" ref="el" class="bw-bubble" :style="style" role="toolbar" :aria-label="m.bold">
    <BlockKindButton size="sm" source="bubble" :show-english="false" @click="openFrom('block', $event)" />
    <span class="bw-sep" />
    <ToolButton size="sm" icon="format_bold" :icon-size="19" :label="m.bold" :active="a?.marks.bold" @click="ed().toggleMark('bold')" />
    <ToolButton size="sm" icon="format_italic" :icon-size="19" :label="m.italic" :active="a?.marks.italic" @click="ed().toggleMark('italic')" />
    <ToolButton size="sm" icon="format_underlined" :icon-size="19" :label="m.underline" :active="a?.marks.underline" @click="ed().toggleMark('underline')" />
    <ToolButton size="sm" icon="format_strikethrough" :icon-size="19" :label="m.strike" :active="a?.marks.strike" @click="ed().toggleMark('strike')" />
    <ToolButton size="sm" icon="code" :icon-size="19" :label="m.code" :active="a?.marks.code" @click="ed().toggleMark('code')" />
    <ColorButton size="sm" source="bubble" @click="openFrom('color', $event)" />
    <ToolButton size="sm" icon="link" :icon-size="19" :label="m.link" :active="!!a?.link" @click="openFrom('link', $event)" />
    <template v-if="props.comments">
      <span class="bw-sep" />
      <ToolButton size="sm" icon="add_comment" :icon-size="19" label="留言 Comment" @click="emit('comment')" />
    </template>
  </div>
</template>
