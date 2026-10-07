<script setup lang="ts">
import { ref } from 'vue';
import { useBlockwell } from '../composables.js';

/** First-run guide for an empty document; hides once typing starts, or for good with "不再顯示". */
const ctx = useBlockwell();
const m = ctx.messages;
const KEY = 'bw-onboarding-dismissed';
const dismissed = ref(read());
function read() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
const dismiss = () => {
  dismissed.value = true;
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* storage unavailable: hide for this session only */
  }
};
</script>

<template>
  <div v-if="!dismissed" class="bw-onboarding" aria-label="Tips">
    <div v-for="[key, zh, en] in m.onboarding.items" :key="key" class="bw-onboarding-row">
      <kbd>{{ key }}</kbd><span>{{ zh }} <span class="bw-en">{{ en }}</span></span>
    </div>
    <button type="button" class="bw-onboarding-dismiss" @click="dismiss">{{ m.onboarding.dismiss }}</button>
  </div>
</template>
