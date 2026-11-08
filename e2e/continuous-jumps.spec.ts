/**
 * Regression tests for jumping while continuous reading is on. A slow network
 * is simulated so the old chapters are still on the page while the new one
 * loads, and the reader keeps scrolling through that moment.
 */
import { expect, test, type Page } from './fixtures';
import { BOOKS } from '../src/bible/books';
import { scrollToChapter } from './scroll-helpers';

// Block the service worker so page.route sees (and can slow down) every book request.
test.use({ serviceWorkers: 'block' });

const order = new Map<string, number>(BOOKS.map((b, i) => [b.id, i]));

/** Chapter keys on the page, top to bottom. */
const sectionKeys = (page: Page) =>
  page.locator('section[data-chapter-key]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.chapterKey!));

/** Every chapter on the page must follow the one above it, with nothing stitched in from elsewhere. */
async function expectUnbroken(page: Page) {
  const keys = await sectionKeys(page);
  for (let i = 1; i < keys.length; i++) {
    const [pb, pc] = keys[i - 1]!.split('.');
    const [b, c] = keys[i]!.split('.');
    const sameBookNext = b === pb && Number(c) === Number(pc) + 1;
    const nextBookStart = order.get(b!) === order.get(pb!)! + 1 && c === '1' && Number(pc) === BOOKS[order.get(pb!)!]!.chapters;
    expect(sameBookNext || nextBookStart, `${keys[i - 1]} then ${keys[i]} in ${keys.join(', ')}`).toBe(true);
  }
  return keys;
}

const title = async (page: Page) => (await page.locator('.place-btn').innerText()).replace('▾', '').trim();

async function scrollUntil(page: Page, want: string, deltaY: number) {
  try {
    await scrollToChapter(page, want, deltaY, () => expectUnbroken(page));
  } catch (e) {
    const state = await page.evaluate(() => ({
      y: Math.round(scrollY),
      height: document.documentElement.scrollHeight,
      url: location.pathname + location.search,
    }));
    throw new Error(`${(e as Error).message}; chapters ${(await sectionKeys(page)).join(', ')}; ${JSON.stringify(state)}`, {
      cause: e,
    });
  }
}

async function slowBook(page: Page, book: string, ms: number) {
  await page.route(`**/bibles/*/${book}.json`, async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

/** Opens the picker and jumps, then keeps scrolling while the new chapter loads. */
async function jumpWhileScrolling(page: Page, bookName: string, chapter: number) {
  await page.locator('.place-btn').click();
  await page.getByRole('button', { name: bookName, exact: true }).click();
  await page.getByRole('button', { name: String(chapter), exact: true }).click();
  await page.getByRole('button', { name: 'Read from the start' }).click();
  await page.mouse.move(400, 400);
  for (let i = 0; i < 15; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(60);
  }
}

async function enableContinuous(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('margins.settings.v1', JSON.stringify({ continuousScroll: true })));
}

test('1 Corinthians 2 → Genesis 50: scrolling up shows Genesis 49, down shows Exodus 1', async ({ page }) => {
  test.setTimeout(120_000);
  await enableContinuous(page);
  await page.goto('/bsb/1CO/2');
  await scrollUntil(page, '1 Corinthians 4', 1200);

  await slowBook(page, 'GEN', 900);
  await jumpWhileScrolling(page, 'Genesis', 50);
  await expect(page.locator('section[data-chapter-key="GEN.50"]')).toBeVisible();
  await page.waitForTimeout(1500);

  let keys = await expectUnbroken(page);
  expect(keys.every((k) => k.startsWith('GEN.') || k.startsWith('EXO.')), keys.join(', ')).toBe(true);

  await scrollUntil(page, 'Genesis 49', -900);
  keys = await expectUnbroken(page);
  expect(keys.some((k) => k.startsWith('1CO.'))).toBe(false);

  await scrollUntil(page, 'Exodus 1', 1500);
  keys = await expectUnbroken(page);
  expect(keys.every((k) => k.startsWith('GEN.') || k.startsWith('EXO.')), keys.join(', ')).toBe(true);
  await expect(page).toHaveURL(/\/bsb\/EXO\/1(\?v=\d+)?$/);
});

test('John → 1 Corinthians 5: scrolling down continues with 1 Corinthians 6, never John', async ({ page }) => {
  test.setTimeout(120_000);
  await enableContinuous(page);
  await page.goto('/bsb/JHN/7');
  await scrollUntil(page, 'John 8', 1200);

  await slowBook(page, '1CO', 900);
  await jumpWhileScrolling(page, '1 Corinthians', 5);
  await expect(page.locator('section[data-chapter-key="1CO.5"]')).toBeVisible();
  await page.waitForTimeout(1500);

  await scrollUntil(page, '1 Corinthians 7', 1200);
  const keys = await expectUnbroken(page);
  expect(keys.some((k) => k.startsWith('JHN.')), keys.join(', ')).toBe(false);
  await expect.poll(() =>
    page.evaluate(() => JSON.parse(localStorage.getItem('margins.settings.v1') ?? '{}').last),
  ).toMatchObject({ book: '1CO', chapter: 7 });
});

test('a chapter still loading from the old place is never stitched onto the new one', async ({ page }) => {
  test.setTimeout(120_000);
  await enableContinuous(page);
  // At the end of John, the next chapter is Acts 1, in a book not loaded yet. Make it very slow.
  await slowBook(page, 'ACT', 3000);
  await slowBook(page, '1CO', 600);
  await page.goto('/bsb/JHN/21');
  await expect(page.locator('section[data-chapter-key="JHN.21"]')).toBeVisible();

  await jumpWhileScrolling(page, '1 Corinthians', 5);
  await expect(page.locator('section[data-chapter-key="1CO.5"]')).toBeVisible();
  // Give the slow Acts request time to arrive.
  await page.waitForTimeout(4000);
  const keys = await expectUnbroken(page);
  expect(keys.some((k) => k.startsWith('ACT.') || k.startsWith('JHN.')), keys.join(', ')).toBe(false);

  await scrollUntil(page, '1 Corinthians 7', 1200);
  await expectUnbroken(page);
});

test('jumping within John to John 7 and scrolling goes 7, 8, 9… in order, and the address keeps up', async ({ page }) => {
  test.setTimeout(120_000);
  await enableContinuous(page);
  await page.goto('/bsb/JHN/1');
  await scrollUntil(page, 'John 2', 1200);

  // John is already loaded, so this jump completes at once.
  await page.locator('.place-btn').click();
  await page.getByRole('button', { name: 'John', exact: true }).click();
  await page.getByRole('button', { name: '7', exact: true }).click();
  await page.getByRole('button', { name: 'Read from the start' }).click();
  await expect(page.locator('.place-btn')).toContainText('John 7');

  const seen: number[] = [];
  await page.mouse.move(400, 400);
  for (let i = 0; i < 200 && (seen.at(-1) ?? 0) < 12; i++) {
    const t = await title(page);
    expect(t).toMatch(/^John \d+$/);
    const n = Number(t.split(' ')[1]);
    if (n !== seen.at(-1)) seen.push(n);
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(60);
    await expectUnbroken(page);
  }
  // Never goes backwards or leaps: each chapter is seen in turn.
  expect(seen).toEqual([7, 8, 9, 10, 11, 12]);
  // While still scrolling, the address follows within a moment.
  await expect(page).toHaveURL(/\/bsb\/JHN\/12(\?v=\d+)?$/);
});
