<script setup lang="ts">
import type { Doc } from '@blockwell/core';
import { BlockwellEditor } from '@blockwell/vue';
import SectionHead from './SectionHead.vue';

const doc: Doc = {
  version: 1,
  blocks: [
    { id: 'd0', type: 'heading', attrs: { level: 1 }, text: '夜間撰寫' },
    {
      id: 'd1',
      type: 'paragraph',
      text: '深色模式下，紅色文字改用較亮的 #F87171，黃色背景改用 #423A0F，同一個 token 在兩種主題都維持可讀。',
      marks: [
        { type: 'bold', from: 5, to: 9 },
        { type: 'color', from: 5, to: 9, attrs: { value: 'red' } },
        { type: 'highlight', from: 23, to: 27, attrs: { value: 'yellow' } },
      ],
    },
    { id: 'd2', type: 'listItem', attrs: { style: 'todo', checked: true }, text: '定義深色 CSS 變數' },
    { id: 'd3', type: 'listItem', attrs: { style: 'todo' }, text: '對比度檢查' },
    { id: 'd4', type: 'code', attrs: { language: 'css' }, text: '.dark {\n  --editor-color-red: #F87171;\n  --editor-bg-yellow: #423A0F;\n}' },
  ],
};
</script>

<template>
  <section data-screen-label="09 Dark mode">
    <SectionHead num="09" zh="深色模式" en="Dark mode">
      只覆寫 --editor-color-* 與 --editor-bg-* 變數，文件內容完全不變。底色用帶暖調的深灰（約 #22211E），不用純黑：減少與白字的眩光，浮層與程式碼區塊以略亮的層級區分。
    </SectionHead>
    <div class="dark-frame" data-theme="dark">
      <BlockwellEditor :model-value="doc" class="dark-editor" :onboarding="false" />
    </div>
  </section>
</template>
