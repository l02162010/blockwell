# 後端驗證

前端的驗證可以被繞過，所以**寫入資料庫前一定要在後端再驗證一次**。驗證器只看 JSON，跟編輯器是同一份 schema。

## Node.js / TypeScript

```ts
import { validate } from '@blockwell/schema';

app.post('/docs/:id', (req, res) => {
  const result = validate(req.body);
  if (!result.ok) return res.status(422).json({ errors: result.errors });
  db.save(req.params.id, result.doc);
  res.sendStatus(204);
});
```

`errors` 的每一項有 `code` 與 `path`（JSON pointer，例如 `/blocks/3/marks/0/attrs/href`）。把 `path` 傳回前端的 `saveError`，編輯器會指出是哪個區塊（見[儲存與錯誤](./saving)）。

## 其他語言

::: warning 尚未完成
Go、C#（.NET）與 Rust 的驗證器目前只有專案骨架，還不能用。在它們完成之前，請用 Node.js 驗證（例如一個小的驗證服務，或在 API gateway 呼叫）。

四種語言會共用同一份 [conformance 測試](https://github.com/l02162010/blockwell/tree/main/conformance)（目前 69 個案例），確保行為一致。
:::

## 純文字

搜尋索引、通知、摘要需要純文字時：

```ts
import { Editor } from '@blockwell/core';
const text = Editor.toPlainText(doc, (userId) => names[userId]);
```
