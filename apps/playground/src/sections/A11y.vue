<script setup lang="ts">
import SectionHead from './SectionHead.vue';

const rules = [
  '工具列為 role="toolbar"，← → 移動、Tab 離開',
  '色塊有名稱，例如 aria-label="紅色 red"',
  '格式變更以 aria-live 宣告，例如「已套用粗體」',
  '浮層關閉後焦點回到原本的游標位置',
  '文字與背景對比至少 4.5:1',
];
</script>

<template>
  <section data-screen-label="07 Keyboard and a11y">
    <SectionHead num="07" zh="鍵盤操作與無障礙" en="Keyboard & accessibility">
      所有浮層、選單、色盤都能只用鍵盤完成；完整快捷鍵在編輯器內按 ⌘ /（Windows 為 Ctrl /）。
    </SectionHead>
    <div class="grid">
      <div class="card">
        <div class="card-title">焦點樣式 <span>Focus</span></div>
        <div class="card-desc">只在鍵盤操作時顯示（:focus-visible），2px 重點色外框、間距 2px。</div>
        <div class="focus-demo">
          <span><button type="button" class="bw-tool bw-tool-md demo-tool"><span class="material-symbols-rounded">format_bold</span></button>預設</span>
          <span><button type="button" class="bw-tool bw-tool-md demo-tool hover"><span class="material-symbols-rounded">format_bold</span></button>滑過</span>
          <span><button type="button" class="bw-tool bw-tool-md demo-tool focus"><span class="material-symbols-rounded">format_bold</span></button>鍵盤焦點</span>
        </div>
      </div>
      <div class="card">
        <div class="card-title">選單導覽 <span>Menu navigation</span></div>
        <div class="card-desc">焦點留在編輯區，選單以 aria-activedescendant 指向目前項目。</div>
        <pre class="code-note">role="listbox" · role="option"
↑ ↓ 移動 · ↵ 選擇 · esc 關閉並還原焦點</pre>
      </div>
      <div class="card">
        <div class="card-title">規則 <span>Rules</span></div>
        <div v-for="r in rules" :key="r" class="rule"><span class="material-symbols-rounded">check</span>{{ r }}</div>
      </div>
    </div>
  </section>
</template>
