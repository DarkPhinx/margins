import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../src/App';
import { makeVerseId } from '../src/bible/verseId';
import { reloadSettings } from '../src/settings';
import { nextSelection } from '../src/study/StudyContext';
import { db, resetDatabase } from '../src/study/db';
import { createJournal, createNote, createQuestion, listByKind, setHighlight } from '../src/study/store';
import { docFromText } from '../src/study/text';
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

const verseButton = (container: HTMLElement, n: number) =>
  container.querySelector(`sup.verse-num[data-verse="${n}"]`) as HTMLElement;

beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn(diskFetch));
  localStorage.clear();
  reloadSettings();
  await resetDatabase();
});

describe('selecting verses', () => {
  it('follows the tap rules', () => {
    const a = v('JHN', 3, 16);
    expect(nextSelection(null, a)).toEqual({ start: a, end: a });
    expect(nextSelection({ start: a, end: a }, a)).toBeNull();
    expect(nextSelection({ start: a, end: a }, v('JHN', 3, 18))).toEqual({ start: a, end: v('JHN', 3, 18) });
    expect(nextSelection({ start: a, end: v('JHN', 3, 18) }, v('JHN', 3, 17))).toEqual({ start: v('JHN', 3, 17), end: v('JHN', 3, 17) });
    // Into the next chapter: extends. Far away or another book: starts again.
    expect(nextSelection({ start: a, end: a }, v('JHN', 4, 2))).toEqual({ start: a, end: v('JHN', 4, 2) });
    expect(nextSelection({ start: a, end: a }, v('JHN', 9, 2))).toEqual({ start: v('JHN', 9, 2), end: v('JHN', 9, 2) });
    expect(nextSelection({ start: a, end: a }, v('ROM', 3, 2))).toEqual({ start: v('ROM', 3, 2), end: v('ROM', 3, 2) });
  });

  it('highlights whole verses that stay highlighted after a reload and in the other translation', async () => {
    const user = userEvent.setup();
    const first = renderAt('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');
    await user.click(verseButton(first.container, 16));
    await user.click(verseButton(first.container, 17));
    const bar = screen.getByRole('toolbar', { name: 'Selected: John 3:16–17' });
    await user.click(within(bar).getByRole('button', { name: 'Highlight green' }));
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: /Selected/ })).not.toBeInTheDocument());
    await waitFor(() => expect(first.container.querySelectorAll('.hl-green').length).toBeGreaterThan(1));
    const highlighted = [...first.container.querySelectorAll('.hl-green')].map((e) => e.textContent).join('');
    expect(highlighted).toContain('For God so loved the world');
    expect(highlighted).toContain('For God did not send His Son into the world to condemn the world');
    expect(highlighted).not.toContain('Whoever believes in Him is not condemned');
    first.unmount();

    // A fresh render reads from the database, as after a reload; and the KJV shows it too.
    const kjv = renderAt('/kjv/JHN/3');
    await screen.findByText(/For God so loved the world/);
    await waitFor(() => expect(kjv.container.querySelectorAll('.hl-green').length).toBeGreaterThan(0));
    expect([...kjv.container.querySelectorAll('.hl-green')].map((e) => e.textContent).join('')).toContain(
      'For God sent not his Son into the world to condemn the world',
    );
  });

  it('never colours a section heading inside a highlighted range', async () => {
    await setHighlight({ start: v('JHN', 3, 20), end: v('JHN', 3, 23) }, 'blue');
    const { container } = renderAt('/bsb/JHN/3');
    await screen.findByText('John’s Testimony about Jesus');
    await waitFor(() => expect(container.querySelectorAll('.hl-blue').length).toBeGreaterThan(0));
    expect(screen.getByText('John’s Testimony about Jesus').querySelector('.hl')).toBeNull();
    expect(screen.getByText('John’s Testimony about Jesus').closest('.hl')).toBeNull();
  });
});

describe('the study panel', () => {
  it('opens in one tap, lists the chapter’s notes, and remembers it was open', async () => {
    const user = userEvent.setup();
    await createNote([{ start: v('JHN', 3, 16), end: v('JHN', 3, 16) }], docFromText('Love that gives.'));
    const { container, unmount } = renderAt('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');
    // A small dot marks the verse with a note.
    expect(await screen.findByRole('button', { name: 'A note on verse 16' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Study' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Study' }));
    const panel = screen.getByRole('complementary', { name: 'Study' });
    expect(within(panel).getByRole('heading', { name: 'John 3' })).toBeInTheDocument();
    expect(await within(panel).findByText('Love that gives.')).toBeInTheDocument();
    // Reading is still on the page.
    expect(container.querySelector('article.chapter')).toBeInTheDocument();
    unmount();

    renderAt('/bsb/JHN/3');
    expect(await screen.findByRole('complementary', { name: 'Study' })).toBeInTheDocument();
  });

  it('turns references in a note into links: preview on hover, passage with grey context on click', async () => {
    const user = userEvent.setup();
    await createNote([{ start: v('JHN', 3, 16), end: v('JHN', 3, 16) }], docFromText('Compare Rom 5:8 and Psalm 23.'));
    renderAt('/bsb/JHN/3');
    await screen.findByRole('button', { name: 'A note on verse 16' });
    await user.click(screen.getByRole('button', { name: 'Study' }));
    const panel = screen.getByRole('complementary', { name: 'Study' });

    const link = await within(panel).findByRole('button', { name: 'Rom 5:8: read the passage' });
    await user.hover(link);
    const tip = await screen.findByRole('tooltip', {}, { timeout: 4000 });
    expect(tip).toHaveTextContent('Romans 5:8');
    expect(tip).toHaveTextContent('But God proves His love for us in this');
    await user.unhover(link);

    await user.click(link);
    expect(within(panel).getByRole('heading', { name: 'Romans 5:8' })).toBeInTheDocument();
    const inRange = await waitFor(() => panel.querySelector('.passage-in') as HTMLElement);
    expect(inRange).toHaveTextContent('But God proves His love for us in this');
    const context = [...panel.querySelectorAll('.passage-context')].map((e) => e.textContent ?? '');
    expect(context).toHaveLength(6);
    expect(context[0]).toMatch(/^5/);
    expect(context[5]).toMatch(/^11/);

    // Tapping the grey context opens the full passage in the reader.
    await user.click(panel.querySelector('.passage-context') as HTMLElement);
    expect(screen.getByTestId('location')).toHaveTextContent('/bsb/ROM/5?v=8');
  });

  it('opens the chapter for a whole-chapter reference', async () => {
    const user = userEvent.setup();
    await createNote([{ start: v('JHN', 3, 16), end: v('JHN', 3, 16) }], docFromText('Compare Psalm 23.'));
    renderAt('/bsb/JHN/3');
    await screen.findByRole('button', { name: 'A note on verse 16' });
    await user.click(screen.getByRole('button', { name: 'Study' }));
    const panel = screen.getByRole('complementary', { name: 'Study' });
    await user.click(await within(panel).findByRole('button', { name: 'Psalm 23: open the chapter' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/bsb/PSA/23');
  });

  it('previews only the first verse of a whole-chapter reference, and cuts long passages short', async () => {
    const { previewText } = await import('../src/study/passage');
    const ps = await previewText('bsb', { start: v('PSA', 23, 1), end: v('PSA', 23, 6) }, true);
    // A psalm's title isn't part of verse 1.
    expect(ps).toBe('The LORD is my shepherd; I shall not want. …');
    const long = await previewText('bsb', { start: v('ROM', 8, 1), end: v('ROM', 8, 39) }, false);
    expect(long.length).toBeLessThanOrEqual(281);
    expect(long.endsWith('…')).toBe(true);
  });

  it('keeps questions open until marked answered', async () => {
    const user = userEvent.setup();
    await createQuestion([{ start: v('ROM', 9, 13), end: v('ROM', 9, 13) }], docFromText('What does hated mean?'));
    renderAt('/bsb/ROM/9');
    await screen.findByText(/Jacob I loved/);
    await user.click(screen.getByRole('button', { name: 'Study' }));
    const panel = screen.getByRole('complementary', { name: 'Study' });
    await user.click(within(panel).getByRole('tab', { name: 'Questions' }));
    expect(await within(panel).findByRole('button', { name: 'Open (1)' })).toBeInTheDocument();
    const card = await within(panel).findByRole('article', { name: 'Question on Romans 9:13' });
    expect(within(card).getByText('Open')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Mark answered' }));
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Open (0)' })).toBeInTheDocument());
    await user.click(within(panel).getByRole('button', { name: 'Answered (1)' }));
    expect(await within(panel).findByText('What does hated mean?')).toBeInTheDocument();
    expect((await listByKind('question'))[0]!.status).toBe('answered');
  });

  it('lists journal entries by date and drops a new entry left empty', async () => {
    const user = userEvent.setup();
    await createJournal('2026-11-01', docFromText('Older entry'), 'First');
    await createJournal('2026-11-05', docFromText('Read Jn 15 today.'), '');
    renderAt('/bsb/JHN/15');
    await screen.findByText(/I am the true vine/);
    await user.click(screen.getByRole('button', { name: 'Study' }));
    const panel = screen.getByRole('complementary', { name: 'Study' });
    await user.click(within(panel).getByRole('tab', { name: 'Journal' }));
    const rows = await within(panel).findAllByRole('button', { name: /2026|Nov/ });
    expect(rows[0]).toHaveTextContent('Read Jn 15 today.');
    expect(rows[1]).toHaveTextContent('First');

    await user.click(within(panel).getByRole('button', { name: 'New entry' }));
    expect(await within(panel).findByRole('heading', { name: 'Journal entry' })).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: '← Back' }));
    await waitFor(async () => expect(await listByKind('journal')).toHaveLength(2));
  });

  it('searches across notes, questions and journal, and opens a result at its verse', async () => {
    const user = userEvent.setup();
    await createNote([{ start: v('EPH', 2, 8), end: v('EPH', 2, 9) }], docFromText('Grace is a gift.'));
    await createJournal('2026-11-02', docFromText('Nothing about that.'), 'Walk');
    renderAt('/bsb/JHN/1');
    await screen.findByText('The Beginning');
    await user.click(screen.getByRole('button', { name: 'Study' }));
    const panel = screen.getByRole('complementary', { name: 'Study' });
    await user.click(within(panel).getByRole('tab', { name: 'Search' }));
    await user.type(within(panel).getByRole('searchbox'), 'gift grace');
    const hit = await within(panel).findByRole('button', { name: /Ephesians 2:8–9/ });
    expect(hit).toHaveTextContent('Grace is a gift.');
    await user.click(hit);
    expect(screen.getByTestId('location')).toHaveTextContent('/bsb/EPH/2?v=8');
    const dialog = await screen.findByRole('dialog', { name: 'Note' });
    expect(await within(dialog).findByRole('heading', { name: /Note\s*Ephesians 2:8–9/ })).toBeInTheDocument();
  });

  it('deletes with undo', async () => {
    const user = userEvent.setup();
    const note = await createNote([{ start: v('JHN', 3, 16), end: v('JHN', 3, 16) }], docFromText('Keep me'));
    renderAt('/bsb/JHN/3');
    await screen.findByRole('button', { name: 'A note on verse 16' });
    await user.click(screen.getByRole('button', { name: 'Study' }));
    const panel = screen.getByRole('complementary', { name: 'Study' });
    const card = await within(panel).findByRole('article', { name: 'Note on John 3:16' });
    await user.click(within(card).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(within(panel).queryByText('Keep me')).not.toBeInTheDocument());
    await user.click(within(panel).getByRole('button', { name: 'Undo' }));
    expect(await within(panel).findByText('Keep me')).toBeInTheDocument();
    expect((await db.items.get(note.id))?.deletedAt).toBeNull();
  });

});

describe('clicking verses and the note pop-up', () => {
  /** A run of verse text (not the verse number). */
  const verseText = (container: HTMLElement, n: number) =>
    container.querySelector(`article.chapter span[data-v="${n}"]`) as HTMLElement;

  it('selects a verse by clicking its text, and adds more verses by clicking theirs', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/bsb/MAT/5');
    await screen.findByText('The Beatitudes');
    await user.click(verseText(container, 3));
    expect(screen.getByRole('toolbar', { name: 'Selected: Matthew 5:3' })).toBeInTheDocument();
    await user.click(verseText(container, 5));
    expect(screen.getByRole('toolbar', { name: 'Selected: Matthew 5:3–5' })).toBeInTheDocument();
    expect(verseText(container, 4)).toHaveClass('sel');
    // Clicking a footnote marker opens the footnote, and leaves the selection alone.
    await user.click(container.querySelector('.note-ref') as HTMLElement);
    expect(screen.getByRole('toolbar', { name: 'Selected: Matthew 5:3–5' })).toBeInTheDocument();
  });

  it('highlights several verses at once from the bar', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/bsb/MAT/5');
    await screen.findByText('The Beatitudes');
    await user.click(verseText(container, 3));
    await user.click(verseText(container, 6));
    await user.click(within(screen.getByRole('toolbar', { name: /Selected/ })).getByRole('button', { name: 'Highlight pink' }));
    await waitFor(() => expect(verseText(container, 4)).toHaveClass('hl-pink'));
    expect(verseText(container, 3)).toHaveClass('hl-pink');
    expect(verseText(container, 6)).toHaveClass('hl-pink');
    expect(verseText(container, 7)).not.toHaveClass('hl-pink');
  });

  it('writes one note for several verses in a pop-up showing their text', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/bsb/MAT/5');
    await screen.findByText('The Beatitudes');
    await user.click(verseText(container, 3));
    await user.click(verseText(container, 10));
    await user.click(within(screen.getByRole('toolbar', { name: /Selected/ })).getByRole('button', { name: 'Note' }));

    const dialog = await screen.findByRole('dialog', { name: 'Note' });
    expect(await within(dialog).findByRole('heading', { name: /Note\s*Matthew 5:3–10/ })).toBeInTheDocument();
    const text = await within(dialog).findByLabelText('Text of Matthew 5:3–10');
    expect(text).toHaveTextContent('Blessed are the poor in spirit');
    expect(text).toHaveTextContent('Blessed are those who are persecuted because of righteousness');
    // The study panel does not open; the passage stays where it was.
    expect(screen.queryByRole('complementary', { name: 'Study' })).not.toBeInTheDocument();

    const [note] = await listByKind('note');
    expect(note!.anchors).toEqual([{ start: v('MAT', 5, 3), end: v('MAT', 5, 10) }]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  it('closes with Done, Esc or a click outside, and drops a new note left empty', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');

    // Done on an empty new note: nothing is kept.
    await user.click(verseText(container, 16));
    await user.click(within(screen.getByRole('toolbar', { name: /Selected/ })).getByRole('button', { name: 'Note' }));
    await user.click(await within(await screen.findByRole('dialog', { name: 'Note' })).findByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Note' })).not.toBeInTheDocument());
    expect(await listByKind('note')).toHaveLength(0);

    // An existing note: Esc closes it; a click on the backdrop closes it.
    await createNote([{ start: v('JHN', 3, 16), end: v('JHN', 3, 16) }], docFromText('Kept.'));
    await user.click(await screen.findByRole('button', { name: 'A note on verse 16' }));
    let dialog = await screen.findByRole('dialog', { name: 'Note' });
    expect(await within(dialog).findByLabelText('Text of John 3:16')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Note' })).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'A note on verse 16' }));
    dialog = await screen.findByRole('dialog', { name: 'Note' });
    await user.pointer([{ keys: '[MouseLeft>]', target: dialog }, { keys: '[/MouseLeft]', target: dialog }]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Note' })).not.toBeInTheDocument());
    expect((await listByKind('note')).map((n) => n.text)).toEqual(['Kept.']);
  });
});
