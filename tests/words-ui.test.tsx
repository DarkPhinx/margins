import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../src/App';
import { makeVerseId } from '../src/bible/verseId';
import { reloadSettings } from '../src/settings';
import { loadPassage } from '../src/study/passage';
import { resetDatabase } from '../src/study/db';
import { linkAt, occurrences, offsetOf, originalWords, wordLinks } from '../src/words/data';
import { searchOriginal } from '../src/words/search';
import { diskFetch } from './helpers';

const v = makeVerseId;

function Location() {
  const loc = useLocation();
  return <output data-testid="location">{loc.pathname + loc.search}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <Location />
    </MemoryRouter>,
  );
}

const location = () => screen.getByTestId('location').textContent ?? '';

beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn(diskFetch));
  localStorage.clear();
  reloadSettings();
  await resetDatabase();
});

/** The original word behind an English word in a verse, as the reader looks it up. */
async function wordFor(translation: 'bsb' | 'kjv', id: number, english: string, occurrence = 0) {
  const [verse] = await loadPassage(translation, { start: id, end: id });
  const offset = offsetOf(verse!.text, english, occurrence)!;
  const link = linkAt(await wordLinks(translation, id), offset, offset + english.length)!;
  return (await originalWords(id))[link[2]]!;
}

describe('the word data, for sample verses in both Testaments', () => {
  it('links BSB and KJV words to the right Hebrew and Greek', async () => {
    expect((await wordFor('bsb', v('JHN', 3, 16), 'loved'))[0]).toBe('G0025');
    expect((await wordFor('bsb', v('JHN', 3, 16), 'world'))[1]).toBe('κόσμον');
    expect((await wordFor('kjv', v('JHN', 3, 16), 'loved'))[0]).toBe('G0025');
    // "was" in the KJV is classic Strong's G2258; STEPBible files it under εἰμί.
    expect((await wordFor('kjv', v('JHN', 1, 1), 'was'))[0]).toBe('G1510');
    expect((await wordFor('bsb', v('GEN', 1, 1), 'created'))).toEqual(expect.arrayContaining(['H1254A', 'בָּרָ֣א']));
    expect((await wordFor('bsb', v('GEN', 1, 1), 'beginning'))[0]).toBe('H7225G');
    expect((await wordFor('bsb', v('PSA', 23, 1), 'shepherd'))[0]).toMatch(/^H7462/);
    expect((await wordFor('bsb', v('ROM', 8, 28), 'love'))[0]).toBe('G0025');
  });

  it('has every verse, including ones the sources number or contain differently', async () => {
    // Not in the Leningrad Codex; restored by STEP.
    expect((await wordFor('bsb', v('JOS', 21, 36), 'Bezer'))[0]).toMatch(/^H1221/);
    expect((await wordFor('kjv', v('NEH', 7, 68), 'horses'))[0]).toBe('H5483M');
    // 2 Cor 13:13 in Greek editions; no note on where the letter was written.
    expect((await wordFor('bsb', v('2CO', 13, 14), 'love'))[0]).toBe('G0026');
    expect((await originalWords(v('2CO', 13, 14))).map((w) => w[0])).not.toContain('G1125');
    expect((await wordFor('bsb', v('2CO', 13, 13), 'saints'))[0]).toMatch(/^G0040/);
    // Modern verse divisions where the KJV's differ.
    expect((await wordFor('bsb', v('PHP', 1, 16), 'love'))[0]).toBe('G0026');
    expect((await wordFor('bsb', v('1KI', 18, 34), 'Fill'))[0]).toBe('H4390');
  });

  it('counts where a word appears', async () => {
    const agape = await occurrences('G0026');
    expect(agape.n).toBe(116);
    expect(agape.v).toContain(v('1CO', 13, 4));
    expect(agape.v).toEqual([...agape.v].sort((a, b) => a - b));
  });

  it('searches by English, Greek, transliteration and Strong’s number; a reference is a verse', async () => {
    const love = await searchOriginal('love');
    expect(love.kind === 'words' && love.hits.slice(0, 3).map((h) => h.strong)).toEqual(['G0026', 'H0157G', 'G0025']);
    const greek = await searchOriginal('ἀγάπη');
    expect(greek.kind === 'words' && greek.hits[0]!.strong).toBe('G0026');
    const translit = await searchOriginal('agape');
    expect(translit.kind === 'words' && translit.hits.map((h) => h.strong)).toContain('G0026');
    const strong = await searchOriginal('G26');
    expect(strong.kind === 'words' && strong.hits.map((h) => h.strong)).toEqual(['G0026']);
    expect(await searchOriginal('Jn 3:16')).toEqual({ kind: 'verse', range: { start: v('JHN', 3, 16), end: v('JHN', 3, 16) } });
  });
});

describe('the Original language area', () => {
  it('is in the sidebar, and searching a word lists the original words with matching verses', async () => {
    const user = userEvent.setup();
    renderAt('/original');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Original language' })).toHaveAttribute('aria-current', 'page');
    await user.type(screen.getByRole('searchbox', { name: 'Search the original language' }), 'love');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(location()).toBe('/original/search?q=love');
    const results = await screen.findByRole('list', { name: 'Words' });
    const first = (await within(results).findAllByRole('listitem'))[0]!;
    expect(first).toHaveTextContent('ἀγάπη');
    // 114 including 2 Corinthians 13:14 (numbered 13:13 in Greek editions).
    expect(first).toHaveTextContent('The BSB translates it “love” 114×');
    expect(await within(first).findByRole('list', { name: 'Verses with agapē' })).toBeInTheDocument();
    await user.click(within(first).getByRole('link', { name: 'Go deeper on this word' }));
    expect(location()).toBe('/original/word/G0026');
  });

  it('opens a verse when a reference is searched, word by word, linked both ways', async () => {
    const user = userEvent.setup();
    renderAt('/original/search?q=John%203%3A16');
    await waitFor(() => expect(location()).toBe(`/original/verse/${v('JHN', 3, 16)}`));
    const words = await screen.findByRole('list', { name: 'Original words' });
    expect(within(words).getAllByRole('listitem').length).toBeGreaterThan(20);
    expect(words).toHaveTextContent('ἠγάπησεν');
    // An English word in the verse goes to its original word, in context.
    await user.click(await screen.findByRole('link', { name: 'loved' }));
    expect(location()).toBe(`/original/word/G0025?v=${v('JHN', 3, 16)}&i=2&t=bsb`);
    const context = await screen.findByRole('region', { name: 'In John 3:16' });
    expect(context).toHaveTextContent('ēgapēsen');
    expect(context).toHaveTextContent('verb, aorist, active, indicative, 3rd person singular');
    expect(within(context).getByRole('link', { name: 'loved' })).toHaveClass('current');
  });

  it('shows a word in depth: meanings, usage by book, and every verse', async () => {
    const user = userEvent.setup();
    renderAt(`/original/word/G0026?v=${v('1JN', 4, 8)}&i=0`);
    expect(await screen.findByRole('article', { name: 'ἀγάπη G0026' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Range of meanings' })).toHaveTextContent('love, goodwill, esteem');
    const usage = await screen.findByRole('region', { name: 'Usage' });
    expect(usage).toHaveTextContent('Appears 116 times in 106 verses');
    expect(usage).toHaveTextContent(/In 1 John: \d+ verses/);
    expect(within(usage).getByRole('list', { name: 'Verses per book in the New Testament' }).children).toHaveLength(27);
    const every = await screen.findByRole('region', { name: 'Every verse' });
    expect(every).toHaveTextContent('Every verse (106)');
    await user.click(within(every).getByRole('button', { name: /Show more/ }));
    // A verse goes to that verse, word by word.
    await user.click((await within(every).findAllByRole('link'))[0]!);
    expect(location()).toMatch(/^\/original\/verse\/\d+$/);
  });

  it('shows Hebrew right to left', async () => {
    renderAt(`/original/verse/${v('GEN', 1, 1)}`);
    const words = await screen.findByRole('list', { name: 'Original words' });
    expect(words).toHaveClass('rtl');
    expect(within(words).getAllByRole('listitem')[0]).toHaveTextContent('בְּרֵאשִׁ֖ית');
  });
});

describe('from the Bible', () => {
  it('the verse pop-up sends the selected verses to the Original language area', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');
    await user.click(container.querySelector('article.chapter span[data-v="16"]') as HTMLElement);
    await user.click(container.querySelector('article.chapter span[data-v="17"]') as HTMLElement);
    const bar = screen.getByRole('toolbar', { name: 'Selected: John 3:16–17' });
    await user.click(within(bar).getByRole('button', { name: 'Original language' }));
    expect(location()).toBe(`/original/verse/${v('JHN', 3, 16)}-${v('JHN', 3, 17)}`);
    expect(await screen.findByRole('article', { name: 'John 3:17' })).toBeInTheDocument();
  });
});
