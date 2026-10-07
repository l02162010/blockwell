import { expect, test, type Page } from '@playwright/test';

/** Section 01, driven the way a person would: mouse, keyboard, menus. */

type Block = { id: string; type: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; from: number; to: number }[]; entities?: unknown[]; children?: Block[] };

const ed = (page: Page) => page.locator('[data-screen-label="01 Full-page editor"] .bw-editor');
const json = (page: Page) => page.evaluate(() => (window as unknown as { __editor: { getJSON(): { blocks: Block[] } } }).__editor.getJSON().blocks);
const textOf = (b: Block): string => b.text ?? (b.children ?? []).map(textOf).join('|');
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

/** Clicks at the end of the block whose text starts with `start`. */
async function clickEnd(page: Page, start: string) {
  const el = ed(page).locator('[data-bw-text]', { hasText: start }).first();
  await el.scrollIntoViewIfNeeded();
  await el.click();
  await page.keyboard.press('End');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(ed(page)).toBeVisible();
});

test('block-type menu works with the arrow keys and Enter', async ({ page }) => {
  await clickEnd(page, '完整規格見');
  await page.locator('.frame .bw-toolbar-page .bw-tool-kind').click();
  const menu = page.locator('.bw-turn');
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowDown'); // the current kind (paragraph)
  await page.keyboard.press('ArrowDown'); // heading 1
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  const b = (await json(page)).find((x) => x.text?.startsWith('完整規格見'))!;
  expect(b).toMatchObject({ type: 'heading', attrs: { level: 1 } });
});

test('Insert adds a block after a non-empty one instead of converting it', async ({ page }) => {
  await clickEnd(page, '完整規格見');
  await page.locator('.frame .bw-tool-insert').click();
  await page.keyboard.type('分隔');
  await page.keyboard.press('Enter');
  await page.keyboard.type('X');
  const bs = await json(page);
  const i = bs.findIndex((x) => x.text?.startsWith('完整規格見'));
  expect(bs[i]!.type).toBe('paragraph');
  expect(bs[i + 1]!.type).toBe('divider');
  expect(bs[i + 2]).toMatchObject({ type: 'paragraph', text: 'X' });
  expect(bs[i + 3]!.type).toBe('code');
});

test('inline Markdown applies marks as you type', async ({ page }) => {
  await clickEnd(page, '完整規格見');
  await page.keyboard.press('Enter');
  await page.keyboard.type('先 **粗體** 再 `code` 好');
  const b = (await json(page)).find((x) => x.text?.startsWith('先 '))!;
  expect(b.text).toBe('先 粗體 再 code 好');
  expect(b.marks).toEqual([
    { type: 'bold', from: 2, to: 4 },
    { type: 'code', from: 7, to: 11 },
  ]);
});

test('the caret can sit after a mention that ends the line', async ({ page }) => {
  await clickEnd(page, '完整規格見');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Hi @陳');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace'); // the space typed after the mention
  await page.keyboard.type('Z');
  const b = (await json(page)).find((x) => x.text?.startsWith('Hi '))!;
  expect(b.text).toBe('Hi ￼Z');
});

test('Backspace at the start of a code block keeps it', async ({ page }) => {
  const code = ed(page).locator('.bw-code [data-bw-text]').first();
  await code.scrollIntoViewIfNeeded();
  await code.click();
  await page.keyboard.press(`${mod}+Home`);
  await page.locator('.frame').evaluate(() => 0);
  // Ctrl+Home goes to the document start; put the caret at the code block's start instead.
  await code.click({ position: { x: 2, y: 4 } });
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  const bs = await json(page);
  expect(bs.find((x) => x.type === 'code')!.text).toMatch(/^export const SafeUrl/);
});

test('the drag handle opens a block menu; duplicate copies the block', async ({ page }) => {
  const p = ed(page).locator('[data-bw-text]', { hasText: '完整規格見' }).first();
  await p.scrollIntoViewIfNeeded();
  await p.hover();
  await page.locator('.bw-handles .bw-grab').click();
  const menu = page.getByRole('menu', { name: /區塊選單/ });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: /複製/ }).click();
  const bs = await json(page);
  expect(bs.filter((x) => x.text?.startsWith('完整規格見'))).toHaveLength(2);
});

test('moving a list item takes its nested items along', async ({ page }) => {
  const p = ed(page).locator('[data-bw-text]', { hasText: 'IME 手動測試矩陣' }).first();
  await p.scrollIntoViewIfNeeded();
  await p.hover();
  await page.locator('.bw-handles .bw-grab').click();
  await page.getByRole('menuitem', { name: /下移/ }).click();
  const texts = (await json(page)).map(textOf);
  const i = texts.indexOf('IME 手動測試矩陣');
  expect(texts.slice(i - 1, i + 3)).toEqual(['協作（Yjs）', 'IME 手動測試矩陣', 'macOS · Chrome、Safari', 'Windows · 微軟注音、新注音']);
});

test('Tab on a list item indents the items nested under it too', async ({ page }) => {
  await clickEnd(page, 'IME 手動測試矩陣');
  await page.keyboard.press('Tab');
  const bs = await json(page);
  const i = bs.findIndex((x) => x.text === 'IME 手動測試矩陣');
  expect([bs[i]!.attrs?.indent, bs[i + 1]!.attrs?.indent, bs[i + 2]!.attrs?.indent]).toEqual([1, 2, 2]);
});

test('ArrowDown in a table goes to the cell below', async ({ page }) => {
  const cell = ed(page).locator('td [data-bw-text]', { hasText: /^macOS$/ });
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  const table = (await json(page)).find((x) => x.type === 'table')!;
  expect(textOf(table)).toContain('Windows!');
});

test('commenting on a selection opens a new thread', async ({ page }) => {
  const p = ed(page).locator('[data-bw-text]', { hasText: '完整規格見' }).first();
  await p.scrollIntoViewIfNeeded();
  await p.dblclick({ position: { x: 4, y: 8 } });
  await page.locator('.bw-bubble:visible').getByRole('button', { name: /留言/ }).click();
  const panel = page.locator('.bw-panel');
  await expect(panel.locator('input')).toBeFocused();
  await panel.locator('input').fill('需要更新連結');
  await panel.locator('input').press('Enter');
  await expect(panel).toContainText('需要更新連結');
  await expect(page.locator('.switch-group').getByRole('button', { name: /留言 2/ })).toBeVisible();
});

test('each version shows its own diff and can be restored', async ({ page }) => {
  await page.locator('.switch-group').getByRole('button', { name: '版本' }).click();
  await expect(page.locator('.bw-diff-bar')).toBeVisible();
  await page.getByRole('option', { name: /昨天 18:20/ }).click();
  await expect(page.locator('.bw-diff')).toContainText('我們以 JSON 為主');
  await page.getByRole('button', { name: /還原此版本/ }).click();
  await expect(page.locator('.bw-history')).toHaveCount(0);
  expect((await json(page)).map(textOf)).toContain('我們以 JSON 為主，畫面只是它的投影。');
});

test('⌘F again returns to the search field; closing selects the match', async ({ page }) => {
  await clickEnd(page, '完整規格見');
  await page.keyboard.press(`${mod}+f`);
  const input = page.locator('.frame .bw-searchbar input');
  await input.fill('白名單');
  await ed(page).locator('[data-bw-text]', { hasText: 'IME 手動測試矩陣' }).first().click();
  await page.keyboard.press(`${mod}+f`);
  await expect(input).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(ed(page)).toBeFocused();
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('白名單');
});

test('shortcuts dialog keeps focus inside and closes with Escape', async ({ page }) => {
  await clickEnd(page, '完整規格見');
  await page.keyboard.press(`${mod}+/`);
  const dialog = page.getByRole('dialog', { name: /鍵盤快捷鍵/ });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await expect(dialog).toContainText(process.platform === 'darwin' ? '⌘ B' : 'Ctrl+B');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('read-only documents still answer ⌘/', async ({ page }) => {
  await page.locator('.switch-group label', { hasText: '唯讀' }).click();
  await ed(page).locator('[data-bw-text]').first().click();
  await page.keyboard.press(`${mod}+/`);
  await expect(page.getByRole('dialog', { name: /鍵盤快捷鍵/ })).toBeVisible();
});

test('a bare domain becomes an https link', async ({ page }) => {
  const p = ed(page).locator('[data-bw-text]', { hasText: '完整規格見' }).first();
  await p.scrollIntoViewIfNeeded();
  await p.dblclick({ position: { x: 4, y: 8 } });
  await page.keyboard.press(`${mod}+k`);
  const input = page.locator('.bw-link-form input');
  await input.fill('example.com');
  await expect(page.locator('.bw-link-status.bw-bad')).toHaveCount(0);
  await expect(page.locator('.bw-link-status')).toContainText('https://example.com');
  await input.press('Enter');
  await expect(ed(page).locator('a[href="https://example.com"]')).toHaveCount(1);
});
