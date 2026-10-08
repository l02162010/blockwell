#!/usr/bin/env bash
# Installs the packed packages into a fresh Vite + Vue app, the way a user would, and builds it.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
for p in schema core vue; do (cd "$ROOT/packages/$p" && pnpm pack --pack-destination "$WORK" >/dev/null); done
mkdir -p "$WORK/app/src"
cd "$WORK/app"
cat > package.json <<JSON
{
  "name": "blockwell-smoke",
  "private": true,
  "type": "module",
  "pnpm": { "overrides": {
    "@blockwell/schema": "file:$(ls "$WORK"/blockwell-schema-*.tgz)",
    "@blockwell/core": "file:$(ls "$WORK"/blockwell-core-*.tgz)"
  } },
  "dependencies": {
    "@blockwell/vue": "file:$(ls "$WORK"/blockwell-vue-*.tgz)",
    "@blockwell/core": "file:$(ls "$WORK"/blockwell-core-*.tgz)",
    "@blockwell/schema": "file:$(ls "$WORK"/blockwell-schema-*.tgz)",
    "vue": "^3.5.0"
  },
  "devDependencies": { "vite": "^8.3.3", "@vitejs/plugin-vue": "^6.0.9", "typescript": "~5.9.3", "vue-tsc": "^3.3.12" }
}
JSON
cat > index.html <<'HTML'
<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>
HTML
cat > vite.config.ts <<'TS'
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
export default defineConfig({ plugins: [vue()] });
TS
cat > tsconfig.json <<'JSON'
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "strict": true, "jsx": "preserve", "types": ["vite/client"], "skipLibCheck": false }, "include": ["src"] }
JSON
cat > src/env.d.ts <<'TS'
declare module '*.vue' { import type { DefineComponent } from 'vue'; const c: DefineComponent; export default c; }
TS
cat > src/App.vue <<'VUE'
<script setup lang="ts">
import type { Doc } from '@blockwell/core';
import { validate } from '@blockwell/schema';
import { BlockwellEditor, CommentsPanel, EditorContent, HistoryPanel, PresenceMenu, SaveStatus, useEditor } from '@blockwell/vue';
import '@blockwell/vue/style.css';
import { ref } from 'vue';
const doc = ref<Doc | null>({ version: 1, blocks: [{ id: 'a', type: 'paragraph', text: 'hi' }] });
const headless = useEditor({ doc: doc.value! });
const ok = validate(doc.value).ok;
</script>
<template>
  <BlockwellEditor v-model="doc" />
  <EditorContent :editor="headless" />
  <SaveStatus status="saved" />
  <PresenceMenu :people="[]" />
  <CommentsPanel :thread="{ id: 't', anchor: 'a', messages: [] }" />
  <HistoryPanel :versions="[]" />
  <p>{{ ok }}</p>
</template>
VUE
cat > src/main.ts <<'TS'
import { createApp } from 'vue';
import App from './App.vue';
createApp(App).mount('#app');
TS
pnpm install --silent
npx vue-tsc --noEmit -p tsconfig.json
npx vite build --logLevel warn
echo "Consumer smoke test: install, typecheck and build OK"
