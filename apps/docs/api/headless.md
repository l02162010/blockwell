# Headless

自己做介面時用的部分。完整範例見 [Headless 指南](/guide/headless)。

## EditorContent

把 `Editor` 掛到頁面上的可編輯區。

<ApiTable component="EditorContent" />

## useEditor(options)

```ts
function useEditor(options?: EditorOptions): ShallowRef<Editor>
```

建立編輯器，元件卸載時自動 `destroy()`。`options` 見 [Editor](/api/editor#editoroptions)。

## useEditorState(editor)

```ts
function useEditorState(editor: Ref<Editor | null>): {
  active: ShallowRef<ActiveState | null>; // 游標所在處的格式、區塊種類、能否復原…
  version: ShallowRef<number>;            // 每次狀態改變 +1
  refresh(): void;                        // 立即重新計算
}
```

每次 `update` 最多在下一個動畫幀重新計算一次，適合綁工具列按鈕的狀態。

`ActiveState`：

| 欄位 | 說明 |
| --- | --- |
| `marks` | `{ bold, italic, underline, strike, code }`，整個選取都有才是 `true` |
| `color` / `highlight` | 色盤 token；沒有是 `null`，混合是 `'mixed'` |
| `link` | 選取中的連結網址 |
| `blockKind` | 目前區塊種類（`paragraph`、`heading2`、`todo`…） |
| `canUndo` / `canRedo` | 能否復原／重做 |
| `collapsed` | 選取是否為單一游標 |
| `focusBlock` / `focusType` | 焦點所在區塊的 id 與型別 |
| `inTable` / `inCode` | 是否在表格／程式碼區塊中 |

## kbd(keys) 與 isMac

```ts
kbd('Mod-Shift-z') // Mac：'⌘⇧Z'，其他：'Ctrl+Shift+Z'
```

把快捷鍵轉成目前平台的寫法，用在提示文字與 `aria-keyshortcuts`。`isMac` 是判斷結果。

## defaultMessages

所有介面文字的預設值（`Messages` 型別），見[文字與語言](/guide/messages)。
