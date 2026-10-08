// Fails when a public prop, event, slot or Editor member has no description or is not exercised
// by any test. Run after `node scripts/api-report.mjs`.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const report = JSON.parse(fs.readFileSync(path.join(root, 'api-report.json'), 'utf8'));
const testDirs = ['packages/core/test', 'packages/vue/test', 'apps/playground/e2e'];
const read = (d) =>
  fs.existsSync(d)
    ? fs.readdirSync(d, { recursive: true }).filter((f) => /\.(ts|tsx|vue)$/.test(f)).map((f) => fs.readFileSync(path.join(d, f), 'utf8'))
    : [];
const tests = testDirs.flatMap((d) => read(path.join(root, d))).join('\n');
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const used = (name) => new RegExp(`\\b(${name}|${kebab(name)})\\b`).test(tests);

const problems = [];
for (const [comp, api] of Object.entries(report.components)) {
  for (const p of api.props) {
    if (!p.description) problems.push(`${comp} prop "${p.name}": no description`);
    if (!used(p.name)) problems.push(`${comp} prop "${p.name}": not exercised by any test`);
  }
  for (const e of api.events) {
    if (!e.description) problems.push(`${comp} event "${e.name}": no description`);
    if (!used(e.name.replace(/^update:/, ''))) problems.push(`${comp} event "${e.name}": not exercised by any test`);
  }
  for (const s of api.slots) if (!used(s.name)) problems.push(`${comp} slot "${s.name}": not exercised by any test`);
}
for (const [name, m] of Object.entries(report.editor)) {
  if (!m.description) problems.push(`Editor.${name}: no description`);
  if (!used(name)) problems.push(`Editor.${name}: not exercised by any test`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s). Every public API needs a description and a test.`);
  process.exit(1);
}
console.log('API check: every public prop, event, slot and Editor member is documented and tested.');
