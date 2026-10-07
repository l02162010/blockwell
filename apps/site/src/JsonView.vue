<script setup lang="ts">
import { computed } from 'vue';

/**
 * Pretty-prints a document with one block per line and colors the tokens. Built from text
 * nodes only: the input may come from the HTML demo.
 */
const props = defineProps<{ value: unknown; compact?: boolean; stableIds?: boolean }>();

/** Fresh random ids on every conversion would make the output jump; show b1, b2… instead. */
const shown = computed(() => {
  if (!props.stableIds) return props.value;
  let n = 0;
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (!x || typeof x !== 'object') return x;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) out[k] = k === 'id' && typeof v === 'string' ? `b${++n}` : walk(v);
    return out;
  };
  return walk(props.value);
});

type Tok = { t: string; c: string };
const RE = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?)|(true|false|null)|([{}[\],:])|(\s+)/g;

const lines = computed(() => {
  const v = shown.value as { blocks?: unknown[] } & Record<string, unknown>;
  const rows: string[] = [];
  if (Array.isArray(v?.blocks)) {
    const head = Object.entries(v).filter(([k]) => k !== 'blocks').map(([k, x]) => `"${k}": ${JSON.stringify(x)}`);
    rows.push(`{ ${head.join(', ')}${head.length ? ',' : ''}`, '  "blocks": [');
    v.blocks.forEach((b, i) => rows.push(`    ${JSON.stringify(b)}${i < v.blocks!.length - 1 ? ',' : ''}`));
    rows.push('  ]', '}');
  } else rows.push(...JSON.stringify(v, null, 2).split('\n'));
  return rows.map((row) => {
    const out: Tok[] = [];
    for (const m of row.matchAll(RE)) {
      if (m[1]) out.push({ t: m[1], c: m[2] ? 'k' : 's' }, ...(m[2] ? [{ t: `${m[2].trim()} `, c: 'p' }] : []));
      else if (m[3]) out.push({ t: m[3], c: 'n' });
      else if (m[4]) out.push({ t: m[4], c: 'b' });
      else if (m[5] === ',' && m.index! < row.length - 1) out.push({ t: ', ', c: 'p' });
      else out.push({ t: m[0], c: 'p' });
    }
    return out;
  });
});
</script>

<template>
  <pre class="json" :class="{ 'json-compact': compact }"><code><span v-for="(line, i) in lines" :key="i" class="json-line"><span v-for="(tok, j) in line" :key="j" :class="`j-${tok.c}`">{{ tok.t }}</span>
</span></code></pre>
</template>
