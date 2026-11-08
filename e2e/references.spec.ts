import { expect, test, type Page } from './fixtures';

async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem('margins.settings.v1', JSON.stringify({ last: { book: 'JHN', chapter: 3, verse: 16 } }));
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('margins-e2e-user');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.goto('/');
}

const journalEditor = (page: Page) => page.getByRole('textbox', { name: 'Journal entry' });

test('clicking a reference in a journal entry goes to that verse, and the entry is kept', async ({ page }) => {
  await fresh(page);
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await journalEditor(page).click();
  await page.keyboard.type('Grace before we ask: Rom 5:8. Read all of Psalm 23 too.');
  const ref = journalEditor(page).locator('.ref-detected', { hasText: 'Rom 5:8' });
  await expect(ref).toHaveCSS('cursor', 'pointer');

  await ref.click();
  await expect(page).toHaveURL(/\/bsb\/ROM\/5\?v=8$/);
  await expect(page.locator('#v8')).toHaveClass(/verse-target/);

  // Back home, the entry has everything typed, and a whole-chapter reference opens the chapter.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();
  await page.getByRole('region', { name: 'Journal' }).getByRole('button', { name: /Grace before we ask/ }).click();
  await expect(journalEditor(page)).toContainText('Read all of Psalm 23 too.');
  await journalEditor(page).locator('.ref-detected', { hasText: 'Psalm 23' }).click();
  await expect(page).toHaveURL(/\/bsb\/PSA\/23$/);
});

test('Alt+click puts the cursor in a reference to edit it, instead of following it', async ({ page }) => {
  await fresh(page);
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await journalEditor(page).click();
  await page.keyboard.type('See Rom 5:8 here.');
  await journalEditor(page).locator('.ref-detected').click({ modifiers: ['Alt'] });
  await expect(page).toHaveURL(/\/journal\//);
  await expect(journalEditor(page)).toBeFocused();
});

test('clicking a reference in a note pop-up saves the note, closes the pop-up and goes to the verse', async ({ page }) => {
  await fresh(page);
  await page.goto('/bsb/JHN/3');
  await page.locator('article.chapter span[data-v="16"]').first().click();
  await page.getByRole('toolbar', { name: /Selected/ }).getByRole('button', { name: 'Note', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Note' }).getByRole('textbox', { name: 'Note' });
  await expect(editor).toBeFocused();
  await page.keyboard.type('Compare 1 Jn 4:9.');
  await editor.locator('.ref-detected').click();
  await expect(page).toHaveURL(/\/bsb\/1JN\/4\?v=9$/);
  await expect(page.getByRole('dialog', { name: 'Note' })).toBeHidden();

  await page.goto('/bsb/JHN/3');
  await page.getByRole('button', { name: 'A note on verse 16' }).click();
  await expect(page.getByRole('dialog', { name: 'Note' }).getByRole('textbox', { name: 'Note' })).toContainText('Compare 1 Jn 4:9.');
});
