<script setup lang="ts">
import type { Upload } from '@blockwell/core';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useBlockwell } from '../composables.js';
import BwIcon from './BwIcon.vue';

const ctx = useBlockwell();
const m = ctx.messages;
const uploads = ref<readonly Upload[]>([]);
let off: (() => void) | null = null;
onMounted(() => {
  uploads.value = ctx.editor.value.uploads;
  off = ctx.editor.value.on('uploads', (e) => (uploads.value = e.uploads));
});
onBeforeUnmount(() => off?.());
</script>

<template>
  <div v-if="uploads.length" class="bw-uploads" aria-live="polite">
    <div v-for="u in uploads" :key="u.id" class="bw-upload" :class="{ 'bw-upload-error': u.error }">
      <div class="bw-upload-row">
        <span class="bw-upload-thumb" />
        <span class="bw-upload-text">
          <span class="bw-upload-name">{{ u.name }}</span>
          <span class="bw-upload-status">{{ u.error ? m.uploadFailed : m.uploading(Math.round(u.progress * 100)) }}</span>
        </span>
        <button v-if="u.error" type="button" class="bw-mini" aria-label="Dismiss" @click="ctx.editor.value.dismissUpload(u.id)"><BwIcon name="close" :size="16" /></button>
      </div>
      <div class="bw-progress"><div :style="{ width: `${Math.round(u.progress * 100)}%` }" /></div>
    </div>
  </div>
</template>
