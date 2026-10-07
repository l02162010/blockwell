<script setup lang="ts">
import { BlockwellEditor } from '@blockwell/vue';
import { tableDoc, textDoc } from '../sample';
import SectionHead from './SectionHead.vue';

const sel = textDoc('IME 測試要涵蓋組字中按 Enter 與點擊別處兩種情況。');
const slash = textDoc('下週先完成 IME 測試。');
const table = tableDoc();
</script>

<template>
  <section data-screen-label="02b Mobile details">
    <SectionHead num="02b" zh="行動裝置細節" en="Mobile details">
      窄螢幕沒有浮動工具列與彈出選單：格式列放在鍵盤上方，斜線指令改成底部面板，表格橫向捲動並固定第一欄。
    </SectionHead>
    <div class="grid grid-phones">
      <div class="phone-col">
        <div class="card-label">選取文字 · Selection</div>
        <div class="phone phone-sm">
          <div class="phone-status" />
          <div class="phone-nav"><span class="material-symbols-rounded">chevron_left</span><b class="done">完成</b></div>
          <BlockwellEditor class="phone-editor" layout="mobile" :model-value="sel" />
          <div class="keyboard keyboard-sm">系統鍵盤 · system keyboard</div>
        </div>
        <div class="note">選取後鍵盤上方切換成格式列；選取把手由系統提供。</div>
      </div>
      <div class="phone-col">
        <div class="card-label">斜線指令 · Bottom sheet</div>
        <div class="phone phone-sm">
          <div class="phone-status" />
          <div class="phone-nav"><span class="material-symbols-rounded">chevron_left</span><b class="done">完成</b></div>
          <BlockwellEditor class="phone-editor" layout="mobile" :model-value="slash" />
          <div class="keyboard keyboard-sm">系統鍵盤 · system keyboard</div>
        </div>
        <div class="note">輸入 / 或點 + 時開啟底部面板，按鈕至少 44px，可直接搜尋。</div>
      </div>
      <div class="phone-col">
        <div class="card-label">表格 · Table</div>
        <div class="phone phone-sm">
          <div class="phone-status" />
          <div class="phone-nav"><span class="material-symbols-rounded">chevron_left</span><b class="done">完成</b></div>
          <BlockwellEditor class="phone-editor" layout="mobile" :model-value="table" />
        </div>
        <div class="note">表格超出寬度時橫向捲動，第一欄固定；表格操作改成底部列。</div>
      </div>
    </div>
  </section>
</template>
