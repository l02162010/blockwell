import { expect, test, type CDPSession, type Page } from '@playwright/test';

/**
 * IME composition (Zhuyin, Cangjie, Pinyin…) driven through Chromium's DevTools protocol: the
 * same compositionstart → update → end sequence a real input method produces. Firefox and
 * WebKit have no such hook; their IME paths are covered by the manual device checklist.
 */

test.skip(({ browserName }) => browserName !== 'chromium', 'IME composition is driven through the Chromium DevTools protocol');

const ed = (page: Page) => page.locator('[data-screen-label="01 Full-page editor"] .bw-editor');
type B = { id: string; type: string; text?: string; marks?: { type: string; from: number; to: number }[]; children?: B[] };
const json = (page: Page) => page.evaluate(() => (window as unknown as { __editor: { getJSON(): { blocks: B[] } } }).__editor.getJSON().blocks);
const find = (bs: B[], f: (b: B) => boolean): B | undefined => {
  for (const b of bs) {
    if (f(b)) return b;
    const c = b.children && find(b.children, f);
    if (c) return c;
  }
};
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

/** Types `steps` as composition updates (ㄓ, ㄓㄨ, ㄓㄨㄥ…) and commits `result`. */
async function compose(cdp: CDPSession, steps: string[], result: string) {
  for (const s of steps) await cdp.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length });
  await cdp.send('Input.insertText', { text: result });
}

async function setup(page: Page) {
  await page.goto('/');
  await expect(ed(page)).toBeVisible();
  return page.context().newCDPSession(page);
}
async function caretAfter(page: Page, start: string) {
  const el = ed(page).locator('[data-bw-text]', { hasText: start }).first();
  await el.scrollIntoViewIfNeeded();
  await el.click();
  await page.keyboard.press('End');
}

test('composes Chinese at the end of a paragraph', async ({ page }) => {
  const cdp = await setup(page);
  await caretAfter(page, '完整規格見');
  await compose(cdp, ['ㄓ', 'ㄓㄨ', 'ㄓㄨㄥ'], '中');
  await compose(cdp, ['ㄨ', 'ㄨㄣ', 'ㄨㄣˊ'], '文');
  await expect.poll(async () => find(await json(page), (b) => !!b.text?.startsWith('完整規格見'))!.text).toMatch(/驗證。中文$/);
  // The caret ends after the composed text: typing continues there.
  await page.keyboard.type('!');
  await expect.poll(async () => find(await json(page), (b) => !!b.text?.startsWith('完整規格見'))!.text).toMatch(/中文!$/);
});

test('composing inside bold text stays bold', async ({ page }) => {
  const cdp = await setup(page);
  const bold = ed(page).locator('strong', { hasText: '消除 XSS' });
  await bold.scrollIntoViewIfNeeded();
  await bold.click({ position: { x: 24, y: 8 } }); // after 消, inside the bold range
  await compose(cdp, ['ㄉ', 'ㄉㄜ˙'], '的');
  await expect.poll(async () => {
    const b = find(await json(page), (x) => !!x.text?.includes('消'))!;
    const at = b.text!.indexOf('消的');
    return at >= 0 && b.marks!.some((m) => m.type === 'bold' && m.from <= at + 1 && m.to > at + 1) ? 'bold' : `${b.text!.slice(38, 52)} ${JSON.stringify(b.marks)}`;
  }).toBe('bold');
});

test('composing over a selection across blocks replaces it', async ({ page }) => {
  const cdp = await setup(page);
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-screen-label="01 Full-page editor"] [data-bw-text]')];
    const a = els.find((e) => e.textContent === 'Schema 白名單與後端驗證')!.firstChild!;
    const b = els.find((e) => e.textContent === '色盤 token 與 CSS 變數')!.firstChild!;
    (document.querySelector('[data-screen-label="01 Full-page editor"] .bw-editor') as HTMLElement).focus();
    const r = document.createRange();
    r.setStart(a, 6);
    r.setEnd(b, 2);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await page.waitForTimeout(50);
  await compose(cdp, ['ㄏ', 'ㄏㄜˊ'], '合');
  await expect.poll(async () => (await json(page)).some((b) => b.text === 'Schema合 token 與 CSS 變數')).toBe(true);
});

test('composing in an empty line and then Enter starts a new block', async ({ page }) => {
  const cdp = await setup(page);
  await caretAfter(page, '完整規格見');
  await page.keyboard.press('Enter');
  await compose(cdp, ['ㄋ', 'ㄋㄧˇ'], '你');
  await page.keyboard.press('Enter');
  await compose(cdp, ['ㄏ', 'ㄏㄠˇ'], '好');
  await expect.poll(async () => {
    const texts = (await json(page)).map((b) => b.text);
    return texts[texts.indexOf('你') + 1];
  }).toBe('好');
});

test('Enter right after choosing a word splits after that word', async ({ page }) => {
  const cdp = await setup(page);
  await caretAfter(page, '完整規格見');
  await page.keyboard.press('Enter');
  await compose(cdp, ['ㄧ'], '一');
  // No pause: the Enter arrives before the editor's post-composition timer.
  await page.keyboard.press('Enter');
  await compose(cdp, ['ㄦ', 'ㄦˋ'], '二');
  await expect.poll(async () => {
    const texts = (await json(page)).map((b) => b.text);
    const i = texts.indexOf('一');
    return [texts[i], texts[i + 1]];
  }).toEqual(['一', '二']);
});

test('words composed back to back all arrive', async ({ page }) => {
  const cdp = await setup(page);
  await caretAfter(page, '完整規格見');
  for (const [steps, word] of [[['ㄙ'], '四'], [['ㄨ'], '五'], [['ㄌ'], '六']] as const) await compose(cdp, [...steps], word);
  await expect.poll(async () => find(await json(page), (b) => !!b.text?.startsWith('完整規格見'))!.text).toMatch(/四五六$/);
});

test('one undo removes a composed word', async ({ page }) => {
  const cdp = await setup(page);
  await caretAfter(page, '完整規格見');
  await compose(cdp, ['ㄘ', 'ㄘㄜˋ'], '測');
  await page.waitForTimeout(600); // outside the typing merge window
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(async () => find(await json(page), (b) => !!b.text?.startsWith('完整規格見'))!.text).toMatch(/驗證。$/);
});

test('composing in a table cell and a list item', async ({ page }) => {
  const cdp = await setup(page);
  const cell = ed(page).locator('td [data-bw-text]', { hasText: /^iOS$/ });
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  await page.keyboard.press('End');
  await compose(cdp, ['ㄕ', 'ㄕㄡˇ'], '手');
  await caretAfter(page, '協作（Yjs）');
  await compose(cdp, ['ㄓ', 'ㄓㄨˇ'], '主');
  const bs = await json(page);
  expect(find(bs, (b) => b.text === 'iOS手')).toBeTruthy();
  expect(find(bs, (b) => b.text === '協作（Yjs）主')).toBeTruthy();
});

test('a composition that is cancelled leaves the text as it was', async ({ page }) => {
  const cdp = await setup(page);
  await caretAfter(page, '完整規格見');
  const before = find(await json(page), (b) => !!b.text?.startsWith('完整規格見'))!.text;
  await cdp.send('Input.imeSetComposition', { text: 'ㄓ', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
  await page.waitForTimeout(100);
  expect(find(await json(page), (b) => !!b.text?.startsWith('完整規格見'))!.text).toBe(before);
});
