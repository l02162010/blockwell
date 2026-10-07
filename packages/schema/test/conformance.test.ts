import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flatten, validate, type Doc } from '../src/index.js';

const root = join(__dirname, '../../../conformance');

function load<T>(dir: string): [string, T[]][] {
  return readdirSync(join(root, dir))
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f, (JSON.parse(readFileSync(join(root, dir, f), 'utf8')) as { cases: T[] }).cases]);
}

interface ValidateCase {
  name: string;
  doc: unknown;
  valid: boolean;
  errors?: string[];
}

interface FlattenCase {
  name: string;
  doc: Doc;
  expected: unknown;
}

for (const [file, cases] of load<ValidateCase>('validate')) {
  describe(`validate/${file}`, () => {
    for (const c of cases) {
      it(c.name, () => {
        const result = validate(c.doc);
        if (c.valid) {
          expect(result.ok ? [] : result.errors).toEqual([]);
        } else {
          expect(result.ok).toBe(false);
          const codes = result.ok ? [] : result.errors.map((e) => e.code);
          for (const code of c.errors ?? []) expect(codes).toContain(code);
        }
      });
    }
  });
}

for (const [file, cases] of load<FlattenCase>('flatten')) {
  describe(`flatten/${file}`, () => {
    for (const c of cases) {
      it(c.name, () => {
        const result = validate(c.doc);
        expect(result.ok ? [] : result.errors).toEqual([]);
        expect(flatten(c.doc)).toEqual(c.expected);
      });
    }
  });
}
