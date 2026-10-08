/*
 * Public API of @blockwell/core. Everything here is documented (apps/docs) and tested; the
 * modules behind it (commands, ops, history, rendering) are internal.
 */

// The editor.
export { Editor } from './editor.js';
export type { EditorOptions, EditorEvents, EditorAction, Feedback, HighlightRange, KeyHandler, SlashState, Upload, UploadResult } from './editor.js';
// Transactions, for custom commands: `const tr = editor.state.tr(); …; editor.dispatch(tr)`.
export { EditorState, Tr } from './state.js';
export type { ApplyResult } from './state.js';

// Working with documents.
export { getBlock, locate, textBlocks, allBlocks, ancestors, newId, caret } from './model.js';
export { LINK_SCHEMES, IMAGE_SCHEMES } from './commands.js';
export { diffDocs } from './diff.js';
export type { BlockChange, DocDiff } from './diff.js';

// Bringing content in: old HTML (migration) and Markdown.
export { convertHtml } from './paste.js';
export type { PasteIssue, PasteReport } from './paste.js';
export { parseMarkdown } from './markdown.js';
export type { MarkdownResult } from './markdown.js';

// Colours: the palette tokens and their CSS for each output target.
export { PALETTE_COLORS, paletteCss } from './palette.js';
export type { PaletteTarget } from './palette.js';

export type * from './types.js';
