/**
 * Every public prop, event and slot of @blockwell/vue, checked for its effect. Layout-dependent
 * ones (cursors, commentCounts, highlights) are covered by the browser tests in apps/playground.
 */
import type { Doc, Editor } from '@blockwell/core';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { BlockwellEditor, CommentsPanel, EditorContent, HistoryPanel, PresenceMenu, SaveStatus, defaultMessages, isMac, kbd, useEditor, useEditorState } from '../src/index.js';

const p = (id: string, text: string) => ({ id, type: 'paragraph', text });
const doc = (...blocks: object[]): Doc => ({ version: 1, blocks }) as Doc;
const editorOf = (w: ReturnType<typeof mount>) => (w.vm as unknown as { editor: Editor }).editor;
const caretAt = (e: Editor, block: string, offset: number) => e.setSelection({ type: 'text', anchor: { block, offset }, focus: { block, offset } });

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('<BlockwellEditor>', () => {
  it('modelValue renders the document; ready hands over the Editor', async () => {
    const ready = vi.fn();
    const w = mount(BlockwellEditor, { props: { modelValue: doc(p('a', 'hello')), onReady: ready }, attachTo: document.body });
    expect(w.find('[data-block-id="a"]').text()).toBe('hello');
    expect(ready).toHaveBeenCalledWith(editorOf(w));
  });

  it('a new modelValue from outside replaces the content', async () => {
    const w = mount(BlockwellEditor, { props: { modelValue: doc(p('a', 'one')) }, attachTo: document.body });
    await w.setProps({ modelValue: doc(p('b', 'two')) });
    expect(w.find('[data-block-id="b"]').text()).toBe('two');
  });

  it('update:modelValue is emitted after `debounce` ms', async () => {
    vi.useFakeTimers();
    const w = mount(BlockwellEditor, { props: { modelValue: doc(p('a', 'x')), debounce: 50 }, attachTo: document.body });
    const e = editorOf(w);
    caretAt(e, 'a', 1);
    e.insertText('y');
    expect(w.emitted('update:modelValue')).toBeUndefined();
    vi.advanceTimersByTime(60);
    expect((w.emitted('update:modelValue')!.at(-1)![0] as Doc).blocks[0]!.text).toBe('xy');
  });

  it('variant changes the chrome: page has a toolbar, field a counter, comment a send button', () => {
    const page = mount(BlockwellEditor, { props: { variant: 'page' }, attachTo: document.body });
    expect(page.find('.bw-toolbar-page').exists()).toBe(true);
    const field = mount(BlockwellEditor, { props: { variant: 'field', maxLength: 100, hint: '# - [] >' }, attachTo: document.body });
    expect(field.find('.bw-field-foot').text()).toContain('/ 100');
    expect(field.find('.bw-field-hint').text()).toBe('# - [] >');
    const comment = mount(BlockwellEditor, { props: { variant: 'comment' }, attachTo: document.body });
    expect(comment.classes()).toContain('bw-comment');
  });

  it('editable=false makes it read-only and hides the toolbar', async () => {
    const w = mount(BlockwellEditor, { props: { modelValue: doc(p('a', 'x')), editable: false }, attachTo: document.body });
    expect(w.find('.bw-editor').attributes('contenteditable')).toBe('false');
    expect(w.find('.bw-toolbar-page').exists()).toBe(false);
    await w.setProps({ editable: true });
    expect(w.find('.bw-editor').attributes('contenteditable')).toBe('true');
  });

  it('toolbar=false removes the page toolbar', () => {
    const w = mount(BlockwellEditor, { props: { toolbar: false }, attachTo: document.body });
    expect(w.find('.bw-toolbar-page').exists()).toBe(false);
  });

  it('placeholder shows in an empty document', async () => {
    const w = mount(BlockwellEditor, { props: { modelValue: doc(p('a', '')), placeholder: '寫點什麼' }, attachTo: document.body });
    await nextTick();
    expect(w.find('[data-placeholder]').attributes('data-placeholder')).toBe('寫點什麼');
  });

  it('allowedBlocks limits what can be created', () => {
    const w = mount(BlockwellEditor, { props: { allowedBlocks: ['paragraph'] }, attachTo: document.body });
    const e = editorOf(w);
    expect(e.allows('paragraph')).toBe(true);
    expect(e.allows('table')).toBe(false);
  });

  it('uploadImage enables image upload', () => {
    const upload = async () => ({ src: 'https://cdn.example/a.png' });
    const w = mount(BlockwellEditor, { props: { uploadImage: upload }, attachTo: document.body });
    expect(editorOf(w).options.uploadImage).toBe(upload);
  });

  it('mentionLabel names mentions; mentionSearch enables the @ picker', async () => {
    const w = mount(BlockwellEditor, {
      props: {
        modelValue: doc({ id: 'a', type: 'paragraph', text: '￼', entities: [{ at: 0, type: 'mention', attrs: { userId: 'u_1' } }] }),
        mentionLabel: (id: string) => `名${id}`,
        mentionSearch: () => [{ id: 'u_2', name: '陳' }],
      },
      attachTo: document.body,
    });
    expect(w.find('.bw-mention').text()).toBe('@名u_1');
    expect(editorOf(w).options.mentions).toBe(true);
  });

  it('messages replaces UI strings', () => {
    const w = mount(BlockwellEditor, { props: { messages: { insert: ['新增', 'Add'] } }, attachTo: document.body });
    expect(w.find('.bw-tool-insert').text()).toContain('新增');
  });

  it('loading shows a skeleton instead of the content', () => {
    const w = mount(BlockwellEditor, { props: { loading: true }, attachTo: document.body });
    expect(w.find('.bw-skeleton').exists()).toBe(true);
  });

  it('saveError shows the error banner, and retry is emitted from it', async () => {
    const w = mount(BlockwellEditor, { props: { modelValue: doc(p('a', 'x')), saveError: { path: '/blocks/0/text' } }, attachTo: document.body });
    expect(w.find('.bw-banner-error').exists()).toBe(true);
    const retry = w.findAll('.bw-banner-error button').find((b) => b.text().includes(defaultMessages.retry));
    await retry!.trigger('click');
    expect(w.emitted('retry')).toHaveLength(1);
  });

  it('offline shows the pending count', () => {
    const w = mount(BlockwellEditor, { props: { offline: { pending: 3 } }, attachTo: document.body });
    expect(w.find('.bw-banner-offline').text()).toContain('3');
  });

  it('diffBase shows a read-only comparison', () => {
    const w = mount(BlockwellEditor, { props: { modelValue: doc(p('a', 'new')), diffBase: doc(p('a', 'old')) }, attachTo: document.body });
    expect(w.find('.bw-diff').exists()).toBe(true);
    expect(w.find('.bw-diff-bar').exists()).toBe(true);
  });

  it('onboarding tips in an empty page; onboarding-dismiss when hidden', async () => {
    const w = mount(BlockwellEditor, { props: { modelValue: doc(p('a', '')) }, attachTo: document.body });
    expect(w.find('.bw-onboarding').exists()).toBe(true);
    await w.find('.bw-onboarding-dismiss').trigger('click');
    expect(w.emitted('onboarding-dismiss')).toHaveLength(1);
    const off = mount(BlockwellEditor, { props: { modelValue: doc(p('a', '')), onboarding: false }, attachTo: document.body });
    expect(off.find('.bw-onboarding').exists()).toBe(false);
  });

  it('layout="mobile" and mobileBreakpoint switch to the phone layout', async () => {
    const w = mount(BlockwellEditor, { props: { layout: 'mobile' }, attachTo: document.body });
    await nextTick();
    expect(w.classes()).toContain('bw-narrow');
    // matchMedia is mocked to "no match": a breakpoint alone keeps the desktop layout here.
    const d = mount(BlockwellEditor, { props: { mobileBreakpoint: 900 }, attachTo: document.body });
    expect(d.classes()).not.toContain('bw-narrow');
  });

  it('comments adds the comment button; comment is emitted from it', async () => {
    const w = mount(BlockwellEditor, { props: { modelValue: doc(p('a', 'hello')), comments: true }, attachTo: document.body });
    const e = editorOf(w);
    e.dom!.tabIndex = 0;
    e.focus();
    e.setSelection({ type: 'text', anchor: { block: 'a', offset: 0 }, focus: { block: 'a', offset: 5 } });
    await nextTick();
    await w.find('.bw-bubble [aria-label*="Comment"]').trigger('click');
    expect(w.emitted('comment')).toHaveLength(1);
  });

  it('submit is emitted by the comment variant, not for an empty message', async () => {
    const w = mount(BlockwellEditor, { props: { variant: 'comment', modelValue: doc(p('a', '')) }, attachTo: document.body });
    const e = editorOf(w);
    (w.vm as unknown as { submit(): void }).submit();
    expect(w.emitted('submit')).toBeUndefined();
    caretAt(e, 'a', 0);
    e.insertText('hi');
    (w.vm as unknown as { submit(): void }).submit();
    expect((w.emitted('submit')!.at(-1)![0] as Doc).blocks[0]!.text).toBe('hi');
  });

  it('slots: before, after and aside render around the document', () => {
    const w = mount(BlockwellEditor, {
      slots: { before: () => h('h1', { class: 's-before' }, 'Title'), after: () => h('p', { class: 's-after' }), aside: () => h('aside', { class: 's-aside' }) },
      attachTo: document.body,
    });
    expect(w.find('.bw-doc > .s-before').exists()).toBe(true);
    expect(w.find('.bw-doc > .s-after').exists()).toBe(true);
    expect(w.find('.bw-body > .s-aside').exists()).toBe(true);
  });
});

describe('<SaveStatus>', () => {
  it('status, variant and label', () => {
    const w = mount(SaveStatus, { props: { status: 'error', variant: 'chip', label: '未儲存' } });
    expect(w.classes()).toEqual(expect.arrayContaining(['bw-save-error', 'bw-save-chip']));
    expect(w.text()).toContain('未儲存');
  });
});

describe('<PresenceMenu>', () => {
  const people = [
    { id: 'me', name: '林', color: 'blue', self: true },
    { id: 'u', name: '陳', color: 'teal', location: '引言' },
  ];
  it('people, jump, follow and update:follow, messages', async () => {
    const w = mount(PresenceMenu, { props: { people, follow: false, messages: { presence: { ...defaultMessages.presence, online: (n: number) => [`${n} online`, ''] as [string, string] } } }, attachTo: document.body });
    await w.find('.bw-avatars').trigger('click');
    expect(w.text()).toContain('2 online');
    await w.find('.bw-presence-menu .bw-link-btn').trigger('click');
    expect(w.emitted('jump')![0]![0]).toMatchObject({ id: 'u' });
    await w.find('.bw-avatars').trigger('click');
    await w.find('.bw-presence-menu input[type="checkbox"], .bw-presence-menu [role="switch"]').trigger('click');
    expect(w.emitted('update:follow')![0]).toEqual([true]);
  });
});

describe('<CommentsPanel>', () => {
  const thread = { id: 't', anchor: '原文', messages: [{ id: 'c', author: '陳', color: 'teal', time: '剛剛', text: '第一則' }] };
  it('thread, reply, resolve, close, messages', async () => {
    const w = mount(CommentsPanel, { props: { thread, messages: { comments: { ...defaultMessages.comments, resolve: 'Done' } } }, attachTo: document.body });
    expect(w.text()).toContain('原文');
    expect(w.text()).toContain('第一則');
    await w.find('input').setValue('回覆');
    await w.find('form').trigger('submit');
    expect(w.emitted('reply')![0]).toEqual(['回覆']);
    const resolve = w.findAll('button').find((b) => b.text().includes('Done'))!;
    await resolve.trigger('click');
    expect(w.emitted('resolve')).toHaveLength(1);
    await w.find('input').trigger('keydown', { key: 'Escape' });
    expect(w.emitted('close')).toHaveLength(1);
  });
});

describe('<HistoryPanel>', () => {
  const versions = [
    { id: 'now', time: '現在', who: '林', what: '編輯中', current: true },
    { id: 'v1', time: '昨天', who: '陳', what: '建立' },
  ];
  it('versions, selected, select, restore, close, messages', async () => {
    const w = mount(HistoryPanel, { props: { versions, selected: 'v1', messages: { history: { ...defaultMessages.history, restore: 'Restore' } } } });
    expect(w.findAll('[role="option"]')).toHaveLength(2);
    await w.findAll('[role="option"]')[0]!.trigger('click');
    expect(w.emitted('select')![0]).toEqual(['now']);
    await w.findAll('button').find((b) => b.text() === 'Restore')!.trigger('click');
    expect(w.emitted('restore')![0]).toEqual(['v1']);
    await w.find('.bw-panel-head button').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });
});

describe('headless: useEditor, useEditorState, <EditorContent>', () => {
  it('builds a working editor without the bundled UI', async () => {
    let state: ReturnType<typeof useEditorState> | null = null;
    let ed: ReturnType<typeof useEditor> | null = null;
    const App = defineComponent({
      setup() {
        ed = useEditor({ doc: doc(p('a', 'x')) });
        state = useEditorState(ed);
        return () => h(EditorContent, { editor: ed!.value });
      },
    });
    const w = mount(App, { attachTo: document.body });
    await flushPromises();
    expect(w.find('[data-block-id="a"]').text()).toBe('x');
    caretAt(ed!.value, 'a', 0);
    ed!.value.setSelection({ type: 'text', anchor: { block: 'a', offset: 0 }, focus: { block: 'a', offset: 1 } });
    ed!.value.toggleMark('bold');
    await new Promise((r) => requestAnimationFrame(r)); // the snapshot refreshes once per frame
    expect(state!.active.value?.marks.bold).toBe(true);
  });
});

describe('kbd and isMac', () => {
  it('writes shortcuts for this platform', () => {
    expect(kbd('⌘ ⇧ X')).toBe(isMac ? '⌘ ⇧ X' : 'Ctrl+Shift+X');
    expect(kbd('⌘↵')).toBe(isMac ? '⌘↵' : 'Ctrl+Enter');
  });
});
