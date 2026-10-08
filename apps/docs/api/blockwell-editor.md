# &lt;BlockwellEditor&gt;

完整的編輯器：可編輯區加上工具列、選單、斜線指令、提及、搜尋、貼上報告與手機介面。

```vue
<BlockwellEditor v-model="doc" variant="page" :upload-image="upload" @save-error="onError" />
```

<Demo />

下面的表格由原始碼自動產生（`scripts/api-report.mjs`）。CI 會檢查每一項都有說明、也都有測試涵蓋，所以這份參考不會和程式碼脫節。

<ApiTable component="BlockwellEditor" />

## 暴露的成員

透過 template ref 取得：

```vue
<script setup lang="ts">
import { ref } from 'vue';
const ed = ref<InstanceType<typeof BlockwellEditor>>();
// ed.value.editor.toggleMark('bold')
</script>

<template><BlockwellEditor ref="ed" v-model="doc" /></template>
```

| 名稱 | 說明 |
| --- | --- |
| `editor` | 底層的 [`Editor`](/api/editor)，可以呼叫任何指令、訂閱事件。 |
| `submit()` | 送出目前內容（觸發 `submit` 事件）；空文件不會送出。和 `comment` 外觀按 Mod-Enter 相同。 |
