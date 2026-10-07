<script setup lang="ts">
import type { BlockKind } from '@blockwell/core';
import { computed } from 'vue';
import { keepFocus, useBlockwell, type PopoverKind } from '../composables.js';
import BlockKindButton from './BlockKindButton.vue';
import BwIcon from './BwIcon.vue';
import ColorButton from './ColorButton.vue';
import ToolButton from './ToolButton.vue';

/**
 * `page`: the compact top bar of the full-page editor. `field`: a form field's small bar.
 * `comment`: inline marks only. `mobile`: one row of 44px buttons above the keyboard.
 */
const props = defineProps<{ variant: 'page' | 'field' | 'comment' | 'mobile' }>();
const emit = defineEmits<{ mention: [] }>();
const ctx = useBlockwell();
const { editor, active, messages: m } = ctx;

const a = computed(() => active.value);
const ed = () => editor.value;
const rectOf = (e: MouseEvent) => {
  const el = e.currentTarget as HTMLElement;
  return () => (el.isConnected ? el.getBoundingClientRect() : null);
};
const openFrom = (kind: Exclude<PopoverKind, null>, e: MouseEvent) => ctx.toggle(kind, rectOf(e), { source: 'toolbar' });
const kind = (k: BlockKind) => ed().toggleBlockKind(k);
const can = (type: string) => ed().allows(type);
const isList = computed(() => ['bullet', 'ordered', 'todo'].includes(a.value?.blockKind ?? ''));
const mod = typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform) ? '⌘' : 'Ctrl+';
const tip = (label: string, key: string) => `${label} (${mod}${key})`;
</script>

<template>
  <div class="bw-toolbar" :class="`bw-toolbar-${props.variant}`" role="toolbar" :aria-label="m.insert[1]">
    <template v-if="variant === 'page'">
      <ToolButton icon="undo" :label="tip(m.undo, 'Z')" :disabled="!a?.canUndo" @click="ed().undo()" />
      <ToolButton icon="redo" :label="tip(m.redo, '⇧Z')" :disabled="!a?.canRedo" @click="ed().redo()" />
      <span class="bw-sep" />
      <BlockKindButton @click="openFrom('block', $event)" />
      <span class="bw-sep" />
      <ToolButton icon="format_bold" :label="tip(m.bold, 'B')" :active="a?.marks.bold" :disabled="a?.inCode" @click="ed().toggleMark('bold')" />
      <ToolButton icon="format_italic" :label="tip(m.italic, 'I')" :active="a?.marks.italic" :disabled="a?.inCode" @click="ed().toggleMark('italic')" />
      <ToolButton icon="format_underlined" :label="tip(m.underline, 'U')" :active="a?.marks.underline" :disabled="a?.inCode" @click="ed().toggleMark('underline')" />
      <ToolButton icon="format_strikethrough" :label="tip(m.strike, '⇧X')" :active="a?.marks.strike" :disabled="a?.inCode" @click="ed().toggleMark('strike')" />
      <ToolButton icon="code" :label="tip(m.code, 'E')" :active="a?.marks.code" :disabled="a?.inCode" @click="ed().toggleMark('code')" />
      <ColorButton @click="openFrom('color', $event)" />
      <ToolButton icon="link" :label="tip(m.link, 'K')" :active="!!a?.link" :disabled="a?.inCode" @click="openFrom('link', $event)" />
      <span class="bw-sep" />
      <ToolButton v-if="can('listItem')" icon="format_list_bulleted" :label="m.blockKinds.bullet.join(' ')" :active="a?.blockKind === 'bullet'" @click="kind('bullet')" />
      <ToolButton v-if="can('listItem')" icon="format_list_numbered" :label="m.blockKinds.ordered.join(' ')" :active="a?.blockKind === 'ordered'" @click="kind('ordered')" />
      <ToolButton v-if="can('listItem')" icon="checklist" :label="m.blockKinds.todo.join(' ')" :active="a?.blockKind === 'todo'" @click="kind('todo')" />
      <span class="bw-sep" />
      <button type="button" class="bw-tool bw-tool-md bw-tool-insert" aria-haspopup="menu" @mousedown="keepFocus" @click="openFrom('insert', $event)">
        <BwIcon name="add" />{{ m.insert[0] }} <span class="bw-en">{{ m.insert[1] }}</span>
      </button>
      <span class="bw-spacer" />
      <span class="bw-hint">{{ m.slashHint[0] }} <kbd>/</kbd> {{ m.slashHint[1] }}</span>
    </template>

    <template v-else-if="variant === 'field'">
      <BlockKindButton size="sm" :show-english="false" @click="openFrom('block', $event)" />
      <span class="bw-sep" />
      <ToolButton size="sm" icon="format_bold" :label="m.bold" :active="a?.marks.bold" @click="ed().toggleMark('bold')" />
      <ToolButton size="sm" icon="format_italic" :label="m.italic" :active="a?.marks.italic" @click="ed().toggleMark('italic')" />
      <ToolButton size="sm" icon="link" :label="m.link" :active="!!a?.link" @click="openFrom('link', $event)" />
      <ToolButton v-if="can('listItem')" size="sm" icon="format_list_bulleted" :label="m.blockKinds.bullet.join(' ')" :active="a?.blockKind === 'bullet'" @click="kind('bullet')" />
      <ToolButton v-if="can('image') && ed().options.uploadImage" size="sm" icon="image" :label="m.image.join(' ')" @click="ctx.pickImage()" />
      <ToolButton size="sm" icon="more_horiz" :label="m.more" @click="openFrom('insert', $event)" />
    </template>

    <template v-else-if="variant === 'comment'">
      <ToolButton size="sm" icon="format_bold" :label="m.bold" :active="a?.marks.bold" @click="ed().toggleMark('bold')" />
      <ToolButton size="sm" icon="format_italic" :label="m.italic" :active="a?.marks.italic" @click="ed().toggleMark('italic')" />
      <ToolButton size="sm" icon="code" :label="m.code" :active="a?.marks.code" @click="ed().toggleMark('code')" />
      <ToolButton size="sm" icon="link" :label="m.link" :active="!!a?.link" @click="openFrom('link', $event)" />
      <ToolButton size="sm" icon="alternate_email" :label="m.mention" @click="emit('mention')" />
      <span class="bw-spacer" />
      <slot name="end" />
    </template>

    <template v-else>
      <ToolButton size="lg" icon="add" :label="m.insert.join(' ')" @click="openFrom('insert', $event)" />
      <button type="button" class="bw-tool bw-tool-lg bw-tool-aa" :aria-label="m.blockKinds.paragraph.join(' ')" @mousedown="keepFocus" @click="openFrom('block', $event)">Aa</button>
      <ToolButton size="lg" icon="format_bold" :label="m.bold" :active="a?.marks.bold" @click="ed().toggleMark('bold')" />
      <ToolButton v-if="can('listItem')" size="lg" icon="checklist" :label="m.blockKinds.todo.join(' ')" :active="a?.blockKind === 'todo'" @click="kind('todo')" />
      <ToolButton size="lg" icon="format_indent_increase" :label="m.indent" :disabled="!isList" @click="ed().indent()" />
      <ToolButton v-if="can('image') && ed().options.uploadImage" size="lg" icon="image" :label="m.image.join(' ')" @click="ctx.pickImage()" />
      <span class="bw-spacer" />
      <ToolButton size="lg" icon="keyboard_hide" :label="m.hideKeyboard" class="bw-muted" @click="ed().dom?.blur()" />
    </template>
  </div>
</template>
