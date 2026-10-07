<script setup lang="ts">
import { useBlockwell } from '../composables.js';
import BwIcon from './BwIcon.vue';

/**
 * Save problems, under the toolbar. `error`: the server refused the document (its validator
 * returns a JSON pointer such as `/blocks/6/marks/0/attrs/href`). `offline`: changes are queued.
 */
const props = defineProps<{ kind: 'error' | 'offline'; path?: string; pending?: number }>();
const emit = defineEmits<{ goto: [index: number]; retry: [] }>();
const m = useBlockwell().messages;
const index = () => Number(props.path?.match(/^\/blocks\/(\d+)/)?.[1] ?? -1);
const field = () => (/href|src/.test(props.path ?? '') ? '連結網址' : '內容');
const pointer = () =>
  (props.path ?? '')
    .split('/')
    .filter(Boolean)
    .map((p, i, a) => (/^\d+$/.test(p) ? `[${p}]` : `${i ? '.' : ''}${p}`))
    .join('')
    .replace(/\.\[/g, '[');
</script>

<template>
  <div v-if="kind === 'error'" class="bw-banner bw-banner-error" role="alert">
    <BwIcon name="error" :size="18" />
    <span class="bw-banner-text">{{ m.saveFailed(index() + 1, field())[0] }} <span class="bw-en">· {{ m.saveFailed(index() + 1, field())[1] }}</span></span>
    <span v-if="path" class="bw-mono bw-banner-path">{{ pointer() }}</span>
    <button v-if="index() >= 0" type="button" class="bw-banner-btn" @click="emit('goto', index())">{{ m.gotoBlock }}</button>
    <button type="button" class="bw-banner-btn bw-banner-primary" @click="emit('retry')">{{ m.retry }}</button>
  </div>
  <div v-else class="bw-banner bw-banner-offline" role="status">
    <BwIcon name="cloud_off" :size="18" />
    <span class="bw-banner-text">{{ m.offlineBanner[0] }} <span class="bw-muted">· {{ m.offlineBanner[1] }}</span></span>
    <span v-if="pending" class="bw-muted bw-banner-count">{{ m.pending(pending) }}</span>
  </div>
</template>
