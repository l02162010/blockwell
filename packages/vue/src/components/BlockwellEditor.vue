<script setup lang="ts">
import { Editor, type Doc, type EditorOptions } from '@blockwell/core';
import { computed, markRaw, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { provideBlockwell } from '../composables.js';
import { defaultMessages, type Messages } from '../messages.js';
import BlockHandles from './BlockHandles.vue';
import BlockKindMenu from './BlockKindMenu.vue';
import BubbleMenu from './BubbleMenu.vue';
import CodeLanguageMenu from './CodeLanguageMenu.vue';
import ColorPalette from './ColorPalette.vue';
import EditorContent from './EditorContent.vue';
import ImageToolbar from './ImageToolbar.vue';
import LinkPopover from './LinkPopover.vue';
import PasteToast from './PasteToast.vue';
import RemoteCursors, { type RemoteCursor } from './RemoteCursors.vue';
import SlashMenu from './SlashMenu.vue';
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
    messages?: Partial<Messages>;
    /** Character limit shown by the field variant's counter. */
    maxLength?: number;
    /** Markdown shortcut hint shown by the field variant. */
    hint?: string;
    cursors?: RemoteCursor[];
    /** Shows a comment button in the selection bar. */
    comments?: boolean;
    /** Below this width the page toolbar moves above the keyboard. */
    mobileBreakpoint?: number;
    /** `mobile` forces the narrow layout with the toolbar inside the editor (for previews). */
    layout?: 'auto' | 'mobile';
    /** Milliseconds to wait before emitting `update:modelValue` (engine guide §8). */
    debounce?: number;
  }>(),
  { variant: 'page', editable: true, debounce: 300, mobileBreakpoint: 640, layout: 'auto', cursors: () => [] },
);
const emit = defineEmits<{
  'update:modelValue': [doc: Doc];
  ready: [editor: Editor];
  submit: [doc: Doc];
  comment: [];
  mention: [];
}>();

const messages: Messages = { ...defaultMessages, ...props.messages };
const allowed = props.allowedBlocks ?? (props.variant === 'comment' ? ['paragraph'] : undefined);
const editor = shallowRef(
  markRaw(
    new Editor({
      ...(props.modelValue ? { doc: props.modelValue } : {}),
      editable: props.editable,
      ...(allowed ? { allowedBlocks: allowed } : {}),
      placeholder: props.placeholder ?? (props.variant === 'page' ? messages.placeholder : ''),
      emptyPlaceholder: props.placeholder ?? (props.variant === 'comment' ? messages.reply : messages.placeholder),
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
const offChange = ed().on('change', () => {
  clearTimeout(timer);
  timer = window.setTimeout(flush, props.debounce);
});
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

const focused = ref(false);
const slash = shallowRef(ed().slash);
const offs = [
  offChange,
  ed().on('focus', () => (focused.value = true)),
  ed().on('blur', () => {
    focused.value = false;
    if (timer) flush();
  }),
  ed().on('slash', (e) => (slash.value = e.slash)),
  ed().on('action', (a) => {
    if (a.type === 'link') ctx.open('link', () => ed().selectionBounds(), { source: 'editor' });
    else if (a.type === 'code-language') {
      ctx.open('codeLanguage', () => ed().blockElement(a.block)?.querySelector('.bw-code-lang')?.getBoundingClientRect() ?? null, { block: a.block });
    } else if (a.type === 'escape') ctx.close();
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

// Narrow screens: one toolbar above the keyboard instead of top bar + floating bar.
const narrow = ref(false);
const keyboardOffset = ref(0);
let mq: MediaQueryList | null = null;
const onMq = () => (narrow.value = props.layout === 'mobile' || !!mq?.matches);
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
const commentOpen = computed(() => focused.value || count.value > 0 || ctx.ui.popover !== null);
const isPage = computed(() => props.variant === 'page');
const showPageToolbar = computed(() => isPage.value && props.editable && !narrow.value);
const showMobileToolbar = computed(() => isPage.value && props.editable && narrow.value && (focused.value || props.layout === 'mobile'));
const fmt = (n: number) => n.toLocaleString('en-US');

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
    <Toolbar v-if="variant === 'field' && editable" variant="field" />

    <div class="bw-scroll">
      <div class="bw-doc">
        <slot name="before" />
        <EditorContent :editor="editor" class="bw-content" />
        <slot name="after" />
      </div>
    </div>

    <div v-if="variant === 'field'" class="bw-field-foot">
      <span class="bw-mono bw-field-hint">{{ hint ?? '# - [] > ```' }}</span>
      <span class="bw-mono" :class="{ 'bw-over': maxLength && count > maxLength }">{{ fmt(count) }}<template v-if="maxLength"> / {{ fmt(maxLength) }}</template></span>
    </div>

    <Toolbar v-if="variant === 'comment' && editable && commentOpen" variant="comment" @mention="emit('mention')">
      <template #end>
        <span class="bw-kbd-hint">⌘↵</span>
        <button type="button" class="bw-btn bw-btn-dark" @mousedown.prevent @click="submit">{{ messages.send }}</button>
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
    <TableControls v-if="editable" />
    <BlockHandles v-if="isPage && editable && !narrow" />
    <SlashMenu v-if="slash" mode="slash" :query="slash.query" />
    <SlashMenu v-if="ctx.ui.popover === 'insert'" mode="insert" />
    <BlockKindMenu v-if="ctx.ui.popover === 'block'" />
    <ColorPalette v-if="ctx.ui.popover === 'color'" />
    <LinkPopover v-if="ctx.ui.popover === 'link'" />
    <CodeLanguageMenu v-if="ctx.ui.popover === 'codeLanguage'" :key="ctx.ui.block ?? ''" />
    <RemoteCursors v-if="cursors.length && editable" :cursors="cursors" />
    <UploadList />
    <PasteToast />
  </div>
</template>
