import { expect, test, type Page } from '@playwright/test';

/** Sections 02–08, driven like a person would. */

const section = (page: Page, label: string) => page.locator(`[data-screen-label="${label}"]`);
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('02: a sent comment keeps its formatting', async ({ page }) => {
  const s = section(page, '02 Embedded variants');
  await s.scrollIntoViewIfNeeded();
  const box = s.locator('.bw-comment .bw-editor');
  await box.click();
  await page.keyboard.type('**重要** 請看 `npm i`');
  await page.keyboard.press(`${mod}+Enter`);
  const sent = s.locator('.doc-view').last();
  await expect(sent.locator('strong')).toHaveText('重要');
  await expect(sent.locator('code')).toHaveText('npm i');
});

test('02: the phone nav works (undo, 完成, reset)', async ({ page }) => {
  const s = section(page, '02 Embedded variants');
  await s.scrollIntoViewIfNeeded();
  const phone = s.locator('.phone');
  await expect(phone.locator('.keyboard')).toHaveCount(0);
  await phone.locator('.bw-editor h1').click();
  await expect(phone.locator('.keyboard')).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.type('！');
  await expect(phone.locator('.bw-editor h1')).toHaveText('上線檢查！');
  await phone.getByRole('button', { name: /復原/ }).click();
  await expect(phone.locator('.bw-editor h1')).toHaveText('上線檢查');
  await phone.getByRole('button', { name: '完成' }).click();
  await expect(phone.locator('.keyboard')).toHaveCount(0);
});

test('02: Aa on a phone opens a bottom sheet inside the phone', async ({ page }) => {
  const s = section(page, '02 Embedded variants');
  await s.scrollIntoViewIfNeeded();
  const phone = s.locator('.phone');
  await phone.locator('.bw-editor h1').click();
  await phone.locator('.bw-mobile-bar').getByRole('button').nth(1).click();
  const sheet = phone.locator('.bw-popover-sheet');
  await expect(sheet).toBeVisible();
  const p = (await phone.boundingBox())!, b = (await sheet.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(p.x);
  expect(b.x + b.width).toBeLessThanOrEqual(p.x + p.width + 1);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('02b: typing after "/" filters the slash sheet; Escape closes it', async ({ page }) => {
  const s = section(page, '02b Mobile details');
  await s.scrollIntoViewIfNeeded();
  const phone = s.locator('.phone').nth(1);
  await phone.locator('.bw-editor [data-bw-text]').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/表');
  await expect(phone.locator('.bw-sheet-tile')).toHaveCount(1);
  await page.keyboard.type('zzz');
  await expect(phone.locator('.bw-sheet-empty')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(phone.locator('.bw-sheet')).toHaveCount(0);
});

test('02b: the table bar has column actions under 更多', async ({ page }) => {
  const s = section(page, '02b Mobile details');
  await s.scrollIntoViewIfNeeded();
  const phone = s.locator('.phone').nth(2);
  await phone.locator('td [data-bw-text]', { hasText: 'macOS' }).click();
  await phone.getByRole('button', { name: '更多' }).click();
  await expect(phone.getByRole('menuitem', { name: /刪除欄/ })).toBeVisible();
  await expect(phone.locator('.bw-table-add').first()).toBeHidden();
});

test('04: the length note is dismissed by typing and the demo resets', async ({ page }) => {
  const s = section(page, '04 Schema feedback');
  await s.scrollIntoViewIfNeeded();
  await s.getByRole('button', { name: /長度上限/ }).click();
  const note = page.locator('.bw-feedback-float');
  await expect(note).toBeVisible();
  await expect(note).toBeInViewport();
  await page.keyboard.type('x');
  await expect(note).toHaveCount(0);
  await s.getByRole('button', { name: '重設' }).click();
  await expect(s.locator('.bw-editor')).toHaveText('在這裡試試看：');
});

test('04: Escape dismisses a note', async ({ page }) => {
  const s = section(page, '04 Schema feedback');
  await s.scrollIntoViewIfNeeded();
  await s.getByRole('button', { name: /圖片來源/ }).click();
  await expect(page.locator('.bw-feedback-float')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.bw-feedback-float')).toHaveCount(0);
});

test('05: the paste toast sits under the field it reports on', async ({ page }) => {
  const s = section(page, '05 Paste sources');
  await s.scrollIntoViewIfNeeded();
  await s.getByRole('button', { name: '貼上 Markdown' }).click();
  const toast = page.locator('.bw-toast');
  await expect(toast).toContainText('1 個標題');
  const field = (await s.locator('.bw-root').boundingBox())!, t = (await toast.boundingBox())!;
  expect(t.y).toBeGreaterThanOrEqual(Math.min(field.y + field.height, 720 - t.height - 20) - 1);
});

test('06: onboarding tips do what they say', async ({ page }) => {
  const s = section(page, '06 Empty and large');
  await s.scrollIntoViewIfNeeded();
  await s.locator('.empty-doc .bw-onboarding-row', { hasText: '標題' }).click();
  await expect(s.locator('.empty-doc .bw-editor h1')).toHaveCount(1);
});

test('06: Enter in the title moves into the document', async ({ page }) => {
  const s = section(page, '06 Empty and large');
  await s.scrollIntoViewIfNeeded();
  await s.locator('.title-input').fill('會議記錄');
  await s.locator('.title-input').press('Enter');
  await expect(s.locator('.empty-doc .bw-editor')).toBeFocused();
});

test('06: select all + Backspace clears a virtualized document', async ({ page }) => {
  const s = section(page, '06 Empty and large');
  await s.scrollIntoViewIfNeeded();
  await s.getByRole('button', { name: /載入 3,412/ }).click();
  const ed = s.locator('.large-doc .bw-editor');
  await ed.locator('[data-bw-text]').first().click();
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press('Backspace');
  await expect(ed.locator('[data-block-id]')).toHaveCount(1);
});

test('06: search reaches a block far down a large document', async ({ page }) => {
  const s = section(page, '06 Empty and large');
  await s.scrollIntoViewIfNeeded();
  await s.getByRole('button', { name: /載入 3,412/ }).click();
  await s.getByRole('button', { name: /搜尋/ }).click();
  await s.locator('.bw-searchbar input').fill('3401. ');
  await expect(s.locator('.bw-search-count')).toHaveText(/1 \/ \d+/);
  await expect(s.locator('.large-doc .bw-editor [data-bw-text]', { hasText: '3401. ' }).first()).toBeInViewport();
});

test('07: the live editor reports what a screen reader would hear', async ({ page }) => {
  const s = section(page, '07 Keyboard and a11y');
  await s.scrollIntoViewIfNeeded();
  await s.locator('.a11y-editor .bw-editor [data-bw-text]').first().dblclick({ position: { x: 6, y: 8 } });
  await page.keyboard.press(`${mod}+b`);
  await expect(s.locator('.heard')).toContainText('已套用粗體');
  await expect(s.locator('.focus-demo button')).toHaveCount(0);
});

test('08: skip, edit and re-run work; the next record is selected', async ({ page }) => {
  const s = section(page, '08 Migration');
  await s.scrollIntoViewIfNeeded();
  await s.getByRole('option', { name: /產品 FAQ/ }).click();
  await s.getByRole('button', { name: '略過' }).click();
  await expect(s.locator('.pill-skip').first()).toContainText('1 已略過');
  await expect(s.locator('.mig-item.on')).toContainText('春季活動頁');
  await s.getByRole('button', { name: '手動編輯' }).click();
  await s.locator('.mig-edit .bw-editor').click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type('（已人工確認）');
  await s.getByRole('button', { name: '儲存並寫入' }).click();
  await expect(s.locator('.pill-ok')).toContainText('12,444');
  await s.getByRole('button', { name: '重新執行' }).first().click();
  await expect(s.locator('.mig-item')).toHaveCount(4);
});

test('08: arrow keys move through the queue', async ({ page }) => {
  const s = section(page, '08 Migration');
  await s.scrollIntoViewIfNeeded();
  await s.locator('.mig-item').first().click();
  await page.keyboard.press('ArrowDown');
  await expect(s.locator('.mig-item').nth(1)).toBeFocused();
  await expect(s.locator('.mig-item.on')).toHaveCount(1);
});
