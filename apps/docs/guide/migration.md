# 舊內容遷移

把舊系統的 HTML 轉成 Blockwell JSON。轉換器跟貼上用的是同一個，所以結果與使用者貼上時一致。

```ts
import { convertHtml } from '@blockwell/core';

for (const post of oldPosts) {
  const { doc, ok, report } = convertHtml(post.html);
  if (ok && report.issues.length === 0) await save(post.id, doc);
  else await queueForReview(post.id, doc, report); // 交給人處理
}
```

`convertHtml` 需要一個 `DOMParser`。瀏覽器裡直接用；在 Node.js 上把 jsdom 的 parser 傳進第二個參數：

```ts
import { JSDOM } from 'jsdom';
import { convertHtml } from '@blockwell/core';

const parser = new new JSDOM().window.DOMParser();
const { doc, ok, report } = convertHtml(html, parser);
```

## 報告

`report` 說明轉換時做了什麼：

| 欄位 | 意思 |
| --- | --- |
| `kept` | 保留下來的格式（heading、bold、link…） |
| `removedElements` | 連同內容一起移除的元素（script、iframe、svg…） |
| `droppedAttrs` | 移除的屬性（style、class、on*…） |
| `unknownElements` | 不認得的標籤數：去掉標籤、保留文字 |
| `unsafeUrls` | 被擋下的網址數 |
| `issues` | 需要人看一下的問題：`color-dropped`、`unsafe-link`、`unsafe-image`、`merged-cells`、`embed`、`list-depth` |

## 保留的東西

- 標題、段落、清單（含巢狀與待辦）、引言、程式碼（`<pre><code class="language-js">` 會保留語言）、表格、圖片（https）、分隔線
- 粗體、斜體、底線、刪除線、行內程式碼、連結（https、mailto）、`<mark>`（黃色背景）
- 色盤名稱的顏色（`<font color="red">` → red）；其他顏色移除並回報
- Google 文件與 Word 的 HTML 有專門的對應規則

Playground 的「08 舊內容遷移」示範了人工審核佇列。
