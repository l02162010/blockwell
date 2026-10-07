<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useBlockwell, useFloating, useOutside, type FloatingOptions } from '../composables.js';

/**
 * A floating panel placed against `ui.anchor`. Closes on outside clicks and Escape.
 *
 * Menus are keyboard-driven without taking focus from the editor (so its selection and the
 * floating bar stay put): arrow keys move a highlight between the buttons by their position,
 * which works for lists and swatch grids alike, and Enter or Space presses the highlighted one.
 */
const props = withDefaults(
  defineProps<{ placement?: FloatingOptions['placement']; align?: FloatingOptions['align']; role?: string; label?: string; nav?: boolean }>(),
  { nav: true },
);
const ctx = useBlockwell();
const el = ref<HTMLElement | null>(null);
const anchor = () => ctx.ui.anchor?.() ?? null;
const { style } = useFloating(el, anchor, () => [ctx.version.value, ctx.ui.popover, ctx.ui.block], {
  placement: props.placement ?? 'bottom',
  align: props.align ?? 'start',
});
useOutside(
  () => [el.value, ...(Array.from(document.querySelectorAll('[aria-expanded="true"]')) as HTMLElement[])],
  () => ctx.close(),
);

const active = ref<HTMLElement | null>(null);
const items = () =>
  el.value ? Array.from(el.value.querySelectorAll<HTMLElement>('button:not(:disabled), [role="option"]')).filter((b) => b.offsetParent !== null) : [];
const setActive = (b: HTMLElement | null) => {
  active.value?.classList.remove('bw-kbd-active');
  active.value = b;
  if (b) {
    b.classList.add('bw-kbd-active');
    b.scrollIntoView({ block: 'nearest' });
  }
};
const center = (b: HTMLElement) => {
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height };
};
/** The nearest button in a direction: rows first for up/down, the same row for left/right. */
function step(key: string) {
  const all = items();
  if (!all.length) return;
  const cur = active.value && all.includes(active.value) ? active.value : null;
  if (!cur || key === 'Home' || key === 'End') {
    const start = all.find((b) => b.getAttribute('aria-checked') === 'true' || b.classList.contains('bw-current'));
    setActive(key === 'End' ? all.at(-1)! : key === 'Home' || !start ? all[0]! : start);
    return;
  }
  const c = center(cur);
  let best: HTMLElement | null = null, score = Infinity;
  for (const b of all) {
    if (b === cur) continue;
    const p = center(b), dx = p.x - c.x, dy = p.y - c.y;
    const sameRow = Math.abs(dy) < c.h / 2;
    let s = Infinity;
    if (key === 'ArrowDown' && dy > c.h / 2) s = dy * 4 + Math.abs(dx);
    else if (key === 'ArrowUp' && dy < -c.h / 2) s = -dy * 4 + Math.abs(dx);
    else if (key === 'ArrowRight' && sameRow && dx > 1) s = dx;
    else if (key === 'ArrowLeft' && sameRow && dx < -1) s = -dx;
    if (s < score) (score = s), (best = b);
  }
  if (best) setActive(best);
}

const NAV = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    ctx.close();
    ctx.editor.value.focus();
    return;
  }
  if (!props.nav || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target as HTMLElement | null;
  // Text fields keep their keys (the link and search inputs).
  if (t?.matches?.('input, textarea, select')) return;
  if (NAV.includes(e.key)) {
    e.preventDefault();
    e.stopPropagation();
    step(e.key);
  } else if ((e.key === 'Enter' || e.key === ' ') && active.value) {
    e.preventDefault();
    e.stopPropagation();
    active.value.click();
  } else if (e.key === 'Tab' || e.key === 'Enter' || e.key.length === 1) {
    // Typing or Tab while a menu is open closes it and goes on as usual.
    ctx.close();
  }
};
onMounted(() => window.addEventListener('keydown', onKey, true));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true));
</script>

<template>
  <div ref="el" class="bw-popover" :style="style" :role="role ?? 'dialog'" :aria-label="label">
    <slot />
  </div>
</template>
