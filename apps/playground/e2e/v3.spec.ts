import { expect, test, type Page } from '@playwright/test';

type Block = { id: string; type: string; text?: string; attrs?: Record<string, unknown>; marks?: unknown[]; entities?: { type: string; attrs?: Record<string, unknown> }[]; children?: Block[] };

const main = (page: Page) => page.locator('.frame .bw-editor').first();
const blocks = (page: Page) => page.evaluate(() => (window as unknown as { __editor: { getJSON(): { blocks: unknown[] } } }).__editor.getJSON().blocks) as Promise<Block[]>;
const last = async (page: Page) => (await blocks(page)).at(-1)!;
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function caretAtEnd(page: Page) {
  const p = main(page).locator(':scope > p').last();
  await p.scrollIntoViewIfNeeded();
  await p.click();
}

async function select(page: Page, root: string, text: string) {
  await page.evaluate(
    ([r, t]) => {
      const el = document.querySelector(r!)!;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = (n.nodeValue ?? '').indexOf(t!);
        if (i < 0) continue;
        (el as HTMLElement).focus();
        const range = document.createRange();
        range.setStart(n, i);
        range.setEnd(n, i + t!.length);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(range);
        return;
      }
      throw new Error('not found ' + t);
    },
    [root, text],
  );
  await page.waitForTimeout(60);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(main(page)).toBeVisible();
});

test('@ mention picker stores only the user id', async ({ page }) => {
  await caretAtEnd(page);
  await page.keyboard.type('請 @陳');
  const menu = page.locator('.bw-mention-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.bw-member')).toHaveCount(3);
  await expect(menu).toContainText('文件只存使用者 ID');
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  const b = await last(page);
  expect(b.entities).toEqual([{ at: 2, type: 'mention', attrs: { userId: 'u_chen' } }]);
  await expect(main(page).locator('.bw-mention').last()).toHaveText('@陳柏翰');
});

test('a menu opening under a resting pointer keeps the keyboard selection', async ({ page }) => {
  await caretAtEnd(page);
  await page.keyboard.type('請 @陳');
  const members = page.locator('.bw-mention-menu .bw-member');
  await expect(members).toHaveCount(3);
  await expect(page.locator('.bw-mention-menu')).toHaveCSS('opacity', '1'); // placed
  // What Firefox does when the menu appears under the cursor: a mouse event without movement.
  const box = (await members.nth(1).boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await expect(members.nth(0)).toHaveClass(/bw-current/);
  // Moving the mouse over an item does select it.
  await page.mouse.move(box.x + 40, box.y + box.height / 2, { steps: 4 });
  await expect(members.nth(1)).toHaveClass(/bw-current/);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  expect((await last(page)).entities).toEqual([{ at: 2, type: 'mention', attrs: { userId: 'u_chen' } }]);
});

test('Backspace right after a Markdown shortcut turns it back into text', async ({ page }) => {
  await caretAtEnd(page);
  await page.keyboard.type('## ');
  expect(await last(page)).toMatchObject({ type: 'heading', attrs: { level: 2 } });
  await expect(page.locator('.bw-rule-hint')).toContainText('已轉為標題 2');
  await page.keyboard.press('Backspace');
  expect(await last(page)).toMatchObject({ type: 'paragraph', text: '## ' });
  await expect(page.locator('.bw-rule-hint')).toHaveCount(0);
});

test('inline code disables the other marks', async ({ page }) => {
  await select(page, '.frame .bw-editor', 'sanitize');
  await expect(page.locator('.frame .bw-toolbar-page [aria-label^="粗體"]')).toBeDisabled();
  await expect(page.locator('.frame .bw-toolbar-page')).toContainText('行內程式碼不可疊加其他樣式');
});

test('Turn into warns before converting formatted text to code', async ({ page }) => {
  await select(page, '.frame .bw-editor', '取代現有的');
  await page.locator('.bw-bubble:visible .bw-tool-kind').click();
  const menu = page.locator('.bw-turn');
  await expect(menu).toContainText('轉換為 · Turn into');
  await expect(menu.locator('.bw-turn-warning')).toContainText('會清除此段的');
  await expect(menu.locator('.bw-turn-warning')).toContainText('1 個提及');
  await menu.getByRole('radio', { name: /置中/ }).click();
  expect((await blocks(page))[0]!.attrs).toEqual({ align: 'center' });
});

test('⌘/ opens the shortcuts dialog and Escape closes it', async ({ page }) => {
  await caretAtEnd(page);
  await page.keyboard.press(`${mod}+/`);
  const dialog = page.getByRole('dialog', { name: /鍵盤快捷鍵/ });
  await expect(dialog).toBeVisible();
  await dialog.locator('input').fill('Bold');
  await expect(dialog.locator('.bw-shortcut')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(main(page)).toBeFocused();
});

test('⌘F searches the document', async ({ page }) => {
  await caretAtEnd(page);
  await page.keyboard.press(`${mod}+f`);
  await page.locator('.bw-searchbar input').fill('注音');
  await expect(page.locator('.bw-search-count')).toHaveText(/1 \/ [3-9]/);
  await page.locator('.bw-searchbar input').press('Enter');
  await expect(page.locator('.bw-search-count')).toHaveText(/2 \//);
  expect(await page.evaluate(() => (CSS as unknown as { highlights: Map<string, unknown> }).highlights.has('bw-search'))).toBe(true);
});

test('schema feedback: length limit offers to paste the rest', async ({ page }) => {
  const section = page.locator('[data-screen-label="04 Schema feedback"]');
  await section.scrollIntoViewIfNeeded();
  await section.getByRole('button', { name: /長度上限/ }).click();
  const note = page.locator('.bw-feedback-float');
  await expect(note).toHaveClass(/bw-feedback-adjust/);
  await expect(note).toContainText('多出的');
  await note.getByRole('button', { name: '貼到新段落' }).click();
  await expect(note).toHaveCount(0);
  const paras = section.locator('.bw-editor > p');
  await expect(paras).toHaveCount(2);
});

test('schema feedback: unsafe image and skipped embed', async ({ page }) => {
  const section = page.locator('[data-screen-label="04 Schema feedback"]');
  await section.scrollIntoViewIfNeeded();
  await section.getByRole('button', { name: /圖片來源/ }).click();
  await expect(page.locator('.bw-feedback-float')).toHaveClass(/bw-feedback-reject/);
  await expect(page.locator('.bw-feedback-float')).toContainText('只允許自家 CDN 或 https');
  await section.getByRole('button', { name: /不支援的內容/ }).click();
  await expect(page.locator('.bw-feedback-float')).toHaveClass(/bw-feedback-skip/);
  await expect(page.locator('.bw-feedback-float')).toContainText('已略過 1 個嵌入內容');
});

test('paste sources are recognised', async ({ page }) => {
  const section = page.locator('[data-screen-label="05 Paste sources"]');
  await section.scrollIntoViewIfNeeded();
  await section.getByRole('button', { name: '從 Google 文件貼上' }).click();
  await expect(page.locator('.bw-toast')).toContainText('從 Google 文件貼上');
  await expect(page.locator('.bw-toast')).toContainText('移除 字型、行距');
  await section.getByRole('button', { name: '從 Word 貼上' }).click();
  await expect(page.locator('.bw-toast')).toContainText('從 Word 貼上');
  await expect(page.locator('.bw-toast')).toContainText('1 個表格');
  await section.getByRole('button', { name: '貼上 Markdown' }).click();
  await expect(page.locator('.bw-toast')).toContainText('偵測到 Markdown');
  await expect(page.locator('.bw-toast')).toContainText('保留原文');
  await expect(section.locator('.bw-editor h2').last()).toHaveText('下週計畫');
  await expect(section.locator('.bw-editor .bw-code')).toHaveCount(1);
});

test('save error banner jumps to the rejected block', async ({ page }) => {
  await page.getByRole('button', { name: '儲存失敗' }).click();
  const banner = page.locator('.bw-banner-error');
  await expect(banner).toContainText('無法儲存');
  await expect(banner).toContainText('blocks[9].marks[0].attrs.href');
  await banner.getByRole('button', { name: '前往區塊' }).click();
  await expect(main(page).locator('.bw-error-block')).toContainText('完整規格見');
  await page.getByRole('button', { name: '離線' }).click();
  await expect(page.locator('.bw-banner-offline')).toContainText('3 筆變更待同步');
});

test('version history shows a diff', async ({ page }) => {
  await page.locator('.switch-group').getByRole('button', { name: '版本' }).click();
  await expect(page.locator('.bw-history')).toBeVisible();
  await expect(page.locator('.bw-diff .bw-diff-removed')).toContainText('第一版先不處理行動裝置輸入法');
  await expect(page.locator('.bw-diff .bw-diff-added')).toContainText('完整規格見');
  // The formatting toolbar gives way to a read-only bar of the same height.
  await expect(page.locator('.frame .bw-toolbar-page:not(.bw-diff-bar)')).toHaveCount(0);
  await expect(page.locator('.frame .bw-diff-bar')).toContainText('唯讀');
});

test('comments panel highlights its anchor', async ({ page }) => {
  await main(page).locator('blockquote').scrollIntoViewIfNeeded();
  await page.locator('.bw-comment-badge').first().click();
  await expect(page.locator('.bw-panel')).toContainText('這句可以放到文件開頭');
  expect(await page.evaluate(() => (CSS as unknown as { highlights: Map<string, unknown> }).highlights.has('bw-comment'))).toBe(true);
  await page.locator('.bw-reply input').fill('好');
  await page.locator('.bw-reply input').press('Enter');
  await expect(page.locator('.bw-comment-msg')).toHaveCount(3);
});

test('presence menu jumps to a collaborator', async ({ page }) => {
  await page.locator('.bw-avatars').click();
  await expect(page.locator('.bw-presence-menu')).toContainText('3 人在線');
  await page.locator('.bw-presence-menu .bw-link-btn').first().click();
  expect(await page.evaluate(() => (window as unknown as { __editor: { selection: { type: string } } }).__editor.selection.type)).toBe('text');
});

test('large documents are virtualized and still searchable', async ({ page }) => {
  const section = page.locator('[data-screen-label="06 Empty and large"]');
  await section.scrollIntoViewIfNeeded();
  await section.getByRole('button', { name: /載入 3,412/ }).click();
  const editor = section.locator('.large-doc .bw-editor');
  await expect(editor).toBeVisible();
  const rendered = await editor.locator(':scope > [data-block-id]').count();
  expect(rendered).toBeGreaterThan(5);
  expect(rendered).toBeLessThan(400);
  await expect(section.locator('.bw-statusbar')).toContainText('已啟用虛擬化');
  await section.getByRole('button', { name: /搜尋/ }).click();
  await section.locator('.bw-searchbar input').fill('Gboard');
  await expect(section.locator('.bw-search-count')).toHaveText(/1 \/ 6\d\d/);
});

test('empty document shows the first-run tips', async ({ page }) => {
  const section = page.locator('[data-screen-label="06 Empty and large"]');
  await section.scrollIntoViewIfNeeded();
  const tips = section.locator('.empty-doc .bw-onboarding');
  await expect(tips).toContainText('插入任何區塊');
  await section.locator('.empty-doc .bw-editor').click();
  await page.keyboard.type('Hello');
  await expect(tips).toHaveCount(0);
});

test('mobile: format row on selection and slash as a bottom sheet', async ({ page }) => {
  const section = page.locator('[data-screen-label="02b Mobile details"]');
  await section.scrollIntoViewIfNeeded();
  await select(page, '[data-screen-label="02b Mobile details"] .phone-col:nth-child(1) .bw-editor', '組字中按 Enter');
  await expect(section.locator('.phone-col').nth(0).locator('.bw-mobile-bar [aria-label="斜體 Italic"]')).toBeVisible();
  const second = section.locator('.phone-col').nth(1).locator('.bw-editor');
  await second.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  await expect(page.locator('.bw-sheet')).toContainText('插入區塊');
  await page.locator('.bw-sheet-tile').filter({ hasText: '待辦清單' }).click();
  await expect(second.locator('.bw-li-todo')).toHaveCount(1);
});

test('migration queue lists issues and accepts results', async ({ page }) => {
  const section = page.locator('[data-screen-label="08 Migration"]');
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator('.bw-feedback')).toHaveCount(2);
  await expect(section.locator('.mig-result')).toContainText('營收成長 12%');
  await section.getByRole('button', { name: '接受轉換結果' }).click();
  await expect(section.locator('.mig-item')).toHaveCount(3);
});
