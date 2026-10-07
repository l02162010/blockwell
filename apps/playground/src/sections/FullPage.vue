<script setup lang="ts">
import { ancestors, getBlock, textBlocks, type Doc, type Editor, type HighlightRange, type UploadResult } from '@blockwell/core';
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
import { members, people, sampleDoc, versionSnapshots } from '../sample';
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
// 分享 copies a link; 跟隨 keeps 陳柏翰's caret in view (here: jumps to it when turned on).
const shared = ref(false);
const share = () => {
  void navigator.clipboard?.writeText(location.href).catch(() => {});
  shared.value = true;
  setTimeout(() => (shared.value = false), 1800);
};
watch(follow, (on) => {
  const chen = presence.value.find((p) => p.id === 'u_chen');
  if (on && chen) jump(chen);
});
const jump = (p: Person) => {
  // To the collaborator's caret, not just their block.
  const c = cursors.value.find((x) => x.name === p.name) ?? null;
  const id = c?.pos.block ?? (p.id === 'u_chen' ? quote.value?.id : ime.value?.id);
  if (!id) return;
  editor.value?.revealBlock(id, { select: true });
  if (c) editor.value?.setSelection({ type: 'text', anchor: c.pos, focus: c.pos });
};

// Comments are anchored to a block and a range; the editor only paints them. The host app
// stores the threads (here: in memory).
interface Thread extends CommentThread {
  block: string;
  from: number;
  to: number;
  resolved?: boolean;
}
const threads = ref<Thread[]>([]);
const active = ref<string | null>(null);
watch(
  quote,
  (q) => {
    if (!q || threads.value.length) return;
    threads.value = [
      {
        id: 't1',
        anchor: 'JSON 是唯一真相',
        block: q.id,
        from: 0,
        to: 'JSON 是唯一真相'.length,
        messages: [
          { id: 'c1', author: '陳柏翰', color: 'teal', time: '1 小時前', text: '這句可以放到文件開頭，當作設計原則。' },
          { id: 'c2', author: '林雅婷', color: 'blue', time: '30 分鐘前', text: '同意，下一版調整。' },
        ],
      },
    ];
  },
  { immediate: true },
);
const open = computed(() => threads.value.filter((t) => !t.resolved && getBlock(doc.value, t.block)));
const written = computed(() => open.value.filter((t) => t.messages.length));
const thread = computed(() => open.value.find((t) => t.id === active.value) ?? null);
const topOf = (id: string) => [id, ...ancestors(doc.value, id).map((b) => b.id)].pop()!;
const commentCounts = computed(() => {
  const counts: Record<string, number> = {};
  // A draft nobody wrote in yet is not a comment.
  for (const t of open.value) if (t.messages.length) counts[topOf(t.block)] = (counts[topOf(t.block)] ?? 0) + t.messages.length;
  return counts;
});
const highlights = computed((): Record<string, HighlightRange[]> => {
  const t = thread.value;
  return panel.value === 'comments' && t ? { comment: [{ block: t.block, from: t.from, to: t.to }] } : {};
});
const showThread = (t: Thread | undefined) => {
  // A new thread nobody wrote in is dropped when closed.
  threads.value = threads.value.filter((x) => x.messages.length > 0 || x.id === t?.id);
  active.value = t?.id ?? null;
  panel.value = t ? 'comments' : null;
};
/** The bubble's 留言 button: a new thread on the selected words. */
const newThread = () => {
  const ed = editor.value;
  const sel = ed?.selection;
  if (!ed || sel?.type !== 'text' || sel.anchor.block !== sel.focus.block || sel.anchor.offset === sel.focus.offset) return;
  const [from, to] = [sel.anchor.offset, sel.focus.offset].sort((x, y) => x - y) as [number, number];
  const t: Thread = { id: `t${Date.now()}`, anchor: ed.selectedText(), block: sel.focus.block, from, to, messages: [] };
  threads.value = [...threads.value, t];
  showThread(t);
};
const openThreadAt = (block: string) => showThread(open.value.find((t) => topOf(t.block) === block));
const toggleComments = () => (panel.value === 'comments' ? showThread(undefined) : showThread(written.value[0]));
const openShortcuts = () => editor.value?.dom?.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true, ctrlKey: true, bubbles: true }));
const reply = (text: string) => {
  const t = thread.value;
  if (!t) return;
  threads.value = threads.value.map((x) =>
    x.id === t.id ? { ...x, messages: [...x.messages, { id: `c${Date.now()}`, author: '林雅婷', color: 'blue', time: '剛剛', text }] } : x,
  );
};
const resolve = () => {
  const t = thread.value;
  threads.value = threads.value.map((x) => (x.id === t?.id ? { ...x, resolved: true } : x));
  showThread(undefined);
  editor.value?.focus();
};

// Version history: real snapshots, so every version shows its own diff and can be restored.
const snapshots = versionSnapshots(sampleDoc());
const versions = ref<Version[]>([
  { id: 'now', time: '目前版本', who: '林雅婷', what: '編輯中', current: true },
  { id: 'v4', time: '今天 10:42', who: '林雅婷', what: '新增連結段落' },
  { id: 'v3', time: '昨天 18:20', who: '陳柏翰', what: '修改引言' },
  { id: 'v2', time: '10月6日 09:15', who: 'Mia', what: '新增 IME 表格' },
  { id: 'v1', time: '10月5日 14:02', who: '林雅婷', what: '建立文件' },
]);
const selectedVersion = ref<string | null>('v4');
const diffBase = computed(() => (panel.value === 'history' && selectedVersion.value ? (snapshots[selectedVersion.value] ?? null) : null));
const restore = (id: string) => {
  const snap = snapshots[id];
  const ed = editor.value;
  if (!snap || !ed) return;
  // The state before the restore stays in the list, and the restore itself can be undone.
  snapshots.before = structuredClone(ed.getJSON());
  panel.value = null;
  selectedVersion.value = 'now';
  versions.value = [
    { ...versions.value[0]!, what: `已還原 ${versions.value.find((v) => v.id === id)?.time}` },
    { id: 'before', time: '剛剛', who: '林雅婷', what: '還原前的版本' },
    ...versions.value.slice(1).filter((v) => v.id !== 'before'),
  ];
  requestAnimationFrame(() => ed.replaceContent(structuredClone(snap)));
};

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
          <button type="button" :class="{ on: panel === 'comments' }" :disabled="!written.length && panel !== 'comments'" :title="written.length ? '' : '沒有未解決的留言；選取文字後按浮動列的留言新增'" @click="toggleComments">留言 {{ written.length || '' }}</button>
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
        <button type="button" class="share" @click="share">{{ shared ? '已複製連結' : '分享' }}</button>
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
        @comment="newThread"
        @comment-open="openThreadAt"
        @retry="system = 'saved'"
      >
        <template #before>
          <h1 class="doc-title">Q4 編輯器改版計畫</h1>
          <div class="doc-meta">林雅婷 · 10 分鐘前編輯</div>
        </template>
        <template #aside>
          <CommentsPanel v-if="panel === 'comments' && thread" :key="thread.id" :thread="thread" @reply="reply" @resolve="resolve" @close="(showThread(undefined), editor?.focus())" />
          <HistoryPanel
            v-else-if="panel === 'history'"
            :versions="versions"
            :selected="selectedVersion"
            @select="selectedVersion = $event"
            @restore="restore"
            @close="panel = null"
          />
        </template>
      </BlockwellEditor>
    </div>
  </section>
</template>
