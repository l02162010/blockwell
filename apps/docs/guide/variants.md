# 三種外觀

`variant` 決定編輯器的樣子與可用功能。

## `page`：全頁文件（預設）

頂部工具列、選取文字時的浮動格式列、`/` 指令選單、區塊把手（拖曳、選單）、搜尋（⌘F）與快捷鍵一覽（⌘/）。

<Demo />

## `field`：表單欄位

取代後台的 `<textarea>`：精簡工具列、字數計數（`maxLength`）、底部的 Markdown 提示（`hint`）。

```vue
<BlockwellEditor v-model="body" variant="field" :max-length="20000" />
```

<Demo variant="field" text="即日起後台所有內容欄位改用新版編輯器。" />

## `comment`：留言框

只有行內格式（粗體、斜體、程式碼、連結、提及），未聚焦時收合成一行。⌘↵（Windows 為 Ctrl+Enter）或「傳送」觸發 `submit`；空白訊息不會送出。

```vue
<BlockwellEditor v-model="draft" variant="comment" @submit="send" />
```

<Demo variant="comment" text="" />

## 手機

視窗寬度小於 `mobileBreakpoint`（預設 640px）時自動切換成手機版：

- 工具列移到鍵盤上方，只在編輯時出現。
- 選取文字時，工具列變成格式列。
- 所有選單改成從底部滑出的面板，按鈕至少 44px。
- 表格可以橫向捲動，第一欄固定。

`layout="mobile"` 可以強制使用手機版（例如預覽用）。
