import type { Doc } from '@blockwell/core';

/** The document in the hero editor. */
export const heroDoc = (): Doc => ({
  version: 1,
  blocks: [
    { id: 'h', type: 'heading', attrs: { level: 2 }, text: '發版說明 v0.3' },
    {
      id: 'p1',
      type: 'paragraph',
      text: '這段文字有粗體、行內程式碼、紅色字與一個連結。全部都是 mark 範圍，不是 HTML。',
      marks: [
        { type: 'bold', from: 5, to: 7 },
        { type: 'code', from: 8, to: 13 },
        { type: 'color', from: 14, to: 17, attrs: { value: 'red' } },
        { type: 'highlight', from: 14, to: 17, attrs: { value: 'yellow' } },
        { type: 'link', from: 20, to: 22, attrs: { href: 'https://github.com/l02162010/blockwell' } },
      ],
    },
    { id: 'l1', type: 'listItem', attrs: { style: 'todo', checked: true }, text: '新增 cyan 色票' },
    { id: 'l2', type: 'listItem', attrs: { style: 'todo' }, text: '圖片對齊：靠左、置中、滿版' },
    { id: 'l3', type: 'listItem', attrs: { style: 'todo' }, text: '從 Google 文件貼上時保留表格' },
    { id: 'q', type: 'quote', children: [{ id: 'q1', type: 'paragraph', text: '顏色只能是色盤 token，連結只能是 https 或 mailto。' }] },
    { id: 'c', type: 'code', attrs: { language: 'typescript' }, text: "editor.toggleMark('bold');" },
  ],
});

/** Starting input for the "throw dangerous HTML at it" demo. */
export const nastyHtml = `<h2 style="font-family:Comic Sans">季報 <script>alert(1)</script></h2>
<p onclick="steal()">營收成長 <b>12%</b>，詳見
  <a href="javascript:alert(document.cookie)">內部報告</a>
  與 <a href="https://example.com/q3">公開版本</a>。</p>
<p><span style="color:#ff00aa">自訂顏色</span>
  <img src="x" onerror="alert(2)"></p>
<iframe src="https://evil.example"></iframe>
<ul><li>保留清單</li><li><i>與斜體</i></li></ul>`;

/** Quick-start snippets. */
export const usage = `<script setup lang="ts">
import { ref } from 'vue';
import type { Doc } from '@blockwell/core';
import { BlockwellEditor } from '@blockwell/vue';

const doc = ref<Doc | null>(null);   // 存進資料庫的就是這份 JSON
<\/script>

<template>
  <BlockwellEditor v-model="doc" :upload-image="upload" />
</template>`;

export const server = `import { validate } from '@blockwell/schema';

const result = validate(req.body);
if (!result.ok) return res.status(422).json(result.errors);
// 通過驗證的文件才寫入，渲染時也只會產生文字節點`;
