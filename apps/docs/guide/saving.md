# 儲存與錯誤

## 儲存狀態

`<SaveStatus>` 顯示「儲存中、已儲存、離線、儲存失敗」，放在你的頂部列：

```vue
<SaveStatus :status="saving ? 'saving' : failed ? 'error' : 'saved'" />
```

## 後端拒絕

後端驗證失敗時，把驗證器回傳的 JSON pointer 傳給 `saveError`，編輯器會顯示錯誤列，「前往區塊」會捲到出問題的區塊並標出來：

```vue
<BlockwellEditor v-model="doc" :save-error="error ? { path: error.path } : null" @retry="save" />
```

## 離線

```vue
<BlockwellEditor v-model="doc" :offline="online ? null : { pending: queue.length }" />
```

## 載入中

`loading` 會顯示骨架，避免閃現空白文件。

## 被 schema 擋下的操作

超過長度、不安全的圖片網址、不支援的內容（例如 iframe）都會在發生的位置顯示一則提示，並提供下一步（例如「貼到新段落」、「上傳圖片」）。不需要你處理；若想自己記錄，可以監聽 `editor.on('feedback', …)`。
