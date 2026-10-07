import { expect, test, type Page } from '@playwright/test';

const editor = (page: Page) => page.locator('.demo-editor .bw-editor');
const json = (page: Page) => page.locator('.demo-json');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editor(page)).toBeVisible();
});

test('every block of the sample renders, including the quote', async ({ page }) => {
  await expect(editor(page).locator('h2')).toHaveText('發版說明 v0.3');
  await expect(editor(page).locator('blockquote')).toContainText('顏色只能是色盤 token');
  await expect(editor(page).locator('.bw-li-todo')).toHaveCount(3);
  await expect(editor(page).locator('.bw-code')).toContainText("editor.toggleMark('bold');");
});

test('focusing the editor draws no outline around it', async ({ page }) => {
  await editor(page).locator('h2').click();
  await expect(editor(page)).toBeFocused();
  const outline = await editor(page).evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe('none');
});

test('typing shows up in the JSON panel', async ({ page }) => {
  await editor(page).locator('h2').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' 正式版');
  await expect(json(page)).toContainText('發版說明 v0.3 正式版');
});

test('Enter twice at the end of a code block leaves it', async ({ page }) => {
  await editor(page).locator('.bw-code [data-bw-text]').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('之後的段落');
  await expect(editor(page).locator(':scope > p').last()).toHaveText('之後的段落');
  await expect(json(page)).toContainText(`"text": "editor.toggleMark('bold');"`);
});

test('clicking below the last block starts a new paragraph', async ({ page }) => {
  await page.locator('.demo-editor').evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' }));
  const last = (await editor(page).locator(':scope > *').last().boundingBox())!;
  await page.mouse.click(last.x + 40, last.y + last.height + 60);
  await page.keyboard.type('最後一行');
  await expect(editor(page).locator(':scope > p').last()).toHaveText('最後一行');
});

test('clicking beside the text puts the caret on that line', async ({ page }) => {
  await editor(page).locator('h2').scrollIntoViewIfNeeded();
  const h = (await editor(page).locator('h2').boundingBox())!;
  const pane = (await page.locator('.demo-editor').boundingBox())!;
  await page.mouse.click(pane.x + pane.width - 8, h.y + h.height / 2);
  await page.keyboard.type('!');
  await expect(editor(page).locator('h2')).toHaveText('發版說明 v0.3!');
});

test('slash menu inserts a block', async ({ page }) => {
  await editor(page).locator('h2').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/分隔');
  await expect(page.locator('.bw-slash')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(editor(page).locator('[data-type="divider"]')).toHaveCount(1);
  await expect(json(page)).toContainText('"type": "divider"');
});

test('reset restores the sample', async ({ page }) => {
  await editor(page).locator('h2').click();
  await page.keyboard.press('End');
  await page.keyboard.type('XYZ');
  await expect(json(page)).toContainText('v0.3XYZ');
  await page.getByRole('button', { name: '重設' }).click();
  await expect(editor(page).locator('h2')).toHaveText('發版說明 v0.3');
  await expect(json(page)).not.toContainText('XYZ');
});

test('security demo strips scripts, handlers and unsafe links', async ({ page }) => {
  const out = page.locator('.sec-out');
  await expect(out.locator('.badge')).toContainText('通過 schema 驗證');
  await expect(out.locator('.findings')).toContainText('擋下');
  await expect(out).not.toContainText('javascript:');
  await expect(out).not.toContainText('onerror');
  await page.locator('.sec-in textarea').fill('<p><a href="javascript:x()">壞連結</a><b>粗</b></p>');
  await expect(out.locator('.findings')).toContainText('擋下 1 個不安全的網址');
  await expect(out).toContainText('"type": "bold"');
});

test('theme toggle switches to dark and is remembered', async ({ page }) => {
  await page.getByRole('button', { name: /切換到深色/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('mobile: editor first, JSON behind a tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor(page)).toBeVisible();
  await expect(json(page)).toBeHidden();
  await page.getByRole('tab', { name: 'JSON' }).click();
  await expect(json(page)).toBeVisible();
  await expect(editor(page)).toBeHidden();
});

test('「直接試試看」 puts the caret in the demo', async ({ page }) => {
  await page.getByRole('link', { name: '直接試試看' }).click();
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('嗨');
  await expect(json(page)).toContainText('"text": "嗨"');
});

test('security demo lists removed elements once and keeps ids stable', async ({ page }) => {
  const out = page.locator('.sec-out');
  await expect(out.locator('.findings')).toContainText('連同內容移除：<script>、<iframe>');
  await expect(out.locator('.findings li')).toHaveCount(4);
  await expect(out).toContainText('"id": "b1"');
  await page.locator('.sec-in textarea').fill('<pre><code class="language-js">let a</code></pre><p><mark>重點</mark></p>');
  await expect(out).toContainText('"language": "javascript"');
  await expect(out).toContainText('"type": "highlight"');
});

test('phone: the menu button opens the section links', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /選單/ }).click();
  await page.locator('.nav-sheet').getByRole('link', { name: '安全模型' }).click();
  await expect(page.locator('.nav-sheet')).toHaveCount(0);
  await expect(page.locator('#security')).toBeInViewport();
});

test('the demo toolbar stays in view while the document scrolls', async ({ page }) => {
  await editor(page).locator('h2').click();
  await page.keyboard.press('Control+End');
  for (let i = 0; i < 30; i++) await page.keyboard.press('Enter');
  await expect(page.locator('.demo-editor .bw-toolbar-page')).toBeInViewport();
});
