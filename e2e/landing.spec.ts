/**
 * Picking a chapter must land exactly on it: its heading (or verse) right
 * under the top bar, and it must stay there while the chapters around it load.
 */
import { expect, test, type Page } from '@playwright/test';

async function jump(page: Page, book: string, chapter: number, verse?: number) {
  await page.locator('.place-btn').click();
  await page.getByRole('button', { name: book, exact: true }).click();
  await page.getByRole('button', { name: String(chapter), exact: true }).click();
  if (verse) await page.getByRole('button', { name: String(verse), exact: true }).click();
  else await page.getByRole('button', { name: 'Read from the start' }).click();
}

/** Distance from the bottom of the top bar to the target. */
async function offsetBelowBar(page: Page, key: string, verse?: number) {
  return page.evaluate(
    ({ key, verse, continuous }) => {
      const bar = document.querySelector('.reader-bar')!.getBoundingClientRect().bottom;
      const scope = continuous ? document.querySelector(`section[data-chapter-key="${key}"]`) : document;
      const el = verse
        ? scope?.querySelector(`[data-verse="${verse}"]`)
        : scope?.querySelector('.chapter-title');
      return el ? Math.round(el.getBoundingClientRect().top - bar) : null;
    },
    { key, verse, continuous: await page.locator('section[data-chapter-key]').count().then((n) => n > 0) },
  );
}

const targets = [
  ['Psalms', 119, undefined, 'PSA.119', 'Psalm 119'],
  ['Psalms', 119, 1, 'PSA.119', 'Psalm 119'],
  ['Genesis', 50, undefined, 'GEN.50', 'Genesis 50'],
  ['Romans', 8, 28, 'ROM.8', 'Romans 8'],
  ['Psalms', 23, undefined, 'PSA.23', 'Psalm 23'],
] as const;

for (const continuous of [true, false]) {
  for (const start of ['/bsb/PSA/150', '/bsb/JHN/3', '/kjv/PRO/31']) {
    test(`${continuous ? 'continuous' : 'paged'}: picker lands exactly, starting from ${start}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto('/');
      await page.evaluate((c) => localStorage.setItem('margins.settings.v1', JSON.stringify({ continuousScroll: c })), continuous);
      await page.goto(start);
      await page.mouse.move(400, 400);
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(300);

      for (const [book, chapter, verse, key, title] of targets) {
        await jump(page, book, chapter, verse);
        await expect(page.locator('.place-btn')).toContainText(title);
        // Let the chapters around it load, then check it hasn't moved.
        await page.waitForTimeout(1200);
        // Verse 1 lands on the chapter heading, just above it.
        const offset = await offsetBelowBar(page, key, verse && verse > 1 ? verse : undefined);
        expect(offset, `${title}${verse ? ':' + verse : ''} from ${start}`).not.toBeNull();
        expect(offset!, `${title}${verse ? ':' + verse : ''} from ${start}`).toBeGreaterThanOrEqual(-4);
        expect(offset!, `${title}${verse ? ':' + verse : ''} from ${start}`).toBeLessThanOrEqual(60);
        await expect(page.locator('.place-btn')).toContainText(title);
      }
    });
  }
}
