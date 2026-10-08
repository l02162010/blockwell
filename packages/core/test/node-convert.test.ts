// The migration guide's recipe: convertHtml on a server, with jsdom's DOMParser and no global DOM.
import { expect, test } from 'vitest';
import { JSDOM } from 'jsdom';
import { convertHtml } from '../src/index.js';

test('convertHtml runs in Node with a jsdom DOMParser', () => {
  expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
  const { window } = new JSDOM();
  const { doc, ok, report } = convertHtml('<h2>標題</h2><p><b>粗</b><script>x()</script></p>', new window.DOMParser());
  expect(ok).toBe(true);
  expect(doc.blocks.map((b) => b.type)).toEqual(['heading', 'paragraph']);
  expect(report.kept).toContain('bold');
  expect(report.removedElements).toContain('script');
});
