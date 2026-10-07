<script setup lang="ts">
import type { UploadResult } from '@blockwell/core';
import { ref, watch } from 'vue';
import A11y from './sections/A11y.vue';
import DarkMode from './sections/DarkMode.vue';
import Embedded from './sections/Embedded.vue';
import EmptyLarge from './sections/EmptyLarge.vue';
import FeedbackDemo from './sections/FeedbackDemo.vue';
import FullPage from './sections/FullPage.vue';
import Migration from './sections/Migration.vue';
import MobileDetails from './sections/MobileDetails.vue';
import Notes from './sections/Notes.vue';
import Palette from './sections/Palette.vue';
import PasteDemo from './sections/PasteDemo.vue';

const theme = ref<'light' | 'dark'>('light');
watch(theme, (t) => document.documentElement.setAttribute('data-theme', t), { immediate: true });

/** Pretends to upload: reports progress, then resolves to an https URL. */
const uploadImage = (file: File, onProgress: (f: number) => void): Promise<UploadResult> =>
  new Promise((resolve) => {
    let p = 0;
    const timer = setInterval(() => {
      p = Math.min(1, p + 0.08 + Math.random() * 0.1);
      onProgress(p);
      if (p >= 1) {
        clearInterval(timer);
        resolve({ src: `https://picsum.photos/seed/${encodeURIComponent(file.name)}/1280/720`, alt: file.name.replace(/\.[^.]+$/, '') });
      }
    }, 160);
  });
</script>

<template>
  <main class="page">
    <header class="intro">
      <div class="eyebrow"><a href="../" class="home-link">Blockwell</a> · UI/UX Spec v0.3 · Playground</div>
      <h1>富文本編輯器 <span>Rich Text Editor</span></h1>
      <p>對應引擎指南 §3–§10 的介面設計。精簡頂部工具列、選取浮動列與斜線指令並存；所有樣式只來自 schema 白名單，顏色只有色盤 token。</p>
      <div class="controls">
        <label><input type="checkbox" :checked="theme === 'dark'" @change="theme = theme === 'dark' ? 'light' : 'dark'" /> 深色 Dark</label>
      </div>
    </header>
    <FullPage :upload-image="uploadImage" />
    <Embedded :upload-image="uploadImage" />
    <MobileDetails />
    <FeedbackDemo />
    <PasteDemo />
    <EmptyLarge />
    <A11y />
    <Migration />
    <DarkMode />
    <Palette />
    <Notes />
  </main>
</template>
