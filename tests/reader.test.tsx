import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../src/App';
import { getSettings, reloadSettings, updateSettings } from '../src/settings';
import { diskFetch } from './helpers';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(diskFetch));
  localStorage.clear();
  reloadSettings();
});

describe('reader', () => {
  it('shows John 3 with headings and red letters, and the setting turns them off', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/bsb/JHN/3');
    expect(await screen.findByText('Jesus and Nicodemus')).toBeInTheDocument();
    expect(container.querySelector('.reader')).toHaveClass('red-letters');
    expect(container.querySelector('.wj')?.textContent).toMatch(/Truly, truly/);

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('switch', { name: /Red letters/ }));
    expect(container.querySelector('.reader')).not.toHaveClass('red-letters');
    expect(getSettings().redLetters).toBe(false);
  });

  it('shows Matthew 17:21 in the BSB as a faded marker whose popup holds the footnote wording', async () => {
    const user = userEvent.setup();
    renderAt('/bsb/MAT/17');
    const marker = await screen.findByRole('button', { name: /Matthew 17:21, not in the earliest manuscripts/ });
    expect(marker).toHaveClass('omitted-verse');
    expect(marker).toHaveTextContent('21');
    await user.click(marker);
    const popup = screen.getByRole('dialog', { name: /Matthew 17:21/ });
    expect(within(popup).getByText('But this kind does not come out except by prayer and fasting').tagName).toBe('EM');
    expect(popup).toHaveTextContent('This verse isn’t found in the earliest manuscripts.');
    expect(popup).toHaveTextContent('Wording from the BSB footnote.');
  });

  it('shows the KJV verse as a marker by default and as printed text when manuscript notes are off', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/kjv/MAT/17');
    const marker = await screen.findByRole('button', { name: /Matthew 17:21/ });
    await user.click(marker);
    expect(screen.getByRole('dialog', { name: /Matthew 17:21/ })).toHaveTextContent(/Howbeit this kind goeth not out but by prayer and fasting/);
    expect(screen.getByRole('dialog', { name: /Matthew 17:21/ })).toHaveTextContent('Wording from the KJV.');
    await user.keyboard('{Escape}');

    act(() => updateSettings({ showManuscriptNotes: false }));
    expect(screen.queryByRole('button', { name: /Matthew 17:21/ })).not.toBeInTheDocument();
    expect(container.querySelector('sup#v21')).toBeInTheDocument();
    expect(container.querySelector('article')?.textContent).toMatch(/Howbeit this kind goeth not out/);
  });

  it('brackets John 7:53 in the KJV with a Margins note in the popup beside it', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/kjv/JHN/7');
    await screen.findByText('[');
    const brackets = [...container.querySelectorAll('.variant-bracket')].map((b) => b.textContent);
    expect(brackets).toEqual(['[']);
    // Notes live only beside the text; there is no list at the end of the chapter.
    expect(screen.queryByRole('region', { name: 'Footnotes' })).not.toBeInTheDocument();
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
    const marker = container.querySelector('.variant-bracket + .note-ref') as HTMLElement;
    expect(marker).toHaveTextContent('a');
    await user.click(marker);
    const popup = screen.getByRole('dialog', { name: 'Footnote a' });
    expect(popup).toHaveTextContent(/Note from Margins, not part of the KJV text/);
    expect(popup).toHaveTextContent('Some early manuscripts do not include John 7:53 through John 8:11.');
  });

  it('switches translation at a missing verse and says where it went', async () => {
    const user = userEvent.setup();
    renderAt('/kjv/MAT/17?v=21');
    await screen.findByRole('button', { name: /Matthew 17:21/ });
    await user.selectOptions(screen.getByLabelText('Translation'), 'bsb');
    expect(await screen.findByRole('status')).toHaveTextContent(/Matthew 17:21 isn’t in the BSB’s main text/);
    expect(getSettings().translation).toBe('bsb');
  });

  it('moves between chapters and books and remembers the position', async () => {
    const user = userEvent.setup();
    renderAt('/bsb/MAL/4');
    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByRole('button', { name: /Matthew 1 →/ }));
    expect(await screen.findByText('The Genealogy of Jesus')).toBeInTheDocument();
    expect(getSettings().last).toMatchObject({ book: 'MAT', chapter: 1 });
  });

  it('opens a passage from the picker', async () => {
    const user = userEvent.setup();
    renderAt('/bsb/GEN/1');
    await screen.findByText('The Creation');
    await user.click(screen.getByRole('button', { name: /Choose a passage/ }));
    await user.click(screen.getByRole('button', { name: 'Jude' }));
    await user.click(screen.getByRole('button', { name: '3' }));
    expect(await screen.findByText(/contend earnestly for the faith/)).toBeInTheDocument();
  });

  it('sends unknown translations and books to a valid page, never an ESV page while the flag is off', async () => {
    renderAt('/esv/JHN/3');
    expect(await screen.findByText('Jesus and Nicodemus')).toBeInTheDocument();
    expect(screen.getByLabelText('Translation')).toHaveValue('bsb');
    expect(screen.queryByRole('option', { name: 'ESV' })).not.toBeInTheDocument();
  });

  it('switches to continuous reading from settings and keeps omitted-verse markers working', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/bsb/MAT/17');
    await screen.findByRole('button', { name: /Matthew 17:21/ });
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('switch', { name: /Continuous reading/ }));
    expect(getSettings().continuousScroll).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Done' }));

    const section = await screen.findByRole('region', { name: 'Matthew 17' });
    expect(section).toHaveAttribute('data-chapter-key', 'MAT.17');
    // Several chapters share the page, so verse ids are left off.
    expect(container.querySelector('#v21')).toBeNull();
    await user.click(within(section).getByRole('button', { name: /Matthew 17:21/ }));
    expect(screen.getByRole('dialog', { name: /Matthew 17:21/ })).toHaveTextContent('But this kind does not come out');
  });

  it('starts at the remembered position', async () => {
    updateSettings({ translation: 'kjv', last: { book: 'PSA', chapter: 119, verse: 105 } });
    renderAt('/');
    expect(await screen.findByText(/a lamp unto my feet, and a light unto my path/)).toBeInTheDocument();
    expect(screen.getByLabelText('Translation')).toHaveValue('kjv');
  });
});
