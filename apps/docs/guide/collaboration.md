# 協作、留言與版本

Blockwell 提供**介面**；資料與同步由你的應用程式負責（例如 Yjs、WebSocket、你的 REST API）。每個元件都只吃資料、發事件，不會自己連線。

## 其他人的游標

```vue
<BlockwellEditor :cursors="[{ name: '陳柏翰', color: '#0F766E', pos: { block: 'p1', offset: 4 } }]" />
```

`pos` 來自你的同步層。

## 在線成員

```vue
<PresenceMenu :people="people" v-model:follow="following" @jump="(p) => goToCursorOf(p.id)" />
```

`people` 裡把自己標上 `self: true`，`location` 顯示對方在哪裡。按「前往」觸發 `jump`（例如用 `editor.revealBlock(blockId, { select: true })` 捲過去）；「跟隨」開關的行為由你決定。

## 留言

1. 傳入 `comments`，選取文字時的浮動列會多一個留言按鈕，按下觸發 `@comment`。
2. 從 `editor.selection` 取得範圍，建立你的討論串。
3. 用 `commentCounts` 在區塊旁顯示數字徽章，點徽章觸發 `@comment-open`。
4. 用 `highlights` 標出被留言的文字。
5. 把 `<CommentsPanel>` 放進 `#aside` slot。

```vue
<BlockwellEditor
  v-model="doc"
  comments
  :comment-counts="counts"
  :highlights="{ comment: [{ block: t.block, from: t.from, to: t.to }] }"
  @comment="newThread"
  @comment-open="openThread"
>
  <template #aside>
    <CommentsPanel v-if="thread" :thread="thread" @reply="reply" @resolve="resolve" @close="thread = null" />
  </template>
</BlockwellEditor>
```

`highlights` 的樣式用 CSS 自訂：`::highlight(bw-comment) { background: #fef3c7 }`。

## 版本紀錄

把舊版本傳給 `diffBase`，編輯器會改成唯讀的差異檢視（新增綠色、刪除劃線）。還原時用 `editor.replaceContent(doc)`，這樣還原本身也能復原。

```vue
<BlockwellEditor v-model="doc" :diff-base="selected ? snapshots[selected] : null" @ready="(e) => (editor = e)">
  <template #aside>
    <HistoryPanel :versions="versions" :selected="selected" @select="(id) => (selected = id)" @restore="(id) => editor.replaceContent(snapshots[id])" @close="selected = null" />
  </template>
</BlockwellEditor>
```

## 即時協作

收到別人的變更時用 `editor.applyRemote(tr)` 套用（不會進入本機的復原紀錄）；送出自己的變更可以監聽 `editor.on('change', ({ tr }) => …)`。衝突合併（OT／CRDT）不在這個套件的範圍內。

完整範例見 Playground 的「01 全頁文件編輯」與它的[原始碼](https://github.com/l02162010/blockwell/blob/main/apps/playground/src/sections/FullPage.vue)。
