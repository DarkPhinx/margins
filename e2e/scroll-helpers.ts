import type { Page } from '@playwright/test';
import { BOOKS } from '../src/bible/books';

/** "1 Corinthians 7" or "Psalm 119" → a number that sorts in Bible order. */
export function chapterOrder(title: string): number {
  const m = /^(.*?)(?: (\d+))?$/.exec(title.trim())!;
  const name = m[1] === 'Psalm' ? 'Psalms' : m[1];
  const index = BOOKS.findIndex((b) => b.name === name);
  if (index < 0) throw new Error(`Unknown book in title "${title}"`);
  return index * 1000 + Number(m[2] ?? 1);
}

export const barTitle = async (page: Page) => (await page.locator('.place-btn').innerText()).replace('▾', '').trim();

/**
 * Scrolls with the wheel until the bar shows the wanted chapter. Big steps can
 * outrun the title by a chapter on a busy machine, so once it reaches or passes
 * the target it steps back gently until the title is exactly right.
 */
export async function scrollToChapter(page: Page, want: string, deltaY: number, onStep?: () => Promise<unknown>) {
  const target = chapterOrder(want);
  const down = deltaY > 0;
  await page.mouse.move(400, 400);
  for (let i = 0; i < 400; i++) {
    const now = chapterOrder(await barTitle(page));
    if (now === target) return;
    const passed = down ? now > target : now < target;
    const step = passed ? -Math.sign(deltaY) * 250 : deltaY;
    await page.mouse.wheel(0, step);
    await page.waitForTimeout(passed ? 120 : 60);
    await onStep?.();
  }
  throw new Error(`Never reached ${want}; at ${await barTitle(page)}`);
}
