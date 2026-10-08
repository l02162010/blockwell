# 圖片上傳

傳入 `uploadImage` 才會有圖片功能：貼上、拖放、工具列的圖片按鈕都會呼叫它。沒有傳入時，圖片檔案會被忽略。

```ts
async function uploadImage(file: File, onProgress: (fraction: number) => void) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/uploads', { method: 'POST', body: form });
  const { url } = await res.json();
  return { src: url, alt: file.name.replace(/\.[^.]+$/, '') };
}
```

```vue
<BlockwellEditor v-model="doc" :upload-image="uploadImage" />
```

- 回傳的 `src` 必須是 `https:` 網址，否則會被拒絕並顯示提示。
- 呼叫 `onProgress(0…1)` 會顯示上傳進度。
- 上傳失敗（Promise reject）會顯示錯誤卡片，使用者可以關閉它。

插入的圖片可以調整寬度（拖曳兩側）、對齊（靠左、置中、滿版）與替代文字。
