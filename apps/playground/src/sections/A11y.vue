<script setup lang="ts">
import type { Doc, Editor } from '@blockwell/core';
import { BlockwellEditor, defaultMessages, kbd } from '@blockwell/vue';
import { ref, shallowRef } from 'vue';
import { textDoc } from '../sample';
import SectionHead from './SectionHead.vue';

// A live editor to try the keyboard rules on, with what a screen reader would hear.
const doc = shallowRef<Doc>(textDoc("選取這段文字，再按 Shift+Tab 到工具列試試看。"));
const heard = ref<string[]>([]);
const ready = (e: Editor) => {
  e.on('format', ({ what, on }) => (heard.value = [defaultMessages.announce(what, on), ...heard.value].slice(0, 4)));
};

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
      所有浮層、選單、色盤都能只用鍵盤完成；完整快捷鍵在編輯器內按 {{ kbd('⌘/') }}。
    </SectionHead>
    <div class="grid">
      <div class="card">
        <div class="card-title">焦點樣式 <span>Focus</span></div>
        <div class="card-desc">只在鍵盤操作時顯示（:focus-visible），2px 重點色外框、間距 2px。</div>
        <!-- A picture of the three states, not controls: hidden from the keyboard and screen readers. -->
        <div class="focus-demo" aria-hidden="true">
          <span><span class="bw-tool bw-tool-md demo-tool"><span class="material-symbols-rounded">format_bold</span></span>預設</span>
          <span><span class="bw-tool bw-tool-md demo-tool hover"><span class="material-symbols-rounded">format_bold</span></span>滑過</span>
          <span><span class="bw-tool bw-tool-md demo-tool focus"><span class="material-symbols-rounded">format_bold</span></span>鍵盤焦點</span>
        </div>
      </div>
      <div class="card">
        <div class="card-title">選單導覽 <span>Menu navigation</span></div>
        <div class="card-desc">焦點留在編輯區，選單以 aria-activedescendant 指向目前項目。</div>
        <pre class="code-note">role="listbox" · role="option"
↑ ↓ 移動 · ↵ 選擇 · esc 關閉並還原焦點</pre>
      </div>
      <div class="card a11y-try">
        <div class="card-title">實際操作 <span>Try it</span></div>
        <div class="card-desc">只用鍵盤：在文字中按 Shift+Tab 回到工具列、← → 移動、Enter 開啟選單、↑ ↓ 選擇、Esc 回到文字。</div>
        <BlockwellEditor v-model="doc" class="inline-page a11y-editor" :onboarding="false" @ready="ready" />
        <div class="heard" aria-hidden="true">
          <span class="heard-label">螢幕閱讀器會念出</span>
          <span v-if="!heard.length" class="heard-empty">（套用或移除格式後顯示）</span>
          <span v-for="(h, i) in heard" :key="i + h" :class="{ dim: i > 0 }">「{{ h }}」</span>
        </div>
      </div>
      <div class="card">
        <div class="card-title">規則 <span>Rules</span></div>
        <div v-for="r in rules" :key="r" class="rule"><span class="material-symbols-rounded">check</span>{{ r }}</div>
      </div>
    </div>
  </section>
</template>
