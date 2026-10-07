<script setup lang="ts">
import type { Doc, Editor } from '@blockwell/core';
import { BlockwellEditor, SaveStatus } from '@blockwell/vue';
import { ref, shallowRef } from 'vue';
import { largeDoc } from '../sample';
import SectionHead from './SectionHead.vue';

const empty: Doc = { version: 1, blocks: [{ id: 'e1', type: 'paragraph', text: '' }] };
const title = ref('');
const large = shallowRef<Doc | null>(null);
const largeEditor = shallowRef<Editor | null>(null);
const loading = ref(true);
const load = () => {
  large.value = largeDoc();
};
const find = () => largeEditor.value?.dom?.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, ctrlKey: true, bubbles: true }));
const placeholders: Doc = {
  version: 1,
  blocks: [
    { id: 'ph1', type: 'heading', attrs: { level: 1 }, text: '' },
    { id: 'ph2', type: 'listItem', attrs: { style: 'bullet' }, text: '' },
    { id: 'ph3', type: 'listItem', attrs: { style: 'todo' }, text: '' },
    { id: 'ph4', type: 'quote', children: [{ id: 'ph5', type: 'paragraph', text: '' }] },
    { id: 'ph6', type: 'paragraph', text: '' },
  ],
};
</script>

<template>
  <section data-screen-label="06 Empty and large">
    <SectionHead num="06" zh="空白文件與大型文件" en="Empty & large documents" />
    <div class="grid grid-wide">
      <div class="card">
        <div class="card-title">空白文件 <span>Empty state</span></div>
        <div class="card-desc">第一次開啟時介紹斜線指令與快捷輸入，開始輸入後自動收起。</div>
        <div class="inner empty-doc">
          <input v-model="title" class="title-input" placeholder="未命名文件 Untitled" aria-label="標題 Title" />
          <BlockwellEditor :model-value="empty" class="inline-page" :toolbar="false" />
        </div>
      </div>
      <div class="card">
        <div class="card-title">大型文件 <span>Large document</span></div>
        <div class="card-desc">超過約 2,000 個區塊啟用虛擬化；搜尋在模型層執行，跳到結果時才渲染該區塊。</div>
        <div class="inner large-doc">
          <BlockwellEditor v-if="large" :model-value="large" class="inline-page fixed-height" :toolbar="false" :onboarding="false" @ready="largeEditor = $event" />
          <div v-else class="load-large"><button type="button" class="btn" @click="load">載入 3,412 個區塊</button></div>
        </div>
        <div v-if="large" class="demo-buttons"><button type="button" @click="find">搜尋 ⌘F</button></div>
      </div>
      <div class="card">
        <div class="card-title">載入與儲存 <span>Loading & saving</span></div>
        <div class="card-desc">載入時以骨架佔位，不閃現空白；儲存狀態固定在頂部列同一位置。</div>
        <div class="inner">
          <BlockwellEditor :model-value="empty" :loading="loading" class="inline-page" :toolbar="false" :onboarding="false" />
        </div>
        <div class="chips">
          <SaveStatus status="saving" variant="chip" />
          <SaveStatus status="saved" variant="chip" label="已儲存 Saved" />
          <SaveStatus status="offline" variant="chip" label="離線 Offline" />
          <SaveStatus status="error" variant="chip" label="未儲存 Not saved" />
          <button type="button" class="btn-link" @click="loading = !loading">{{ loading ? '完成載入' : '重新載入' }}</button>
        </div>
      </div>
      <div class="card">
        <div class="card-title">空白區塊提示 <span>Block placeholders</span></div>
        <div class="card-desc">只在游標所在的空白區塊顯示，提示該區塊的類型。點進每一行看看。</div>
        <div class="inner">
          <BlockwellEditor :model-value="placeholders" class="inline-page" :toolbar="false" :onboarding="false" />
        </div>
      </div>
    </div>
  </section>
</template>
