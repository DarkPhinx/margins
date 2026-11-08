import { expect, test, type Page } from '@playwright/test';

/** Selects one word of a verse's text, as a double-click or long-press would. */
async function selectWord(page: Page, verse: number, word: string) {
  await page.evaluate(
    ({ verse, word }) => {
      for (const span of document.querySelectorAll(`article.chapter [data-v="${verse}"]`)) {
        const node = span.firstChild;
        const at = node?.textContent?.search(new RegExp(`\\b${word}\\b`)) ?? -1;
        if (node && at >= 0) {
          const r = document.createRange();
          r.setStart(node, at);
          r.setEnd(node, at + word.length);
          const sel = window.getSelection()!;
          sel.removeAllRanges();
          sel.addRange(r);
          return;
        }
      }
      throw new Error(`"${word}" not found in verse ${verse}`);
    },
    { verse, word },
  );
}

test('select a word in the Bible and look it up in the original language', async ({ page }) => {
  await page.goto('/bsb/JHN/3?v=14');
  await expect(page.getByText('Jesus and Nicodemus')).toBeAttached();
  // The verse in the middle of the screen, so there's room above it.
  await page.locator('article.chapter [data-v="16"]').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await selectWord(page, 16, 'loved');
  const popup = page.getByRole('toolbar', { name: 'Selected text: loved' });
  await expect(popup).toBeVisible();
  // It sits just above the word, on screen.
  const box = await popup.boundingBox();
  const word = await page.evaluate(() => window.getSelection()!.getRangeAt(0).getBoundingClientRect().top);
  expect(box!.y + box!.height).toBeLessThanOrEqual(word + 2);
  await popup.getByRole('button', { name: 'Original language for this word' }).click();
  await expect(page).toHaveURL(/\/original\/word\/G0025\?v=43003016&i=2&t=bsb$/);
  await expect(page.getByRole('region', { name: 'In John 3:16' })).toContainText('ēgapēsen');

  // The Hebrew of an Old Testament word, from the KJV.
  await page.goto('/kjv/GEN/1');
  await expect(page.locator('article.chapter[data-scope="GEN.1"] [data-v="1"]').first()).toBeAttached();
  await selectWord(page, 1, 'created');
  await page.getByRole('toolbar', { name: 'Selected text: created' }).getByRole('button', { name: 'Original language for this word' }).click();
  await expect(page).toHaveURL(/\/original\/word\/H1254A\?v=1001001&i=1&t=kjv$/);
  await expect(page.getByRole('article', { name: /H1254A/ })).toContainText('to create');
});

test('selecting across verses offers those verses', async ({ page }) => {
  await page.goto('/bsb/JHN/3');
  await expect(page.getByText('Jesus and Nicodemus')).toBeAttached();
  await page.evaluate(() => {
    const a = document.querySelector('article.chapter [data-v="16"]')!.firstChild!;
    const b = document.querySelector('article.chapter [data-v="17"]')!.firstChild!;
    const r = document.createRange();
    r.setStart(a, 4);
    r.setEnd(b, 10);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(r);
  });
  const popup = page.getByRole('toolbar', { name: /^Selected text:/ });
  await popup.getByRole('button', { name: 'Original language: these verses' }).click();
  await expect(page).toHaveURL(/\/original\/verse\/43003016-43003017$/);
});

test('word pages work offline once they have been used', async ({ page, context }) => {
  await page.goto('/original/word/G0026');
  await expect(page.getByRole('region', { name: 'Usage' })).toContainText('Appears 116 times');
  // Once the service worker is in charge, using the page again stores its word data.
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker?.controller), { timeout: 30_000 }).toBe(true);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Usage' })).toContainText('Appears 116 times');
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          if (!(await caches.has('margins-words'))) return 0;
          return (await (await caches.open('margins-words')).keys()).length;
        }),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(1);
  // Cut the network: only the service worker's cache can answer.
  await context.route('**/*', (route) => route.abort('internetdisconnected'));
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Usage' })).toContainText('Appears 116 times');
  await expect(page.getByRole('region', { name: 'Range of meanings' })).toContainText('love, goodwill, esteem');
});
