<script setup lang="ts">
import type { Editor } from '@blockwell/core';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { keepFocus, useBlockwell, useFloating, useHoverIntent, useOutside } from '../composables.js';
import { slashItems, type SlashItem } from '../messages.js';
import BwIcon from './BwIcon.vue';

/**
 * The block menu. In `slash` mode it follows the caret and filters by what was typed after `/`;
 * in `insert` mode it hangs off a toolbar button.
 */
const props = defineProps<{ mode: 'slash' | 'insert'; query?: string }>();
const ctx = useBlockwell();
const hover = useHoverIntent();
const m = ctx.messages;
const ed = () => ctx.editor.value;

const filter = ref('');
const items = computed(() => {
  const q = (props.mode === 'slash' ? (props.query ?? '') : filter.value).trim().toLowerCase();
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
  if (it.kind) e.insertKind(it.kind);
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
const filterInput = ref<HTMLInputElement | null>(null);
/** Insert mode types into its own filter field; slash mode reads keys from the editor. */
const onFilterKey = (e: KeyboardEvent) => {
  if (e.isComposing) return;
  if (onKey(e)) {
    e.preventDefault();
    if (e.key === 'Escape') ed().focus();
  }
};
onMounted(() => {
  if (props.mode === 'insert') {
    requestAnimationFrame(() => filterInput.value?.focus());
    return;
  }
  off = ed().addKeyHandler(onKey);
});
function onKey(e: KeyboardEvent): boolean {
  {
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
  }
}
onBeforeUnmount(() => off?.());
const flatIndex = (it: SlashItem) => items.value.indexOf(it);
const optionId = (it: SlashItem) => `bw-slash-${it.id}`;
// Focus stays in the editor; the listbox is announced through aria-activedescendant (design §07).
watch(
  [index, items],
  () => {
    const it = items.value[index.value];
    const dom = ed().dom;
    if (!dom) return;
    dom.setAttribute('aria-controls', 'bw-slash-list');
    dom.setAttribute('aria-expanded', 'true');
    if (it) dom.setAttribute('aria-activedescendant', optionId(it));
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  const dom = ed().dom;
  dom?.removeAttribute('aria-controls');
  dom?.removeAttribute('aria-activedescendant');
  dom?.setAttribute('aria-expanded', 'false');
});
</script>

<template>
  <div id="bw-slash-list" ref="el" class="bw-popover bw-slash" :style="style" role="listbox" :aria-label="m.insert.join(' ')">
    <div v-if="mode === 'insert'" class="bw-slash-filter">
      <BwIcon name="search" :size="16" class="bw-muted" />
      <input ref="filterInput" v-model="filter" type="text" :placeholder="m.insertFilter" :aria-label="m.insertFilter" @keydown="onFilterKey" />
    </div>
    <template v-for="g in groups" :key="g.id">
      <div class="bw-slash-group">{{ g.label[0] }} · {{ g.label[1] }}</div>
      <div
        v-for="it in g.items"
        :id="optionId(it)"
        :key="it.id"
        class="bw-slash-item"
        :class="{ 'bw-current': flatIndex(it) === index }"
        role="option"
        :aria-selected="flatIndex(it) === index"
        @mousedown="keepFocus"
        @mousemove="hover($event, () => (index = flatIndex(it)))"
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
