<script setup lang="ts">
import SectionHead from './SectionHead.vue';

const notes = [
  ['圖示', '正式環境自架 Material Symbols，並子集化只保留用到的圖示，避免外部請求與 CSP 例外。這個 playground 為了方便仍從 Google Fonts 載入。'],
  ['顏色', '介面色與色盤都定義為 CSS 變數；深色模式只覆寫變數（data-theme="dark" 或 .dark），文件 JSON 不變。'],
  ['對比', '正文與次要文字在淺、深色模式皆 ≥ 4.5:1；停用狀態、佔位裝飾線不在此限。'],
  ['焦點', '所有可互動元件使用 :focus-visible 樣式；浮層開啟時焦點留在編輯區，關閉後還原游標。'],
];
</script>

<template>
  <section data-screen-label="11 Implementation notes">
    <SectionHead num="11" zh="實作備註" en="Implementation notes" />
    <div class="notes">
      <div v-for="[k, v] in notes" :key="k" class="note-row"><b>{{ k }}</b><span>{{ v }}</span></div>
    </div>
  </section>
</template>
