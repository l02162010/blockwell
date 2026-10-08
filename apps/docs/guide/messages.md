# 文字與語言

介面文字預設是繁體中文加英文。用 `messages` 換掉任何一段：

```vue
<BlockwellEditor :messages="{ insert: ['Insert', ''], send: 'Send' }" />
```

所有可替換的文字見 `defaultMessages`（從 `@blockwell/vue` 匯入）。`messages` 只在建立時讀取一次。

面板元件（`<CommentsPanel>`、`<HistoryPanel>`、`<PresenceMenu>`）也接受 `messages`。

快捷鍵會依平台顯示：macOS 顯示 `⌘ B`，其他平台顯示 `Ctrl+B`。自己的介面可以用 `kbd()`：

```ts
import { kbd } from '@blockwell/vue';
kbd('⌘ ⇧ X'); // macOS: "⌘ ⇧ X"，Windows：「Ctrl+Shift+X」
```
