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

/** The first run of a verse's text (what a reader clicks on). */
const verseText = (page: Page, n: number) => page.locator(`article.chapter span[data-v="${n}"]`).first();
const bar = (page: Page) => page.getByRole('toolbar', { name: /Selected/ });
const noteDialog = (page: Page) => page.getByRole('dialog', { name: 'Note' });

test('hovering a verse tints the whole verse; clicking its text selects it', async ({ page }) => {
  await fresh(page, '/bsb/JHN/3');
  await expect(page.getByText('Jesus and Nicodemus')).toBeVisible();
  await verseText(page, 16).hover();
  const tinted = (n: number) =>
    page
      .locator(`article.chapter span[data-v="${n}"]`)
      .evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  await expect.poll(async () => (await tinted(16)).every((c) => c !== 'rgba(0, 0, 0, 0)')).toBe(true);
  expect((await tinted(17)).every((c) => c === 'rgba(0, 0, 0, 0)')).toBe(true);
  await expect(verseText(page, 16)).toHaveCSS('cursor', 'pointer');

  await verseText(page, 16).click();
  await expect(bar(page)).toHaveAccessibleName('Selected: John 3:16');
  await verseText(page, 18).click();
  await expect(bar(page)).toHaveAccessibleName('Selected: John 3:16–18');
});

test('a note is a pop-up over the passage: shows the verses, saves as you type, closes by clicking outside', async ({ page }) => {
  await fresh(page, '/bsb/JHN/3');
  await verseText(page, 16).click();
  await verseText(page, 17).click();
  await bar(page).getByRole('button', { name: 'Note', exact: true }).click();

  const dialog = noteDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Text of John 3:16–17')).toContainText('For God so loved the world');
  await expect(dialog.getByLabel('Text of John 3:16–17')).toContainText('but to save the world through Him');
  const editor = dialog.getByRole('textbox', { name: 'Note' });
  await expect(editor).toBeFocused();
  await page.keyboard.type('Love that sends. Compare Rom 5:8 and 1 Jn 4:9-10.');
  await expect(editor.locator('.ref-detected')).toHaveText(['Rom 5:8', '1 Jn 4:9-10']);
  await expect(dialog.getByText('Saved')).toBeVisible();

  // Click outside the pop-up: it closes and the passage is there as before.
  await page.mouse.click(5, 400);
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('complementary', { name: 'Study' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'A note on verse 16' })).toBeVisible();

  // After a reload, the dot reopens the note; edit, close with Esc straight away, reload again.
  await page.reload();
  await page.getByRole('button', { name: 'A note on verse 16' }).click();
  await expect(noteDialog(page).getByRole('textbox', { name: 'Note' })).toContainText('Love that sends.');
  await noteDialog(page).getByRole('textbox', { name: 'Note' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Edited.');
  await page.keyboard.press('Escape');
  await expect(noteDialog(page)).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: 'A note on verse 16' }).click();
  await expect(noteDialog(page).getByRole('textbox', { name: 'Note' })).toContainText('Love that sends. Compare Rom 5:8 and 1 Jn 4:9-10. Edited.');
  await noteDialog(page).getByRole('button', { name: 'Done' }).click();
  await expect(noteDialog(page)).toBeHidden();
});

test('several verses highlighted together, one note for all of them', async ({ page }) => {
  await fresh(page, '/bsb/MAT/5');
  await verseText(page, 3).click();
  await verseText(page, 10).click();
  await bar(page).getByRole('button', { name: 'Highlight yellow' }).click();
  for (const n of [3, 6, 10]) await expect(verseText(page, n)).toHaveClass(/hl-yellow/);
  await expect(verseText(page, 11)).not.toHaveClass(/hl-yellow/);

  await verseText(page, 3).click();
  await verseText(page, 10).click();
  await bar(page).getByRole('button', { name: 'Note', exact: true }).click();
  await expect(noteDialog(page).getByRole('heading', { name: /Note\s*Matthew 5:3–10/ })).toBeVisible();
  await expect(noteDialog(page).getByRole('textbox', { name: 'Note' })).toBeFocused();
  await page.keyboard.type('The Beatitudes as one picture.');
  await noteDialog(page).getByRole('button', { name: 'Done' }).click();
  await expect(noteDialog(page)).toBeHidden();
  await page.getByRole('button', { name: 'Study' }).click();
  await expect(page.getByRole('article', { name: 'Note on Matthew 5:3–10' })).toContainText('The Beatitudes as one picture.');
});

test('hovering a reference in a saved note previews it', async ({ page }) => {
  await fresh(page, '/bsb/JHN/3');
  await verseText(page, 16).click();
  await bar(page).getByRole('button', { name: 'Note', exact: true }).click();
  await expect(noteDialog(page).getByRole('textbox', { name: 'Note' })).toBeFocused();
  await page.keyboard.type('See Rom 5:8.');
  await noteDialog(page).getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Study' }).click();
  await expect(page.getByRole('article', { name: /^Note on/ })).toHaveCount(1);
  const link = page.getByRole('button', { name: 'Rom 5:8: read the passage' });
  await link.hover();
  await page.waitForTimeout(500);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(page.getByRole('tooltip')).toContainText('But God proves His love for us in this', { timeout: 4000 });
});

test('journal entries are dated, need no verse, and keep their text', async ({ page }) => {
  await fresh(page, '/bsb/PSA/1');
  await page.getByRole('button', { name: 'Study' }).click();
  const panel = page.getByRole('complementary', { name: 'Study' });
  await panel.getByRole('tab', { name: 'Journal' }).click();
  await panel.getByRole('button', { name: 'New entry', exact: true }).click();
  await panel.getByLabel('Title').fill('Morning');
  await panel.getByRole('textbox', { name: 'Journal entry' }).click();
  await page.keyboard.type('Thinking about Ps 1:3 and trees.');
  await expect(panel.getByText('Saved')).toBeVisible();
  await panel.getByRole('button', { name: '← Back' }).click();
  await expect(panel.getByRole('button', { name: /Morning/ })).toBeVisible();

  await page.reload();
  const again = page.getByRole('complementary', { name: 'Study' });
  await again.getByRole('tab', { name: 'Journal' }).click();
  await again.getByRole('button', { name: /Morning/ }).click();
  await expect(again.getByRole('textbox', { name: 'Journal entry' })).toContainText('Thinking about Ps 1:3 and trees.');
});

test('highlights and notes work offline, and nothing typed is lost on an instant reload', async ({ page, context }) => {
  await fresh(page, '/bsb/JHN/1');
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker?.controller), { timeout: 30_000 })
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await verseText(page, 1).click();
  await bar(page).getByRole('button', { name: 'Highlight yellow' }).click();
  await expect(page.locator('.hl-yellow').first()).toBeVisible();
  await verseText(page, 14).click();
  await bar(page).getByRole('button', { name: 'Note', exact: true }).click();
  await expect(noteDialog(page).getByRole('textbox', { name: 'Note' })).toBeFocused();
  await page.keyboard.type('Written offline.');
  await page.reload();
  await expect(page.locator('.hl-yellow').first()).toBeVisible();
  await page.getByRole('button', { name: 'A note on verse 14' }).click();
  await expect(noteDialog(page).getByRole('textbox', { name: 'Note' })).toContainText('Written offline.');
});

test('on a phone the note pop-up fits the screen and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await fresh(page, '/bsb/MAT/5');
  await verseText(page, 3).click();
  await expect(bar(page)).toBeVisible();
  await bar(page).getByRole('button', { name: 'Question', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Note' });
  await expect(dialog.getByRole('textbox', { name: 'Question' })).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(375);
  expect(box!.y + box!.height).toBeLessThanOrEqual(741);
  await expect(dialog.getByRole('button', { name: 'Done' })).toBeInViewport();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
