<script setup lang="ts">
import { getBlock } from '@blockwell/core';
import { spec } from '@blockwell/schema';
import { computed, nextTick, onMounted, ref } from 'vue';
import { useBlockwell } from '../composables.js';
import BwIcon from './BwIcon.vue';
import Popover from './Popover.vue';

/** Languages come from the schema's whitelist only. */
const ctx = useBlockwell();
const m = ctx.messages;
const languages = (spec.blocks.code!.attrs.language as { values: readonly string[] }).values;
const query = ref('');
const index = ref(0);
const input = ref<HTMLInputElement | null>(null);
const current = computed(() => {
  void ctx.version.value;
  const b = ctx.ui.block ? getBlock(ctx.editor.value.getJSON(), ctx.ui.block) : null;
  return String(b?.attrs?.language ?? 'plaintext');
});
const list = computed(() => {
  const q = query.value.trim().toLowerCase();
  return languages.filter((l) => !q || l.includes(q) || (m.languages[l] ?? '').toLowerCase().includes(q));
});
onMounted(() => nextTick(() => input.value?.focus()));
const choose = (lang: string) => {
  if (ctx.ui.block) ctx.editor.value.setCodeLanguage(ctx.ui.block, lang);
  ctx.close();
  ctx.editor.value.focus();
};
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'ArrowDown') index.value = Math.min(list.value.length - 1, index.value + 1);
  else if (e.key === 'ArrowUp') index.value = Math.max(0, index.value - 1);
  else if (e.key === 'Enter' && list.value[index.value]) choose(list.value[index.value]!);
  else return;
  e.preventDefault();
};
</script>

<template>
  <Popover role="listbox" :label="m.searchLanguage">
    <div class="bw-lang">
      <label class="bw-lang-search">
        <BwIcon name="search" :size="16" />
        <input ref="input" v-model="query" type="text" :placeholder="m.searchLanguage" spellcheck="false" @input="index = 0" @keydown="onKey" />
      </label>
      <div class="bw-lang-list">
        <button
          v-for="(l, i) in list"
          :key="l"
          type="button"
          role="option"
          class="bw-menu-item"
          :class="{ 'bw-current': l === current, 'bw-hover': i === index }"
          :aria-selected="l === current"
          @click="choose(l)"
        >
          <span>{{ m.languages[l] ?? l }}</span>
          <BwIcon v-if="l === current" name="check" :size="16" class="bw-accent" />
        </button>
      </div>
    </div>
  </Popover>
</template>
