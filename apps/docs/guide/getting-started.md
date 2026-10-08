# 快速開始

::: warning 尚未發佈到 npm
套件還沒發佈。在那之前，請從原始碼使用（`git clone` 後 `pnpm install && pnpm build`），或用 `pnpm pack` 產生的 `.tgz` 安裝。
:::

## 安裝

```bash
pnpm add @blockwell/vue @blockwell/core @blockwell/schema
```

需要 Vue 3.5 以上。套件只提供 ES modules。

## 第一個編輯器

```vue
<script setup lang="ts">
import { ref } from 'vue';
import type { Doc } from '@blockwell/core';
import { BlockwellEditor } from '@blockwell/vue';
import '@blockwell/vue/style.css';

const doc = ref<Doc | null>(null); // 這份 JSON 就是要存進資料庫的內容
</script>

<template>
  <BlockwellEditor v-model="doc" />
</template>
```

<Demo json />

編輯器的圖示使用 [Material Symbols Rounded](https://fonts.google.com/icons)，請在頁面載入這個字型：

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..24,300..500,0..1,0&display=block" />
```

## 存檔

`v-model` 在停止輸入 300 毫秒後（`debounce`）或失去焦點時更新。存檔時把 JSON 送到後端，後端**一定要**再驗證一次（見[後端驗證](./server)）：

```ts
watch(doc, (value) => value && save(value));
```

## 下一步

- [文件格式](./document)：JSON 長什麼樣子
- [三種外觀](./variants)：全頁、表單欄位、留言框
- [`<BlockwellEditor>` API](/api/blockwell-editor)：所有 props 與事件
