<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { defaultMessages, type Messages } from '../messages.js';
import BwIcon from './BwIcon.vue';

export interface CommentMessage {
  id: string;
  author: string;
  color: string;
  time: string;
  text: string;
}
export interface CommentThread {
  id: string;
  /** The commented words, quoted at the top. */
  anchor: string;
  messages: CommentMessage[];
}

/** Side panel for one comment thread. Storage and permissions belong to the host app. */
const props = defineProps<{
  /** The thread to show. With no messages yet it is a new comment: the field takes focus. */
  thread: CommentThread;
  /** Replaces any of the UI strings. */
  messages?: Partial<Messages>;
}>();
const emit = defineEmits<{
  /** Enter, ⌘↵ or the send button with text: add it to the thread. */
  reply: [text: string];
  /** 解決 was pressed. */
  resolve: [];
  /** The close button or Escape. Drop the thread if it has no messages yet. */
  close: [];
}>();
const m: Messages = { ...defaultMessages, ...props.messages };
const draft = ref('');
const input = ref<HTMLInputElement | null>(null);
// A new thread starts with its first message.
onMounted(() => props.thread.messages.length === 0 && nextTick(() => input.value?.focus()));
const send = () => {
  const t = draft.value.trim();
  if (!t) return;
  emit('reply', t);
  draft.value = '';
};
</script>

<template>
  <aside class="bw-panel" :aria-label="m.comments.title.join(' ')">
    <div class="bw-panel-head">
      <span>{{ m.comments.title[0] }} <span class="bw-en">{{ m.comments.title[1] }}</span></span>
      <button type="button" class="bw-mini" :aria-label="m.close" @click="emit('close')"><BwIcon name="close" :size="18" /></button>
    </div>
    <div class="bw-panel-body">
      <div class="bw-comment-anchor">{{ thread.anchor }}</div>
      <div v-for="c in thread.messages" :key="c.id" class="bw-comment-msg">
        <span class="bw-avatar bw-avatar-sm" :class="[`bw-c-${c.color}`, `bw-bg-${c.color}`]">{{ c.author.slice(0, 1) }}</span>
        <div>
          <div class="bw-comment-meta"><strong>{{ c.author }}</strong> <span class="bw-muted">· {{ c.time }}</span></div>
          <div>{{ c.text }}</div>
        </div>
      </div>
      <form class="bw-reply" @submit.prevent="send">
        <input ref="input" v-model="draft" @keydown.esc.prevent="emit('close')" @keydown.enter.ctrl.prevent="send" @keydown.enter.meta.prevent="send" type="text" :placeholder="thread.messages.length ? m.comments.reply : m.comments.first" :aria-label="m.comments.reply" />
        <button type="submit" class="bw-mini" :disabled="!draft.trim()" aria-label="Send"><BwIcon name="send" :size="18" /></button>
      </form>
    </div>
    <div v-if="thread.messages.length" class="bw-panel-foot">
      <button type="button" class="bw-btn bw-btn-block" @click="emit('resolve')"><BwIcon name="check" :size="16" />{{ m.comments.resolve }}</button>
    </div>
  </aside>
</template>
