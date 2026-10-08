import { expect, test } from '@playwright/test';

const pages = [
  '/', '/guide/getting-started', '/guide/document', '/guide/security', '/guide/variants', '/guide/uploads',
  '/guide/mentions', '/guide/collaboration', '/guide/saving', '/guide/messages', '/guide/theming',
  '/guide/headless', '/guide/commands', '/guide/server', '/guide/migration', '/guide/testing',
  '/api/blockwell-editor', '/api/panels', '/api/headless', '/api/editor', '/api/events', '/api/core',
];

for (const path of pages) {
  test(`${path} loads without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${m.text()} ${m.location().url}`));
    await page.goto(path);
    await expect(page.locator('.VPContent h1').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
}

test('the live demo on the API page is editable', async ({ page }) => {
  await page.goto('/api/blockwell-editor');
  const editor = page.locator('.demo .bw-editor');
  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' OK');
  await expect(editor.locator('p').first()).toContainText('試試看');
  await expect(editor.locator('p').first()).toContainText(' OK');
});

test('the API tables are generated from the source', async ({ page }) => {
  await page.goto('/api/blockwell-editor');
  await expect(page.locator('.api-table').getByRole('cell', { name: 'variant', exact: true })).toBeVisible();
  await expect(page.locator('.api-table').getByRole('cell', { name: '@submit' })).toBeVisible();
  await page.goto('/api/editor');
  await expect(page.locator('.api-table').getByText('replaceContent(', { exact: false })).toBeVisible();
});

test('search finds a guide page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /搜尋|Search/ }).first().click();
  await page.locator('.VPLocalSearchBox input').fill('jsdom');
  await expect(page.locator('.VPLocalSearchBox')).toContainText('舊內容遷移');
});
