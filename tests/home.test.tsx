import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../src/App';
import { makeVerseId } from '../src/bible/verseId';
import { reloadSettings, updateSettings } from '../src/settings';
import { chapterRange, isWholeChapter, rangeLabel } from '../src/study/ranges';
import { resetDatabase } from '../src/study/db';
import { createJournal, listByKind, setAnchors } from '../src/study/store';
import { docFromText } from '../src/study/text';
import { diskFetch } from './helpers';

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
  updateSettings({ translation: 'bsb', last: { book: 'JHN', chapter: 3, verse: 16 } });
  await resetDatabase();
});

describe('chapter ranges', () => {
  it('ties to a whole chapter and labels it by chapter', () => {
    const r = chapterRange('JHN', 3);
    expect(r).toEqual({ start: makeVerseId('JHN', 3, 1), end: makeVerseId('JHN', 3, 36) });
    expect(isWholeChapter(r)).toBe(true);
    expect(rangeLabel(r)).toBe('John 3');
    expect(rangeLabel(chapterRange('PSA', 23))).toBe('Psalm 23');
    expect(rangeLabel(chapterRange('JUD', 1))).toBe('Jude');
    expect(rangeLabel(chapterRange('PHM', 1))).toBe('Philemon');
    expect(rangeLabel({ start: makeVerseId('JHN', 3, 16), end: makeVerseId('JHN', 3, 18) })).toBe('John 3:16–18');
  });
});

describe('home page sections', () => {
  it('is an ordered list of self-contained sections, so it can grow later', async () => {
    const { HOME_SECTIONS } = await import('../src/home/sections');
    expect(HOME_SECTIONS.map((s) => s.id)).toEqual(['continue', 'journal', 'notes']);

    const { Home } = await import('../src/home/Home');
    const { container } = render(
      <MemoryRouter>
        <Home
          sections={[
            { id: 'future', label: 'Open questions', Component: () => <p>A future section</p> },
            ...HOME_SECTIONS,
          ]}
        />
      </MemoryRouter>,
    );
    expect([...container.querySelectorAll('[data-section]')].map((e) => e.getAttribute('data-section'))).toEqual([
      'future',
      'continue',
      'journal',
      'notes',
    ]);
    expect(screen.getByRole('region', { name: 'Open questions' })).toHaveTextContent('A future section');
  });
});

describe('home page', () => {
  it('shows where you were reading, and continues there', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: /Continue reading\s*John 3:16\s*BSB/ }));
    expect(location()).toBe('/bsb/JHN/3?v=16');
  });

  it('starts a standalone entry on its own page, and tidies it away if left empty', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'New entry' }));
    await waitFor(() => expect(location()).toMatch(/^\/journal\/[\w-]+\?new=1$/));
    expect(await screen.findByText('Standalone entry')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Journal entry' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '← Journal' }));
    await waitFor(() => expect(location()).toBe('/journal'));
    await waitFor(async () => expect(await listByKind('journal')).toHaveLength(0));
  });

  it('tidies away old blank entries, but never one being started right now', async () => {
    const { discardEmptyJournals, setClock } = await import('../src/study/store');
    let now = 1_000_000;
    setClock(() => now);
    await createJournal('2026-11-01');
    now += 2 * 60_000;
    const fresh = await createJournal('2026-11-02');
    await createJournal('2026-11-01', docFromText('Kept'));
    expect(await discardEmptyJournals()).toBe(1);
    expect((await listByKind('journal')).map((e) => e.id)).toContain(fresh.id);
    setClock(() => Date.now());
  });

  it('starts an entry on the chapter you were reading, or on any chapter', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'New entry on John 3' }));
    expect(await screen.findByText('John 3', { selector: 'strong' })).toBeInTheDocument();
    const [first] = await listByKind('journal');
    expect(first!.anchors).toEqual([chapterRange('JHN', 3)]);
    await user.click(screen.getByRole('button', { name: '← Journal' }));

    await user.click(await screen.findByRole('button', { name: 'On another chapter…' }));
    const picker = screen.getByRole('dialog', { name: 'Choose a chapter' });
    await user.click(within(picker).getByRole('button', { name: 'Psalms' }));
    await user.click(screen.getByRole('button', { name: '23' }));
    expect(await screen.findByText('Psalm 23', { selector: 'strong' })).toBeInTheDocument();
    const entries = await listByKind('journal');
    expect(entries.map((e) => rangeLabel(e.anchors[0]!)).sort()).toEqual(['Psalm 23']);
  });

  it('lists entries newest first, with their chapter, and filters them', async () => {
    const user = userEvent.setup();
    await createJournal('2026-11-01', docFromText('A quiet morning.'), 'Morning');
    await createJournal('2026-11-05', docFromText('The wind blows where it wishes.'), '', [chapterRange('JHN', 3)]);
    await createJournal('2026-11-03', docFromText(''), '');
    renderAt('/journal');
    const list = await within(screen.getByRole('main')).findByRole('list');
    const rows = await within(list).findAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('John 3');
    expect(rows[0]).toHaveTextContent('The wind blows where it wishes.');
    expect(rows[1]).toHaveTextContent('Standalone');
    expect(rows[1]).toHaveTextContent('Morning');

    await user.click(screen.getByRole('button', { name: 'Standalone (1)' }));
    const main = () => within(screen.getByRole('main')).getByRole('list');
    expect(within(main()).getAllByRole('button')).toHaveLength(1);
    expect(main()).toHaveTextContent('Morning');
    await user.click(screen.getByRole('button', { name: 'On a chapter (1)' }));
    expect(main()).toHaveTextContent('John 3');

    await user.click(within(main()).getByRole('button'));
    expect(location()).toMatch(/^\/journal\/[\w-]+$/);
    expect(await screen.findByRole('textbox', { name: 'Journal entry' }).catch(() => screen.findByText('Loading the editor…'))).toBeInTheDocument();
  });

  it('ties a standalone entry to a chapter, changes it, and makes it standalone again', async () => {
    const user = userEvent.setup();
    const entry = await createJournal('2026-11-02', docFromText('Thinking.'), 'Thoughts');
    renderAt(`/journal/${entry.id}`);
    await user.click(await screen.findByRole('button', { name: 'Tie to a chapter' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Choose a chapter' })).getByRole('button', { name: 'Jude' }));
    expect(await screen.findByText('Jude', { selector: 'strong' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Change' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Choose a chapter' })).getByRole('button', { name: 'Romans' }));
    await user.click(screen.getByRole('button', { name: '8' }));
    expect(await screen.findByText('Romans 8', { selector: 'strong' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Read' }));
    expect(location()).toBe('/bsb/ROM/8');

    await setAnchors(entry.id, []);
    expect((await listByKind('journal'))[0]!.anchors).toEqual([]);
  });

  it('shows a chapter’s journal entries while reading that chapter', async () => {
    const user = userEvent.setup();
    await createJournal('2026-11-05', docFromText('Born again, from above.'), 'Nicodemus', [chapterRange('JHN', 3)]);
    await createJournal('2026-11-06', docFromText('Not this one.'), 'Elsewhere', [chapterRange('JHN', 4)]);
    renderAt('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');
    await user.click(screen.getByRole('button', { name: 'Study' }));
    const panel = screen.getByRole('complementary', { name: 'Study' });
    expect(await within(panel).findByText('Nicodemus')).toBeInTheDocument();
    expect(within(panel).queryByText('Elsewhere')).not.toBeInTheDocument();

    // The Journal tab can start an entry on this chapter.
    await user.click(within(panel).getByRole('tab', { name: 'Journal' }));
    await user.click(within(panel).getByRole('button', { name: 'New entry on John 3' }));
    expect(await within(panel).findByText('John 3', { selector: 'strong' })).toBeInTheDocument();
  });

  it('the sidebar is beside the reader, and its Home link goes home', async () => {
    const user = userEvent.setup();
    renderAt('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Bible' })).toHaveAttribute('aria-current', 'page');
    await user.click(within(nav).getByRole('link', { name: 'Home' }));
    expect(location()).toBe('/');
    expect(await screen.findByRole('heading', { name: 'Journal' })).toBeInTheDocument();
  });
});

describe('notes page', () => {
  it('writes a standalone note in the pop-up, and drops it if left empty', async () => {
    const user = userEvent.setup();
    renderAt('/notes');
    await user.click(await screen.findByRole('button', { name: 'New note' }));
    const dialog = await screen.findByRole('dialog', { name: 'Note' });
    expect(await within(dialog).findByText('A standalone note, not tied to any verse.')).toBeInTheDocument();
    const [note] = await listByKind('note');
    expect(note!.anchors).toEqual([]);
    expect(note!.chapterKeys).toEqual([]);
    await user.click(await within(dialog).findByRole('button', { name: 'Done' }));
    await waitFor(async () => expect(await listByKind('note')).toHaveLength(0));
  });

  it('lists notes and questions, on verses or standalone, and filters them', async () => {
    const user = userEvent.setup();
    const { createNote, createQuestion } = await import('../src/study/store');
    await createNote([{ start: makeVerseId('JHN', 3, 16), end: makeVerseId('JHN', 3, 16) }], docFromText('Love gives. See Rom 5:8.'));
    await createNote([], docFromText('A thought on rest.'));
    await createQuestion([], docFromText('What is the Sabbath for?'));
    renderAt('/notes');
    const main = within(screen.getByRole('main'));
    expect(await main.findByRole('article', { name: 'Note on John 3:16' })).toBeInTheDocument();
    expect(main.getByRole('article', { name: 'Standalone note' })).toHaveTextContent('Standalone');
    expect(main.getByRole('article', { name: 'Standalone question' })).toBeInTheDocument();

    await user.click(main.getByRole('button', { name: 'Standalone (2)' }));
    expect(main.getAllByRole('article')).toHaveLength(2);
    await user.click(main.getByRole('button', { name: 'Questions (1)' }));
    expect(main.getAllByRole('article')).toHaveLength(1);
    await user.click(main.getByRole('button', { name: 'All (3)' }));
    await user.type(main.getByRole('searchbox'), 'rest');
    await waitFor(() => expect(main.getAllByRole('article')).toHaveLength(1));
    await user.clear(main.getByRole('searchbox'));

    // A reference in a saved note goes to the verse.
    await user.click(await main.findByRole('button', { name: 'Rom 5:8: read the passage' }));
    expect(location()).toBe('/bsb/ROM/5?v=8');
  });

  it('the sidebar marks the page you are on', async () => {
    const user = userEvent.setup();
    renderAt('/notes');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Notes' })).toHaveAttribute('aria-current', 'page');
    await user.click(within(nav).getByRole('link', { name: 'Journal' }));
    expect(location()).toBe('/journal');
    expect(within(nav).getByRole('link', { name: 'Journal' })).toHaveAttribute('aria-current', 'page');
    await user.click(within(nav).getByRole('link', { name: 'Bible' }));
    expect(location()).toBe('/bsb/JHN/3?v=16');
  });
});
