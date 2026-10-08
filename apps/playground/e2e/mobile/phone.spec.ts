import { expect, test, type Page } from '@playwright/test';

/** The editor on a phone (Android and iPhone emulation): touch, the bar above the keyboard, sheets. */

const ed = (page: Page) => page.locator('[data-screen-label="01 Full-page editor"] .bw-editor');
const json = (page: Page) =>
  page.evaluate(() => (window as unknown as { __editor: { getJSON(): { blocks: { type: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string }[] }[] } } }).__editor.getJSON().blocks);

async function tapEnd(page: Page, start: string) {
  const el = ed(page).locator('[data-bw-text]', { hasText: start }).first();
  await el.scrollIntoViewIfNeeded();
  await el.tap();
  await expect(ed(page)).toBeFocused();
  await page.keyboard.press('End');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(ed(page)).toBeVisible();
});

test('no horizontal scrolling on a phone', async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('tapping into the text shows the phone bar; typing works', async ({ page }) => {
  await tapEnd(page, '完整規格見');
  await expect(page.locator('.frame .bw-mobile-bar')).toBeVisible();
  await page.keyboard.type('！');
  expect((await json(page)).some((b) => b.text?.endsWith('白名單驗證。！'))).toBe(true);
});

test('"/" opens the insert sheet; a tile inserts the block', async ({ page }) => {
  await tapEnd(page, '完整規格見');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  const sheet = page.locator('.bw-sheet');
  await expect(sheet).toBeVisible();
  await sheet.locator('.bw-sheet-tile', { hasText: '待辦清單' }).tap();
  await expect(sheet).toHaveCount(0);
  expect((await json(page)).some((b) => b.type === 'listItem' && b.attrs?.style === 'todo' && !b.text)).toBe(true);
});

test('Aa opens the block-type sheet', async ({ page }) => {
  await tapEnd(page, '完整規格見');
  await page.locator('.frame .bw-mobile-bar').getByRole('button', { name: /文字|Text|Aa|轉換/ }).first().tap();
  const sheet = page.locator('.bw-popover-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('menuitemradio', { name: /標題 1/ }).tap();
  expect((await json(page)).find((b) => b.text?.startsWith('完整規格見'))).toMatchObject({ type: 'heading', attrs: { level: 1 } });
});

test('a selection turns the bar into a format row; B makes it bold', async ({ page }) => {
  await tapEnd(page, '完整規格見');
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-screen-label="01 Full-page editor"] [data-bw-text]')].find((e) => e.textContent?.startsWith('完整規格見'))!;
    const t = el.firstChild!;
    const r = document.createRange();
    r.setStart(t, 0);
    r.setEnd(t, 2);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  const bold = page.locator('.frame .bw-mobile-bar').getByRole('button', { name: /粗體|Bold/ });
  await expect(bold).toBeVisible();
  await bold.tap();
  expect((await json(page)).find((b) => b.text?.startsWith('完整規格見'))!.marks!.some((m) => m.type === 'bold')).toBe(true);
});

test('in a table the bar has row and column actions', async ({ page }) => {
  const cell = ed(page).locator('td [data-bw-text]', { hasText: /^macOS$/ });
  await cell.scrollIntoViewIfNeeded();
  await cell.tap();
  const bar = page.locator('.frame .bw-mobile-bar');
  await bar.getByRole('button', { name: '加列' }).tap();
  const rows = await page.evaluate(() => {
    const blocks = (window as unknown as { __editor: { getJSON(): { blocks: { type: string; children?: unknown[] }[] } } }).__editor.getJSON().blocks;
    return blocks.find((b) => b.type === 'table')!.children!.length;
  });
  expect(rows).toBe(6);
});

test('website on a phone: menu, editor tab, typing', async ({ page }) => {
  await page.goto('http://localhost:5176/');
  await page.getByRole('button', { name: /選單/ }).tap();
  await expect(page.locator('.nav-sheet')).toBeVisible();
  await page.locator('.nav-sheet').getByRole('link', { name: '安全模型' }).tap();
  await expect(page.locator('.nav-sheet')).toHaveCount(0);
  const editor = page.locator('.demo-editor .bw-editor');
  await editor.locator('h2').scrollIntoViewIfNeeded();
  await editor.locator('h2').tap();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect(editor.locator('h2')).toHaveText('發版說明 v0.3!');
});
