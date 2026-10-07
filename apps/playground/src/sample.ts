import type { Attrs, Block, Doc, Entity, Mark } from '@blockwell/core';

type Part = string | { text: string; marks?: (string | [string, Attrs])[] } | { mention: string };

let n = 0;
const id = () => `s_${(++n).toString(36)}`;

/** Builds a text block from parts, computing mark and entity offsets. */
function rich(type: string, parts: Part[], attrs?: Attrs): Block {
  let text = '';
  const marks: Mark[] = [];
  const entities: Entity[] = [];
  for (const p of parts) {
    if (typeof p === 'string') text += p;
    else if ('mention' in p) {
      entities.push({ at: text.length, type: 'mention', attrs: { userId: p.mention } });
      text += '\uFFFC';
    } else {
      const from = text.length;
      text += p.text;
      for (const m of p.marks ?? []) {
        const [type, a] = typeof m === 'string' ? [m, undefined] : m;
        marks.push(a ? { type, from, to: text.length, attrs: a } : { type, from, to: text.length });
      }
    }
  }
  const b: Block = { id: id(), type, text };
  if (attrs) b.attrs = attrs;
  if (marks.length) b.marks = marks.sort((x, y) => x.from - y.from || x.type.localeCompare(y.type));
  if (entities.length) b.entities = entities;
  return b;
}

const p = (...parts: Part[]) => rich('paragraph', parts);
const todo = (text: string, checked: boolean, indent = 0) =>
  rich('listItem', [text], { style: 'todo', ...(checked ? { checked } : {}), ...(indent ? { indent } : {}) });
const cell = (...parts: Part[]): Block => ({ id: id(), type: 'tableCell', children: [p(...parts)] });
const row = (...cells: Block[]): Block => ({ id: id(), type: 'tableRow', children: cells });

export const people: Record<string, string> = { u_chen: '陳柏翰', u_lin: '林雅婷', u_mia: 'Mia' };

/** The document shown in section 01 of the spec. */
export function sampleDoc(): Doc {
  n = 0;
  return {
    version: 1,
    blocks: [
      p(
        '本季目標是以',
        { text: '結構化 JSON 文件模型', marks: [['highlight', { value: 'blue' }]] },
        '取代現有的 richtextarea，從架構上',
        { text: '消除 XSS', marks: ['bold', ['color', { value: 'red' }]] },
        '，而不是靠事後 ',
        { text: 'sanitize', marks: ['code'] },
        '。負責人 ',
        { mention: 'u_chen' },
        '。',
      ),
      rich('heading', ['里程碑 ', { text: 'Milestones', marks: [['color', { value: 'gray' }]] }], { level: 2 }),
      todo('Schema 白名單與後端驗證', true),
      todo('色盤 token 與 CSS 變數', true),
      todo('IME 手動測試矩陣', false),
      todo('macOS · Chrome、Safari', true, 1),
      todo('Windows · 微軟注音、新注音', false, 1),
      todo('協作（Yjs）', false),
      { id: id(), type: 'quote', children: [p('JSON 是唯一真相：DOM 和 HTML 都只是衍生物，可以隨時從 JSON 重建。')] },
      p(
        '完整規格見',
        { text: '引擎開發指南 §5', marks: [['link', { href: 'https://github.com/l02162010/blockwell/blob/main/spec/SPEC.md' }]] },
        '，貼上、編輯與後端存檔都經過同一份白名單驗證。',
      ),
      {
        id: id(),
        type: 'code',
        attrs: { language: 'typescript' },
        text: "export const SafeUrl = (v: string) => {\n  try {\n    const u = new URL(v);\n    return ['https:', 'mailto:'].includes(u.protocol);\n  } catch { return false; }\n};",
      },
      rich('heading', ['輸入法測試矩陣 ', { text: 'IME matrix', marks: [['color', { value: 'gray' }]] }], { level: 2 }),
      {
        id: id(),
        type: 'table',
        children: [
          row(cell('平台'), cell('瀏覽器'), cell('輸入法')),
          row(cell('macOS'), cell('Chrome、Safari'), cell('注音、倉頡')),
          row(cell('Windows'), cell('Chrome、Edge'), cell('微軟注音、新注音')),
          row(cell('iOS'), cell('Safari'), cell('注音、手寫')),
          row(cell('Android'), cell('Chrome'), cell('Gboard 注音')),
        ],
      },
      { id: id(), type: 'image', attrs: { src: 'https://picsum.photos/seed/blockwell-editor/1200/640', alt: '產品截圖 · product screenshot', width: 520 } },
      rich('paragraph', [{ text: '圖 1　新版編輯器介面', marks: [['color', { value: 'gray' }]] }], { align: 'center' }),
      { id: id(), type: 'divider' },
      p(''),
    ],
  };
}

export function cmsDoc(): Doc {
  return {
    version: 1,
    blocks: [
      p('即日起後台所有內容欄位改用新版編輯器，內容以 ', { text: 'JSON', marks: ['bold'] }, ' 儲存。'),
      rich('listItem', ['舊文章已自動轉換'], { style: 'bullet' }),
      rich('listItem', ['轉換失敗的文章列在', { text: '待處理清單', marks: [['link', { href: 'https://cms.example.com/migration/failed' }]] }], { style: 'bullet' }),
    ],
  };
}

export function mobileDoc(): Doc {
  return {
    version: 1,
    blocks: [
      rich('heading', ['上線檢查'], { level: 1 }),
      todo('iOS Safari 注音', true),
      todo('iOS 手寫輸入', false),
      todo('Gboard 注音', false),
    ],
  };
}

export const members = [
  { id: 'u_chen', name: '陳柏翰', subtitle: '前端工程師', color: 'teal' },
  { id: 'u_chen2', name: '陳怡君', subtitle: '設計師', color: 'pink' },
  { id: 'u_chen3', name: '陳志明', subtitle: '後端工程師', color: 'gray' },
  { id: 'u_lin', name: '林雅婷', subtitle: '產品經理', color: 'blue' },
  { id: 'u_mia', name: 'Mia', subtitle: 'QA', color: 'orange' },
];
Object.assign(people, { u_chen2: '陳怡君', u_chen3: '陳志明' });

/**
 * The version before the live document: without the "完整規格見…" paragraph, and with a paragraph
 * that was deleted since. The diff then shows one addition and one removal.
 */
/** Snapshots for the version-history demo, each a little older than the one before. */
export function versionSnapshots(current: Doc): Record<string, Doc> {
  const v4 = previousVersion(current);
  const v3: Doc = {
    version: 1,
    blocks: v4.blocks.map((b) =>
      b.type === 'quote' ? { ...b, children: [{ id: 'v_q', type: 'paragraph', text: '我們以 JSON 為主，畫面只是它的投影。' }] } : b,
    ),
  };
  const t = v3.blocks.findIndex((b) => b.type === 'table');
  const v2: Doc = { version: 1, blocks: v3.blocks.filter((_, i) => i !== t && i !== t - 1) };
  const v1: Doc = { version: 1, blocks: [...v2.blocks.slice(0, 2), { id: 'v_p', type: 'paragraph', text: '' }] };
  return { v4, v3, v2, v1 };
}

export function previousVersion(current: Doc): Doc {
  const blocks = current.blocks.slice();
  const i = blocks.findIndex((b) => b.text?.startsWith('完整規格見'));
  const removed: Block = { id: 'v_old', type: 'paragraph', text: '第一版先不處理行動裝置輸入法。' };
  if (i >= 0) blocks.splice(i, 1, removed);
  return { version: 1, blocks };
}

export const tableDoc = (): Doc => ({
  version: 1,
  blocks: [
    rich('heading', ['輸入法測試矩陣'], { level: 3 }),
    {
      id: id(),
      type: 'table',
      children: [
        row(cell('平台'), cell('瀏覽器'), cell('輸入法')),
        row(cell('macOS'), cell('Chrome、Safari'), cell('注音、倉頡')),
        row(cell('Windows'), cell('Chrome、Edge'), cell('微軟注音、新注音')),
        row(cell('iOS'), cell('Safari'), cell('注音、手寫')),
        row(cell('Android'), cell('Chrome'), cell('Gboard 注音')),
      ],
    },
  ],
});

export const textDoc = (text: string): Doc => ({ version: 1, blocks: [p(text)] });

/** About 3,400 blocks, to show virtualization and model-level search. */
export function largeDoc(): Doc {
  const lines = [
    'Windows 的微軟注音與新注音需分開測試。',
    'iOS Safari 的注音在組字中按 Enter 會送出。',
    'Android Gboard 的組字事件順序與桌面不同。',
    'macOS 倉頡在 mark 邊界組字時要保留粗體。',
    '組字中點擊別處，候選字不應遺失。',
  ];
  const blocks: Block[] = [];
  for (let i = 0; i < 3412; i++) {
    if (i % 40 === 0) blocks.push(rich('heading', [`第 ${i / 40 + 1} 輪測試紀錄`], { level: 2 }));
    else blocks.push(p(`${i}. ${lines[i % lines.length]}`));
  }
  return { version: 1, blocks };
}

export const pasteSamples = {
  gdocs: {
    html: '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b"><h2 dir="ltr" style="line-height:1.38"><span style="font-size:16pt;font-family:Arial">會議記錄</span></h2><ul><li dir="ltr" style="line-height:1.38"><p dir="ltr"><span style="font-family:Arial;font-weight:700">決議</span><span style="font-family:Arial">：先完成 IME 測試</span></p></li><li dir="ltr"><p dir="ltr"><span style="font-family:Arial">參考 </span><a href="https://docs.example.com/ime" style="text-decoration:none"><span style="color:#1155cc;text-decoration:underline">測試矩陣</span></a></p></li></ul></b>',
    text: '會議記錄\n決議：先完成 IME 測試\n參考 測試矩陣',
  },
  word: {
    html: '<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><p class=MsoNormal><b>上線檢查</b><o:p></o:p></p><p class=MsoListParagraphCxSpFirst style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.<span>  </span></span>iOS Safari 注音</p><p class=MsoListParagraphCxSpMiddle style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">2.<span>  </span></span>iOS 手寫輸入</p><p class=MsoListParagraphCxSpLast style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">o<span> </span></span>Gboard 注音</p><table class=MsoTableGrid><tr><td>平台</td><td>狀態</td></tr><tr><td>iOS</td><td>進行中</td></tr></table><!--[if gte mso 9]><xml></xml><![endif]--></body></html>',
    text: '上線檢查\n1. iOS Safari 注音\n2. iOS 手寫輸入',
  },
  markdown: {
    html: '',
    text: '## 下週計畫\n\n- 完成 **IME** 測試\n- 整理 `compositionend` 順序\n- [ ] Android 結果\n\n```ts\neditor.on("change", save);\n```',
  },
  embed: {
    html: '<p>拖放進來的內容含有嵌入影片。</p><iframe src="https://video.example.com/embed/1"></iframe>',
    text: '拖放進來的內容含有嵌入影片。',
  },
};

export const migrationRecords = [
  { id: 'post_1182', title: '2023 年度報告', html: '<h2>2023 年度報告</h2><p><font color="#ff0000">營收成長 12%</font></p><p><a href="javascript:void(0)">下載</a></p>' },
  { id: 'post_0937', title: '產品 FAQ', html: '<h2>產品 FAQ</h2><table><tr><td colspan="2">常見問題</td></tr><tr><td>Q</td><td>A</td></tr></table>' },
  { id: 'post_2210', title: '春季活動頁', html: '<h2>春季活動</h2><p>報名請見影片說明。</p><iframe src="https://video.example.com/spring"></iframe>' },
  {
    id: 'post_0415',
    title: '徵才公告',
    html: '<h2>徵才公告</h2>' + '<ul><li>層級'.repeat(9) + '</li></ul>'.repeat(9),
  },
];
