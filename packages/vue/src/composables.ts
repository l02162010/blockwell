import { Editor, type ActiveState, type EditorOptions } from '@blockwell/core';
import {
  inject,
  markRaw,
  onBeforeUnmount,
  onMounted,
  provide,
  reactive,
  shallowRef,
  watch,
  type InjectionKey,
  type Ref,
  type ShallowRef,
} from 'vue';
import { defaultMessages, type Messages } from './messages.js';

/**
 * Creates an editor. The instance lives in a `shallowRef` and is marked raw, so Vue never proxies
 * the document (engine guide §8). It is destroyed with the component.
 */
export function useEditor(options: EditorOptions = {}): ShallowRef<Editor> {
  const editor = shallowRef(markRaw(new Editor(options)));
  onBeforeUnmount(() => editor.value.destroy());
  return editor;
}

/**
 * Toolbar state, recomputed once per editor update and stored as a plain snapshot.
 * `version` changes on every update, for things that depend on layout (floating menus).
 */
export function useEditorState(editor: Ref<Editor | null>) {
  const active = shallowRef<ActiveState | null>(null);
  const version = shallowRef(0);
  let off: (() => void) | null = null;
  let frame = 0;
  const refresh = () => {
    frame = 0;
    active.value = editor.value ? editor.value.activeState() : null;
    version.value++;
  };
  watch(
    editor,
    (ed) => {
      off?.();
      off = null;
      if (!ed) return;
      off = ed.on('update', () => {
        // Selection changes can fire many times per frame while dragging.
        if (!frame) frame = requestAnimationFrame(refresh);
      });
      refresh();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    off?.();
    if (frame) cancelAnimationFrame(frame);
  });
  return { active, version, refresh };
}

export type PopoverKind = 'block' | 'align' | 'color' | 'link' | 'codeLanguage' | 'tableColumn' | 'tableRow' | 'imageAlt' | 'insert' | null;

export interface UiState {
  popover: PopoverKind;
  /** Element or rectangle the popover is attached to. */
  anchor: (() => DOMRect | null) | null;
  /** Block the popover acts on (code block, table cell, image). */
  block: string | null;
  /** Where the popover was opened from, so it can be placed against that surface. */
  source: 'toolbar' | 'bubble' | 'editor';
}

export interface BlockwellContext {
  editor: ShallowRef<Editor>;
  active: ShallowRef<ActiveState | null>;
  version: ShallowRef<number>;
  ui: UiState;
  messages: Messages;
  open(kind: Exclude<PopoverKind, null>, anchor: (() => DOMRect | null) | null, opts?: { block?: string | null; source?: UiState['source'] }): void;
  close(): void;
  toggle(kind: Exclude<PopoverKind, null>, anchor: (() => DOMRect | null) | null, opts?: { block?: string | null; source?: UiState['source'] }): void;
  /** Opens a file picker and uploads the chosen images. */
  pickImage(): void;
}

const KEY: InjectionKey<BlockwellContext> = Symbol('blockwell');

export function provideBlockwell(editor: ShallowRef<Editor>, messages: Messages = defaultMessages): BlockwellContext {
  const { active, version } = useEditorState(editor);
  const ui = reactive<UiState>({ popover: null, anchor: null, block: null, source: 'editor' });
  const ctx: BlockwellContext = {
    editor,
    active,
    version,
    ui,
    messages,
    open(kind, anchor, opts = {}) {
      ui.popover = kind;
      ui.anchor = anchor ? markRaw(anchor) : null;
      ui.block = opts.block ?? null;
      ui.source = opts.source ?? 'editor';
    },
    close() {
      ui.popover = null;
      ui.anchor = null;
      ui.block = null;
    },
    toggle(kind, anchor, opts) {
      if (ui.popover === kind && (opts?.block ?? null) === ui.block) ctx.close();
      else ctx.open(kind, anchor, opts);
    },
    pickImage() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp,image/gif';
      input.multiple = true;
      input.onchange = () => editor.value.uploadImages(Array.from(input.files ?? []));
      input.click();
    },
  };
  provide(KEY, ctx);
  return ctx;
}

export function useBlockwell(): BlockwellContext {
  const ctx = inject(KEY);
  if (!ctx) throw new Error('blockwell: component used outside <BlockwellEditor> or provideBlockwell()');
  return ctx;
}

export interface FloatingOptions {
  placement?: 'top' | 'bottom';
  /** Horizontal alignment against the anchor. */
  align?: 'start' | 'center';
  offset?: number;
}

/**
 * Positions a fixed element against an anchor rectangle, flipping above/below to stay in view.
 * Recomputes on scroll, resize and whenever `deps` change.
 */
export function useFloating(
  el: Ref<HTMLElement | null>,
  anchor: () => DOMRect | null,
  deps: () => unknown,
  opts: FloatingOptions = {},
) {
  // Hidden with opacity rather than `visibility`, so inputs inside can take focus before placement.
  const style = reactive({ top: '0px', left: '0px', opacity: '0', pointerEvents: 'none' as 'none' | 'auto' });
  const place = () => {
    const r = anchor();
    const e = el.value;
    if (!r || !e) {
      style.opacity = '0';
      style.pointerEvents = 'none';
      return;
    }
    const w = e.offsetWidth, h = e.offsetHeight;
    const gap = opts.offset ?? 8;
    const vw = window.innerWidth, vh = window.visualViewport?.height ?? window.innerHeight;
    let top = opts.placement === 'top' ? r.top - h - gap : r.bottom + gap;
    if (opts.placement === 'top' && top < 8) top = r.bottom + gap;
    else if (opts.placement !== 'top' && top + h > vh - 8 && r.top - h - gap > 8) top = r.top - h - gap;
    let left = opts.align === 'center' ? r.left + r.width / 2 - w / 2 : r.left - 8;
    left = Math.max(8, Math.min(left, vw - w - 8));
    style.top = `${Math.round(top)}px`;
    style.left = `${Math.round(left)}px`;
    style.opacity = '1';
    style.pointerEvents = 'auto';
  };
  let raf = 0;
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(place);
  };
  watch([deps, el], schedule, { flush: 'post' });
  onMounted(() => {
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    schedule();
  });
  onBeforeUnmount(() => {
    cancelAnimationFrame(raf);
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('resize', schedule);
  });
  return { style, update: schedule };
}

/** Closes something when a pointer goes down outside the given elements. */
export function useOutside(els: () => (HTMLElement | null | undefined)[], fn: () => void) {
  const handler = (e: PointerEvent) => {
    const t = e.target as Node;
    if (els().some((el) => el && el.contains(t))) return;
    fn();
  };
  onMounted(() => document.addEventListener('pointerdown', handler, true));
  onBeforeUnmount(() => document.removeEventListener('pointerdown', handler, true));
}

/** The rectangle the editor's content is visible in: its scroll container, or the content itself. */
export function visibleRect(editor: { dom: HTMLElement | null }): DOMRect | null {
  const dom = editor.dom;
  if (!dom) return null;
  return ((dom.closest('.bw-scroll') as HTMLElement | null) ?? dom).getBoundingClientRect();
}

/** Keeps toolbar buttons from taking focus away from the editor. */
export const keepFocus = (e: MouseEvent) => e.preventDefault();
