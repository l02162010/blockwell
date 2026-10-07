import raw from '../../../spec/palette.json' with { type: 'json' };

export type PaletteTarget = 'light' | 'dark' | 'print';

/** Text and background colors for each palette token, per output target (spec/palette.json). */
export const PALETTE_COLORS = raw.tokens as Record<string, Record<PaletteTarget, { text: string; bg: string }>>;

const vars = (target: PaletteTarget) =>
  Object.entries(PALETTE_COLORS)
    .map(([k, v]) => `--editor-color-${k}:${v[target].text};--editor-bg-${k}:${v[target].bg};`)
    .join('');

/**
 * CSS for palette tokens: custom properties per theme and the `.bw-c-*` / `.bw-bg-*` classes the
 * renderer emits. Documents only ever hold token names, never CSS.
 *
 * Dark values apply under `[data-theme="dark"]` or `.dark`, and under `prefers-color-scheme: dark`
 * unless the root sets `data-theme="light"`. Only variables change: documents stay the same.
 */
export function paletteCss(): string {
  const classes = Object.keys(PALETTE_COLORS)
    .map((k) => `.bw-c-${k}{color:var(--editor-color-${k})}.bw-bg-${k}{background-color:var(--editor-bg-${k});border-radius:2px}`)
    .join('');
  return (
    `:root{${vars('light')}}` +
    `[data-theme="dark"],.dark{${vars('dark')}}` +
    `[data-theme="light"]{${vars('light')}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${vars('dark')}}}` +
    `@media print{:root{${vars('print')}}}` +
    classes
  );
}
