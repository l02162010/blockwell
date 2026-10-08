<script setup lang="ts">
import type { Doc } from '@blockwell/core';
import { BlockwellEditor } from '@blockwell/vue';
import { computed, ref } from 'vue';

/** A live editor inside a docs page, optionally with its JSON underneath. */
const props = withDefaults(
  defineProps<{ variant?: 'page' | 'field' | 'comment'; text?: string; json?: boolean; doc?: Doc }>(),
  { variant: 'page', text: '在這裡打字試試看：選取文字、輸入 / 或 **粗體**。', json: false },
);
const model = ref<Doc>(props.doc ?? { version: 1, blocks: [{ id: 'd1', type: 'paragraph', text: props.text }] });
const shown = computed(() => JSON.stringify(model.value, null, 2));
</script>

<template>
  <ClientOnly>
    <div class="demo">
      <BlockwellEditor v-model="model" :variant="variant" :debounce="100" :onboarding="false" :upload-image="async () => ({ src: 'https://picsum.photos/seed/docs/800/400' })" />
      <pre v-if="json" class="demo-json"><code>{{ shown }}</code></pre>
    </div>
  </ClientOnly>
</template>
