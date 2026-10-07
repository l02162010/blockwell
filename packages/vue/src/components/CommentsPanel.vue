<script setup lang="ts">
import { ref } from 'vue';
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
const props = defineProps<{ thread: CommentThread; messages?: Messages }>();
const emit = defineEmits<{ reply: [text: string]; resolve: []; close: [] }>();
const m = props.messages ?? defaultMessages;
const draft = ref('');
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
        <input v-model="draft" type="text" :placeholder="m.comments.reply" :aria-label="m.comments.reply" />
        <button type="submit" class="bw-mini" :disabled="!draft.trim()" aria-label="Send"><BwIcon name="send" :size="18" /></button>
      </form>
    </div>
    <div class="bw-panel-foot">
      <button type="button" class="bw-btn bw-btn-block" @click="emit('resolve')"><BwIcon name="check" :size="16" />{{ m.comments.resolve }}</button>
    </div>
  </aside>
</template>
