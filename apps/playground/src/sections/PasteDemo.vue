<script setup lang="ts">
import type { Editor } from '@blockwell/core';
import { BlockwellEditor } from '@blockwell/vue';
import { shallowRef } from 'vue';
import { pasteSamples, textDoc } from '../sample';
import SectionHead from './SectionHead.vue';

const doc = shallowRef(textDoc(''));
const editor = shallowRef<Editor | null>(null);
const paste = (kind: keyof typeof pasteSamples) => {
  const e = editor.value;
  if (!e) return;
  // Each button shows one source on its own: start from an empty field.
  e.setDoc(textDoc(''));
  const last = e.getJSON().blocks.at(-1)!;
  e.focus();
  e.setSelection({ type: 'text', anchor: { block: last.id, offset: last.text?.length ?? 0 }, focus: { block: last.id, offset: last.text?.length ?? 0 } });
  const dt = new DataTransfer();
  if (pasteSamples[kind].html) dt.setData('text/html', pasteSamples[kind].html);
  dt.setData('text/plain', pasteSamples[kind].text);
  e.pasteData(dt);
};
</script>

<template>
  <section data-screen-label="05 Paste sources">
    <SectionHead num="05" zh="貼上來源辨識" en="Paste sources">
      依剪貼簿 HTML 的特徵判斷來源（例如 docs-internal-guid、mso- 前綴），套用專屬對應規則；判斷不出時走通用規則。純文字若含 Markdown 語法，自動轉成區塊。
    </SectionHead>
    <div class="card">
      <div class="demo-buttons">
        <button type="button" @click="paste('gdocs')">從 Google 文件貼上</button>
        <button type="button" @click="paste('word')">從 Word 貼上</button>
        <button type="button" @click="paste('markdown')">貼上 Markdown</button>
      </div>
      <BlockwellEditor v-model="doc" class="paste-field" variant="field" placeholder="點上方按鈕模擬貼上，或直接貼上 · Paste here" @ready="editor = $event" />
    </div>
  </section>
</template>
