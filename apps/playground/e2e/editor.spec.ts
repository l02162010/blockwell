import { expect, test, type Page } from '@playwright/test';

type Block = { id: string; type: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; from: number; to: number; attrs?: Record<string, unknown> }[]; children?: Block[] };

const page01 = (page: Page) => page.locator('.bw-page .bw-editor').first();
const blocks = (page: Page) => page.evaluate(() => (window as unknown as { __editor: { getJSON(): { blocks: unknown[] } } }).__editor.getJSON().blocks) as Promise<Block[]>;
const last = async (page: Page) => (await blocks(page)).at(-1)!;
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

/** Puts the caret in the empty last paragraph of the sample document. */
async function caretAtEnd(page: Page) {
  const p = page01(page).locator(':scope > p').last();
  await p.scrollIntoViewIfNeeded();
  await p.click();
}

/** Selects `text` inside the editor with a DOM range, then lets the editor read the selection. */
async function select(page: Page, text: string) {
  await page.evaluate((t) => {
    const root = document.querySelector('.bw-page .bw-editor')!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n.nodeValue ?? '').indexOf(t);
      if (i >= 0) {
        (root as HTMLElement).focus();
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + t.length);
        const s = getSelection()!;
        s.removeAllRanges();
        s.addRange(r);
        return;
      }
    }
    throw new Error('text not found: ' + t);
  }, text);
  await page.waitForTimeout(50);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page01(page)).toBeVisible();
  test.info().annotations.push({ type: 'errors', description: errors.join('\n') });
});

test('types text and splits blocks with Enter', async ({ page }) => {
  await caretAtEnd(page);
  await page.keyboard.type('Hello world');
  expect((await last(page)).text).toBe('Hello world');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  const bs = await blocks(page);
  expect(bs.at(-2)!.text).toBe('Hello ');
  expect(bs.at(-1)!.text).toBe('world');
  await page.keyboard.press('Backspace');
  expect((await last(page)).text).toBe('Hello world');
});

test('undo and redo', async ({ page }) => {
  await caretAtEnd(page);
  await page.keyboard.type('abc');
  await page.keyboard.press(`${mod}+z`);
  expect((await last(page)).text).toBe('');
  await page.keyboard.press(`${mod}+Shift+z`);
  expect((await last(page)).text).toBe('abc');
});

test('bold with the keyboard and the floating toolbar', async ({ page }) => {
  await caretAtEnd(page);
  await page.keyboard.type('make me bold');
  await select(page, 'bold');
  await page.keyboard.press(`${mod}+b`);
  expect((await last(page)).marks).toEqual([{ type: 'bold', from: 8, to: 12 }]);
  await expect(page.locator('.bw-bubble:visible')).toBeVisible();
  await page.locator('.bw-bubble:visible [aria-label^="斜體"]').click();
  expect((await last(page)).marks).toContainEqual({ type: 'italic', from: 8, to: 12 });
});

test('markdown shortcuts', async ({ page }) => {
  await caretAtEnd(page);
  await page.keyboard.type('## Title');
  expect(await last(page)).toMatchObject({ type: 'heading', attrs: { level: 2 }, text: 'Title' });
  await page.keyboard.press('Enter');
  await page.keyboard.type('[] task');
  expect(await last(page)).toMatchObject({ type: 'listItem', attrs: { style: 'todo' }, text: 'task' });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('nested');
  expect(await last(page)).toMatchObject({ attrs: { style: 'todo', indent: 1 } });
  // A second Tab cannot go deeper than one level below the previous item.
  await page.keyboard.press('Tab');
  expect(await last(page)).toMatchObject({ attrs: { indent: 1 } });
});

test('slash menu filters and inserts a block', async ({ page }) => {
  await caretAtEnd(page);
  await page.keyboard.type('/');
  const menu = page.locator('.bw-slash');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.bw-slash-item')).toHaveCount(12);
  await page.keyboard.type('quote');
  await expect(menu.locator('.bw-slash-item')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  expect((await last(page)).type).toBe('quote');
});

test('link popover rejects unsafe schemes', async ({ page }) => {
  await caretAtEnd(page);
  await page.keyboard.type('read the docs');
  await select(page, 'docs');
  await page.keyboard.press(`${mod}+k`);
  const input = page.locator('.bw-link-form input');
  await expect(input).toBeFocused();
  await input.fill('javascript:alert(1)');
  await expect(page.locator('.bw-link-status.bw-bad')).toContainText('Only https: and mailto:');
  await expect(page.locator('.bw-link-form [type=submit]')).toBeDisabled();
  await input.fill('https://example.com/docs');
  await expect(page.locator('.bw-link-status.bw-good')).toBeVisible();
  await input.press('Enter');
  expect((await last(page)).marks).toEqual([{ type: 'link', from: 9, to: 13, attrs: { href: 'https://example.com/docs' } }]);
  await expect(page01(page).locator('a[href="https://example.com/docs"]')).toHaveAttribute('rel', 'noopener noreferrer nofollow');
});

test('colors come from the palette', async ({ page }) => {
  await caretAtEnd(page);
  await page.keyboard.type('colorful');
  await select(page, 'color');
  await page.locator('.bw-bubble:visible .bw-tool-color').click();
  await page.locator('.bw-swatch-text[title="紅色 red"]').click();
  await page.locator('.bw-swatch-bg[title="黃色 yellow"]').click();
  const marks = (await last(page)).marks;
  expect(marks).toContainEqual({ type: 'color', from: 0, to: 5, attrs: { value: 'red' } });
  expect(marks).toContainEqual({ type: 'highlight', from: 0, to: 5, attrs: { value: 'yellow' } });
  await expect(page01(page).locator('.bw-c-red.bw-bg-yellow, .bw-bg-yellow .bw-c-red, .bw-c-red .bw-bg-yellow').first()).toBeVisible();
  await expect(page.locator('.bw-palette input')).toHaveCount(0);
});

test('paste strips styles and scripts and says so', async ({ page }) => {
  await caretAtEnd(page);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/html', '<h2 style="color:red">Pasted</h2><p class="x" onclick="alert(1)"><b>bold</b> <a href="javascript:alert(1)">bad</a> <a href="https://ok.example/">good</a></p><script>alert(1)</script><img src=x onerror=alert(1)>');
    dt.setData('text/plain', 'Pasted\nbold bad good');
    document.querySelector('.bw-page .bw-editor')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  const bs = await blocks(page);
  const pasted = bs.slice(-2);
  expect(pasted[0]).toMatchObject({ type: 'heading', attrs: { level: 2 }, text: 'Pasted' });
  expect(pasted[1]!.text).toBe('bold bad good');
  expect(pasted[1]!.marks).toEqual([
    { type: 'bold', from: 0, to: 4 },
    { type: 'link', from: 9, to: 13, attrs: { href: 'https://ok.example/' } },
  ]);
  const toast = page.locator('.bw-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('style');
  await expect(page01(page).locator('script, [onclick], [style*="color"]')).toHaveCount(0);
  await toast.getByRole('button', { name: '純文字' }).click();
  expect((await blocks(page)).slice(-2).map((b) => [b.type, b.marks])).toEqual([
    ['paragraph', undefined],
    ['paragraph', undefined],
  ]);
});

test('IME composition inserts the committed text once', async ({ page }) => {
  await caretAtEnd(page);
  await page.keyboard.type('注音：');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'ㄓ', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: 'ㄓㄨㄥ', selectionStart: 3, selectionEnd: 3 });
  await cdp.send('Input.imeSetComposition', { text: '中', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.insertText', { text: '中' });
  await page.waitForTimeout(50);
  await page.keyboard.type('文');
  expect((await last(page)).text).toBe('注音：中文');
});

test('to-do checkbox toggles', async ({ page }) => {
  const box = page01(page).locator('.bw-li-todo .bw-check').nth(2);
  await box.click();
  const todos = (await blocks(page)).filter((b) => b.attrs?.style === 'todo');
  expect(todos[2]!.attrs!.checked).toBe(true);
});

test('read-only blocks editing', async ({ page }) => {
  await page.getByLabel('唯讀', { exact: true }).check();
  await expect(page01(page)).toHaveAttribute('contenteditable', 'false');
  await expect(page.locator('.frame .bw-toolbar-page')).toHaveCount(0);
  const before = await blocks(page);
  await page01(page).locator('.bw-check').first().click();
  expect(await blocks(page)).toEqual(before);
});

test('table rows and columns', async ({ page }) => {
  const cell = page01(page).locator('td').filter({ hasText: 'Gboard' });
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  await expect(page.locator('.bw-col-handle')).toBeVisible();
  await page.locator('.bw-row-handle').click();
  await page.getByRole('menuitem', { name: /下方插入列/ }).click();
  const table = (await blocks(page)).find((b) => b.type === 'table')!;
  expect(table.children).toHaveLength(6);
  await page.keyboard.type('new row');
  expect(JSON.stringify((await blocks(page)).find((b) => b.type === 'table'))).toContain('new row');
});

test('code block language comes from the whitelist', async ({ page }) => {
  const lang = page01(page).locator('.bw-code-lang');
  await lang.scrollIntoViewIfNeeded();
  await lang.click();
  await page.locator('.bw-lang input').fill('pyth');
  await page.locator('.bw-lang input').press('Enter');
  expect((await blocks(page)).find((b) => b.type === 'code')!.attrs).toEqual({ language: 'python' });
});

test('comment box submits with Mod+Enter', async ({ page }) => {
  const box = page.locator('.bw-comment .bw-editor');
  await box.click();
  await expect(page.locator('.bw-toolbar-comment')).toBeVisible();
  await page.keyboard.type('收到，我補上');
  await page.keyboard.press(`${mod}+Enter`);
  await expect(page.locator('.msg-body').filter({ hasText: '收到，我補上' })).toBeVisible();
});
