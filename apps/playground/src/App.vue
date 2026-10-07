<script setup lang="ts">
import { PALETTE_COLORS, textBlocks, type Doc, type Editor, type UploadResult } from '@blockwell/core';
import { BlockwellEditor, type RemoteCursor } from '@blockwell/vue';
import { computed, ref, shallowRef, watch } from 'vue';
import { cmsDoc, mobileDoc, people, sampleDoc } from './sample';

const doc = shallowRef<Doc>(sampleDoc());
const cms = cmsDoc();
const mobile = mobileDoc();
const readOnly = ref(false);
const showCollab = ref(true);
const theme = ref<'light' | 'dark'>('light');
const showJson = ref(false);
const savedAt = ref<Date>(new Date());
const editor = shallowRef<Editor | null>(null);

watch(doc, () => (savedAt.value = new Date()));
// Lets end-to-end tests read the document and selection.
watch(editor, (e) => ((window as unknown as { __editor?: Editor }).__editor = e ?? undefined));
watch(theme, (t) => document.documentElement.setAttribute('data-theme', t), { immediate: true });

const mentionLabel = (uid: string) => people[uid] ?? uid;

/** Pretends to upload: reports progress, then resolves to an https URL. */
const uploadImage = (file: File, onProgress: (f: number) => void): Promise<UploadResult> =>
  new Promise((resolve) => {
    let p = 0;
    const timer = setInterval(() => {
      p = Math.min(1, p + 0.08 + Math.random() * 0.1);
      onProgress(p);
      if (p >= 1) {
        clearInterval(timer);
        resolve({ src: `https://picsum.photos/seed/${encodeURIComponent(file.name)}/1280/720`, alt: file.name.replace(/\.[^.]+$/, '') });
      }
    }, 160);
  });

// Collaborator carets placed like the spec: one in the quote, one in the IME table.
const cursors = computed<RemoteCursor[]>(() => {
  if (!showCollab.value) return [];
  const texts = textBlocks(doc.value);
  const out: RemoteCursor[] = [];
  const quote = texts.find((b) => b.text?.startsWith('JSON 是唯一真相'));
  if (quote) out.push({ name: '陳柏翰', color: '#0F766E', pos: { block: quote.id, offset: (quote.text ?? '').indexOf('從 JSON') } });
  const ime = texts.find((b) => b.text === '注音、倉頡');
  if (ime) out.push({ name: 'Mia', color: '#C2410C', pos: { block: ime.id, offset: (ime.text ?? '').length } });
  return out;
});

const comment = shallowRef<Doc | undefined>(undefined);
const sent = ref<string[]>([]);
const onSubmit = (d: Doc) => {
  const text = textBlocks(d).map((b) => b.text).join('\n').trim();
  if (!text) return;
  sent.value = [...sent.value, text];
  comment.value = { version: 1, blocks: [{ id: `c_${Date.now()}`, type: 'paragraph', text: '' }] };
};

const tokens = Object.entries(PALETTE_COLORS);
const time = computed(() => savedAt.value.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }));
</script>

<template>
  <main class="page">
    <header class="intro">
      <div class="eyebrow">Blockwell · Playground · v0.1</div>
      <h1>富文本編輯器 <span>Rich Text Editor</span></h1>
      <p>
        結構化 JSON 文件模型的編輯器。精簡頂部工具列、選取浮動列與斜線指令並存；所有樣式只來自 schema 白名單，顏色只有色盤 token。
      </p>
      <div class="controls">
        <label><input v-model="readOnly" type="checkbox" /> 唯讀 Read-only</label>
        <label><input v-model="showCollab" type="checkbox" /> 協作游標 Collaborators</label>
        <label><input type="checkbox" :checked="theme === 'dark'" @change="theme = theme === 'dark' ? 'light' : 'dark'" /> 深色 Dark</label>
      </div>
    </header>

    <!-- 01 -->
    <section data-screen-label="01 Full-page editor">
      <div class="section-head">
        <div class="num">01</div>
        <h2>全頁文件編輯 <span>Full-page document</span></h2>
      </div>
      <div class="frame">
        <div class="topbar">
          <div class="crumbs"><span>工作區</span><i>/</i><span>產品</span><i>/</i><b>Q4 編輯器改版計畫</b></div>
          <div v-if="!readOnly" class="saved"><span class="dot" />已儲存 · Saved {{ time }}</div>
          <div v-else class="badge"><span class="material-symbols-rounded">lock</span>唯讀 Read-only</div>
          <div class="avatars">
            <span style="background: #dbeafe; color: #1e3a8a">林</span>
            <span style="background: #ccfbf1; color: #0f766e">陳</span>
            <span style="background: #ffedd5; color: #c2410c">M</span>
          </div>
          <button type="button" class="share">分享</button>
        </div>
        <BlockwellEditor
          v-model="doc"
          class="frame-editor"
          :editable="!readOnly"
          :upload-image="uploadImage"
          :mention-label="mentionLabel"
          :cursors="cursors"
          comments
          @ready="editor = $event"
        >
          <template #before>
            <h1 class="doc-title">Q4 編輯器改版計畫</h1>
            <div class="doc-meta">林雅婷 · 10 分鐘前編輯</div>
          </template>
        </BlockwellEditor>
      </div>
      <details class="json" :open="showJson" @toggle="showJson = ($event.target as HTMLDetailsElement).open">
        <summary>文件 JSON · Document JSON <span>（唯一真相 · the only stored form）</span></summary>
        <pre v-if="showJson">{{ JSON.stringify(doc, null, 2) }}</pre>
      </details>
    </section>

    <!-- 02 -->
    <section data-screen-label="02 Embedded variants">
      <div class="section-head">
        <div class="num">02</div>
        <h2>嵌入場景 <span>Embedded</span></h2>
      </div>
      <div class="grid">
        <div class="card">
          <div class="card-label">表單欄位 · CMS field</div>
          <label class="field-label">標題 Title<span class="input">新版編輯器上線公告</span></label>
          <div class="field-group">
            <div class="field-name">內容 Content</div>
            <BlockwellEditor variant="field" :model-value="cms" :max-length="20000" :upload-image="uploadImage" />
            <div class="note">支援 Markdown 快捷輸入；顏色僅限色盤。</div>
          </div>
        </div>

        <div class="card">
          <div class="card-label">留言框 · Comment</div>
          <div class="msg">
            <div class="avatar" style="background: #ccfbf1; color: #0f766e">陳</div>
            <div class="msg-body">
              <div class="msg-head"><b>陳柏翰</b> <span>· 2 小時前</span></div>
              <div>Safari 的 <code>compositionend</code> 順序跟 Chrome 不同，<strong>先別合併</strong>，細節見<a href="#">測試紀錄</a>。</div>
            </div>
          </div>
          <div v-for="(s, i) in sent" :key="i" class="msg">
            <div class="avatar" style="background: #dbeafe; color: #1e3a8a">林</div>
            <div class="msg-body">
              <div class="msg-head"><b>林雅婷</b> <span>· 剛剛</span></div>
              <div>{{ s }}</div>
            </div>
          </div>
          <div class="msg">
            <div class="avatar" style="background: #dbeafe; color: #1e3a8a">林</div>
            <BlockwellEditor v-model="comment" variant="comment" class="grow" :debounce="0" @submit="onSubmit" />
          </div>
          <div class="note">未聚焦時收合為單行；聚焦後展開工具列。留言只開放行內樣式，不提供區塊。</div>
        </div>

        <div class="phone-col">
          <div class="card-label">行動裝置 · Mobile</div>
          <div class="phone">
            <div class="phone-status" />
            <div class="phone-nav">
              <span class="material-symbols-rounded">chevron_left</span>
              <span class="phone-actions"><span class="material-symbols-rounded">undo</span><b>完成</b></span>
            </div>
            <BlockwellEditor class="phone-editor" layout="mobile" :model-value="mobile" :upload-image="uploadImage" />
            <div class="keyboard">系統鍵盤 · system keyboard</div>
          </div>
          <div class="note">窄螢幕把頂部列與浮動列合併成鍵盤上方的工具列，按鈕 44px。</div>
        </div>
      </div>
    </section>

    <!-- 04 -->
    <section data-screen-label="04 Palette">
      <div class="section-head">
        <div class="num">03</div>
        <h2>色盤 token <span>Palette</span></h2>
        <p>文件只存 token，渲染為 <code>.bw-c-*</code> 與 <code>.bw-bg-*</code> class，色碼來自 <code>spec/palette.json</code>。</p>
      </div>
      <div class="palette">
        <div class="swatch">
          <div class="sample">文字 Aa</div>
          <div class="meta"><b>default</b><span>正文色 / 無</span></div>
        </div>
        <div v-for="[k, v] in tokens" :key="k" class="swatch">
          <div class="sample" :class="[`bw-c-${k}`, `bw-bg-${k}`]">文字 Aa</div>
          <div class="meta"><b>{{ k }}</b><span>{{ v[theme].text }} / {{ v[theme].bg }}</span></div>
        </div>
      </div>
    </section>
  </main>
</template>
