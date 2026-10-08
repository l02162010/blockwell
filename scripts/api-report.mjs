// Lists the public API of @blockwell/vue components (props, events, slots, exposed) and of the
// core Editor class, as JSON. Used by the docs and by `pnpm api:check`.
import { createChecker } from 'vue-component-meta';
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const vueDir = path.join(root, 'packages/vue');
const checker = createChecker(path.join(vueDir, 'tsconfig.json'), { forceUseTs: true, printer: { newLine: 1 } });

const index = fs.readFileSync(path.join(vueDir, 'src/index.ts'), 'utf8');
const components = [...index.matchAll(/export \{ default as (\w+) \} from '\.\/components\/(\w+)\.vue'/g)].map((m) => ({ name: m[1], file: path.join(vueDir, 'src/components', `${m[2]}.vue`) }));

/** vue-component-meta drops JSDoc on tuple-style emits; read it from the source instead. */
const emitDoc = (file, name) => {
  const src = fs.readFileSync(file, 'utf8');
  const key = name.includes(':') || name.includes('-') ? `'${name}'` : name;
  const m = new RegExp(`/\\*\\*\\s*([^*]*(?:\\*(?!/)[^*]*)*)\\*/\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`).exec(src);
  return m ? m[1].replace(/\s*\n\s*\*?\s*/g, ' ').trim() : '';
};

const out = { components: {}, editor: {} };
for (const c of components) {
  const meta = checker.getComponentMeta(c.file);
  out.components[c.name] = {
    props: meta.props.filter((p) => !p.global).map((p) => ({ name: p.name, type: p.type, required: p.required, default: p.default, description: p.description })),
    events: meta.events.map((e) => ({ name: e.name, type: e.type, description: e.description || emitDoc(c.file, e.name) })),
    slots: meta.slots.map((s) => ({ name: s.name, description: s.description })),
    exposed: meta.exposed.filter((e) => !e.name.startsWith('$') && !['props'].includes(e.name) && !meta.props.some((p) => p.name === e.name)).map((e) => ({ name: e.name, type: e.type })),
  };
}

// Editor: public methods and getters with their JSDoc.
const program = ts.createProgram([path.join(root, 'packages/core/src/editor.ts')], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true });
const src = program.getSourceFile(path.join(root, 'packages/core/src/editor.ts'));
const tc = program.getTypeChecker();
ts.forEachChild(src, (node) => {
  if (!ts.isClassDeclaration(node) || node.name?.text !== 'Editor') return;
  for (const m of node.members) {
    if (!m.name || !ts.isIdentifier(m.name)) continue;
    const mods = ts.getCombinedModifierFlags(m);
    if (mods & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) continue;
    if (ts.isPropertyDeclaration(m) && !(mods & ts.ModifierFlags.Readonly) && m.name.text !== 'dom') continue;
    const sym = tc.getSymbolAtLocation(m.name);
    const doc = sym ? ts.displayPartsToString(sym.getDocumentationComment(tc)) : '';
    const kind = ts.isMethodDeclaration(m) ? 'method' : ts.isGetAccessor(m) ? 'getter' : 'property';
    const sig = ts.isMethodDeclaration(m) ? m.getText(src).split('{')[0].replace(/\s+/g, ' ').trim() : m.name.text;
    out.editor[m.name.text] = { kind, signature: sig, description: doc };
  }
});

// Core: the runtime values exported by @blockwell/core besides Editor.
const coreIndex = fs.readFileSync(path.join(root, 'packages/core/src/index.ts'), 'utf8');
out.core = [...coreIndex.matchAll(/^export \{([^}]+)\} from/gm)].flatMap((m) => m[1].split(',').map((x) => x.trim())).filter((x) => x && x !== 'Editor');

const file = path.join(root, 'api-report.json');
fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
const n = Object.values(out.components).reduce((a, c) => a + c.props.length + c.events.length, 0);
console.log(`${Object.keys(out.components).length} components, ${n} props+events, ${Object.keys(out.editor).length} editor members → api-report.json`);
