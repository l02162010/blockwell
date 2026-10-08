import { validate } from '@blockwell/schema';
import { expect, test } from 'vitest';
import * as pg from '../../../apps/playground/src/sample';
import * as site from '../../../apps/site/src/content';

test('demo documents in the playground and the website match the schema', () => {
  const bad: string[] = [];
  for (const [mod, name] of [[pg, 'pg'], [site, 'site']] as const)
    for (const [k, v] of Object.entries(mod)) {
      if (typeof v !== 'function') continue;
      let d: unknown;
      try { d = (v as () => unknown)(); } catch { continue; }
      if (!d || typeof d !== 'object' || !('blocks' in (d as object))) continue;
      const r = validate(d);
      if (!r.ok) bad.push(`${name}.${k}: ${JSON.stringify(r.errors.slice(0, 3))}`);
    }
  expect(bad).toEqual([]);
});
