import { expect, test, type Page } from './fixtures';

/** Selects text as a drag would: from `from` in one verse to `to` in another (or the same). */
async function selectText(page: Page, from: { verse: number; word: string }, to = from) {
  await page.evaluate(
    ({ from, to }) => {
      const find = (verse: number, word: string, end: boolean) => {
        for (const span of document.querySelectorAll(`article.chapter [data-v="${verse}"]`)) {
          const node = span.firstChild;
          const at = node?.textContent?.search(new RegExp(`\\b${word}\\b`)) ?? -1;
          if (node && at >= 0) return [node, end ? at + word.length : at] as const;
        }
        throw new Error(`"${word}" not found in verse ${verse}`);
      };
      const r = document.createRange();
      r.setStart(...find(from.verse, from.word, false));
      r.setEnd(...find(to.verse, to.word, true));
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(r);
    },
    { from, to },
  );
}

const wordHighlights = (page: Page) =>
  page.locator('article.chapter .hl-words').evaluateAll((els) => els.map((e) => [e.textContent, e.className.match(/hl-(yellow|green|blue|pink|purple)/)?.[1]]));

test('highlight one word, then a phrase across verses; they stay after a reload', async ({ page }) => {
  await page.goto('/bsb/JHN/3?v=16');
  await expect(page.getByText('Jesus and Nicodemus')).toBeAttached();

  // One word.
  await selectText(page, { verse: 16, word: 'loved' });
  await page.getByRole('toolbar', { name: 'Selected text: loved' }).getByRole('button', { name: 'Highlight yellow' }).click();
  await expect(page.getByRole('toolbar', { name: /Selected text/ })).toBeHidden();
  await expect.poll(() => wordHighlights(page)).toEqual([['loved', 'yellow']]);

  // A phrase running from verse 16 into 17.
  await selectText(page, { verse: 16, word: 'eternal' }, { verse: 17, word: 'Son' });
  await page.getByRole('toolbar', { name: /Selected text/ }).getByRole('button', { name: 'Highlight green' }).click();
  await expect.poll(async () => (await wordHighlights(page)).map(([t]) => t).join('|')).toMatch(/^loved\|eternal life\.\|For God did not send His Son$/);

  // The whole-verse highlighter still works alongside.
  await page.locator('article.chapter [data-v="18"]').first().click();
  await page.getByRole('toolbar', { name: 'Selected: John 3:18' }).getByRole('button', { name: 'Highlight blue' }).click();
  await expect(page.locator('article.chapter [data-v="18"].hl-blue').first()).toBeVisible();

  await page.reload();
  await expect(page.getByText('Jesus and Nicodemus')).toBeAttached();
  await expect.poll(() => wordHighlights(page)).toEqual([
    ['loved', 'yellow'],
    ['eternal life.', 'green'],
    ['For God did not send His Son', 'green'],
  ]);

  // A highlighted word can still be looked up in the original language.
  await selectText(page, { verse: 16, word: 'loved' });
  await page.getByRole('toolbar', { name: 'Selected text: loved' }).getByRole('button', { name: 'Original language for this word' }).click();
  await expect(page).toHaveURL(/\/original\/word\/G0025\?v=43003016&i=2&t=bsb$/);
});

test('remove a highlight from part of the words', async ({ page }) => {
  await page.goto('/bsb/JHN/3?v=16');
  await expect(page.getByText('Jesus and Nicodemus')).toBeAttached();
  await selectText(page, { verse: 16, word: 'God' }, { verse: 16, word: 'world' });
  await page.getByRole('toolbar', { name: /Selected text/ }).getByRole('button', { name: 'Highlight pink' }).click();
  await expect.poll(() => wordHighlights(page)).toEqual([['God so loved the world', 'pink']]);
  await selectText(page, { verse: 16, word: 'loved' });
  await page.getByRole('toolbar', { name: 'Selected text: loved' }).getByRole('button', { name: 'Remove highlight' }).click();
  await expect.poll(() => wordHighlights(page)).toEqual([
    ['God so ', 'pink'],
    [' the world', 'pink'],
  ]);
});

const wordPopup = (page: Page) => page.getByRole('toolbar', { name: /^Selected text:/ });

test('selected words offer the same study actions, applied to the whole verse', async ({ page }) => {
  await page.goto('/bsb/JHN/3?v=16');
  await expect(page.getByText('Jesus and Nicodemus')).toBeAttached();

  // Note: on John 3:16, with the verse's full text, even though only "loved" was selected.
  await selectText(page, { verse: 16, word: 'loved' });
  await expect(wordPopup(page)).toContainText('John 3:16');
  await wordPopup(page).getByRole('button', { name: 'Note', exact: true }).click();
  const note = page.getByRole('dialog', { name: 'Note' });
  await expect(note.getByLabel('Text of John 3:16')).toContainText('For God so loved the world');
  await expect(note.getByRole('textbox', { name: 'Note' })).toBeFocused();
  await page.keyboard.type('What kind of love?');
  await expect(note.getByText('Saved')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(note).toBeHidden();
  await expect(page.getByRole('button', { name: 'A note on verse 16' })).toBeVisible();

  // Question, across two verses: on John 3:16–17.
  await selectText(page, { verse: 16, word: 'eternal' }, { verse: 17, word: 'Son' });
  await expect(wordPopup(page)).toContainText('John 3:16–17');
  await wordPopup(page).getByRole('button', { name: 'Question', exact: true }).click();
  // Questions open in the same pop-up as notes.
  const question = page.getByRole('dialog', { name: 'Note' });
  await expect(question.getByLabel('Text of John 3:16–17')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(question).toBeHidden();

  // Cross-references for the verse.
  await selectText(page, { verse: 16, word: 'world' });
  await wordPopup(page).getByRole('button', { name: 'Cross-refs' }).click();
  const refs = page.getByRole('complementary', { name: 'Study' }).getByRole('region', { name: 'Cross-references' });
  await expect(refs.getByRole('listitem').first()).toContainText('Romans 5:8');

  // Link, from the verse.
  await selectText(page, { verse: 17, word: 'save' });
  await wordPopup(page).getByRole('button', { name: 'Link', exact: true }).click();
  const link = page.getByRole('dialog', { name: 'Link John 3:17' });
  await link.getByLabel('To which passage?').fill('Lk 19:10');
  await link.getByRole('button', { name: 'Save link' }).click();
  await expect(link).toBeHidden();

  // Answer: the verse answers a question.
  await selectText(page, { verse: 16, word: 'perish' });
  await wordPopup(page).getByRole('button', { name: 'Answer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /John 3:16/ })).toBeVisible();
});

test('on a phone, the selected-words pop-up fits the screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto('/bsb/JHN/3?v=16');
  await expect(page.getByText('Jesus and Nicodemus')).toBeAttached();
  await selectText(page, { verse: 16, word: 'loved' });
  const box = (await wordPopup(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  for (const name of ['Highlight yellow', 'Note', 'Question', 'Cross-refs', 'Link', 'Answer', 'Original language for this word']) {
    await expect(wordPopup(page).getByRole('button', { name, exact: true })).toBeInViewport();
  }
});
