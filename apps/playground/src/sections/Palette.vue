<script setup lang="ts">
import { PALETTE_COLORS } from '@blockwell/core';
import SectionHead from './SectionHead.vue';

const tokens = Object.entries(PALETTE_COLORS);
</script>

<template>
  <section data-screen-label="10 Palette">
    <SectionHead num="10" zh="色盤 token" en="Palette">
      文件只存 token，渲染為 <code>var(--editor-color-*)</code> 與 <code>var(--editor-bg-*)</code>；色碼來自 <code>spec/palette.json</code>。
    </SectionHead>
    <div class="palette">
      <div class="swatch">
        <div class="pair">
          <div class="sample" data-theme="light">文字 Aa</div>
          <div class="sample sample-dark" data-theme="dark">文字 Aa</div>
        </div>
        <div class="meta"><b>default</b><span>沿用正文色，不加背景</span></div>
      </div>
      <div v-for="[k, v] in tokens" :key="k" class="swatch">
        <div class="pair">
          <div class="sample" data-theme="light"><span :class="[`bw-c-${k}`]">文字 Aa</span><i :class="`bw-bg-${k}`" /></div>
          <div class="sample sample-dark" data-theme="dark"><span :class="[`bw-c-${k}`]">文字 Aa</span><i :class="`bw-bg-${k}`" /></div>
        </div>
        <div class="meta"><b>{{ k }}</b><span>{{ v.light.text }} / {{ v.light.bg }}</span><span>{{ v.dark.text }} / {{ v.dark.bg }}</span></div>
      </div>
    </div>
  </section>
</template>
