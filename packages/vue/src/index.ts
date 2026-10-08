import 'virtual:blockwell-palette.css';
import './theme.css';

/*
 * Public API. Everything exported here works on its own; the editor's internal parts (toolbars,
 * menus, popovers, banners) live inside <BlockwellEditor> and are configured through its props.
 */

// The editor, complete with its UI.
export { default as BlockwellEditor } from './components/BlockwellEditor.vue';
export type { RemoteCursor } from './components/RemoteCursors.vue';
export type { Member } from './components/MentionMenu.vue';

// Collaboration and status UI fed by your app's data (put them in the editor's slots or anywhere).
export { default as SaveStatus } from './components/SaveStatus.vue';
export { default as PresenceMenu } from './components/PresenceMenu.vue';
export type { Person } from './components/PresenceMenu.vue';
export { default as CommentsPanel } from './components/CommentsPanel.vue';
export type { CommentMessage, CommentThread } from './components/CommentsPanel.vue';
export { default as HistoryPanel } from './components/HistoryPanel.vue';
export type { Version } from './components/HistoryPanel.vue';

// Headless: the bare editable area for a UI of your own.
export { default as EditorContent } from './components/EditorContent.vue';
export { useEditor, useEditorState, isMac, kbd } from './composables.js';

export { defaultMessages } from './messages.js';
export type { Messages } from './messages.js';
