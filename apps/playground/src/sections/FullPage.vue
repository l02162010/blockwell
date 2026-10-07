<script setup lang="ts">
import { textBlocks, type Doc, type Editor, type HighlightRange, type UploadResult } from '@blockwell/core';
import {
  BlockwellEditor,
  CommentsPanel,
  HistoryPanel,
  PresenceMenu,
  SaveStatus,
  type CommentThread,
  type Person,
  type RemoteCursor,
  type Version,
} from '@blockwell/vue';
import { computed, ref, shallowRef, watch } from 'vue';
import { members, people, previousVersion, sampleDoc } from '../sample';
import SectionHead from './SectionHead.vue';

const props = defineProps<{ uploadImage: (f: File, p: (n: number) => void) => Promise<UploadResult> }>();

const doc = shallowRef<Doc>(sampleDoc());
const editor = shallowRef<Editor | null>(null);
watch(editor, (e) => ((window as unknown as { __editor?: Editor }).__editor = e ?? undefined));

/** Demo switches for states that come from outside the editor. */
const readOnly = ref(false);
const collab = ref(true);
const panel = ref<'comments' | 'history' | null>(null);
const system = ref<'saved' | 'error' | 'offline'>('saved');
const follow = ref(false);

const mentionLabel = (uid: string) => people[uid] ?? uid;
const mentionSearch = (q: string) => members.filter((m) => !q || m.name.includes(q) || m.id.includes(q.toLowerCase()));

const texts = computed(() => textBlocks(doc.value));
const quote = computed(() => texts.value.find((b) => b.text?.startsWith('JSON 是唯一真相')));
const ime = computed(() => texts.value.find((b) => b.text === '注音、倉頡'));
const cursors = computed<RemoteCursor[]>(() => {
  if (!collab.value) return [];
  const out: RemoteCursor[] = [];
  if (quote.value) out.push({ name: '陳柏翰', color: '#0F766E', pos: { block: quote.value.id, offset: (quote.value.text ?? '').indexOf('從 JSON') } });
  if (ime.value) out.push({ name: 'Mia', color: '#C2410C', pos: { block: ime.value.id, offset: (ime.value.text ?? '').length } });
  return out;
});
const presence = computed<Person[]>(() => [
  { id: 'u_lin', name: '林雅婷', color: 'blue', location: '編輯中 · Editing', self: true },
  { id: 'u_chen', name: '陳柏翰', color: 'teal', location: '引言區塊 · Quote' },
  { id: 'u_mia', name: 'Mia', color: 'orange', location: '選取表格 · Table' },
]);
const jump = (p: Person) => {
  const id = p.id === 'u_chen' ? quote.value?.id : ime.value?.id;
  if (id) editor.value?.revealBlock(id, { select: true });
};

// Comments are anchored to a block and a range; the editor only paints them.
const thread = ref<CommentThread>({
  id: 't1',
  anchor: 'JSON 是唯一真相',
  messages: [
    { id: 'c1', author: '陳柏翰', color: 'teal', time: '1 小時前', text: '這句可以放到文件開頭，當作設計原則。' },
    { id: 'c2', author: '林雅婷', color: 'blue', time: '30 分鐘前', text: '同意，下一版調整。' },
  ],
});
const resolved = ref(false);
const commentCounts = computed(() => (quote.value && !resolved.value ? { [quoteTop.value!]: thread.value.messages.length } : {}));
const quoteTop = computed(() => doc.value.blocks.find((b) => b.type === 'quote')?.id);
const highlights = computed((): Record<string, HighlightRange[]> => {
  const q = quote.value;
  return panel.value === 'comments' && q ? { comment: [{ block: q.id, from: 0, to: 'JSON 是唯一真相'.length }] } : {};
});
const openShortcuts = () => editor.value?.dom?.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true, ctrlKey: true, bubbles: true }));
const reply = (text: string) =>
  (thread.value = { ...thread.value, messages: [...thread.value.messages, { id: `c${Date.now()}`, author: '林雅婷', color: 'blue', time: '剛剛', text }] });

const versions: Version[] = [
  { id: 'now', time: '目前版本', who: '林雅婷', what: '編輯中', current: true },
  { id: 'v4', time: '今天 10:42', who: '林雅婷', what: '新增 1 段、刪除 1 段' },
  { id: 'v3', time: '昨天 18:20', who: '陳柏翰', what: '修改引言' },
  { id: 'v2', time: '10月6日 09:15', who: 'Mia', what: '新增 IME 表格' },
  { id: 'v1', time: '10月5日 14:02', who: '林雅婷', what: '建立文件' },
];
const selectedVersion = ref<string | null>('v4');
const diffBase = computed(() => (panel.value === 'history' && selectedVersion.value && selectedVersion.value !== 'now' ? previousVersion(doc.value) : null));

// The server's validator answers with a JSON pointer; in this demo it rejects the link paragraph.
const saveError = computed(() => {
  if (system.value !== 'error') return null;
  const i = doc.value.blocks.findIndex((b) => b.text?.startsWith('完整規格見'));
  return { path: `/blocks/${Math.max(i, 0)}/marks/0/attrs/href` };
});
const offline = computed(() => (system.value === 'offline' ? { pending: 3 } : null));
const status = computed(() => (system.value === 'error' ? 'error' : system.value === 'offline' ? 'offline' : 'saved'));
</script>

<template>
  <section data-screen-label="01 Full-page editor">
    <div class="section-row">
      <SectionHead num="01" zh="全頁文件編輯" en="Full-page document" />
      <div class="switches">
        <div class="switch-group">
          <span>協作</span>
          <label><input v-model="collab" type="checkbox" /> 協作游標</label>
          <button type="button" :class="{ on: panel === 'comments' }" @click="panel = panel === 'comments' ? null : 'comments'">留言</button>
          <button type="button" :class="{ on: panel === 'history' }" @click="panel = panel === 'history' ? null : 'history'">版本</button>
        </div>
        <div class="switch-group">
          <span>系統</span>
          <button type="button" :class="{ on: system === 'error' }" @click="system = system === 'error' ? 'saved' : 'error'">儲存失敗</button>
          <button type="button" :class="{ on: system === 'offline' }" @click="system = system === 'offline' ? 'saved' : 'offline'">離線</button>
          <label><input v-model="readOnly" type="checkbox" /> 唯讀</label>
          <button type="button" @click="openShortcuts">快捷鍵 ⌘/</button>
        </div>
      </div>
    </div>
    <div class="frame">
      <div class="topbar">
        <div class="crumbs"><span>工作區</span><i>/</i><span>產品</span><i>/</i><b>Q4 編輯器改版計畫</b></div>
        <SaveStatus v-if="!readOnly" :status="status" />
        <div v-else class="badge"><span class="material-symbols-rounded">lock</span>唯讀 Read-only</div>
        <PresenceMenu v-model:follow="follow" :people="presence" @jump="jump" />
        <button type="button" class="share">分享</button>
      </div>
      <BlockwellEditor
        v-model="doc"
        class="frame-editor"
        :editable="!readOnly && !diffBase"
        :upload-image="props.uploadImage"
        :mention-label="mentionLabel"
        :mention-search="mentionSearch"
        :cursors="cursors"
        :comment-counts="commentCounts"
        :highlights="highlights"
        :save-error="saveError"
        :offline="offline"
        :diff-base="diffBase"
        comments
        @ready="editor = $event"
        @comment="panel = 'comments'"
        @comment-open="panel = 'comments'"
        @retry="system = 'saved'"
      >
        <template #before>
          <h1 class="doc-title">Q4 編輯器改版計畫</h1>
          <div class="doc-meta">林雅婷 · 10 分鐘前編輯</div>
        </template>
        <template #aside>
          <CommentsPanel v-if="panel === 'comments' && !resolved" :thread="thread" @reply="reply" @resolve="(resolved = true), (panel = null)" @close="panel = null" />
          <HistoryPanel
            v-else-if="panel === 'history'"
            :versions="versions"
            :selected="selectedVersion"
            @select="selectedVersion = $event"
            @restore="(panel = null)"
            @close="panel = null"
          />
        </template>
      </BlockwellEditor>
    </div>
  </section>
</template>
