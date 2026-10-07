<script setup lang="ts">
import type { Editor } from '@blockwell/core';
import { BlockwellEditor } from '@blockwell/vue';
import { shallowRef } from 'vue';
import { pasteSamples, textDoc } from '../sample';
import SectionHead from './SectionHead.vue';

const doc = textDoc('在這裡試試看：');
const editor = shallowRef<Editor | null>(null);
const atEnd = () => {
  const e = editor.value;
  const last = e?.getJSON().blocks.at(-1);
  if (!e || !last) return null;
  e.focus();
  e.setSelection({ type: 'text', anchor: { block: last.id, offset: last.text?.length ?? 0 }, focus: { block: last.id, offset: last.text?.length ?? 0 } });
  return e;
};
const tooLong = () => atEnd()?.insertText('長'.repeat(10_300));
const badImage = () => atEnd()?.insertImage({ src: 'http://insecure.example/a.png' });
const embed = () => {
  const e = atEnd();
  if (!e) return;
  const dt = new DataTransfer();
  dt.setData('text/html', pasteSamples.embed.html);
  dt.setData('text/plain', pasteSamples.embed.text);
  e.pasteData(dt);
};
const badLink = () => {
  const e = atEnd();
  if (!e) return;
  e.dom?.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }));
};
</script>

<template>
  <section data-screen-label="04 Schema feedback">
    <SectionHead num="04" zh="統一的拒絕回饋" en="Schema feedback">
      所有被 schema 擋下的情況都用同一個元件：出現在觸發位置旁，說明原因，提供一個可行的下一步，不使用彈窗。分三級：拒絕、已調整、已略過。
    </SectionHead>
    <div class="card">
      <div class="demo-buttons">
        <button type="button" @click="badLink">連結 · 開啟連結框</button>
        <button type="button" @click="tooLong">長度上限 · 插入 10,300 字</button>
        <button type="button" @click="badImage">圖片來源 · http 圖片</button>
        <button type="button" @click="embed">不支援的內容 · 含嵌入影片</button>
      </div>
      <BlockwellEditor variant="field" :model-value="doc" :upload-image="async () => ({ src: 'https://picsum.photos/640/360' })" @ready="editor = $event" />
    </div>
    <div class="levels">
      <div class="bw-feedback bw-feedback-reject"><span class="material-symbols-rounded">error</span><span>拒絕 Reject：不合法的連結、圖片來源</span></div>
      <div class="bw-feedback bw-feedback-adjust"><span class="material-symbols-rounded">content_cut</span><span>已調整 Adjusted：超過長度上限的部分</span></div>
      <div class="bw-feedback bw-feedback-skip"><span class="material-symbols-rounded">info</span><span>已略過 Skipped：schema 沒有的內容</span></div>
    </div>
  </section>
</template>
