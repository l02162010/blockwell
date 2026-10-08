# Editor 事件

```ts
const off = editor.on('change', ({ doc, tr }) => { /* … */ });
off(); // 取消訂閱
```

| 事件 | 參數 | 何時觸發 |
| --- | --- | --- |
| `update` | `{ editor }` | 任何狀態改變：文件、選取或可編輯狀態 |
| `change` | `{ doc, tr }` | 文件改變。`tr.origin` 是 `'user'`、`'history'` 或 `'remote'` |
| `selection` | `{ selection }` | 選取改變 |
| `focus` / `blur` | `{}` | 取得／失去焦點 |
| `paste` | `{ report }` | 貼上完成，附[轉換報告](/guide/migration#報告) |
| `action` | `EditorAction` | 需要介面處理的動作：`link`（Mod-K）、`search`（Mod-F）、`shortcuts`（Mod-/）、`escape`、`code-language` |
| `slash` | `{ slash }` | 斜線選單開啟、更新查詢或關閉（`null`） |
| `mention` | `{ mention }` | 輸入 `@`：提及選單應顯示符合 `query` 的成員；`null` 表示關閉 |
| `rule` | `{ rule }` | Markdown 快捷輸入剛轉換了區塊，此時 Backspace 可還原；`null` 表示結束 |
| `uploads` | `{ uploads }` | 圖片上傳進度改變 |
| `refuse` | `{ reason, block? }` | 指令無法執行（例如清單已到最大縮排還按 Tab） |
| `reject` | `{ errors }` | 交易沒通過 schema 驗證而被丟棄 |
| `feedback` | `Feedback` | schema 擋下（`reject`）、調整（`adjust`）或略過（`skip`）了某些東西，要在發生處告訴使用者 |
| `search` | `{ search }` | 搜尋結果改變：`{ query, count, index }` 或 `null` |
| `format` | `{ what, on }` | 格式改變，供螢幕閱讀器播報 |

`Feedback.code` 可能是 `length`（超過長度上限，`rest` 是沒插入的文字）、`image-src`、`unsupported`、`invalid`、`link`。

`<BlockwellEditor>` 已經處理好這些事件並顯示對應介面；只有用 [Headless](/guide/headless) 時才需要自己接。
