import { expect, test, type Page } from './fixtures';

test.use({ signedOut: true });

const prompt = (page: Page) => page.getByRole('dialog', { name: 'Save your study with an account' });

/** Selects one word of a verse, as a double-click or long-press would. */
async function selectWord(page: Page, verse: number, word: string) {
  await page.evaluate(
    ({ verse, word }) => {
      for (const span of document.querySelectorAll(`article.chapter [data-v="${verse}"]`)) {
        const node = span.firstChild;
        const at = node?.textContent?.indexOf(word) ?? -1;
        if (node && at >= 0) {
          const r = document.createRange();
          r.setStart(node, at);
          r.setEnd(node, at + word.length);
          window.getSelection()!.removeAllRanges();
          window.getSelection()!.addRange(r);
          return;
        }
      }
      throw new Error(word);
    },
    { verse, word },
  );
}

test('without an account: read, look up cross-references and the original language; saving asks first', async ({ page }) => {
  await page.goto('/');
  // Home opens the Bible when signed out.
  await expect(page).toHaveURL(/\/bsb\/[1-3A-Z]{3}\/\d+/);
  await page.goto('/bsb/JHN/3');
  await expect(page.getByText('Jesus and Nicodemus')).toBeVisible();

  // Cross-references, with Show all.
  await page.locator('article.chapter span[data-v="16"]').first().click();
  await page.getByRole('toolbar', { name: 'Selected: John 3:16' }).getByRole('button', { name: 'Cross-refs' }).click();
  const refs = page.getByRole('complementary', { name: 'Study' }).getByRole('region', { name: 'Cross-references' });
  await expect(refs.getByRole('listitem')).toHaveCount(10);
  await refs.getByRole('button', { name: /Show all/ }).click();
  expect(await refs.getByRole('listitem').count()).toBeGreaterThan(10);

  // A highlight asks first, with Sign in and Create account; nothing is saved.
  await page.locator('article.chapter span[data-v="17"]').first().click();
  await page.getByRole('toolbar', { name: 'Selected: John 3:17' }).getByRole('button', { name: 'Highlight yellow' }).click();
  await expect(prompt(page)).toBeVisible();
  await expect(prompt(page).getByRole('button', { name: 'Create account' })).toBeVisible();
  await prompt(page).getByRole('button', { name: 'Not now' }).click();
  await expect(prompt(page)).toBeHidden();
  await expect(page.locator('article.chapter .hl')).toHaveCount(0);

  // Words: highlighting asks; the original language opens.
  await page.getByRole('button', { name: 'Close study panel' }).click();
  await selectWord(page, 16, 'loved');
  const words = page.getByRole('toolbar', { name: 'Selected text: loved' });
  await words.getByRole('button', { name: 'Highlight pink' }).click();
  await expect(prompt(page).getByRole('heading', { name: 'Save highlights with an account' })).toBeVisible();
  await prompt(page).getByRole('button', { name: 'Not now' }).click();
  await selectWord(page, 16, 'loved');
  await page.getByRole('toolbar', { name: 'Selected text: loved' }).getByRole('button', { name: 'Original language for this word' }).click();
  await expect(page).toHaveURL(/\/original\/word\/G0025/);
  await expect(page.getByRole('region', { name: 'In John 3:16' })).toContainText('ēgapēsen');

  // Notes explains accounts in place, with the sidebar still there.
  await page.goto('/notes');
  await expect(page.getByRole('region', { name: 'Your notes and questions' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /Sign in/ })).toBeVisible();
});

test('without an account, reading works offline once the Bibles are stored', async ({ page, context }) => {
  await page.goto('/bsb/JHN/3');
  await expect(page.getByText('Jesus and Nicodemus')).toBeVisible();
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
  await context.setOffline(true);
  await page.goto('/kjv/PSA/23');
  await expect(page.getByText(/The LORD is my shepherd; I shall not want/)).toBeVisible();
});
