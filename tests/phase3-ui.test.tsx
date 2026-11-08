import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../src/App';
import { makeVerseId } from '../src/bible/verseId';
import { reloadSettings } from '../src/settings';
import { resetDatabase } from '../src/study/db';
import { createQuestion, listByKind } from '../src/study/store';
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

const verseText = (container: HTMLElement, n: number) =>
  container.querySelector(`article.chapter span[data-v="${n}"]`) as HTMLElement;
const bar = () => screen.getByRole('toolbar', { name: /Selected/ });

beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn(diskFetch));
  localStorage.clear();
  reloadSettings();
  await resetDatabase();
});

describe('cross-references in the study panel', () => {
  it('shows the top ten for a verse beside the text, then all; opening one shows it with its context', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');
    await user.click(verseText(container, 16));
    await user.click(within(bar()).getByRole('button', { name: 'Cross-refs' }));

    const panel = screen.getByRole('complementary', { name: 'Study' });
    expect(within(panel).getByRole('heading', { name: /Cross-references\s*John 3:16/ })).toBeInTheDocument();
    const section = within(panel).getByRole('region', { name: 'Cross-references' });
    const rows = await within(section).findAllByRole('listitem');
    expect(rows).toHaveLength(10);
    expect(rows[0]).toHaveTextContent('Romans 5:8');
    await waitFor(() => expect(rows[0]).toHaveTextContent('But God proves His love for us in this'));
    // The text is still on the page.
    expect(container.querySelector('article.chapter')).toBeInTheDocument();
    expect(within(panel).getByText(/OpenBible\.info \(CC BY\) and the Treasury of Scripture Knowledge/)).toBeInTheDocument();

    const showAll = within(section).getByRole('button', { name: /^Show all \d+$/ });
    const total = Number(showAll.textContent!.match(/\d+/)![0]);
    await user.click(showAll);
    expect(within(section).getAllByRole('listitem')).toHaveLength(total);

    // Open Romans 5:8: it shows with its context, still in the panel.
    await user.click(within(section).getByRole('button', { name: 'Romans 5:8' }));
    expect(await within(panel).findByRole('heading', { name: 'Romans 5:8' })).toBeInTheDocument();
    expect(panel.querySelector('.passage-in')).toHaveTextContent('But God proves His love for us in this');
    expect(screen.getByTestId('location')).toHaveTextContent('/bsb/JHN/3');
  });

  it('merges cross-references for a passage of several verses', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');
    await user.click(verseText(container, 16));
    await user.click(verseText(container, 18));
    await user.click(within(bar()).getByRole('button', { name: 'Cross-refs' }));
    const panel = screen.getByRole('complementary', { name: 'Study' });
    expect(within(panel).getByRole('heading', { name: /Cross-references\s*John 3:16–18/ })).toBeInTheDocument();
    const rows = await within(within(panel).getByRole('region', { name: 'Cross-references' })).findAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Romans 5:8');
  });
});

describe('linking passages', () => {
  it('links selected verses to a typed passage, with a note; it shows on both passages and on the Notes page', async () => {
    const user = userEvent.setup();
    const { container, unmount } = renderAt('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');
    await user.click(verseText(container, 16));
    await user.click(within(bar()).getByRole('button', { name: 'Link' }));

    const dialog = screen.getByRole('dialog', { name: 'Link John 3:16' });
    const save = within(dialog).getByRole('button', { name: 'Save link' });
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByLabelText('To which passage?'), 'Jn 3:16');
    expect(within(dialog).getByText(/That’s the passage you’re linking from/)).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('To which passage?'));
    await user.type(within(dialog).getByLabelText('To which passage?'), 'Rom 8:28-30');
    expect(within(dialog).getByText('Romans 8:28–30')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Why do they belong together/), 'God’s love, start to finish');
    await user.click(save);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Link John 3:16' })).not.toBeInTheDocument());

    const [link] = await listByKind('link');
    expect(link).toMatchObject({
      anchors: [
        { start: v('JHN', 3, 16), end: v('JHN', 3, 16) },
        { start: v('ROM', 8, 28), end: v('ROM', 8, 30) },
      ],
      note: 'God’s love, start to finish',
    });

    // In John 3's study panel, and at the top of Romans 8:28's cross-references.
    await user.click(screen.getByRole('button', { name: 'Study' }));
    const panel = screen.getByRole('complementary', { name: 'Study' });
    expect(await within(panel).findByRole('article', { name: 'Link John 3:16 and Romans 8:28–30' })).toHaveTextContent(
      'God’s love, start to finish',
    );
    unmount();

    renderAt('/bsb/ROM/8');
    await screen.findByText(/Therefore, there is now no condemnation/);
    await user.click(verseText(document.body, 28));
    await user.click(within(bar()).getByRole('button', { name: 'Cross-refs' }));
    const yours = within(screen.getByRole('complementary', { name: 'Study' })).getByRole('region', { name: 'Your links' });
    expect(await within(yours).findByRole('button', { name: 'John 3:16' })).toBeInTheDocument();
    expect(yours).toHaveTextContent('God’s love, start to finish');
  });

  it('lists links on the Notes page', async () => {
    const user = userEvent.setup();
    const { createLink } = await import('../src/study/store');
    await createLink({ start: v('GEN', 22, 8), end: v('GEN', 22, 8) }, { start: v('JHN', 1, 29), end: v('JHN', 1, 29) }, 'The lamb provided');
    renderAt('/notes');
    const main = within(screen.getByRole('main'));
    await user.click(await main.findByRole('button', { name: 'Links (1)' }));
    expect(main.getByRole('article', { name: 'Link Genesis 22:8 and John 1:29' })).toHaveTextContent('The lamb provided');
    await user.click(main.getByRole('button', { name: 'John 1:29' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/bsb/JHN/1?v=29');
  });
});

describe('verses as answers to a question', () => {
  it('adds selected verses as an answer to a chosen question', async () => {
    const user = userEvent.setup();
    const q = await createQuestion([], docFromText('Who is blessed?'));
    const { container } = renderAt('/bsb/MAT/5');
    await screen.findByText('The Beatitudes');
    await user.click(verseText(container, 3));
    await user.click(verseText(container, 10));
    await user.click(within(bar()).getByRole('button', { name: 'Answer' }));
    const dialog = screen.getByRole('dialog', { name: 'Matthew 5:3–10 answers…' });
    await user.click(await within(dialog).findByRole('button', { name: /Who is blessed\?/ }));
    expect(await within(dialog).findByRole('status')).toHaveTextContent('Added as an answer to “Who is blessed?”');
    await waitFor(async () =>
      expect((await listByKind('question')).find((x) => x.id === q.id)!.answerRefs).toEqual([
        { start: v('MAT', 5, 3), end: v('MAT', 5, 10) },
      ]),
    );

    // The question card shows what answers it.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /answers…/ })).not.toBeInTheDocument(), { timeout: 3000 });
    await user.click(screen.getByRole('navigation', { name: 'Main' }).querySelector('a[href="/notes"]') as HTMLElement);
    const card = await screen.findByRole('article', { name: 'Standalone question' });
    expect(card).toHaveTextContent('Answered by');
    expect(within(card).getByRole('button', { name: 'Matthew 5:3–10' })).toBeInTheDocument();
  });
});
