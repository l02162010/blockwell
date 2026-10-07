<script setup lang="ts">
import type { Editor } from '@blockwell/core';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { keepFocus, useBlockwell, useFloating, useOutside } from '../composables.js';
import { slashItems, type SlashItem } from '../messages.js';
import BwIcon from './BwIcon.vue';

/**
 * The block menu. In `slash` mode it follows the caret and filters by what was typed after `/`;
 * in `insert` mode it hangs off a toolbar button.
 */
const props = defineProps<{ mode: 'slash' | 'insert'; query?: string }>();
const ctx = useBlockwell();
const m = ctx.messages;
const ed = () => ctx.editor.value;

const items = computed(() => {
  const q = (props.query ?? '').trim().toLowerCase();
  return slashItems(m).filter((it) => {
    if (!ed().allows(it.type)) return false;
    if (it.id === 'image' && !ed().options.uploadImage) return false;
    if (!q) return true;
    return [it.label[0], it.label[1], it.keywords, it.md].some((s) => s.toLowerCase().includes(q));
  });
});
const groups = computed(() =>
  (['basic', 'lists', 'more'] as const)
    .map((g) => ({ id: g, label: m.slashGroups[g], items: items.value.filter((i) => i.group === g) }))
    .filter((g) => g.items.length > 0),
);
const index = ref(0);
watch(items, () => (index.value = 0));

const perform = (it: SlashItem) => (e: Editor) => {
  if (it.kind) e.setBlockKind(it.kind);
  else if (it.id === 'divider') e.insertDivider();
  else if (it.id === 'table') e.insertTable(3, 3);
  else if (it.id === 'image') ctx.pickImage();
};
const choose = (it: SlashItem) => {
  if (props.mode === 'slash') ed().runSlash(perform(it));
  else {
    ctx.close();
    perform(it)(ed());
  }
  ed().focus();
};

const el = ref<HTMLElement | null>(null);
const anchor = () => (props.mode === 'slash' ? ed().selectionRect() : (ctx.ui.anchor?.() ?? null));
const { style } = useFloating(el, anchor, () => [ctx.version.value, items.value.length], { offset: 4 });
useOutside(
  () => [el.value, ...(props.mode === 'insert' ? (Array.from(document.querySelectorAll('[aria-expanded="true"]')) as HTMLElement[]) : [])],
  () => (props.mode === 'slash' ? ed().closeSlash() : ctx.close()),
);

const scrollIntoView = () => el.value?.querySelector('.bw-current')?.scrollIntoView({ block: 'nearest' });
let off: (() => void) | null = null;
onMounted(() => {
  off = ed().addKeyHandler((e) => {
    const list = items.value;
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      index.value = list.length ? (index.value + 1) % list.length : 0;
      requestAnimationFrame(scrollIntoView);
      return true;
    }
    if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      index.value = list.length ? (index.value - 1 + list.length) % list.length : 0;
      requestAnimationFrame(scrollIntoView);
      return true;
    }
    if (e.key === 'Enter' && !e.isComposing) {
      const it = list[index.value];
      if (!it) return false;
      choose(it);
      return true;
    }
    if (e.key === 'Escape') {
      if (props.mode === 'slash') ed().closeSlash();
      else ctx.close();
      return true;
    }
    return false;
  });
});
onBeforeUnmount(() => off?.());
const flatIndex = (it: SlashItem) => items.value.indexOf(it);
</script>

<template>
  <div ref="el" class="bw-popover bw-slash" :style="style" role="listbox" :aria-label="m.insert.join(' ')">
    <template v-for="g in groups" :key="g.id">
      <div class="bw-slash-group">{{ g.label[0] }} · {{ g.label[1] }}</div>
      <div
        v-for="it in g.items"
        :key="it.id"
        class="bw-slash-item"
        :class="{ 'bw-current': flatIndex(it) === index }"
        role="option"
        :aria-selected="flatIndex(it) === index"
        @mousedown="keepFocus"
        @mouseenter="index = flatIndex(it)"
        @click="choose(it)"
      >
        <span class="bw-slash-icon"><BwIcon :name="it.icon" :size="18" /></span>
        <span class="bw-slash-label"
          ><span>{{ it.label[0] }}</span><span class="bw-en">{{ it.label[1] }}</span></span
        >
        <span class="bw-mono bw-muted">{{ it.md }}</span>
      </div>
    </template>
    <div v-if="groups.length === 0" class="bw-slash-empty">{{ m.slashEmpty }}</div>
    <div class="bw-slash-foot">
      <span v-for="f in m.slashFooter" :key="f">{{ f }}</span>
    </div>
  </div>
</template>
