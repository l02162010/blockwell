# Editor

`@blockwell/core` 的編輯器本體，不依賴任何框架。`<BlockwellEditor>` 暴露的 `editor`、`useEditor()` 回傳的都是它。

```ts
import { Editor } from '@blockwell/core';

const editor = new Editor({ doc, placeholder: '開始寫…' });
editor.mount(document.querySelector('#editor')!);
const off = editor.on('change', ({ doc }) => save(doc));
// …
off();
editor.destroy();
```

## EditorOptions

| 選項 | 說明 |
| --- | --- |
| `doc` | 初始文件 |
| `editable` | 預設 `true` |
| `allowedBlocks` | 限制使用者可建立的區塊型別（例如留言框只允許 `paragraph`） |
| `placeholder` | 焦點所在的空段落顯示的提示 |
| `placeholders` | 其他空區塊依種類的提示，例如 `{ heading1: '標題' }` |
| `emptyPlaceholder` | 整份文件為空且未聚焦時顯示 |
| `copiedLabel` | 程式碼區塊「複製」按鈕複製後的文字 |
| `mentionLabel(userId)` | 提及顯示的名稱 |
| `languageLabel(lang)` | 程式碼語言顯示的名稱 |
| `uploadImage(file, onProgress)` | 上傳圖片並回傳 `https:` 網址；沒有它，貼上或拖入的檔案會被忽略 |
| `virtualizeAbove` | 頂層區塊超過這個數量時只渲染可視範圍附近，預設 2000 |
| `mentions` | 啟用 `@` 提及 |

## 屬性

<ApiTable editor="getters" />

## 方法

<ApiTable editor="methods" />

## 交易

需要一次做多個修改、或自訂指令時，用交易（[自訂指令](/guide/commands)）：

```ts
editor.run((tr) => {
  tr.insertText({ block: id, offset: 0 }, '✅ ');
  return true; // 回傳 false 表示不適用，什麼都不做
});
```

每個交易在套用前都會經過 schema 驗證；不合法的交易整個被丟棄，並觸發 `reject` 事件。
