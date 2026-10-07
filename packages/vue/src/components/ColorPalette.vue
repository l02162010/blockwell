<script setup lang="ts">
import { spec } from '@blockwell/schema';
import { computed } from 'vue';
import { keepFocus, useBlockwell } from '../composables.js';
import BwIcon from './BwIcon.vue';
import Popover from './Popover.vue';

/** Palette tokens only: no custom colour input exists, by design (engine guide §5). */
const ctx = useBlockwell();
const m = ctx.messages;
const tokens = ['default', ...spec.palette];
const color = computed(() => ctx.active.value?.color ?? 'default');
const highlight = computed(() => ctx.active.value?.highlight ?? 'default');
const setColor = (t: string) => ctx.editor.value.setColor(t === 'default' ? null : t);
const setHighlight = (t: string) => ctx.editor.value.setHighlight(t === 'default' ? null : t);
</script>

<template>
  <Popover :label="m.color">
    <div class="bw-palette">
      <div class="bw-palette-head">
        <span>{{ m.textColor[0] }} <span class="bw-en">{{ m.textColor[1] }}</span></span>
        <span class="bw-mono">{{ color }}</span>
      </div>
      <div class="bw-swatches" role="radiogroup" :aria-label="m.textColor.join(' ')">
        <button
          v-for="t in tokens"
          :key="t"
          type="button"
          role="radio"
          class="bw-swatch bw-swatch-text"
          :class="{ 'bw-current': color === t }"
          :aria-checked="color === t"
          :title="t"
          :style="{ color: t === 'default' ? undefined : `var(--editor-color-${t})` }"
          @mousedown="keepFocus"
          @click="setColor(t)"
        >A</button>
      </div>
      <div class="bw-palette-head">
        <span>{{ m.highlight[0] }} <span class="bw-en">{{ m.highlight[1] }}</span></span>
        <span class="bw-mono">{{ highlight }}</span>
      </div>
      <div class="bw-swatches" role="radiogroup" :aria-label="m.highlight.join(' ')">
        <button
          v-for="t in tokens"
          :key="t"
          type="button"
          role="radio"
          class="bw-swatch bw-swatch-bg"
          :class="{ 'bw-current': highlight === t }"
          :aria-checked="highlight === t"
          :title="t"
          :style="{ background: t === 'default' ? undefined : `var(--editor-bg-${t})` }"
          @mousedown="keepFocus"
          @click="setHighlight(t)"
        ><BwIcon v-if="t === 'default'" name="block" :size="16" /></button>
      </div>
      <div class="bw-palette-foot"><BwIcon name="palette" :size="14" />{{ m.paletteOnly }}</div>
    </div>
  </Popover>
</template>
