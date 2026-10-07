<script setup lang="ts">
import { textBlocks, type Doc, type UploadResult } from '@blockwell/core';
import { BlockwellEditor } from '@blockwell/vue';
import { ref, shallowRef } from 'vue';
import { cmsDoc, mobileDoc } from '../sample';
import DocView from './DocView.vue';
import PhoneFrame from './PhoneFrame.vue';
import SectionHead from './SectionHead.vue';

defineProps<{ uploadImage: (f: File, p: (n: number) => void) => Promise<UploadResult> }>();
const cms = cmsDoc();
const comment = shallowRef<Doc | undefined>(undefined);
const sent = ref<Doc[]>([]);
const onSubmit = (d: Doc) => {
  const text = textBlocks(d).map((b) => b.text).join('\n').trim();
  if (!text) return;
  // The sent message keeps its formatting: it is the same JSON, shown read-only.
  sent.value = [...sent.value, d];
  comment.value = { version: 1, blocks: [{ id: `c_${Date.now()}`, type: 'paragraph', text: '' }] };
};
</script>

<template>
  <section data-screen-label="02 Embedded variants">
    <SectionHead num="02" zh="嵌入場景" en="Embedded" />
    <div class="grid">
      <div class="card">
        <div class="card-label">表單欄位 · CMS field</div>
        <label class="field-label">標題 Title<span class="input">新版編輯器上線公告</span></label>
        <div class="field-group">
          <div class="field-name">內容 Content</div>
          <BlockwellEditor variant="field" :model-value="cms" :max-length="20000" :upload-image="uploadImage" />
          <div class="note">支援 Markdown 快捷輸入：# 標題、- 清單、**粗體**、`程式碼`。</div>
        </div>
      </div>

      <div class="card">
        <div class="card-label">留言框 · Comment</div>
        <div class="msg">
          <div class="avatar" style="background: #ccfbf1; color: #0f766e">陳</div>
          <div class="msg-body">
            <div class="msg-head"><b>陳柏翰</b> <span>· 2 小時前</span></div>
            <div>Safari 的 <code>compositionend</code> 順序跟 Chrome 不同，<strong>先別合併</strong>，細節見<a href="#">測試紀錄</a>。</div>
          </div>
        </div>
        <div v-for="(s, i) in sent" :key="i" class="msg">
          <div class="avatar" style="background: #dbeafe; color: #1e3a8a">林</div>
          <div class="msg-body">
            <div class="msg-head"><b>林雅婷</b> <span>· 剛剛</span></div>
            <DocView :doc="s" />
          </div>
        </div>
        <div class="msg">
          <div class="avatar" style="background: #dbeafe; color: #1e3a8a">林</div>
          <BlockwellEditor v-model="comment" variant="comment" class="grow" :debounce="0" @submit="onSubmit" />
        </div>
        <div class="note">未聚焦時收合為單行；聚焦後展開工具列。留言只開放行內樣式，不提供區塊。</div>
      </div>

      <div class="phone-col">
        <div class="card-label">行動裝置 · Mobile</div>
        <PhoneFrame :doc="mobileDoc" :upload-image="uploadImage" />
        <div class="note">窄螢幕把頂部列與浮動列合併成鍵盤上方的工具列，按鈕 44px。</div>
      </div>
    </div>
  </section>
</template>
