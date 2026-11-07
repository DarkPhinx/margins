import { expect, test, type Page } from '@playwright/test';

async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem('margins.settings.v1', JSON.stringify({ last: { book: 'JHN', chapter: 3, verse: 16 } }));
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('margins');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.goto('/');
}

test('the app opens on the home page, with your place and your journal', async ({ page }) => {
  await fresh(page);
  await expect(page.getByRole('region', { name: 'Continue reading' })).toContainText('John 3:16');
  await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();

  // A standalone entry.
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await expect(page).toHaveURL(/\/journal\/[\w-]+\?new=1$/);
  await expect(page.getByText('Standalone entry')).toBeVisible();
  await page.getByLabel('Title').fill('Sabbath');
  await page.getByRole('textbox', { name: 'Journal entry' }).click();
  await page.keyboard.type('Rest is a gift, not a reward. Mk 2:27.');
  await expect(page.getByText('Saved')).toBeVisible();
  await page.getByRole('button', { name: '← Journal' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/journal');

  // An entry on the chapter being read, from the Journal page.
  await page.getByRole('button', { name: 'New entry on John 3' }).click();
  await expect(page.locator('.chapter-tie')).toContainText('On John 3');
  await page.getByRole('textbox', { name: 'Journal entry' }).click();
  await page.keyboard.type('Wind and Spirit.');
  await page.getByRole('button', { name: '← Journal' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/journal');

  await page.reload();
  const list = page.getByRole('main').getByRole('list');
  await expect(list.getByRole('button')).toHaveCount(2);
  await expect(list).toContainText('Sabbath');
  await expect(list).toContainText('Standalone');
  await expect(list).toContainText('John 3');

  // Home shows the latest entries too.
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('region', { name: 'Journal' })).toContainText('Sabbath');

  // The chapter entry shows while reading John 3, with the sidebar still beside the text.
  await page.getByRole('button', { name: /Continue reading/ }).click();
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Bible' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Study' }).click();
  await expect(page.getByRole('complementary', { name: 'Study' })).toContainText('Wind and Spirit.');
  await nav.getByRole('link', { name: 'Home' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/');
});

test('notes page: a standalone note written in the pop-up', async ({ page }) => {
  await fresh(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Notes' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/notes');
  await page.getByRole('button', { name: 'New note' }).click();
  const dialog = page.getByRole('dialog', { name: 'Note' });
  await expect(dialog).toContainText('A standalone note, not tied to any verse.');
  await expect(dialog.getByRole('textbox', { name: 'Note' })).toBeFocused();
  await page.keyboard.type('Rest is trust. Compare Heb 4:9-10.');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  const card = page.getByRole('article', { name: 'Standalone note' });
  await expect(card).toContainText('Rest is trust.');
  await card.getByRole('button', { name: 'Heb 4:9-10: read the passage' }).click();
  await expect(page).toHaveURL(/\/bsb\/HEB\/4\?v=9$/);
});

test('on a phone the sidebar is a drawer behind the menu button, and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await fresh(page);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav).not.toBeInViewport();
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(nav).toBeInViewport();
  await nav.getByRole('link', { name: 'Bible' }).click();
  await expect(page).toHaveURL(/\/bsb\/JHN\/3/);
  await expect(nav).not.toBeInViewport();
  await expect(page.locator('article.chapter')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('home and journal pages work offline', async ({ page, context }) => {
  await fresh(page);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker?.controller), { timeout: 30_000 })
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await page.getByRole('textbox', { name: 'Journal entry' }).click();
  await page.keyboard.type('Written offline.');
  const url = page.url().replace('?new=1', '');
  await page.goto(url);
  await expect(page.getByRole('textbox', { name: 'Journal entry' })).toContainText('Written offline.');
});
