<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { kbd, useBlockwell } from '../composables.js';
import BwIcon from './BwIcon.vue';

/** ⌘/ — every shortcut, searchable. Closing returns focus to the caret. */
const emit = defineEmits<{ close: [] }>();
const ctx = useBlockwell();
const m = ctx.messages;
const query = ref('');
const input = ref<HTMLInputElement | null>(null);
const keyLabel = kbd;
const groups = computed(() => {
  const q = query.value.trim().toLowerCase();
  return m.shortcutGroups
    .map((g) => ({ ...g, items: g.items.filter(([zh, en]) => !q || zh.includes(q) || en.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length);
});
const dialog = ref<HTMLElement | null>(null);
const close = () => {
  emit('close');
  ctx.editor.value.focus();
};
/** A modal: Escape closes it from anywhere, Tab cycles inside it. */
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    close();
  } else if (e.key === 'Tab' && dialog.value) {
    const f = Array.from(dialog.value.querySelectorAll<HTMLElement>('button, input'));
    const i = f.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : i >= f.length - 1 ? 0 : i + 1;
    e.preventDefault();
    f[next]?.focus();
  }
};
onMounted(() => {
  window.addEventListener('keydown', onKey, true);
  nextTick(() => input.value?.focus());
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true));
</script>

<template>
  <div class="bw-overlay" @mousedown.self="close">
    <div ref="dialog" class="bw-dialog" role="dialog" aria-modal="true" :aria-label="m.shortcutsTitle.join(' ')">
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
        <p v-if="groups.length === 0" class="bw-sheet-empty">{{ m.slashEmpty }}</p>
      </div>
    </div>
  </div>
</template>
