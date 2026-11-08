import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../src/App';
import { BOOKS } from '../src/bible/books';
import { prepareChapter } from '../src/bible/prepare';
import { textPositions, verseTexts } from '../src/bible/verseText';
import { makeVerseId } from '../src/bible/verseId';
import { reloadSettings } from '../src/settings';
import { resetDatabase } from '../src/study/db';
import { setHighlight, setSegmentHighlight } from '../src/study/store';
import { diskFetch, loadBook } from './helpers';

const v = makeVerseId;

beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn(diskFetch));
  localStorage.clear();
  reloadSettings();
  await resetDatabase();
});

describe('where each character of the text falls', () => {
  it('matches the plain verse text for every chapter of both Bibles, as the reader shows them', () => {
    let checked = 0;
    for (const translation of ['bsb', 'kjv'] as const) {
      for (const book of BOOKS) {
        for (const raw of loadBook(translation, book.id).chapters) {
          for (const showManuscriptNotes of [true, false]) {
            const doc = prepareChapter(raw, { showManuscriptNotes });
            const texts = verseTexts(doc);
            const positions = textPositions(doc);
            // Rebuild each verse's plain text from the characters' positions.
            const rebuilt = new Map<number, string[]>();
            let current = 0;
            doc.blocks.forEach((block, b) => {
              if (block.type !== 'para' && block.type !== 'descriptive') return;
              block.inline.forEach((item, i) => {
                if (item.type === 'verse') current = item.n;
                if (item.type !== 'text' || !current) return;
                const chars = rebuilt.get(current) ?? [];
                rebuilt.set(current, chars);
                positions.get(`${b}:${i}`)!.forEach((p, k) => {
                  if (p >= 0) chars[p] = /\s/.test(item.text[k]!) ? ' ' : item.text[k]!;
                });
              });
            });
            for (const [verse, text] of texts) {
              // A gap is the space between two paragraphs of one verse.
              const got = Array.from(rebuilt.get(verse) ?? [], (c) => c ?? ' ').join('').trimEnd();
              if (got !== text) throw new Error(`${translation} ${book.id} ${raw.chapter}:${verse}: "${got}" ≠ "${text}"`);
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(120_000);
  });
});

describe('highlighting some words', () => {
  it('colours just those words in the reader, in that translation only', async () => {
    const id = v('JHN', 3, 16);
    // "loved" in "For God so loved the world…"
    await setHighlight({ start: id, end: id }, 'green');
    await setSegmentHighlight('bsb', { start: id, end: id }, 11, 16, 'yellow');
    const { container, unmount } = render(
      <MemoryRouter initialEntries={['/bsb/JHN/3']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    await screen.findByText('Jesus and Nicodemus');
    await waitFor(() => expect(container.querySelectorAll('.hl-words')).toHaveLength(1));
    const word = container.querySelector('.hl-words')!;
    expect(word).toHaveTextContent(/^loved$/);
    expect(word).toHaveClass('hl-yellow');
    expect(word).toHaveAttribute('data-v', '16');
    // The rest of the verse keeps its whole-verse colour.
    const rest = [...container.querySelectorAll('article.chapter [data-v="16"]')].filter((s) => s !== word);
    expect(rest.every((s) => s.classList.contains('hl-green'))).toBe(true);
    expect(rest.map((s) => s.textContent).join('')).not.toContain('loved');
    unmount();

    // The KJV doesn't show the BSB's word highlight (character positions differ).
    const kjv = render(
      <MemoryRouter initialEntries={['/kjv/JHN/3']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    await waitFor(() => expect(kjv.container.querySelector('article.chapter [data-v="16"]')).not.toBeNull());
    expect(kjv.container.querySelector('.hl-words')).toBeNull();
  });
});
