<script setup lang="ts">
import { getBlock, type BlockKind } from '@blockwell/core';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { keepFocus, useBlockwell, type PopoverKind } from '../composables.js';
import BlockKindButton from './BlockKindButton.vue';
import BwIcon from './BwIcon.vue';
import ColorButton from './ColorButton.vue';
import ToolButton from './ToolButton.vue';

/**
 * `page`: the compact top bar of the full-page editor. `field`: a form field's small bar.
 * `comment`: inline marks only. `mobile`: one row of 44px buttons above the keyboard, which
 * turns into a format row while text is selected and a table bar inside tables.
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
/** Inline code excludes every other mark, so those buttons are off while it is active. */
const inCode = computed(() => !!a.value?.marks.code || !!a.value?.inCode);
const mod = typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform) ? '⌘' : 'Ctrl+';
const tip = (label: string, key: string) => `${label} (${mod}${key})`;
const alignIcon = computed(() => {
  void ctx.version.value;
  const id = a.value?.focusBlock;
  const al = String((id && getBlock(ed().getJSON(), id)?.attrs?.align) || 'left');
  return { left: 'format_align_left', center: 'format_align_center', right: 'format_align_right' }[al] ?? 'format_align_left';
});
const alignable = computed(() => a.value?.focusType === 'paragraph' || a.value?.focusType === 'heading');
const mobileMode = computed(() => (props.variant !== 'mobile' ? null : a.value && !a.value.collapsed && !a.value.inCode ? 'format' : a.value?.inTable ? 'table' : 'default'));
const tableMore = (e: MouseEvent) => ctx.toggle('tableRow', rectOf(e), { source: 'toolbar' });
const tableDelete = () => {
  const id = a.value?.focusBlock;
  if (id) ed().deleteRow(id);
};

// Roving tabindex: one stop in the tab order, arrow keys move between buttons (WAI-ARIA toolbar).
const bar = ref<HTMLElement | null>(null);
const buttons = () => Array.from(bar.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
const roving = () => {
  const list = buttons();
  const current = list.find((b) => b.tabIndex === 0) ?? list[0];
  list.forEach((b) => (b.tabIndex = b === current ? 0 : -1));
};
onMounted(roving);
watch([() => ctx.version.value, mobileMode], () => nextTick(roving));
const onKey = (e: KeyboardEvent) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const list = buttons();
  const i = list.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
  list.forEach((b, j) => (b.tabIndex = j === next ? 0 : -1));
  list[next]!.focus();
};
</script>

<template>
  <div ref="bar" class="bw-toolbar" :class="`bw-toolbar-${props.variant}`" role="toolbar" :aria-label="m.insert[1]" @keydown="onKey">
    <template v-if="variant === 'page'">
      <ToolButton icon="undo" :label="tip(m.undo, 'Z')" :disabled="!a?.canUndo" @click="ed().undo()" />
      <ToolButton icon="redo" :label="tip(m.redo, '⇧Z')" :disabled="!a?.canRedo" @click="ed().redo()" />
      <span class="bw-sep" />
      <BlockKindButton @click="openFrom('block', $event)" />
      <span class="bw-sep" />
      <ToolButton icon="format_bold" :label="tip(m.bold, 'B')" :active="a?.marks.bold" :disabled="inCode" @click="ed().toggleMark('bold')" />
      <ToolButton icon="format_italic" :label="tip(m.italic, 'I')" :active="a?.marks.italic" :disabled="inCode" @click="ed().toggleMark('italic')" />
      <ToolButton icon="format_underlined" :label="tip(m.underline, 'U')" :active="a?.marks.underline" :disabled="inCode" @click="ed().toggleMark('underline')" />
      <ToolButton icon="format_strikethrough" :label="tip(m.strike, '⇧X')" :active="a?.marks.strike" :disabled="inCode" @click="ed().toggleMark('strike')" />
      <ToolButton icon="code" :label="tip(m.code, 'E')" :active="a?.marks.code" :disabled="a?.inCode" @click="ed().toggleMark('code')" />
      <ColorButton :disabled="inCode" @click="openFrom('color', $event)" />
      <ToolButton icon="link" :label="tip(m.link, 'K')" :active="!!a?.link" :disabled="inCode" @click="openFrom('link', $event)" />
      <span class="bw-sep" />
      <ToolButton v-if="can('listItem')" icon="format_list_bulleted" :label="m.blockKinds.bullet.join(' ')" :active="a?.blockKind === 'bullet'" @click="kind('bullet')" />
      <ToolButton v-if="can('listItem')" icon="format_list_numbered" :label="m.blockKinds.ordered.join(' ')" :active="a?.blockKind === 'ordered'" @click="kind('ordered')" />
      <ToolButton v-if="can('listItem')" icon="checklist" :label="m.blockKinds.todo.join(' ')" :active="a?.blockKind === 'todo'" @click="kind('todo')" />
      <span class="bw-sep" />
      <button
        type="button"
        class="bw-tool bw-tool-md bw-tool-align"
        :class="{ 'bw-open': ctx.ui.popover === 'align' }"
        :aria-label="m.align.join(' ')"
        :title="m.align.join(' ')"
        aria-haspopup="menu"
        :aria-expanded="ctx.ui.popover === 'align'"
        :disabled="!alignable"
        @mousedown="keepFocus"
        @click="openFrom('align', $event)"
      >
        <BwIcon :name="alignIcon" /><BwIcon name="expand_more" :size="16" class="bw-muted" />
      </button>
      <span class="bw-sep" />
      <button type="button" class="bw-tool bw-tool-md bw-tool-insert" aria-haspopup="menu" @mousedown="keepFocus" @click="openFrom('insert', $event)">
        <BwIcon name="add" />{{ m.insert[0] }} <span class="bw-en">{{ m.insert[1] }}</span>
      </button>
      <span class="bw-spacer" />
      <span v-if="a?.marks.code" class="bw-hint bw-hint-accent"><BwIcon name="info" :size="15" />{{ m.inlineCodeHint[0] }} · {{ m.inlineCodeHint[1] }}</span>
      <span v-else class="bw-hint">{{ m.slashHint[0] }} <kbd>/</kbd> {{ m.slashHint[1] }}</span>
    </template>

    <template v-else-if="variant === 'field'">
      <BlockKindButton size="sm" :show-english="false" @click="openFrom('block', $event)" />
      <span class="bw-sep" />
      <ToolButton size="sm" icon="format_bold" :label="m.bold" :active="a?.marks.bold" :disabled="inCode" @click="ed().toggleMark('bold')" />
      <ToolButton size="sm" icon="format_italic" :label="m.italic" :active="a?.marks.italic" :disabled="inCode" @click="ed().toggleMark('italic')" />
      <ToolButton size="sm" icon="link" :label="m.link" :active="!!a?.link" :disabled="inCode" @click="openFrom('link', $event)" />
      <ToolButton v-if="can('listItem')" size="sm" icon="format_list_bulleted" :label="m.blockKinds.bullet.join(' ')" :active="a?.blockKind === 'bullet'" @click="kind('bullet')" />
      <ToolButton v-if="can('image') && ed().options.uploadImage" size="sm" icon="image" :label="m.image.join(' ')" @click="ctx.pickImage()" />
      <ToolButton size="sm" icon="more_horiz" :label="m.more" @click="openFrom('insert', $event)" />
    </template>

    <template v-else-if="variant === 'comment'">
      <ToolButton size="sm" icon="format_bold" :label="m.bold" :active="a?.marks.bold" :disabled="inCode" @click="ed().toggleMark('bold')" />
      <ToolButton size="sm" icon="format_italic" :label="m.italic" :active="a?.marks.italic" :disabled="inCode" @click="ed().toggleMark('italic')" />
      <ToolButton size="sm" icon="code" :label="m.code" :active="a?.marks.code" @click="ed().toggleMark('code')" />
      <ToolButton size="sm" icon="link" :label="m.link" :active="!!a?.link" :disabled="inCode" @click="openFrom('link', $event)" />
      <ToolButton size="sm" icon="alternate_email" :label="m.mention" @click="emit('mention')" />
      <span class="bw-spacer" />
      <slot name="end" />
    </template>

    <template v-else-if="mobileMode === 'format'">
      <ToolButton size="lg" icon="format_bold" :label="m.bold" :active="a?.marks.bold" :disabled="inCode" @click="ed().toggleMark('bold')" />
      <ToolButton size="lg" icon="format_italic" :label="m.italic" :active="a?.marks.italic" :disabled="inCode" @click="ed().toggleMark('italic')" />
      <ToolButton size="lg" icon="format_underlined" :label="m.underline" :active="a?.marks.underline" :disabled="inCode" @click="ed().toggleMark('underline')" />
      <ToolButton size="lg" icon="format_strikethrough" :label="m.strike" :active="a?.marks.strike" :disabled="inCode" @click="ed().toggleMark('strike')" />
      <ToolButton size="lg" icon="code" :label="m.code" :active="a?.marks.code" @click="ed().toggleMark('code')" />
      <ToolButton size="lg" icon="format_color_text" :label="m.color" :disabled="inCode" @click="openFrom('color', $event)" />
      <ToolButton size="lg" icon="link" :label="m.link" :active="!!a?.link" :disabled="inCode" @click="openFrom('link', $event)" />
    </template>

    <template v-else-if="mobileMode === 'table'">
      <button type="button" class="bw-tool bw-table-bar-btn" @mousedown="keepFocus" @click="a?.focusBlock && ed().addRow(a.focusBlock, 'after')">
        <BwIcon name="table_rows" :size="22" />{{ m.tableBar.addRow }}
      </button>
      <button type="button" class="bw-tool bw-table-bar-btn" @mousedown="keepFocus" @click="a?.focusBlock && ed().addColumn(a.focusBlock, 'after')">
        <BwIcon name="view_column" :size="22" />{{ m.tableBar.addCol }}
      </button>
      <button type="button" class="bw-tool bw-table-bar-btn" @mousedown="keepFocus" @click="tableDelete">
        <BwIcon name="delete" :size="22" />{{ m.tableBar.delete }}
      </button>
      <button type="button" class="bw-tool bw-table-bar-btn" aria-haspopup="menu" @mousedown="keepFocus" @click="tableMore">
        <BwIcon name="more_horiz" :size="22" />{{ m.tableBar.more }}
      </button>
    </template>

    <template v-else>
      <ToolButton size="lg" icon="add" :label="m.insert.join(' ')" @click="openFrom('insert', $event)" />
      <button type="button" class="bw-tool bw-tool-lg bw-tool-aa" :aria-label="m.turnInto.join(' ')" @mousedown="keepFocus" @click="openFrom('block', $event)">Aa</button>
      <ToolButton size="lg" icon="format_bold" :label="m.bold" :active="a?.marks.bold" :disabled="inCode" @click="ed().toggleMark('bold')" />
      <ToolButton v-if="can('listItem')" size="lg" icon="checklist" :label="m.blockKinds.todo.join(' ')" :active="a?.blockKind === 'todo'" @click="kind('todo')" />
      <ToolButton size="lg" icon="format_indent_increase" :label="m.indent" :disabled="!isList" @click="ed().indent()" />
      <ToolButton v-if="can('image') && ed().options.uploadImage" size="lg" icon="image" :label="m.image.join(' ')" @click="ctx.pickImage()" />
      <span class="bw-spacer" />
      <ToolButton size="lg" icon="keyboard_hide" :label="m.hideKeyboard" class="bw-muted" @click="ed().dom?.blur()" />
    </template>
  </div>
</template>
