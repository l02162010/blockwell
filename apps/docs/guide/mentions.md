# 提及

傳入 `mentionSearch` 就會啟用 `@`：輸入 `@` 後顯示成員選單，可以用中文或英文搜尋。

```vue
<script setup lang="ts">
import type { Member } from '@blockwell/vue';

const members: Member[] = [
  { id: 'u_chen', name: '陳柏翰', subtitle: '前端', color: 'teal' },
  { id: 'u_lin', name: '林雅婷' },
];
const search = (q: string) => members.filter((m) => m.name.includes(q) || m.id.includes(q));
const label = (id: string) => members.find((m) => m.id === id)?.name ?? id;
</script>

<template>
  <BlockwellEditor v-model="doc" :mention-search="search" :mention-label="label" />
</template>
```

- 文件只存 `userId`，不存名字；改名不需要更新文件。
- `mentionSearch` 可以回傳 Promise（例如向後端查詢）。
- `mentionLabel` 決定提及顯示的名字。
- 留言框（`variant="comment"`）的工具列會多一個 @ 按鈕。
