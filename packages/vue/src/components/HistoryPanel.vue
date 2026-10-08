<script setup lang="ts">
import { defaultMessages, type Messages } from '../messages.js';
import BwIcon from './BwIcon.vue';

export interface Version {
  id: string;
  time: string;
  who: string;
  what: string;
  current?: boolean;
}

/** Version list; selecting one shows its diff in the editor (`diffBase` on BlockwellEditor). */
const props = defineProps<{
  /** Newest first; mark the live one with `current: true`. */
  versions: Version[];
  /** The version being looked at. Pass its document to the editor's `diffBase` to show the changes. */
  selected?: string | null;
  /** Replaces any of the UI strings. */
  messages?: Partial<Messages>;
}>();
const emit = defineEmits<{
  /** A version was clicked. */
  select: [id: string];
  /** 還原此版本 was pressed; restore with `editor.replaceContent(doc)` so it can be undone. */
  restore: [id: string];
  /** The close button. */
  close: [];
}>();
const m: Messages = { ...defaultMessages, ...props.messages };
</script>

<template>
  <aside class="bw-panel bw-history" :aria-label="m.history.title.join(' ')">
    <div class="bw-panel-head">
      <span>{{ m.history.title[0] }} <span class="bw-en">{{ m.history.title[1] }}</span></span>
      <button type="button" class="bw-mini" :aria-label="m.close" @click="emit('close')"><BwIcon name="close" :size="18" /></button>
    </div>
    <div class="bw-panel-body bw-versions" role="listbox" :aria-label="m.history.title.join(' ')">
      <button
        v-for="v in versions"
        :key="v.id"
        type="button"
        role="option"
        class="bw-version"
        :class="{ 'bw-current': v.id === selected }"
        :aria-selected="v.id === selected"
        @click="emit('select', v.id)"
      >
        <span class="bw-version-dot" :class="{ 'bw-live': v.current, 'bw-on': v.id === selected }" />
        <span class="bw-version-text"><span class="bw-version-time">{{ v.time }}</span><span class="bw-member-sub">{{ v.who }} · {{ v.what }}</span></span>
      </button>
    </div>
    <div class="bw-panel-foot">
      <div class="bw-legend"><span><i class="bw-legend-add" />{{ m.history.added }}</span><span><i class="bw-legend-del" />{{ m.history.removed }}</span></div>
      <button type="button" class="bw-btn bw-btn-dark bw-btn-block" :disabled="!selected || versions.find((v) => v.id === selected)?.current" @click="selected && emit('restore', selected)">{{ m.history.restore }}</button>
    </div>
  </aside>
</template>
