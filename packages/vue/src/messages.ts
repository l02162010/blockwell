import type { BlockKind } from '@blockwell/core';

/** UI strings. Defaults are bilingual (Traditional Chinese with English), as in the design. */
export interface Messages {
  blockKinds: Record<BlockKind, [string, string]>;
  undo: string;
  redo: string;
  bold: string;
  italic: string;
  underline: string;
  strike: string;
  code: string;
  link: string;
  color: string;
  insert: [string, string];
  slashHint: [string, string];
  placeholder: string;
  textColor: [string, string];
  highlight: [string, string];
  paletteOnly: string;
  linkInvalid: [string, string];
  linkSafe: string;
  linkRemove: string;
  linkApply: string;
  linkPlaceholder: string;
  pastedTitle: [string, string];
  pastedKept: (features: string[]) => string;
  pastedRemoved: (attrs: string[], unknown: number, unsafe: number) => string;
  pasteAsPlain: string;
  pasteUndo: string;
  slashGroups: { basic: [string, string]; lists: [string, string]; more: [string, string] };
  slashFooter: [string, string, string];
  slashEmpty: string;
  searchLanguage: string;
  languages: Record<string, string>;
  imageFit: string;
  imageAlt: [string, string];
  imageDelete: string;
  altPlaceholder: string;
  uploading: (pct: number) => string;
  uploadFailed: string;
  divider: [string, string];
  image: [string, string];
  table: [string, string];
  tableCol: { left: [string, string]; right: [string, string]; move: [string, string]; delete: [string, string] };
  tableRow: { above: [string, string]; below: [string, string]; delete: [string, string] };
  addBlock: string;
  dragBlock: string;
  send: string;
  reply: string;
  mention: string;
  indent: string;
  hideKeyboard: string;
  more: string;
  features: Record<string, string>;
}

export const defaultMessages: Messages = {
  blockKinds: {
    paragraph: ['內文', 'Text'],
    heading1: ['標題 1', 'Heading 1'],
    heading2: ['標題 2', 'Heading 2'],
    heading3: ['標題 3', 'Heading 3'],
    bullet: ['項目清單', 'Bulleted list'],
    ordered: ['有序清單', 'Numbered list'],
    todo: ['待辦清單', 'To-do'],
    quote: ['引言', 'Quote'],
    code: ['程式碼區塊', 'Code block'],
  },
  undo: '復原 Undo',
  redo: '重做 Redo',
  bold: '粗體 Bold',
  italic: '斜體 Italic',
  underline: '底線 Underline',
  strike: '刪除線 Strikethrough',
  code: '行內程式碼 Inline code',
  link: '連結 Link',
  color: '顏色 Color',
  insert: ['插入', 'Insert'],
  slashHint: ['輸入', '插入區塊'],
  placeholder: '輸入 / 插入區塊 · Type / for commands',
  textColor: ['文字色', 'Text'],
  highlight: ['背景色', 'Highlight'],
  paletteOnly: '僅提供色盤 token，不支援自訂色碼 · Palette tokens only',
  linkInvalid: ['只允許 https: 與 mailto: 連結', 'Only https: and mailto: links are allowed'],
  linkSafe: '安全連結 · 將以 noopener 開啟',
  linkRemove: '移除',
  linkApply: '套用',
  linkPlaceholder: 'https://',
  pastedTitle: ['已清理貼上內容', 'Pasted clean'],
  pastedKept: (f) => `保留 ${f.join('、')}`,
  pastedRemoved: (attrs, unknown, unsafe) =>
    '移除 ' + [...attrs, ...(unknown ? [`${unknown} 個未知元素`] : []), ...(unsafe ? [`${unsafe} 個不安全網址`] : [])].join(' · '),
  pasteAsPlain: '純文字',
  pasteUndo: '復原',
  slashGroups: { basic: ['基本', 'Basic'], lists: ['清單', 'Lists'], more: ['其他', 'More'] },
  slashFooter: ['↑↓ 選擇', '↵ 插入', 'esc 關閉'],
  slashEmpty: '沒有符合的區塊 · No matches',
  searchLanguage: '搜尋語言 Search',
  languages: {
    plaintext: '純文字 Plain',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    json: 'JSON',
    html: 'HTML',
    css: 'CSS',
    bash: 'Bash',
    python: 'Python',
    go: 'Go',
    rust: 'Rust',
    csharp: 'C#',
    java: 'Java',
    sql: 'SQL',
    yaml: 'YAML',
    markdown: 'Markdown',
  },
  imageFit: '適合寬度 Fit width',
  imageAlt: ['替代文字', 'Alt'],
  imageDelete: '刪除 Delete',
  altPlaceholder: '描述圖片內容 · Describe the image',
  uploading: (pct) => `上傳中 ${pct}%`,
  uploadFailed: '上傳失敗 · Upload failed',
  divider: ['分隔線', 'Divider'],
  image: ['圖片', 'Image'],
  table: ['表格', 'Table'],
  tableCol: {
    left: ['左側插入欄', 'Insert left'],
    right: ['右側插入欄', 'Insert right'],
    move: ['移動欄', 'Move'],
    delete: ['刪除欄', 'Delete'],
  },
  tableRow: {
    above: ['上方插入列', 'Insert above'],
    below: ['下方插入列', 'Insert below'],
    delete: ['刪除列', 'Delete'],
  },
  addBlock: '新增區塊 Add block',
  dragBlock: '拖曳移動 Drag to move',
  send: '傳送',
  reply: '回覆… Reply',
  mention: '提及 Mention',
  indent: '縮排 Indent',
  hideKeyboard: '收起鍵盤 Hide keyboard',
  more: '更多 More',
  features: {
    heading: '標題',
    bold: '粗體',
    italic: '斜體',
    underline: '底線',
    strike: '刪除線',
    code: '程式碼',
    link: '連結',
    list: '清單',
    quote: '引言',
    table: '表格',
    image: '圖片',
    divider: '分隔線',
  },
};

export interface SlashItem {
  id: string;
  group: 'basic' | 'lists' | 'more';
  icon: string;
  label: [string, string];
  /** Markdown shortcut shown on the right. */
  md: string;
  keywords: string;
  /** Block type the item creates, checked against `allowedBlocks`. */
  type: string;
  kind?: BlockKind;
}

export function slashItems(m: Messages): SlashItem[] {
  const k = m.blockKinds;
  return [
    { id: 'paragraph', group: 'basic', icon: 'notes', label: k.paragraph, md: '', keywords: 'p text paragraph', type: 'paragraph', kind: 'paragraph' },
    { id: 'heading1', group: 'basic', icon: 'format_h1', label: k.heading1, md: '#', keywords: 'h1 title heading', type: 'heading', kind: 'heading1' },
    { id: 'heading2', group: 'basic', icon: 'format_h2', label: k.heading2, md: '##', keywords: 'h2 heading', type: 'heading', kind: 'heading2' },
    { id: 'heading3', group: 'basic', icon: 'format_h3', label: k.heading3, md: '###', keywords: 'h3 heading', type: 'heading', kind: 'heading3' },
    { id: 'bullet', group: 'lists', icon: 'format_list_bulleted', label: k.bullet, md: '-', keywords: 'ul bullet list', type: 'listItem', kind: 'bullet' },
    { id: 'ordered', group: 'lists', icon: 'format_list_numbered', label: k.ordered, md: '1.', keywords: 'ol ordered numbered list', type: 'listItem', kind: 'ordered' },
    { id: 'todo', group: 'lists', icon: 'checklist', label: k.todo, md: '[]', keywords: 'todo task check', type: 'listItem', kind: 'todo' },
    { id: 'quote', group: 'more', icon: 'format_quote', label: k.quote, md: '>', keywords: 'quote blockquote', type: 'quote', kind: 'quote' },
    { id: 'code', group: 'more', icon: 'data_object', label: k.code, md: '```', keywords: 'code pre', type: 'code', kind: 'code' },
    { id: 'divider', group: 'more', icon: 'horizontal_rule', label: m.divider, md: '---', keywords: 'hr divider rule line', type: 'divider' },
    { id: 'image', group: 'more', icon: 'image', label: m.image, md: '', keywords: 'img image picture photo', type: 'image' },
    { id: 'table', group: 'more', icon: 'table', label: m.table, md: '', keywords: 'table grid', type: 'table' },
  ];
}

export const BLOCK_KIND_ICONS: Record<BlockKind, string> = {
  paragraph: 'notes',
  heading1: 'format_h1',
  heading2: 'format_h2',
  heading3: 'format_h3',
  bullet: 'format_list_bulleted',
  ordered: 'format_list_numbered',
  todo: 'checklist',
  quote: 'format_quote',
  code: 'data_object',
};
