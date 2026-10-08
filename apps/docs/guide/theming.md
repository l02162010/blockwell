# 外觀與色盤

## 深色模式

在 `<html>` 加上 `data-theme="dark"`（或 `class="dark"`）就會切換。沒有設定時跟隨系統（`prefers-color-scheme`），設定 `data-theme="light"` 可以強制淺色。

## CSS 變數

外觀全部由 CSS 變數決定，覆寫它們就能換風格：

```css
:root {
  --bw-font: 'Inter', 'Noto Sans TC', sans-serif;
  --bw-accent: oklch(0.55 0.15 150); /* 主色 */
  --bw-surface: #fff; /* 編輯區背景 */
}
```

常用變數：`--bw-font`、`--bw-mono`、`--bw-ink`（文字）、`--bw-muted`、`--bw-surface`、`--bw-page`、`--bw-raised`（浮層）、`--bw-line`（邊線）、`--bw-accent`、`--bw-accent-ink`、`--bw-danger`、`--bw-code-bg`，以及程式碼上色的 `--bw-tok-*`。

## 色盤

文字色與背景色只能是 11 個色盤 token：gray、brown、red、orange、yellow、green、teal、cyan、blue、purple、pink。文件只存名稱，實際色值在 [spec/palette.json](https://github.com/l02162010/blockwell/blob/main/spec/palette.json)，分成淺色、深色、列印三組。

CSS 變數是 `--editor-color-<token>` 與 `--editor-bg-<token>`，可以覆寫：

```css
:root { --editor-color-red: #c00; }
```

## 標示

`highlights` 產生的標示用 CSS Custom Highlight API，樣式自己定：

```css
::highlight(bw-comment) { background: #fef3c7; }
::highlight(bw-search) { background: #dbeafe; }
```
