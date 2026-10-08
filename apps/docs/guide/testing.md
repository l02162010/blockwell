# 瀏覽器支援與測試

## 支援的瀏覽器

最近兩個主要版本的 Chrome、Edge、Firefox、Safari，以及 iOS Safari 與 Android Chrome。用到的現代 API：`beforeinput`、CSS Custom Highlight API（不支援時只是沒有標示）、`ResizeObserver`、CSS container queries。

## 自動化測試

每次推送，CI 會跑：

| 檢查 | 內容 |
| --- | --- |
| 單元測試 | schema 驗證器（69 個 conformance 案例）、編輯器核心與每個公開方法、Vue 元件的每個 prop 與事件 |
| API 檢查 | 每個公開的 prop、事件、slot、方法都要有說明與測試（`pnpm api:check`） |
| 瀏覽器測試 | 網站、文件站與 playground 的每個 demo，在 Chromium、Firefox、WebKit 上跑；另有 Android 與 iPhone 模擬 |
| 輸入法 | 在 Chromium 上透過 DevTools 協定模擬組字事件（瀏覽器端的處理是真的，但不是真實輸入法）：連續選字、選字後立刻 Enter、在粗體裡組字、跨區塊選取後組字… |
| 套件 | publint 檢查套件設定；把打包好的套件裝進全新的 Vite 專案並建置 |
| 死碼 | knip 找出沒用到的檔案、匯出與相依套件 |

## 實機輸入法

真正的輸入法（注音、倉頡、手寫、語音）在實機上的行為無法自動化。發版前請照[實機輸入法測試清單](https://github.com/l02162010/blockwell/blob/main/docs/testing/device-checklist.md)在 macOS、Windows、iOS、Android 上各跑一次。
