<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { keepFocus, useBlockwell, useFloating, useOutside } from '../composables.js';

export interface Member {
  id: string;
  name: string;
  /** Role or team, shown under the name. */
  subtitle?: string;
  /** Palette token for the avatar, e.g. `teal`. */
  color?: string;
}

/** `@` picker. The host looks members up; the document stores only the chosen id (design 01). */
const props = defineProps<{ query: string; search: (query: string) => Member[] | Promise<Member[]> }>();
const ctx = useBlockwell();
const m = ctx.messages;
const ed = () => ctx.editor.value;
const results = shallowRef<Member[]>([]);
const index = ref(0);
let seq = 0;
watch(
  () => props.query,
  async (q) => {
    const n = ++seq;
    const r = await props.search(q);
    if (n !== seq) return;
    results.value = r.slice(0, 8);
    index.value = 0;
  },
  { immediate: true },
);

const el = ref<HTMLElement | null>(null);
const { style } = useFloating(el, () => ed().selectionRect(), () => [ctx.version.value, results.value.length], { offset: 4 });
useOutside(() => [el.value], () => ed().closeMention());
const choose = (mem: Member) => ed().runMention(mem.id);
const split = (name: string) => {
  const q = props.query;
  return q && name.toLowerCase().startsWith(q.toLowerCase()) ? [name.slice(0, q.length), name.slice(q.length)] : ['', name];
};
const optionId = (i: number) => `bw-mention-${i}`;

let off: (() => void) | null = null;
onMounted(() => {
  off = ed().addKeyHandler((e) => {
    const list = results.value;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!list.length) return false;
      index.value = (index.value + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      ed().dom?.setAttribute('aria-activedescendant', optionId(index.value));
      return true;
    }
    if ((e.key === 'Enter' || e.key === 'Tab') && !e.isComposing && list[index.value]) {
      choose(list[index.value]!);
      return true;
    }
    if (e.key === 'Escape') {
      ed().closeMention();
      return true;
    }
    return false;
  });
  ed().dom?.setAttribute('aria-controls', 'bw-mention-list');
  ed().dom?.setAttribute('aria-expanded', 'true');
});
onBeforeUnmount(() => {
  off?.();
  ed().dom?.removeAttribute('aria-controls');
  ed().dom?.removeAttribute('aria-activedescendant');
  ed().dom?.setAttribute('aria-expanded', 'false');
});
</script>

<template>
  <div ref="el" class="bw-popover bw-mention-menu" :style="style">
    <div class="bw-menu-head">{{ m.members[0] }} · {{ m.members[1] }}</div>
    <div id="bw-mention-list" role="listbox" :aria-label="m.members.join(' ')">
      <div
        v-for="(mem, i) in results"
        :id="optionId(i)"
        :key="mem.id"
        role="option"
        class="bw-member"
        :class="{ 'bw-current': i === index }"
        :aria-selected="i === index"
        @mousedown="keepFocus"
        @mouseenter="index = i"
        @click="choose(mem)"
      >
        <span class="bw-avatar" :class="mem.color ? [`bw-c-${mem.color}`, `bw-bg-${mem.color}`] : []">{{ mem.name.slice(0, 1) }}</span>
        <span class="bw-member-text">
          <span><strong>{{ split(mem.name)[0] }}</strong>{{ split(mem.name)[1] }}</span>
          <span v-if="mem.subtitle" class="bw-member-sub">{{ mem.subtitle }}</span>
        </span>
        <span v-if="i === index" class="bw-muted bw-enter">↵</span>
      </div>
    </div>
    <div class="bw-menu-foot">{{ m.membersNote }}</div>
  </div>
</template>
