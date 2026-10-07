<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useBlockwell } from '../composables.js';
import BwIcon from './BwIcon.vue';

/** ⌘F — searches the model, so blocks that are not rendered (large documents) are found too. */
const props = defineProps<{ seed?: { text: string; n: number } }>();
const emit = defineEmits<{ close: [] }>();
const ctx = useBlockwell();
const m = ctx.messages;
const ed = () => ctx.editor.value;
const query = ref('');
const input = ref<HTMLInputElement | null>(null);
const state = shallowRef(ed().search);
let off: (() => void) | null = null;
/** Each ⌘F focuses the field and selects it, taking the editor's selected text when there is one. */
const focusField = () => {
  if (props.seed?.text) {
    query.value = props.seed.text;
    ed().find(query.value);
  }
  nextTick(() => {
    input.value?.focus();
    input.value?.select();
  });
};
watch(() => props.seed?.n, focusField);
onMounted(() => {
  off = ed().on('search', (e) => (state.value = e.search));
  focusField();
});
onBeforeUnmount(() => {
  off?.();
  ed().clearSearch();
});
let timer = 0;
const onInput = () => {
  clearTimeout(timer);
  timer = window.setTimeout(() => ed().find(query.value), 120);
};
const close = () => {
  clearTimeout(timer);
  if (query.value && state.value?.query !== query.value) ed().find(query.value);
  // Leave the caret on what was found, so the search was worth something.
  ed().selectSearchMatch();
  emit('close');
  ed().focus();
};
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (state.value?.query !== query.value) ed().find(query.value);
    else ed().findNext(e.shiftKey ? -1 : 1);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
};
</script>

<template>
  <div class="bw-searchbar" role="search">
    <label class="bw-search-input">
      <BwIcon name="search" :size="16" class="bw-muted" />
      <input ref="input" v-model="query" type="text" :placeholder="m.searchPlaceholder" :aria-label="m.search" @input="onInput" @keydown="onKey" />
      <span v-if="state && query" class="bw-search-count" aria-live="polite">{{ state.count ? state.index + 1 : 0 }} / {{ state.count }}</span>
    </label>
    <button type="button" class="bw-tool bw-tool-sm" aria-label="Previous" :disabled="!state?.count" @click="ed().findNext(-1)"><BwIcon name="keyboard_arrow_up" :size="18" /></button>
    <button type="button" class="bw-tool bw-tool-sm" aria-label="Next" :disabled="!state?.count" @click="ed().findNext(1)"><BwIcon name="keyboard_arrow_down" :size="18" /></button>
    <button type="button" class="bw-tool bw-tool-sm" :aria-label="m.close" @click="close"><BwIcon name="close" :size="18" /></button>
  </div>
</template>
