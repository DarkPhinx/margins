import { expect, test } from '@playwright/test';

test('both Bibles work fully offline after the first visit', async ({ page, context }) => {
  await page.goto('/bsb/JHN/3');
  await expect(page.getByText('Jesus and Nicodemus')).toBeVisible();

  // Wait for the service worker to finish caching every book in the background.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          if (!navigator.serviceWorker?.controller) return 0;
          let books = 0;
          for (const key of await caches.keys()) {
            const reqs = await (await caches.open(key)).keys();
            books += reqs.filter((r) => /\/bibles\/(bsb|kjv)\/[1-3A-Z]{3}\.json/.test(r.url)).length;
          }
          return books;
        }),
      { timeout: 60_000, intervals: [500] },
    )
    .toBe(132);

  // Cut the network: every request that reaches it fails, so only the service
  // worker's cache can answer. (setOffline does not reliably cover service-worker
  // navigations in Chromium.)
  const leaked: string[] = [];
  await context.route('**/*', (route) => {
    leaked.push(route.request().url());
    return route.abort('internetdisconnected');
  });
  await context.setOffline(true);

  await page.reload();
  await expect(page.getByText('Jesus and Nicodemus')).toBeVisible();

  // A book never opened online, in both translations.
  await page.goto('/kjv/PSA/119?v=105');
  await expect(page.getByText(/a lamp unto my feet, and a light unto my path/)).toBeVisible();
  await page.getByLabel('Translation').selectOption('bsb');
  await expect(page.getByText(/Your word is a lamp to my feet/)).toBeVisible();

  await page.goto('/bsb/REV/22');
  await expect(page.locator('p', { hasText: 'be with all the saints.' })).toContainText('The grace of the Lord Jesus');

  // An omitted verse marker still works offline.
  await page.goto('/bsb/ACT/8');
  await page.getByRole('button', { name: /Acts 8:37/ }).click();
  await expect(page.getByRole('dialog', { name: /Acts 8:37/ })).toContainText('And Philip said');
  expect(leaked.filter((u) => /\/bibles\/|\/assets\/|\/$|\/(bsb|kjv)\//.test(u))).toEqual([]);
});

test('no ESV appears anywhere while the flag is off', async ({ page }) => {
  await page.goto('/esv/JHN/3');
  await expect(page).toHaveURL(/\/bsb\/JHN\/3/);
  const options = await page.getByLabel('Translation').locator('option').allTextContents();
  expect(options).toEqual(['BSB', 'KJV']);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).not.toContainText(/ESV|Crossway|English Standard/);
  expect(await page.content()).not.toMatch(/\bESV\b|Crossway/);
});

test('fits a phone screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto('/bsb/PSA/119');
  await expect(page.getByRole('heading', { name: 'Your Word Is a Lamp to My Feet' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
