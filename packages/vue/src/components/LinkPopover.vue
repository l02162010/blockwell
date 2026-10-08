<script setup lang="ts">
import { LINK_SCHEMES } from '@blockwell/core';
import { isSafeUrl } from '@blockwell/schema';
import { computed, nextTick, onMounted, ref } from 'vue';
import { useBlockwell } from '../composables.js';
import BwIcon from './BwIcon.vue';
import Popover from './Popover.vue';

const ctx = useBlockwell();
const m = ctx.messages;
const existing = ctx.editor.value.linkAtSelection()?.href ?? (ctx.active.value?.link !== 'mixed' ? ctx.active.value?.link : null) ?? null;
const value = ref(existing ?? '');
const input = ref<HTMLInputElement | null>(null);
/** What the link will be: a bare domain gets `https://`, a bare address gets `mailto:`. */
const href = computed(() => {
  const v = value.value.trim();
  if (!v || /^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(v)) return `mailto:${v}`;
  if (/^(\/\/)?[^\s/]+\.[^\s/]{2,}(\/\S*)?$/.test(v)) return `https://${v.replace(/^\/\//, '')}`;
  return v;
});
const ok = computed(() => isSafeUrl(href.value, LINK_SCHEMES));
const tried = ref(false);
/** A scheme that can never become allowed (javascript:, data:…) is flagged as soon as it is typed. */
const badScheme = computed(() => {
  const v = value.value.trim().toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(v)?.[1];
  return !!scheme && !['https', 'mailto', 'http'].includes(scheme);
});
/** The message with its URL schemes split out, to set them in code style. */
const invalidParts = m.linkInvalid[0].split(/(https:|mailto:)/);
const touched = computed(() => value.value.trim().length > 0 && (tried.value || badScheme.value));
// Keep the selection the link applies to: focus moves into the input.
const selection = ctx.editor.value.selection;

onMounted(() => nextTick(() => input.value?.focus()));

const restore = () => {
  ctx.editor.value.setSelection(selection, { write: false });
};
const apply = () => {
  tried.value = true;
  if (!ok.value) return;
  restore();
  if (ctx.editor.value.setLink(href.value)) {
    ctx.close();
    ctx.editor.value.focus();
  }
};
const remove = () => {
  restore();
  ctx.editor.value.setLink(null);
  ctx.close();
  ctx.editor.value.focus();
};
</script>

<template>
  <Popover :label="m.link">
    <form class="bw-link-form" @submit.prevent="apply">
      <label class="bw-link-input" :class="{ 'bw-bad': touched && !ok, 'bw-good': ok }">
        <BwIcon name="link" :size="18" class="bw-muted" />
        <input
          ref="input"
          v-model="value"
          type="text"
          inputmode="url"
          spellcheck="false"
          autocomplete="off"
          :placeholder="m.linkPlaceholder"
          :aria-invalid="touched && !ok"
          aria-describedby="bw-link-status"
          @blur="tried = !!value.trim()"
        />
      </label>
      <p v-if="touched && !ok" id="bw-link-status" class="bw-link-status bw-bad" role="alert">
        <BwIcon name="error" :size="16" />
        <span
          ><template v-for="(part, i) in invalidParts" :key="i"
            ><code v-if="i % 2">{{ part }}</code><template v-else>{{ part }}</template></template
          ><br /><span class="bw-en">{{ m.linkInvalid[1] }}</span></span
        >
      </p>
      <p v-else-if="ok" id="bw-link-status" class="bw-link-status bw-good">
        <BwIcon name="check_circle" :size="16" />
        <span v-if="href !== value.trim()" class="bw-mono">{{ href }}</span><template v-else>{{ m.linkSafe }}</template>
      </p>
      <div class="bw-link-actions">
        <span class="bw-spacer" />
        <button v-if="existing" type="button" class="bw-btn" @click="remove">{{ m.linkRemove }}</button>
        <button type="submit" class="bw-btn bw-btn-primary" :disabled="!value.trim() || badScheme">{{ m.linkApply }}</button>
      </div>
    </form>
  </Popover>
</template>
