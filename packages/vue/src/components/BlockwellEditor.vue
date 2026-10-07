<script setup lang="ts">
import { Editor, type Doc, type EditorOptions, type HighlightRange } from '@blockwell/core';
import { computed, markRaw, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { kbd, provideBlockwell } from '../composables.js';
import { defaultMessages, type Messages } from '../messages.js';
import AlignMenu from './AlignMenu.vue';
import Announcer from './Announcer.vue';
import BlockHandles from './BlockHandles.vue';
import BlockActionsMenu from './BlockActionsMenu.vue';
import BwIcon from './BwIcon.vue';
import BlockKindMenu from './BlockKindMenu.vue';
import BubbleMenu from './BubbleMenu.vue';
import CodeLanguageMenu from './CodeLanguageMenu.vue';
import ColorPalette from './ColorPalette.vue';
import CommentBadges from './CommentBadges.vue';
import DiffView from './DiffView.vue';
import EditorContent from './EditorContent.vue';
import EmptyState from './EmptyState.vue';
import FeedbackNote from './FeedbackNote.vue';
import ImageToolbar from './ImageToolbar.vue';
import LinkPopover from './LinkPopover.vue';
import MentionMenu, { type Member } from './MentionMenu.vue';
import PasteToast from './PasteToast.vue';
import RemoteCursors, { type RemoteCursor } from './RemoteCursors.vue';
import RuleHint from './RuleHint.vue';
import SearchBar from './SearchBar.vue';
import ShortcutsDialog from './ShortcutsDialog.vue';
import Skeleton from './Skeleton.vue';
import SlashMenu from './SlashMenu.vue';
import SlashSheet from './SlashSheet.vue';
import StatusBanner from './StatusBanner.vue';
import TableControls from './TableControls.vue';
import Toolbar from './Toolbar.vue';
import UploadList from './UploadList.vue';

const props = withDefaults(
  defineProps<{
    modelValue?: Doc | null;
    /** `page`: full document. `field`: a form field replacing a rich textarea. `comment`: inline styles only. */
    variant?: 'page' | 'field' | 'comment';
    editable?: boolean;
    placeholder?: string;
    allowedBlocks?: readonly string[];
    uploadImage?: EditorOptions['uploadImage'];
    mentionLabel?: EditorOptions['mentionLabel'];
    /** Enables `@` mentions: looks up members for the picker. Documents store only the id. */
    mentionSearch?: (query: string) => Member[] | Promise<Member[]>;
    messages?: Partial<Messages>;
    /** Character limit shown by the field variant's counter. */
    maxLength?: number;
    /** Markdown shortcut hint shown by the field variant. */
    hint?: string;
    cursors?: RemoteCursor[];
    /** Shows a comment button in the selection bar. */
    comments?: boolean;
    /** Comment counts per block, shown as badges. */
    commentCounts?: Record<string, number>;
    /** Named text highlights, e.g. `{ comment: [...] }`, styled with `::highlight(bw-<name>)`. */
    highlights?: Record<string, HighlightRange[]>;
    /** Shows a skeleton instead of the content while the document loads. */
    loading?: boolean;
    /** The server refused the last save; `path` is its validator's JSON pointer. */
    saveError?: { path?: string } | null;
    /** Offline with queued changes. */
    offline?: { pending: number } | null;
    /** When set, shows a read-only diff of the document against this earlier version. */
    diffBase?: Doc | null;
    /** First-run tips in an empty page document. */
    onboarding?: boolean;
    /** Shows the page variant's top toolbar (the floating bar and slash menu stay). */
    toolbar?: boolean;
    /** Below this width the page toolbar moves above the keyboard. */
    mobileBreakpoint?: number;
    /** `mobile` forces the narrow layout with the toolbar inside the editor (for previews). */
    layout?: 'auto' | 'mobile';
    /** Milliseconds to wait before emitting `update:modelValue` (engine guide §8). */
    debounce?: number;
  }>(),
  {
    variant: 'page',
    editable: true,
    debounce: 300,
    mobileBreakpoint: 640,
    layout: 'auto',
    onboarding: true,
    toolbar: true,
    cursors: () => [],
    commentCounts: () => ({}),
    highlights: () => ({}),
  },
);
const emit = defineEmits<{
  'update:modelValue': [doc: Doc];
  ready: [editor: Editor];
  submit: [doc: Doc];
  comment: [];
  'comment-open': [block: string];
  mention: [];
  retry: [];
  /** The first-run tips were hidden; set `onboarding` to false from now on to remember it. */
  'onboarding-dismiss': [];
}>();

const messages: Messages = { ...defaultMessages, ...props.messages };
const allowed = props.allowedBlocks ?? (props.variant === 'comment' ? ['paragraph'] : undefined);
const editor = shallowRef(
  markRaw(
    new Editor({
      ...(props.modelValue ? { doc: props.modelValue } : {}),
      editable: props.editable,
      ...(allowed ? { allowedBlocks: allowed } : {}),
      // A custom placeholder is for the empty document; empty lines keep the "type /" hint.
      placeholder: props.variant === 'page' ? messages.placeholder : '',
      emptyPlaceholder: props.placeholder ?? (props.variant === 'comment' ? messages.reply : props.variant === 'page' ? messages.emptyHint : messages.placeholder),
      placeholders: messages.placeholders,
      copiedLabel: messages.copied,
      mentions: !!props.mentionSearch,
      languageLabel: (l) => messages.languages[l] ?? l,
      ...(props.uploadImage ? { uploadImage: props.uploadImage } : {}),
      ...(props.mentionLabel ? { mentionLabel: props.mentionLabel } : {}),
    }),
  ),
);
const ctx = provideBlockwell(editor, messages);
const ed = () => editor.value;

// v-model: debounced out, and a changed value from outside replaces the document.
let timer = 0;
let lastEmitted: Doc | null = props.modelValue ?? null;
const flush = () => {
  clearTimeout(timer);
  timer = 0;
  lastEmitted = ed().getJSON();
  emit('update:modelValue', lastEmitted);
};
watch(
  () => props.modelValue,
  (doc) => {
    if (!doc || doc === lastEmitted || doc === ed().getJSON()) return;
    lastEmitted = doc;
    ed().setDoc(doc);
  },
);
watch(
  () => props.editable,
  (v) => ed().setEditable(v),
);
watch(
  () => props.highlights,
  (h, prev) => {
    for (const name of Object.keys(prev ?? {})) if (!(name in h)) ed().setHighlights(name, []);
    for (const [name, ranges] of Object.entries(h)) ed().setHighlights(name, ranges);
  },
  { immediate: true, deep: true },
);

const focused = ref(false);
const slash = shallowRef(ed().slash);
const mention = shallowRef(ed().mention);
const searchOpen = ref(false);
const shortcutsOpen = ref(false);
const searchSeed = ref({ text: '', n: 0 });
const offs = [
  ed().on('change', () => {
    clearTimeout(timer);
    timer = window.setTimeout(flush, props.debounce);
  }),
  ed().on('focus', () => (focused.value = true)),
  ed().on('blur', () => {
    focused.value = false;
    if (timer) flush();
  }),
  ed().on('slash', (e) => (slash.value = e.slash)),
  ed().on('mention', (e) => (mention.value = e.mention)),
  ed().on('action', (a) => {
    if (a.type === 'link') ctx.open('link', () => ed().selectionBounds(), { source: 'editor' });
    else if (a.type === 'code-language') {
      ctx.open('codeLanguage', () => ed().blockElement(a.block)?.querySelector('.bw-code-lang')?.getBoundingClientRect() ?? null, { block: a.block });
    } else if (a.type === 'shortcuts') shortcutsOpen.value = true;
    else if (a.type === 'search' && props.variant === 'page') {
      // Opening again (search already open) goes back to the field; a selection seeds the query.
      searchSeed.value = { text: ed().selectedText().slice(0, 100), n: searchSeed.value.n + 1 };
      searchOpen.value = true;
    }
    else if (a.type === 'escape') ctx.close();
  }),
  ed().on('refuse', (e) => {
    const el = e.block ? ed().blockElement(e.block) : null;
    if (!el) return;
    el.classList.remove('bw-shake');
    void el.offsetWidth;
    el.classList.add('bw-shake');
  }),
];
if (props.variant === 'comment') {
  offs.push(
    ed().addKeyHandler((e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        submit();
        return true;
      }
      return false;
    }),
  );
}
const submit = () => {
  if (timer) flush();
  emit('submit', ed().getJSON());
};

/** "前往區塊": scroll to the block the server rejected and mark it. */
const gotoError = (index: number) => {
  const block = ed().getJSON().blocks[index];
  if (!block) return;
  ed().revealBlock(block.id, { select: true });
  ed().setBlockClasses('error', { [block.id]: 'bw-error-block' });
};
watch(
  () => props.saveError,
  (e) => !e && ed().setBlockClasses('error', {}),
);

// Narrow screens: one toolbar above the keyboard, menus as bottom sheets (design 02b).
const narrow = ref(false);
const keyboardOffset = ref(0);
let mq: MediaQueryList | null = null;
const onMq = () => (narrow.value = props.layout === 'mobile' || !!mq?.matches);
watch(narrow, (v) => (ctx.narrow.value = v), { immediate: true });
watch(focused, (v) => (ctx.focused.value = v));
const onViewport = () => {
  const vv = window.visualViewport;
  keyboardOffset.value = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
};
onMounted(() => {
  mq = window.matchMedia(`(max-width: ${props.mobileBreakpoint}px)`);
  onMq();
  mq.addEventListener('change', onMq);
  window.visualViewport?.addEventListener('resize', onViewport);
  window.visualViewport?.addEventListener('scroll', onViewport);
  emit('ready', ed());
});
onBeforeUnmount(() => {
  if (timer) flush();
  offs.forEach((f) => f());
  mq?.removeEventListener('change', onMq);
  window.visualViewport?.removeEventListener('resize', onViewport);
  window.visualViewport?.removeEventListener('scroll', onViewport);
});

const count = computed(() => {
  void ctx.version.value;
  return ed().characterCount();
});
const isEmpty = computed(() => {
  void ctx.version.value;
  const blocks = ed().getJSON().blocks;
  return blocks.length === 1 && blocks[0]!.type === 'paragraph' && !blocks[0]!.text;
});
const stats = computed(() => {
  void ctx.version.value;
  return ed().stats();
});
const commentOpen = computed(() => focused.value || count.value > 0 || ctx.ui.popover !== null);
const isPage = computed(() => props.variant === 'page');
const showPageToolbar = computed(() => isPage.value && props.toolbar && props.editable && !narrow.value && !props.diffBase);
// Like a phone's keyboard bar: only while editing, so it never looks active when it is not.
const showMobileToolbar = computed(() => isPage.value && props.editable && narrow.value && focused.value);
const fmt = (n: number) => n.toLocaleString('en-US');

/** A click in the empty space below the document continues it, like a word processor. */
function onBlankMouseDown(e: MouseEvent) {
  const t = e.target as Element;
  if (e.button !== 0 || !props.editable || props.loading || props.diffBase) return;
  if (t.closest('.bw-editor, button, a, input, textarea, select, [role], [contenteditable]')) return;
  const ed = editor.value;
  const last = ed.getJSON().blocks.at(-1);
  const lastEl = last && ed.blockElement(last.id);
  if (!lastEl) return;
  e.preventDefault();
  if (e.clientY > lastEl.getBoundingClientRect().bottom) return ed.focusEnd();
  // Beside the text column: put the caret on the nearest line, as if the click were inside.
  const dom = ed.dom;
  const r = dom?.getBoundingClientRect();
  const doc = dom?.ownerDocument as (Document & { caretRangeFromPoint?(x: number, y: number): Range | null }) | undefined;
  if (!dom || !r || !doc?.caretRangeFromPoint) return;
  const x = Math.min(Math.max(e.clientX, r.left + 1), r.right - 1);
  const range = doc.caretRangeFromPoint(x, e.clientY);
  if (!range || !dom.contains(range.startContainer)) return;
  dom.focus({ preventScroll: true });
  const sel = doc.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

defineExpose({ editor, submit });
</script>

<template>
  <div
    class="bw-root"
    :class="[
      `bw-${variant}`,
      { 'bw-focused': focused, 'bw-is-readonly': !editable, 'bw-narrow': narrow, 'bw-comment-open': variant === 'comment' && commentOpen },
    ]"
  >
    <Toolbar v-if="showPageToolbar" variant="page" />
    <!-- Comparing versions: a bar where the toolbar was, so the page does not jump. -->
    <div v-else-if="isPage && toolbar && diffBase && !narrow" class="bw-toolbar bw-toolbar-page bw-diff-bar">
      <BwIcon name="history" :size="18" />{{ messages.history.viewing }}
    </div>
    <Toolbar v-if="variant === 'field' && editable" variant="field" />
    <StatusBanner v-if="saveError" kind="error" :path="saveError.path" @goto="gotoError" @retry="emit('retry')" />
    <StatusBanner v-else-if="offline" kind="offline" :pending="offline.pending" />
    <SearchBar v-if="searchOpen" :seed="searchSeed" @close="searchOpen = false" />

    <div class="bw-body">
      <div class="bw-scroll" @mousedown="onBlankMouseDown">
        <div class="bw-doc">
          <slot name="before" />
          <Skeleton v-if="loading" />
          <DiffView v-else-if="diffBase" :base="diffBase" :current="editor.getJSON()" :mention-label="mentionLabel" />
          <EditorContent v-show="!loading && !diffBase" :editor="editor" class="bw-content" />
          <EmptyState v-if="isPage && editable && onboarding && isEmpty && !loading && !diffBase" @dismiss="emit('onboarding-dismiss')" />
          <slot name="after" />
        </div>
      </div>
      <slot name="aside" />
    </div>

    <div v-if="isPage && stats.virtual" class="bw-statusbar">
      <span>{{ messages.virtualized(stats.blocks) }}</span><span>{{ messages.printAll }}</span>
    </div>

    <div v-if="variant === 'field'" class="bw-field-foot">
      <span class="bw-mono bw-field-hint">{{ hint ?? '# - [] > ```' }}</span>
      <span class="bw-mono" :class="{ 'bw-over': maxLength && count > maxLength }">{{ fmt(count) }}<template v-if="maxLength"> / {{ fmt(maxLength) }}</template></span>
    </div>

    <Toolbar v-if="variant === 'comment' && editable && commentOpen" variant="comment" @mention="emit('mention')">
      <template #end>
        <span class="bw-kbd-hint">{{ kbd('⌘↵') }}</span>
        <button type="button" class="bw-btn bw-btn-dark" :disabled="isEmpty" @mousedown.prevent @click="submit">{{ messages.send }}</button>
      </template>
    </Toolbar>

    <div
      v-if="showMobileToolbar"
      class="bw-mobile-bar"
      :class="{ 'bw-mobile-inline': layout === 'mobile' }"
      :style="layout === 'mobile' ? undefined : { bottom: `${keyboardOffset}px` }"
    >
      <Toolbar variant="mobile" />
    </div>

    <!-- Floating UI -->
    <BubbleMenu v-if="editable && !narrow" :comments="comments" @comment="emit('comment')" />
    <ImageToolbar v-if="editable" />
    <TableControls v-if="editable && !narrow" />
    <BlockHandles v-if="isPage && editable && !narrow" />
    <template v-if="narrow">
      <SlashSheet v-if="slash" mode="slash" :query="slash.query" />
      <SlashSheet v-if="ctx.ui.popover === 'insert'" mode="insert" />
    </template>
    <template v-else>
      <SlashMenu v-if="slash" mode="slash" :query="slash.query" />
      <SlashMenu v-if="ctx.ui.popover === 'insert'" mode="insert" />
    </template>
    <MentionMenu v-if="mention && mentionSearch" :query="mention.query" :search="mentionSearch" />
    <BlockKindMenu v-if="ctx.ui.popover === 'block'" />
    <BlockActionsMenu v-if="ctx.ui.popover === 'blockActions'" :key="ctx.ui.block ?? ''" />
    <AlignMenu v-if="ctx.ui.popover === 'align'" />
    <ColorPalette v-if="ctx.ui.popover === 'color'" />
    <LinkPopover v-if="ctx.ui.popover === 'link'" />
    <CodeLanguageMenu v-if="ctx.ui.popover === 'codeLanguage'" :key="ctx.ui.block ?? ''" />
    <TableControls v-if="narrow && (ctx.ui.popover === 'tableRow' || ctx.ui.popover === 'tableColumn')" />
    <RemoteCursors v-if="cursors.length && editable && !diffBase" :cursors="cursors" />
    <CommentBadges v-if="Object.keys(commentCounts).length && !diffBase" :counts="commentCounts" @open="emit('comment-open', $event)" />
    <RuleHint />
    <FeedbackNote />
    <UploadList />
    <PasteToast />
    <Announcer />
    <ShortcutsDialog v-if="shortcutsOpen" @close="shortcutsOpen = false" />
  </div>
</template>
