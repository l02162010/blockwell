# 其他匯出

`@blockwell/core` 除了 `Editor` 之外的工具。全部是純函式，伺服器上也能用（`convertHtml` 需要傳入 `DOMParser`）。

## 狀態

| 匯出 | 說明 |
| --- | --- |
| `EditorState` | 不可變的狀態：`doc` 與 `selection`。`EditorState.create(doc)` 建立，`state.tr()` 開始一個交易 |
| `Tr` | 交易：`insertText`、`deleteText`、`step(op)`… 由 `editor.run()` / `editor.dispatch()` 套用 |

## 文件查詢

| 函式 | 說明 |
| --- | --- |
| `getBlock(doc, id)` | 依 id 找區塊（含巢狀） |
| `locate(doc, id)` | 區塊與它的位置（父層、索引） |
| `allBlocks(doc)` | 依閱讀順序列出所有區塊 |
| `textBlocks(doc)` | 只列出有文字的區塊 |
| `ancestors(doc, id)` | 由內而外的祖先區塊 |
| `newId()` | 產生新的區塊 id |
| `caret(block, offset)` | 建立游標選取 |

## 轉換

| 函式 | 說明 |
| --- | --- |
| `convertHtml(html, parser?)` | HTML → `{ doc, ok, report }`，與貼上用同一個轉換器，見[舊內容遷移](/guide/migration) |
| `parseMarkdown(text)` | Markdown → `{ blocks, counts }` |
| `diffDocs(base, current)` | 依區塊 id 比對兩個版本，回傳 `{ doc, changes }`；`changes[id]` 是 `added`、`removed` 或 `changed`，修改前的區塊以 `<id>_was` 標為 removed |

## 安全與色盤

| 匯出 | 說明 |
| --- | --- |
| `LINK_SCHEMES` | schema 允許的連結協定 |
| `IMAGE_SCHEMES` | schema 允許的圖片來源協定 |
| `PALETTE_COLORS` | 色盤 token 對應的淺色／深色值 |
| `paletteCss()` | 產生色盤 class 的 CSS（Vue 套件已內建） |

## 型別

`Doc`、`Block`、`Mark`、`Entity`、`Selection`、`Pos`、`Op`、`Transaction`、`Origin`、`BlockKind`、`ActiveState`、`EditorOptions`、`EditorEvents`、`EditorAction`、`Feedback`、`HighlightRange`、`SlashState`、`Upload`、`UploadResult`、`KeyHandler`、`ApplyResult`、`DocDiff`、`BlockChange`、`PasteReport`、`PasteIssue`、`MarkdownResult`、`PaletteTarget`。
