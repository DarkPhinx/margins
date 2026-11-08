import { expect, test, type Page } from './fixtures';

async function fresh(page: Page, path: string) {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('margins-e2e-user');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.goto(path);
}

const verseText = (page: Page, n: number) => page.locator(`article.chapter span[data-v="${n}"]`).first();
const bar = (page: Page) => page.getByRole('toolbar', { name: /Selected/ });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Study' });

test('cross-references work offline, and links are still there after a reload', async ({ page, context }) => {
  await fresh(page, '/bsb/JHN/3');
  // Wait until every cross-reference file is cached.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          if (!navigator.serviceWorker?.controller) return 0;
          let n = 0;
          for (const key of await caches.keys()) {
            n += (await (await caches.open(key)).keys()).filter((r) => /\/xrefs\/[1-3A-Z]{3}\.json/.test(r.url)).length;
          }
          return n;
        }),
      { timeout: 60_000, intervals: [500] },
    )
    .toBe(66);
  await context.setOffline(true);
  await page.reload();

  await verseText(page, 16).click();
  await bar(page).getByRole('button', { name: 'Cross-refs' }).click();
  const refs = panel(page).getByRole('region', { name: 'Cross-references' });
  await expect(refs.getByRole('listitem')).toHaveCount(10);
  await expect(refs.getByRole('listitem').first()).toContainText('Romans 5:8');
  await refs.getByRole('button', { name: 'Romans 5:8' }).click();
  await expect(panel(page).getByRole('heading', { name: 'Romans 5:8' })).toBeVisible();

  // A link, made offline.
  await verseText(page, 17).click();
  await bar(page).getByRole('button', { name: 'Link', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Link John 3:17' });
  await dialog.getByLabel('To which passage?').fill('Lk 19:10');
  await dialog.getByRole('button', { name: 'Save link' }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(panel(page).getByRole('article', { name: 'Link John 3:17 and Luke 19:10' })).toBeVisible();
});

test('on a phone the fuller selection bar fits, and cross-references open in the sheet', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await fresh(page, '/bsb/JHN/3');
  await verseText(page, 16).click();
  const box = await bar(page).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  for (const name of ['Note', 'Question', 'Cross-refs', 'Link', 'Answer']) {
    await expect(bar(page).getByRole('button', { name, exact: true })).toBeInViewport();
  }
  await bar(page).getByRole('button', { name: 'Cross-refs' }).click();
  await expect(panel(page).getByRole('region', { name: 'Cross-references' }).getByRole('listitem').first()).toContainText('Romans 5:8');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
