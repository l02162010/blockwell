<script setup lang="ts">
import { convertHtml, type Doc } from '@blockwell/core';
import { BlockwellEditor } from '@blockwell/vue';
import { computed, ref, shallowRef, watch } from 'vue';
import palette from '../../../spec/palette.json';
import JsonView from './JsonView.vue';
import { heroDoc, nastyHtml, server, usage } from './content';

const REPO = 'https://github.com/l02162010/blockwell';
const base = import.meta.env.BASE_URL;
const PLAYGROUND = `${base}playground/`;

const theme = ref(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
watch(theme, (t) => {
  document.documentElement.setAttribute('data-theme', t);
  try {
    localStorage.setItem('bw-theme', t);
  } catch {
    /* storage may be blocked */
  }
});

const doc = shallowRef<Doc>(heroDoc());
const tab = ref<'json' | 'editor'>('editor');
const bytes = computed(() => new TextEncoder().encode(JSON.stringify(doc.value)).length);
const reset = () => (doc.value = heroDoc());

const html = ref(nastyHtml);
const converted = computed(() => convertHtml(html.value));
const findings = computed(() => {
  const r = converted.value.report;
  const out: string[] = [];
  if (r.droppedAttrs.length) out.push(`移除屬性：${r.droppedAttrs.join('、')}`);
  if (r.unsafeUrls) out.push(`擋下 ${r.unsafeUrls} 個不安全的網址`);
  if (r.unknownElements) out.push(`${r.unknownElements} 個未知標籤只保留文字`);
  if (r.skipped) out.push(`略過 ${r.skipped} 個嵌入內容`);
  for (const i of r.issues) if (i.code === 'color-dropped') out.push(`${i.count} 處非色盤顏色被捨棄`);
  return out;
});

const tokens = Object.keys(palette.tokens);

const features = [
  ['keyboard', '中文輸入法友善', '注音、倉頡、拼音與手寫輸入在組字結束後才寫入模型，Safari 與 Chrome 的事件順序差異都處理好了。'],
  ['bolt', 'Markdown 快捷輸入', '輸入 ## 、- 、1. 、[] 、``` 直接轉換；立刻按 Backspace 就還原成原文。'],
  ['content_paste', '聰明的貼上', '辨識 Google 文件、Word、Markdown 與一般網頁，只保留 schema 允許的格式，並告訴你移除了什麼。'],
  ['view_agenda', '大型文件', '超過 2,000 個區塊自動虛擬化，3,000+ 段落仍然順暢，搜尋直接在模型上執行。'],
  ['accessibility_new', '無障礙', '工具列 roving tabindex、選單 aria-activedescendant、狀態變化由 live region 朗讀，⌘/ 列出所有快捷鍵。'],
  ['group', '協作介面', '在線成員、遠端游標、留言、版本差異與離線佇列都是元件，資料由你的後端提供。'],
  ['dark_mode', '深色模式與列印', '色盤 token 在淺色、深色、列印三種輸出各有一組經過對比檢查的色值。'],
  ['translate', '四種後端，一份規格', 'TypeScript、Go、C#、Rust 驗證器共用同一份 conformance 測試，伺服器端也能拒絕不合法的文件。'],
] as const;

</script>

<template>
  <div class="site">
    <nav class="nav">
      <a class="brand" href="#top">
        <img :src="`${base}favicon.svg`" alt="" width="24" height="24" />
        Blockwell
      </a>
      <div class="nav-links">
        <a href="#why">為什麼</a>
        <a href="#security">安全模型</a>
        <a href="#features">功能</a>
        <a href="#start">開始使用</a>
        <a :href="PLAYGROUND">Playground</a>
      </div>
      <div class="nav-actions">
        <button
          type="button"
          class="icon-btn"
          :aria-label="theme === 'dark' ? '切換到淺色' : '切換到深色'"
          @click="theme = theme === 'dark' ? 'light' : 'dark'"
        >
          <span class="material-symbols-rounded">{{ theme === 'dark' ? 'light_mode' : 'dark_mode' }}</span>
        </button>
        <a class="btn btn-ghost" :href="REPO" target="_blank" rel="noopener">GitHub</a>
      </div>
    </nav>

    <header id="top" class="hero">
      <div class="hero-copy">
        <div class="eyebrow">Open source · MIT · Vue 3</div>
        <h1>富文本，<br />不存 HTML。</h1>
        <p class="lead">
          Blockwell 是區塊式富文本編輯器。文件是結構化 JSON，schema 白名單就是安全邊界——不需要 sanitizer，XSS 從格式本身就不存在。
        </p>
        <div class="cta">
          <a class="btn btn-primary" href="#demo">直接試試看</a>
          <a class="btn" :href="PLAYGROUND">完整 Playground</a>
        </div>
      </div>
    </header>

    <section id="demo" class="demo">
      <div class="demo-tabs" role="tablist" aria-label="檢視">
        <button type="button" role="tab" :aria-selected="tab === 'editor'" @click="tab = 'editor'">編輯器</button>
        <button type="button" role="tab" :aria-selected="tab === 'json'" @click="tab = 'json'">JSON</button>
      </div>
      <div class="demo-grid" :data-tab="tab">
        <div class="demo-editor">
          <BlockwellEditor v-model="doc" :debounce="120" :onboarding="false" />
        </div>
        <aside class="demo-json" aria-label="即時 JSON">
          <div class="json-head">
            <span>document.json</span>
            <span class="muted">{{ doc.blocks.length }} blocks · {{ bytes.toLocaleString() }} B</span>
            <button type="button" class="link-btn" @click="reset">重設</button>
          </div>
          <JsonView :value="doc" />
        </aside>
      </div>
      <p class="demo-hint">
        試試：選取文字套用顏色、輸入 <kbd>/</kbd> 插入區塊、<kbd>##</kbd> 加空白變標題、<kbd>⌘</kbd><kbd>/</kbd> 看快捷鍵。右邊就是存進資料庫的內容。
      </p>
    </section>

    <section id="why" class="section">
      <h2>為什麼不直接存 HTML？</h2>
      <div class="three">
        <div class="pillar">
          <div class="num">01</div>
          <h3>JSON 是唯一真相</h3>
          <p>HTML、Email、PDF、Excel 都從同一份 JSON 產生。換版型、換前端框架，資料不用遷移。</p>
        </div>
        <div class="pillar">
          <div class="num">02</div>
          <h3>schema 即安全邊界</h3>
          <p>沒寫在 <code>spec/schema.json</code> 的東西一律拒絕。顏色是 token 不是 CSS，連結先檢查協定，前後端用同一套規則。</p>
        </div>
        <div class="pillar">
          <div class="num">03</div>
          <h3>渲染只產生文字</h3>
          <p>渲染器用 <code>createElement</code> 與 <code>textContent</code> 建構輸出，使用者內容永遠只會變成文字節點。</p>
        </div>
      </div>
    </section>

    <section id="security" class="section">
      <h2>把危險的 HTML 丟進來看看</h2>
      <p class="section-lead">這是貼上與舊資料遷移共用的轉換器 <code>convertHtml()</code>。修改左邊的 HTML，右邊即時顯示會被存下來的內容。</p>
      <div class="sec-grid">
        <label class="sec-in">
          <span class="pane-label">輸入 HTML</span>
          <textarea v-model="html" spellcheck="false" rows="12" />
        </label>
        <div class="sec-out">
          <span class="pane-label">
            輸出 JSON
            <span class="badge" :class="converted.ok ? 'ok' : 'bad'">{{ converted.ok ? '✓ 通過 schema 驗證' : '✕ 未通過驗證' }}</span>
          </span>
          <ul v-if="findings.length" class="findings">
            <li v-for="f in findings" :key="f"><span class="material-symbols-rounded">shield</span>{{ f }}</li>
          </ul>
          <JsonView :value="converted.doc" compact />
        </div>
      </div>
    </section>

    <section id="features" class="section">
      <h2>為真實文件而做</h2>
      <div class="features">
        <div v-for="[icon, title, body] in features" :key="title" class="feature">
          <span class="material-symbols-rounded feature-icon">{{ icon }}</span>
          <h3>{{ title }}</h3>
          <p>{{ body }}</p>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>11 色色盤</h2>
      <p class="section-lead">文件只存 token 名稱，例如 <code>{ "value": "cyan" }</code>。實際色值由輸出目標決定，切換深色模式看看。</p>
      <div class="swatches">
        <div v-for="t in tokens" :key="t" class="swatch">
          <span class="chip" :class="`bw-bg-${t}`"><span :class="`bw-c-${t}`">Aa</span></span>
          <code>{{ t }}</code>
        </div>
      </div>
    </section>

    <section id="start" class="section">
      <h2>開始使用</h2>
      <p class="section-lead">套件尚未發佈到 npm，目前請從原始碼使用。編輯器核心不依賴框架，Vue 3 是第一個轉接層。</p>
      <div class="code-grid">
        <figure>
          <figcaption>前端 · Vue 3</figcaption>
          <pre><code>{{ usage }}</code></pre>
        </figure>
        <figure>
          <figcaption>後端 · 寫入前驗證</figcaption>
          <pre><code>{{ server }}</code></pre>
        </figure>
      </div>
      <div class="cta">
        <a class="btn btn-primary" :href="REPO" target="_blank" rel="noopener">在 GitHub 上查看</a>
        <a class="btn" :href="`${REPO}/blob/main/spec/SPEC.md`" target="_blank" rel="noopener">閱讀規格</a>
      </div>
    </section>

    <footer class="footer">
      <span>Blockwell · MIT License</span>
      <span class="muted">早期開發中，API 可能變動。</span>
    </footer>
  </div>
</template>
