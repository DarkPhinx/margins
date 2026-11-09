import { expect, setContinuous, test, type Page } from './fixtures';
import { scrollToChapter } from './scroll-helpers';

const enableContinuous = (page: Page) => setContinuous(page, true);

const place = (page: Page) => page.locator('.place-btn');

/** Scrolls with the mouse wheel until the bar shows the wanted chapter. */
const scrollUntil = (page: Page, title: string, deltaY: number) => scrollToChapter(page, title, deltaY);

async function savedPosition(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('margins.settings.v1') ?? '{}').last);
}

test('scrolls from John 1 to John 15 and back, always knowing where you are', async ({ page }) => {
  test.setTimeout(120_000);
  await enableContinuous(page);
  await page.goto('/bsb/JHN/1');
  await expect(page.locator('section[data-chapter-key="JHN.1"]')).toBeVisible();

  await scrollUntil(page, 'John 15', 1500);
  await expect(page).toHaveURL(/\/bsb\/JHN\/15(\?v=\d+)?$/);
  await expect.poll(() => savedPosition(page)).toMatchObject({ book: 'JHN', chapter: 15 });
  // Chapters far behind are dropped from the page.
  expect(await page.locator('section[data-chapter-key]').count()).toBeLessThanOrEqual(8);

  await scrollUntil(page, 'John 2', -1500);
  await expect(page).toHaveURL(/\/bsb\/JHN\/2(\?v=\d+)?$/);
  await expect.poll(() => savedPosition(page)).toMatchObject({ book: 'JHN', chapter: 2 });

  // The verse in the URL is the one at the top of the screen.
  const url = new URL(page.url());
  const v = Number(url.searchParams.get('v') ?? 1);
  const top = await page
    .locator(`section[data-chapter-key="JHN.2"] [data-verse="${v}"]`)
    .first()
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeLessThan(200);
});

test('crosses from one book into the next', async ({ page }) => {
  await enableContinuous(page);
  await page.goto('/kjv/JUD/1?v=20');
  await scrollUntil(page, 'Revelation 1', 1200);
  await expect(page.locator('section[data-chapter-key="REV.1"] .chapter-book')).toHaveText('Revelation');
  await expect.poll(() => savedPosition(page)).toMatchObject({ book: 'REV', chapter: 1 });
});

test('loads the chapter above without moving the text you are reading', async ({ page }) => {
  await enableContinuous(page);
  await page.goto('/bsb/JHN/3?v=16');
  const verse = page.locator('section[data-chapter-key="JHN.3"] [data-verse="16"]');
  await expect(verse).toBeVisible();
  // John 2 is added above, out of sight.
  await expect(page.locator('section[data-chapter-key="JHN.2"]')).toBeAttached();
  await page.waitForTimeout(400);
  const top = await verse.evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeGreaterThan(40);
  expect(top).toBeLessThan(200);
  await expect(place(page)).toContainText('John 3');

  // Reopening offers the same place, and continuing goes back to it.
  await page.goto('/');
  await page.getByRole('button', { name: /Continue reading\s*John 3:16/ }).click();
  await expect(page).toHaveURL(/\/bsb\/JHN\/3\?v=16$/);
});
