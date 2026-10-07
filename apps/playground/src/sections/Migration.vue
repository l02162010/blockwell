<script setup lang="ts">
import { convertHtml, Editor, type Doc, type PasteIssue } from '@blockwell/core';
import { BlockwellEditor } from '@blockwell/vue';
import { computed, markRaw, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { migrationRecords } from '../sample';
import SectionHead from './SectionHead.vue';

/** Batch migration review (engine guide §10): convert old HTML, validate, list what needs a person. */
type Status = 'pending' | 'accepted' | 'edited' | 'skipped';
const convert = () => migrationRecords.map((r) => ({ ...r, ...convertHtml(r.html) }));
const results = shallowRef(convert());
const status = ref<Record<string, Status>>({});
const queue = computed(() => results.value.filter((r) => (status.value[r.id] ?? 'pending') === 'pending'));
const counts = computed(() => {
  const v = Object.values(status.value);
  return { converted: 12_443 + v.filter((s) => s === 'accepted' || s === 'edited').length, skipped: v.filter((s) => s === 'skipped').length };
});
const selected = ref<string | null>(queue.value[0]?.id ?? null);
const current = computed(() => queue.value.find((r) => r.id === selected.value) ?? null);

const LABELS: Record<PasteIssue['code'], [string, string, string, 'reject' | 'adjust' | 'skip']> = {
  'color-dropped': ['format_color_reset', 'font color 不在色盤：保留文字，移除顏色', 'Color not in palette, text kept', 'adjust'],
  'unsafe-link': ['link_off', 'javascript: 連結不合法：移除連結，保留文字', 'Unsafe link removed, text kept', 'reject'],
  'unsafe-image': ['hide_image', '圖片網址不合法：已移除圖片', 'Unsafe image removed', 'reject'],
  'merged-cells': ['table', '合併儲存格不支援：已拆成一般儲存格', 'Merged cells split', 'adjust'],
  embed: ['smart_display', 'iframe 嵌入不在 schema 中：已略過', 'Embed skipped', 'skip'],
  'list-depth': ['format_indent_increase', '清單太深：超過 6 層縮排的項目已上移到第 6 層', 'Deeper list items moved up to level 6', 'adjust'],
};
const BADGES: Record<PasteIssue['code'], string> = {
  'merged-cells': '合併儲存格',
  embed: 'iframe 嵌入',
  'list-depth': '清單太深',
  'color-dropped': '顏色',
  'unsafe-link': '不安全連結',
  'unsafe-image': '不安全圖片',
};
const badge = (issues: PasteIssue[]) => {
  if (issues.length > 1) return { text: `${issues.length} 項問題`, level: 'reject' };
  const c = issues[0]?.code;
  return c ? { text: BADGES[c], level: LABELS[c][3] } : { text: '可轉換', level: 'ok' };
};

// Read-only preview of the converted document; "手動編輯" swaps in an editor.
const editing = ref(false);
const draft = shallowRef<Doc | null>(null);
const preview = ref<HTMLElement | null>(null);
let viewer: Editor | null = null;
watch(
  [current, preview, editing],
  ([r, el, ed]) => {
    viewer?.destroy();
    viewer = null;
    if (!r || !el || ed) return;
    viewer = markRaw(new Editor({ doc: r.doc, editable: false }));
    viewer.mount(el);
  },
  { immediate: true, flush: 'post' },
);
watch(selected, () => (editing.value = false));
onBeforeUnmount(() => viewer?.destroy());

const list = ref<HTMLElement | null>(null);
/** After handling a record, go on with the one below it (or above, at the end of the list). */
const finish = (s: Status) => {
  const id = selected.value;
  if (!id) return;
  const i = queue.value.findIndex((r) => r.id === id);
  status.value = { ...status.value, [id]: s };
  editing.value = false;
  const next = queue.value[Math.min(i, queue.value.length - 1)];
  selected.value = next?.id ?? null;
  nextTick(() => (next ? list.value?.querySelector<HTMLElement>(`[data-id="${next.id}"]`) : list.value?.querySelector<HTMLElement>('.mig-empty button'))?.focus());
};
const editorHost = ref<HTMLElement | null>(null);
const edit = () => {
  draft.value = current.value ? structuredClone(current.value.doc) : null;
  editing.value = true;
  // Straight into the editor.
  nextTick(() => editorHost.value?.querySelector<HTMLElement>('.bw-editor')?.focus());
};
const saveEdit = () => {
  const id = selected.value;
  if (id && draft.value) results.value = results.value.map((r) => (r.id === id ? { ...r, doc: draft.value! } : r));
  finish('edited');
};
/** 重新執行: convert every record again and put them all back in the queue. */
const rerun = () => {
  results.value = convert();
  status.value = {};
  selected.value = results.value[0]?.id ?? null;
  nextTick(() => list.value?.querySelector<HTMLElement>('.mig-item')?.focus());
};
const onListKey = (e: KeyboardEvent) => {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const i = queue.value.findIndex((r) => r.id === selected.value);
  const to = e.key === 'Home' ? 0 : e.key === 'End' ? queue.value.length - 1 : i + (e.key === 'ArrowDown' ? 1 : -1);
  const next = queue.value[Math.max(0, Math.min(queue.value.length - 1, to))];
  if (!next) return;
  selected.value = next.id;
  nextTick(() => list.value?.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.focus());
};
</script>

<template>
  <section data-screen-label="08 Migration">
    <SectionHead num="08" zh="舊內容遷移" en="Migration">批次把舊 HTML 轉成 JSON；通過 schema 驗證才寫入，有問題的記錄在這裡人工處理。</SectionHead>
    <div class="card card-flush">
      <div class="mig-head">
        <span class="card-title">遷移佇列 <span>Migration queue</span></span>
        <span class="pill pill-ok">{{ counts.converted.toLocaleString('en-US') }} 已轉換</span>
        <span v-if="queue.length" class="pill pill-bad">{{ queue.length }} 待處理</span>
        <span v-if="counts.skipped" class="pill pill-skip">{{ counts.skipped }} 已略過</span>
        <span class="spacer" />
        <button v-if="queue.length" type="button" class="btn" @click="rerun">重新執行</button>
      </div>
      <div class="mig-body">
        <div ref="list" class="mig-list" role="listbox" aria-label="遷移佇列" @keydown="onListKey">
          <button
            v-for="r in queue"
            :key="r.id"
            :data-id="r.id"
            type="button"
            role="option"
            class="mig-item"
            :class="{ on: r.id === selected }"
            :aria-selected="r.id === selected"
            :tabindex="r.id === selected ? 0 : -1"
            @click="selected = r.id"
          >
            <span class="mig-row"><b>{{ r.title }}</b><code>{{ r.id }}</code></span>
            <span class="pill" :class="`pill-${badge(r.report.issues).level}`">{{ badge(r.report.issues).text }}</span>
          </button>
          <div v-if="!queue.length" class="mig-empty">
            <span class="material-symbols-rounded">task_alt</span>
            <b>全部處理完成</b>
            <span>{{ counts.skipped ? `${counts.skipped} 筆略過的記錄留在舊系統。` : '所有記錄都已寫入。' }}</span>
            <button type="button" class="btn" @click="rerun">重新執行遷移</button>
          </div>
        </div>
        <div v-if="current" class="mig-detail">
          <div class="mig-cols">
            <div>
              <div class="card-label">原始 HTML · Source</div>
              <pre class="mig-source">{{ current.html }}</pre>
            </div>
            <div>
              <div class="card-label">{{ editing ? '手動編輯 · Edit' : '轉換結果 · Result' }}</div>
              <div v-if="editing && draft" ref="editorHost"><BlockwellEditor v-model="draft" variant="field" class="mig-edit" :debounce="0" /></div>
              <div v-else ref="preview" class="mig-result bw-content" />
            </div>
          </div>
          <div v-for="i in current.report.issues" :key="i.code" class="bw-feedback" :class="`bw-feedback-${LABELS[i.code][3]}`">
            <span class="material-symbols-rounded">{{ LABELS[i.code][0] }}</span>
            <span>{{ LABELS[i.code][1] }}<br /><span class="bw-en">{{ LABELS[i.code][2] }}</span></span>
          </div>
          <div class="mig-actions">
            <template v-if="editing">
              <button type="button" class="btn-link" @click="editing = false">取消</button>
              <button type="button" class="btn btn-dark" @click="saveEdit">儲存並寫入</button>
            </template>
            <template v-else>
              <button type="button" class="btn-link" title="留在舊系統，不寫入" @click="finish('skipped')">略過</button>
              <button type="button" class="btn" @click="edit">手動編輯</button>
              <button type="button" class="btn btn-dark" :disabled="!current.ok" @click="finish('accepted')">接受轉換結果</button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
