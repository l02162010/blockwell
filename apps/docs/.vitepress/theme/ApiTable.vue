<script setup lang="ts">
import { computed } from 'vue';
import report from '../../../../api-report.json';

/**
 * Tables generated from api-report.json (scripts/api-report.mjs): the same source the API check
 * uses, so the reference cannot drift from the code.
 */
const props = defineProps<{ component?: string; editor?: 'methods' | 'getters' }>();
type Row = { name: string; type?: string; description?: string; default?: string; required?: boolean; signature?: string };
const api = computed(() => (props.component ? (report.components as Record<string, { props: Row[]; events: Row[]; slots: Row[]; exposed: Row[] }>)[props.component] : null));
const members = computed(() =>
  Object.entries(report.editor as Record<string, { kind: string; signature: string; description: string }>)
    .filter(([, m]) => (props.editor === 'getters' ? m.kind !== 'method' : m.kind === 'method'))
    .map(([name, m]) => ({ name, ...m })),
);
</script>

<template>
  <div class="api-table">
    <template v-if="api">
      <h3 v-if="api.props.length">Props</h3>
      <table v-if="api.props.length">
        <thead><tr><th>名稱</th><th>型別</th><th>預設</th><th>說明</th></tr></thead>
        <tbody>
          <tr v-for="p in api.props" :key="p.name">
            <td><code>{{ p.name }}</code><span v-if="p.required"> *</span></td>
            <td><code>{{ p.type }}</code></td>
            <td><code v-if="p.default">{{ p.default }}</code></td>
            <td>{{ p.description }}</td>
          </tr>
        </tbody>
      </table>
      <h3 v-if="api.events.length">事件</h3>
      <table v-if="api.events.length">
        <thead><tr><th>名稱</th><th>參數</th><th>說明</th></tr></thead>
        <tbody>
          <tr v-for="e in api.events" :key="e.name">
            <td><code>@{{ e.name }}</code></td>
            <td><code>{{ e.type }}</code></td>
            <td>{{ e.description }}</td>
          </tr>
        </tbody>
      </table>
      <h3 v-if="api.slots.length">Slots</h3>
      <ul v-if="api.slots.length">
        <li v-for="s in api.slots" :key="s.name"><code>#{{ s.name }}</code></li>
      </ul>
    </template>
    <table v-else-if="editor">
      <thead><tr><th>成員</th><th>說明</th></tr></thead>
      <tbody>
        <tr v-for="m in members" :key="m.name">
          <td><code>{{ m.kind === 'method' ? m.signature : m.name }}</code></td>
          <td>{{ m.description }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
