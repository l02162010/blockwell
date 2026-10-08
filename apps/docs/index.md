---
layout: home
hero:
  name: Blockwell
  text: 富文本，不存 HTML。
  tagline: 區塊式編輯器。文件是結構化 JSON，schema 白名單就是安全邊界——不需要 sanitizer。
  actions:
    - theme: brand
      text: 快速開始
      link: /guide/getting-started
    - theme: alt
      text: API 參考
      link: /api/blockwell-editor
    - theme: alt
      text: Playground
      link: https://l02162010.github.io/blockwell/playground/
features:
  - title: JSON 是唯一真相
    details: 存進資料庫的是經過 schema 驗證的 JSON。HTML、Email、PDF 都從它產生，換框架不用遷移資料。
  - title: schema 即安全邊界
    details: 沒列在白名單的東西一律拒絕；顏色是色盤 token，連結先檢查協定。前端與後端用同一套規則。
  - title: 為中文輸入而做
    details: 注音、倉頡、拼音與手寫在組字結束後才寫入；Chromium 上以模擬的組字事件自動測試；實機輸入法另附手動測試清單。
  - title: 每個公開 API 都有測試
    details: 每個 prop、事件、方法都有說明與測試，CI 會擋下沒有測試的 API。Chromium、Firefox、WebKit 與手機模擬都在 CI 跑。
---

<Demo json />
