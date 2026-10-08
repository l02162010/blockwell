# Headless：自己做介面

不想用內建的工具列與選單？用 `useEditor` 建立編輯器、`<EditorContent>` 放置可編輯區，介面全部自己做。輸入、IME、貼上、復原、Markdown 快捷輸入、schema 驗證都照常運作。

```vue
<script setup lang="ts">
import { EditorContent, useEditor, useEditorState } from '@blockwell/vue';
import '@blockwell/vue/style.css';

const editor = useEditor({ doc: initialDoc, placeholder: '開始寫…' });
const { active } = useEditorState(editor); // 每一幀更新一次的工具列狀態

editor.value.on('change', ({ doc }) => save(doc));
</script>

<template>
  <div class="my-toolbar">
    <button :class="{ on: active?.marks.bold }" @mousedown.prevent @click="editor.toggleMark('bold')">B</button>
    <button @mousedown.prevent @click="editor.setBlockKind('heading2')">H2</button>
    <button :disabled="!active?.canUndo" @mousedown.prevent @click="editor.undo()">復原</button>
  </div>
  <EditorContent :editor="editor" />
</template>
```

按鈕加上 `@mousedown.prevent` 才不會搶走編輯器的焦點與選取。

`useEditor` 在元件卸載時會自動銷毀編輯器。所有可用的方法見 [Editor API](/api/editor)。

## 不用 Vue

`@blockwell/core` 不依賴任何框架：

```ts
import { Editor } from '@blockwell/core';

const editor = new Editor({ doc, placeholder: '開始寫…' });
editor.mount(document.querySelector('#editor')!);
editor.on('change', ({ doc }) => save(doc));
// …
editor.destroy();
```

樣式需要 `@blockwell/vue/style.css`，或自行撰寫 `.bw-editor` 系列的 CSS。
