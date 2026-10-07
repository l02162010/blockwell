<script setup lang="ts">
import { convertHtml, Editor, type PasteIssue } from '@blockwell/core';
import { computed, markRaw, onBeforeUnmount, ref, watch } from 'vue';
import { migrationRecords } from '../sample';
import SectionHead from './SectionHead.vue';

/** Batch migration review (engine guide §10): convert old HTML, validate, list what needs a person. */
const results = migrationRecords.map((r) => ({ ...r, ...convertHtml(r.html) }));
const done = ref<Set<string>>(new Set());
const queue = computed(() => results.filter((r) => !done.value.has(r.id)));
const selected = ref(queue.value[0]?.id ?? null);
const current = computed(() => results.find((r) => r.id === selected.value) ?? null);

const LABELS: Record<PasteIssue['code'], [string, string, string, 'reject' | 'adjust' | 'skip']> = {
  'color-dropped': ['format_color_reset', 'font color 不在色盤：保留文字，移除顏色', 'Color not in palette, text kept', 'adjust'],
  'unsafe-link': ['link_off', 'javascript: 連結不合法：移除連結，保留文字', 'Unsafe link removed, text kept', 'reject'],
  'unsafe-image': ['hide_image', '圖片網址不合法：已移除圖片', 'Unsafe image removed', 'reject'],
  'merged-cells': ['table', '合併儲存格不支援：已拆成一般儲存格', 'Merged cells split', 'adjust'],
  embed: ['smart_display', 'iframe 嵌入不在 schema 中：已略過', 'Embed skipped', 'skip'],
  'list-depth': ['format_indent_increase', '清單超過 6 層：已調整到 6 層', 'List depth capped at 6', 'adjust'],
};
const badge = (codes: PasteIssue[]) => {
  if (codes.length > 1) return { text: `${codes.length} 項問題`, level: 'reject' };
  const c = codes[0]?.code;
  const text = { 'merged-cells': '合併儲存格', embed: 'iframe 嵌入', 'list-depth': '清單 9 層（上限 6）', 'color-dropped': '顏色', 'unsafe-link': '不安全連結', 'unsafe-image': '不安全圖片' }[c ?? 'embed'];
  return { text, level: c ? LABELS[c][3] : 'skip' };
};

const preview = ref<HTMLElement | null>(null);
let editor: Editor | null = null;
watch(
  [current, preview],
  ([r, el]) => {
    editor?.destroy();
    editor = null;
    if (!r || !el) return;
    editor = markRaw(new Editor({ doc: r.doc, editable: false }));
    editor.mount(el);
  },
  { immediate: true, flush: 'post' },
);
onBeforeUnmount(() => editor?.destroy());
const accept = () => {
  if (!selected.value) return;
  done.value = new Set([...done.value, selected.value]);
  selected.value = queue.value[0]?.id ?? null;
};
</script>

<template>
  <section data-screen-label="08 Migration">
    <SectionHead num="08" zh="舊內容遷移" en="Migration">批次把舊 HTML 轉成 JSON；通過 schema 驗證才寫入，失敗的記錄在這裡人工處理。</SectionHead>
    <div class="card card-flush">
      <div class="mig-head">
        <span class="card-title">遷移佇列 <span>Migration queue</span></span>
        <span class="pill pill-ok">{{ (12_443 + done.size).toLocaleString('en-US') }} 已轉換</span>
        <span class="pill pill-bad">{{ 33 + queue.length }} 待處理</span>
        <span class="spacer" />
        <button type="button" class="btn">重新執行</button>
      </div>
      <div class="mig-body">
        <div class="mig-list" role="listbox" aria-label="遷移佇列">
          <button
            v-for="r in queue"
            :key="r.id"
            type="button"
            role="option"
            class="mig-item"
            :class="{ on: r.id === selected }"
            :aria-selected="r.id === selected"
            @click="selected = r.id"
          >
            <span class="mig-row"><b>{{ r.title }}</b><code>{{ r.id }}</code></span>
            <span class="pill" :class="`pill-${badge(r.report.issues).level}`">{{ badge(r.report.issues).text }}</span>
          </button>
          <div v-if="!queue.length" class="note">全部處理完成。</div>
        </div>
        <div v-if="current" class="mig-detail">
          <div class="mig-cols">
            <div>
              <div class="card-label">原始 HTML · Source</div>
              <pre class="mig-source">{{ current.html }}</pre>
            </div>
            <div>
              <div class="card-label">轉換結果 · Result</div>
              <div ref="preview" class="mig-result bw-content" />
            </div>
          </div>
          <div v-for="i in current.report.issues" :key="i.code" class="bw-feedback" :class="`bw-feedback-${LABELS[i.code][3]}`">
            <span class="material-symbols-rounded">{{ LABELS[i.code][0] }}</span>
            <span>{{ LABELS[i.code][1] }}<br /><span class="bw-en">{{ LABELS[i.code][2] }}</span></span>
          </div>
          <div class="mig-actions">
            <button type="button" class="btn-link" @click="accept">略過</button>
            <button type="button" class="btn">手動編輯</button>
            <button type="button" class="btn btn-dark" :disabled="!current.ok" @click="accept">接受轉換結果</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
