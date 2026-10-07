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
      { id: id(), type: 'image', attrs: { src: 'https://assets.example.invalid/editor-v2.png', alt: '產品截圖 · product screenshot' } },
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
