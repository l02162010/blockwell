<script setup lang="ts">
import { ref } from 'vue';
import { defaultMessages, type Messages } from '../messages.js';
import BwIcon from './BwIcon.vue';

export interface Person {
  id: string;
  name: string;
  /** Palette token for the avatar. */
  color: string;
  /** Where they are, e.g. "引言區塊 · Quote". */
  location?: string;
  self?: boolean;
}

/** Avatars in the top bar; click for who is here, where, and "go to" (design 01, 協作者). */
const props = defineProps<{ people: Person[]; follow?: boolean; messages?: Messages }>();
const emit = defineEmits<{ jump: [person: Person]; 'update:follow': [on: boolean] }>();
const m = props.messages ?? defaultMessages;
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const onDoc = (e: PointerEvent) => {
  if (!root.value?.contains(e.target as Node)) close();
};
const toggle = () => {
  open.value = !open.value;
  if (open.value) document.addEventListener('pointerdown', onDoc, true);
  else document.removeEventListener('pointerdown', onDoc, true);
};
const close = () => {
  open.value = false;
  document.removeEventListener('pointerdown', onDoc, true);
};
</script>

<template>
  <div ref="root" class="bw-presence" @keydown.esc="close">
    <button type="button" class="bw-avatars" :aria-label="m.presence.online(people.length).join(' ')" aria-haspopup="dialog" :aria-expanded="open" @click="toggle">
      <span v-for="p in people.slice(0, 4)" :key="p.id" class="bw-avatar" :class="[`bw-c-${p.color}`, `bw-bg-${p.color}`]">{{ p.name.slice(0, 1) }}</span>
    </button>
    <div v-if="open" class="bw-popover bw-presence-menu" role="dialog">
      <div class="bw-menu-head">{{ m.presence.online(people.length)[0] }} · {{ m.presence.online(people.length)[1] }}</div>
      <div v-for="p in people" :key="p.id" class="bw-person">
        <span class="bw-avatar" :class="[`bw-c-${p.color}`, `bw-bg-${p.color}`]">{{ p.name.slice(0, 1) }}</span>
        <span class="bw-member-text">
          <span>{{ p.name }}<template v-if="p.self">{{ m.presence.you }}</template></span>
          <span v-if="p.location" class="bw-member-sub">{{ p.location }}</span>
        </span>
        <button v-if="!p.self" type="button" class="bw-link-btn" @click="(emit('jump', p), close())">{{ m.presence.jump }}</button>
      </div>
      <div class="bw-menu-sep" />
      <label class="bw-switch-row">
        <span>{{ m.presence.follow[0] }} <span class="bw-en">{{ m.presence.follow[1] }}</span></span>
        <input type="checkbox" role="switch" class="bw-switch" :checked="follow" @change="emit('update:follow', ($event.target as HTMLInputElement).checked)" />
      </label>
    </div>
  </div>
</template>
