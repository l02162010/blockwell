# 安全模型

富文本的 XSS 幾乎都來自「存 HTML、再渲染 HTML」。Blockwell 從格式上避開它：

1. **存的是 JSON。** 沒有 HTML 字串，也就沒有要 sanitize 的東西。
2. **schema 是白名單。** 只有 [spec/schema.json](https://github.com/l02162010/blockwell/blob/main/spec/schema.json) 列出的區塊、屬性、格式能通過驗證；其他一律拒絕，不會「盡量保留」。
3. **顏色是 token。** 文件只存 `"red"` 這種名稱，實際色值由輸出端決定，所以不可能注入 CSS。
4. **網址先檢查。** 連結只接受 `https:`、`mailto:`；圖片只接受 `https:`。`javascript:`、`data:` 等一律擋下。
5. **渲染只產生文字節點。** 渲染器用 `createElement` 與 `textContent`，使用者內容永遠不會被當成 HTML 解析。

## 前端與後端都要驗證

編輯器每次變更都會先驗證，不合法的變更直接丟棄。但前端可以被繞過，所以**後端寫入前一定要再驗證**（見[後端驗證](./server)）。

## 貼上與遷移

從網頁、Google 文件、Word 貼上的 HTML 會轉成 JSON，只保留 schema 允許的格式，並回報移除了什麼。舊資料遷移用同一個轉換器（見[舊內容遷移](./migration)）。
