# 文件格式

文件是一個物件：`version` 與 `blocks` 陣列。每個區塊有穩定的 `id`、`type`，文字區塊有 `text`，格式用 `marks` 標在文字的範圍上——**不是 HTML**。

```json
{
  "version": 1,
  "blocks": [
    { "id": "h1", "type": "heading", "attrs": { "level": 2 }, "text": "發版說明" },
    {
      "id": "p1",
      "type": "paragraph",
      "text": "Hello world",
      "marks": [
        { "type": "bold", "from": 0, "to": 5 },
        { "type": "color", "from": 6, "to": 11, "attrs": { "value": "red" } }
      ]
    }
  ]
}
```

## 區塊

| type | 內容 | attrs |
| --- | --- | --- |
| `paragraph` | 文字 | `align`（left、center、right） |
| `heading` | 文字 | `level`（1–3）、`align` |
| `listItem` | 文字 | `style`（bullet、ordered、todo）、`indent`（0–6）、`checked` |
| `quote` | 子區塊（段落、標題、清單） | — |
| `code` | 純文字，可換行 | `language` |
| `divider` | — | — |
| `image` | — | `src`（https）、`alt`、`width`、`align`（left、center、full） |
| `table` → `tableRow` → `tableCell` | 子區塊 | — |

清單是**扁平**的：巢狀用 `indent` 表示，不是層層包住。

## 格式（marks）

`bold`、`italic`、`underline`、`strike`、`code`、`link`（`href`）、`color` 與 `highlight`（`value` 是色盤名稱）。

`from` 與 `to` 是 UTF-16 位置（JavaScript 字串索引）。

## 實體（entities）

提及與軟換行在 `text` 裡佔一個 `U+FFFC` 字元，詳細資料放在 `entities`：

```json
{ "text": "請 ￼ 看一下", "entities": [{ "at": 2, "type": "mention", "attrs": { "userId": "u_chen" } }] }
```

文件只存使用者 ID；顯示名稱由 `mentionLabel` 決定。

完整規格見 [spec/SPEC.md](https://github.com/l02162010/blockwell/blob/main/spec/SPEC.md)。
