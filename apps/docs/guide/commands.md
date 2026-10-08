# 自訂指令

## 用現成的方法

`Editor` 的方法涵蓋所有內建操作：`toggleMark`、`setBlockKind`、`insertTable`、`setLink`、`moveBlockBy`……每個方法都會先驗證，不合法就回傳 `false`、不改變文件。見 [Editor API](/api/editor)。

```ts
editor.setSelection({ type: 'text', anchor: { block: id, offset: 0 }, focus: { block: id, offset: 5 } });
editor.toggleMark('bold');
```

## 自己組交易

需要一次做好幾件事時，用交易：所有步驟一起驗證、一起進入復原紀錄。

```ts
const tr = editor.state.tr();
tr.insertText({ block: id, offset: 0 }, '【公告】');
tr.updateAttrs(id, { align: 'center' });
editor.dispatch(tr); // 不合法時回傳 false，什麼都不改
```

或用 `editor.run(tr => …)`，回傳 `true` 才會套用。

## 鍵盤

`addKeyHandler` 在編輯器之前處理按鍵；回傳 `true` 表示已處理。

```ts
const off = editor.addKeyHandler((e) => {
  if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
    save(editor.getJSON());
    return true;
  }
  return false;
});
```

## 監聽

`editor.on(event, fn)` 回傳取消監聽的函式。所有事件見 [Editor 事件](/api/events)。
