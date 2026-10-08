# 面板元件

這些元件顯示**你的應用程式**提供的資料：儲存狀態、線上成員、留言、版本。編輯器本身不連線、不存資料，資料從哪來由你決定。它們可以放在編輯器的 slot（`#before`、`#after`、`#aside`）或頁面上任何地方。

接線方式見[協作、留言與版本](/guide/collaboration)和[儲存與錯誤](/guide/saving)。

## SaveStatus

顯示「儲存中／已儲存／離線／失敗」。

<ApiTable component="SaveStatus" />

## PresenceMenu

線上成員的頭像列與選單。

```ts
interface Person {
  id: string;
  name: string;
  color: string;     // 頭像的色盤 token
  location?: string; // 對方正在看哪裡，例如「引言區塊」
}
```

<ApiTable component="PresenceMenu" />

## CommentsPanel

留言串列表。錨點用 `editor.setHighlights('comment', ranges)` 畫在文字上。

<ApiTable component="CommentsPanel" />

## HistoryPanel

版本列表；選一個版本時用 `diffBase` 讓編輯器顯示差異，還原時呼叫 `editor.replaceContent(doc)`（可以復原）。

<ApiTable component="HistoryPanel" />
