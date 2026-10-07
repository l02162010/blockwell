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
  turnInto: [string, string];
  align: [string, string];
  alignments: Record<'left' | 'center' | 'right', string>;
  imageAlign: Record<'left' | 'center' | 'full', string>;
  conversionWarning: (marks: number, types: string[], mentions: number) => [string, string];
  inlineCodeHint: [string, string];
  members: [string, string];
  membersNote: string;
  ruleApplied: (label: string) => string;
  ruleRevert: string;
  shortcutsTitle: [string, string];
  shortcutsSearch: string;
  shortcutGroups: { zh: string; en: string; items: [string, string, string][] }[];
  feedback: {
    length: (n: number) => [string, string];
    lengthAction: string;
    imageSrc: [string, string];
    imageSrcAction: string;
    unsupported: (n: number) => [string, string];
    unsupportedAction: string;
    invalid: [string, string];
    supported: string;
  };
  pasteSources: Record<'html' | 'gdocs' | 'word' | 'markdown' | 'blockwell' | 'text', [string, string]>;
  pasteCounts: (counts: Record<string, number>, prefix: string) => string;
  removedKinds: Record<string, string>;
  keepSource: string;
  insertSheet: [string, string];
  search: string;
  searchPlaceholder: string;
  swipe: string;
  tableBar: { addRow: string; addCol: string; delete: string; more: string };
  emptyHint: string;
  onboarding: { items: [string, string, string][]; dismiss: string };
  placeholders: Partial<Record<BlockKind, string>>;
  copied: string;
  saveStatus: Record<'saving' | 'saved' | 'offline' | 'error', string>;
  saveFailed: (index: number, field: string) => [string, string];
  gotoBlock: string;
  retry: string;
  offlineBanner: [string, string];
  pending: (n: number) => string;
  virtualized: (n: number) => string;
  printAll: string;
  presence: { online: (n: number) => [string, string]; you: string; jump: string; follow: [string, string] };
  comments: { title: [string, string]; reply: string; resolve: string };
  history: { title: [string, string]; added: string; removed: string; restore: string };
  close: string;
  tokenNames: Record<string, string>;
  announce: (what: string, on: boolean) => string;
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
  turnInto: ['轉換為', 'Turn into'],
  align: ['對齊', 'Align'],
  alignments: { left: '靠左 Left', center: '置中 Center', right: '靠右 Right' },
  imageAlign: { left: '靠左 Left', center: '置中 Center', full: '滿版 Full width' },
  conversionWarning: (marks, types, mentions) => {
    const names: Record<string, string> = { bold: '粗體', italic: '斜體', underline: '底線', strike: '刪除線', code: '行內程式碼', link: '連結', color: '顏色', highlight: '背景色' };
    const zh = [marks ? `${marks} 個樣式（${types.map((t) => names[t] ?? t).join('、')}）` : '', mentions ? `${mentions} 個提及` : ''].filter(Boolean).join('與 ');
    return [`會清除此段的 ${zh}`, mentions ? 'Marks and mentions will be removed' : 'Marks will be removed'];
  },
  inlineCodeHint: ['行內程式碼不可疊加其他樣式', 'Inline code excludes other marks'],
  members: ['成員', 'Members'],
  membersNote: '文件只存使用者 ID · Stores user ID only',
  ruleApplied: (label) => `已轉為${label}`,
  ruleRevert: '還原為文字',
  shortcutsTitle: ['鍵盤快捷鍵', 'Keyboard shortcuts'],
  shortcutsSearch: '搜尋指令… Search commands',
  shortcutGroups: [
    { zh: '文字樣式', en: 'Text', items: [['粗體', 'Bold', '⌘ B'], ['斜體', 'Italic', '⌘ I'], ['底線', 'Underline', '⌘ U'], ['刪除線', 'Strike', '⌘ ⇧ X'], ['行內程式碼', 'Inline code', '⌘ E'], ['連結', 'Link', '⌘ K']] },
    { zh: '區塊', en: 'Blocks', items: [['標題 1–3', 'Heading', '⌘ ⌥ 1–3'], ['項目清單', 'Bulleted', '⌘ ⇧ 8'], ['有序清單', 'Numbered', '⌘ ⇧ 7'], ['待辦', 'To-do', '⌘ ⇧ 9'], ['縮排／凸排', 'Indent', 'Tab / ⇧ Tab']] },
    { zh: '編輯', en: 'Editing', items: [['復原', 'Undo', '⌘ Z'], ['重做', 'Redo', '⌘ ⇧ Z'], ['斜線指令', 'Commands', '/'], ['軟換行', 'Line break', '⇧ ↵'], ['搜尋', 'Find', '⌘ F'], ['快捷鍵一覽', 'Shortcuts', '⌘ /']] },
  ],
  feedback: {
    length: (n) => [`已達單一區塊上限，多出的 ${n.toLocaleString('en-US')} 字未插入`, `Block limit reached, ${n.toLocaleString('en-US')} chars not inserted`],
    lengthAction: '貼到新段落',
    imageSrc: ['不接受此圖片來源，只允許自家 CDN 或 https', 'Image source not allowed'],
    imageSrcAction: '上傳圖片',
    unsupported: (n) => [`已略過 ${n} 個嵌入內容（不在 schema 中）`, `Skipped ${n} embed${n > 1 ? 's' : ''} not in schema`],
    unsupportedAction: '支援清單',
    invalid: ['這個變更不符合 schema，已取消', 'Change rejected by the schema'],
    supported: '段落、標題、清單、待辦、引言、程式碼、分隔線、圖片、表格',
  },
  pasteSources: {
    html: ['已清理貼上內容', 'Pasted clean'],
    gdocs: ['從 Google 文件貼上', 'Google Docs'],
    word: ['從 Word 貼上', 'Word'],
    markdown: ['偵測到 Markdown', 'Markdown'],
    blockwell: ['已貼上', 'Pasted'],
    text: ['已貼上純文字', 'Plain text'],
  },
  pasteCounts: (counts, prefix) => {
    const names: Record<string, string> = { heading: '標題', list: '清單', table: '表格', code: '程式碼', quote: '引言', image: '圖片', divider: '分隔線' };
    const parts = Object.entries(counts).map(([k, n]) => `${names[k] ?? k} ${n}`);
    return parts.length ? `${prefix} ${parts.join('、')}` : '';
  },
  removedKinds: { font: '字型', 'line-height': '行距', mso: 'mso 樣式', comments: '註解', color: '顏色', style: 'style', class: 'class' },
  keepSource: '保留原文',
  insertSheet: ['插入區塊', 'Insert'],
  search: '搜尋 Search',
  searchPlaceholder: '搜尋文件 · Find in document',
  swipe: '左右滑動',
  tableBar: { addRow: '加列', addCol: '加欄', delete: '刪除', more: '更多' },
  emptyHint: '開始寫作，或輸入 / 插入區塊',
  onboarding: {
    items: [['/', '插入任何區塊', 'Insert block'], ['# 空格', '標題', 'Heading'], ['- 空格', '項目清單', 'List'], ['[] 空格', '待辦', 'To-do']],
    dismiss: '不再顯示',
  },
  placeholders: {
    heading1: '標題 1 · Heading 1',
    heading2: '標題 2 · Heading 2',
    heading3: '標題 3 · Heading 3',
    bullet: '清單項目 · List',
    ordered: '清單項目 · List',
    todo: '待辦事項 · To-do',
    quote: '引言 · Quote',
  },
  copied: '已複製 Copied',
  saveStatus: { saving: '儲存中 Saving…', saved: '已儲存 · Saved', offline: '離線 · Offline', error: '未儲存 · Not saved' },
  saveFailed: (index, field) => [`無法儲存：第 ${index} 個區塊的${field}不合法`, `Save failed: invalid ${field === '連結網址' ? 'link' : 'content'} in block ${index}`],
  gotoBlock: '前往區塊',
  retry: '重試',
  offlineBanner: ['離線中，變更保存在這台裝置，連線後自動同步', 'Changes sync on reconnect'],
  pending: (n) => `${n} 筆變更待同步`,
  virtualized: (n) => `${n.toLocaleString('en-US')} 個區塊 · 已啟用虛擬化`,
  printAll: '列印時渲染全部',
  presence: { online: (n) => [`${n} 人在線`, `${n} online`], you: '（你）', jump: '前往', follow: ['跟隨游標', 'Follow'] },
  comments: { title: ['留言', 'Comments'], reply: '回覆… Reply', resolve: '解決 · Resolve' },
  history: { title: ['版本紀錄', 'History'], added: '新增', removed: '刪除', restore: '還原此版本 · Restore' },
  close: '關閉 Close',
  tokenNames: {
    default: '預設 default', gray: '灰色 gray', brown: '棕色 brown', red: '紅色 red', orange: '橙色 orange', yellow: '黃色 yellow',
    green: '綠色 green', teal: '藍綠色 teal', cyan: '青色 cyan', blue: '藍色 blue', purple: '紫色 purple', pink: '粉紅色 pink',
  },
  announce: (what, on) => {
    const names: Record<string, string> = { bold: '粗體', italic: '斜體', underline: '底線', strike: '刪除線', code: '行內程式碼', link: '連結', color: '文字色', highlight: '背景色' };
    const kinds: Record<string, string> = { paragraph: '內文', heading1: '標題 1', heading2: '標題 2', heading3: '標題 3', bullet: '項目清單', ordered: '有序清單', todo: '待辦清單', quote: '引言', code: '程式碼區塊' };
    if (kinds[what]) return `已轉為${kinds[what]}`;
    const [type, token] = what.split(':');
    const name = names[type!] ?? type;
    return on ? `已套用${token ? `${token} ` : ''}${name}` : `已移除${name}`;
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
