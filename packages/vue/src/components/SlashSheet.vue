<script setup lang="ts">
import type { Editor } from '@blockwell/core';
import { computed, nextTick, onMounted, ref } from 'vue';
import { useBlockwell } from '../composables.js';
import { slashItems, type SlashItem } from '../messages.js';
import BwIcon from './BwIcon.vue';

/** Narrow screens: the block menu as a bottom sheet with 44px+ targets and its own search (design 02b). */
const props = defineProps<{ mode: 'slash' | 'insert' }>();
const ctx = useBlockwell();
const m = ctx.messages;
const ed = () => ctx.editor.value;
const query = ref('');
const input = ref<HTMLInputElement | null>(null);
const items = computed(() => {
  const q = query.value.trim().toLowerCase() || (props.mode === 'slash' ? (ed().slash?.query ?? '').toLowerCase() : '');
  return slashItems(m).filter(
    (it) =>
      ed().allows(it.type) &&
      (it.id !== 'image' || !!ed().options.uploadImage) &&
      (!q || [it.label[0], it.label[1], it.keywords, it.md].some((s) => s.toLowerCase().includes(q))),
  );
});
const perform = (it: SlashItem) => (e: Editor) => {
  if (it.kind) e.setBlockKind(it.kind);
  else if (it.id === 'divider') e.insertDivider();
  else if (it.id === 'table') e.insertTable(3, 3);
  else if (it.id === 'image') ctx.pickImage();
};
const close = () => (props.mode === 'slash' ? ed().closeSlash() : ctx.close());
const choose = (it: SlashItem) => {
  if (props.mode === 'slash') ed().runSlash(perform(it));
  else {
    ctx.close();
    perform(it)(ed());
  }
  ed().focus();
};
onMounted(() => nextTick(() => props.mode === 'insert' && input.value?.focus()));
</script>

<template>
  <div class="bw-sheet-scrim" @mousedown.self.prevent="close" />
  <div class="bw-sheet" role="dialog" :aria-label="m.insertSheet.join(' ')">
    <div class="bw-sheet-grip" />
    <div class="bw-sheet-title">{{ m.insertSheet[0] }} <span class="bw-en">{{ m.insertSheet[1] }}</span></div>
    <label class="bw-sheet-search">
      <BwIcon name="search" :size="18" />
      <input ref="input" v-model="query" type="search" :placeholder="m.search" enterkeyhint="go" @keydown.enter.prevent="items[0] && choose(items[0])" />
    </label>
    <div class="bw-sheet-grid">
      <button v-for="it in items" :key="it.id" type="button" class="bw-sheet-tile" @mousedown.prevent @click="choose(it)">
        <BwIcon :name="it.icon" :size="22" />{{ it.label[0] }}
      </button>
    </div>
  </div>
</template>
