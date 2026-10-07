<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useBlockwell } from '../composables.js';
import BwIcon from './BwIcon.vue';

/** ⌘/ — every shortcut, searchable. Closing returns focus to the caret. */
const emit = defineEmits<{ close: [] }>();
const ctx = useBlockwell();
const m = ctx.messages;
const query = ref('');
const input = ref<HTMLInputElement | null>(null);
const isMac = typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform);
const keyLabel = (k: string) => (isMac ? k : k.replace(/⌘/g, 'Ctrl').replace(/⌥/g, 'Alt').replace(/⇧/g, 'Shift'));
const groups = computed(() => {
  const q = query.value.trim().toLowerCase();
  return m.shortcutGroups
    .map((g) => ({ ...g, items: g.items.filter(([zh, en]) => !q || zh.includes(q) || en.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length);
});
onMounted(() => nextTick(() => input.value?.focus()));
const close = () => {
  emit('close');
  ctx.editor.value.focus();
};
</script>

<template>
  <div class="bw-overlay" @mousedown.self="close" @keydown.esc.prevent="close">
    <div class="bw-dialog" role="dialog" aria-modal="true" :aria-label="m.shortcutsTitle.join(' ')">
      <div class="bw-dialog-head">
        <span class="bw-dialog-title">{{ m.shortcutsTitle[0] }} <span class="bw-en">{{ m.shortcutsTitle[1] }}</span></span>
        <button type="button" class="bw-kbd-btn" :aria-label="m.close" @click="close">esc</button>
      </div>
      <label class="bw-dialog-search">
        <BwIcon name="search" :size="17" />
        <input ref="input" v-model="query" type="text" :placeholder="m.shortcutsSearch" />
      </label>
      <div class="bw-shortcuts">
        <div v-for="g in groups" :key="g.zh" class="bw-shortcut-group">
          <div class="bw-shortcut-head">{{ g.zh }} · {{ g.en }}</div>
          <div v-for="[zh, en, key] in g.items" :key="zh" class="bw-shortcut">
            <span>{{ zh }} <span class="bw-en">{{ en }}</span></span><kbd>{{ keyLabel(key) }}</kbd>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
