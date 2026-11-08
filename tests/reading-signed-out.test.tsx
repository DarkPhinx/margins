import 'fake-indexeddb/auto';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dexie from 'dexie';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../src/App';
import { makeVerseId } from '../src/bible/verseId';
import { getSettings, reloadSettings } from '../src/settings';
import { db } from '../src/study/db';
import { createNote } from '../src/study/store';
import { AuthGate } from '../src/sync/AuthGate';
import { diskFetch } from './helpers';

// A stand-in for Supabase: nobody signed in until a test says so.
const auth = vi.hoisted(() => {
  let listener: ((event: string, session: unknown) => void) | null = null;
  return {
    getSession: vi.fn(async () => ({ data: { session: null } })),
    onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
      listener = cb;
      return { data: { subscription: { unsubscribe: () => undefined } } };
    }),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    emit: (event: string, session: unknown) => listener?.(event, session),
  };
});
vi.mock('../src/sync/supabase', () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    AUTH_STORAGE_KEY: 'margins.auth',
    isConfigured: () => true,
    supabase: () => ({ auth, channel: () => channel, removeChannel: async () => undefined }),
    supabaseRemote: () => ({ push: async () => ({ status: 'ok', version: 1, seq: 1 }), pull: async () => [] }),
  };
});

function Location() {
  const loc = useLocation();
  return <output data-testid="location">{loc.pathname + loc.search}</output>;
}
const location = () => screen.getByTestId('location').textContent ?? '';
const signIn = () => act(async () => auth.emit('SIGNED_IN', { user: { id: 'u1', email: 'reader@example.com' } }));

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthGate>
        <AppRoutes />
        <Location />
      </AuthGate>
    </MemoryRouter>,
  );
}

const verse = (container: HTMLElement, n: number) => container.querySelector(`article.chapter span[data-v="${n}"]`) as HTMLElement;
const prompt = () => screen.findByRole('dialog', { name: 'Save your study with an account' });

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('margins.settings.v1', JSON.stringify({ last: { book: 'JHN', chapter: 3, verse: 1 } }));
  reloadSettings();
  for (const name of await Dexie.getDatabaseNames()) await Dexie.delete(name);
  vi.stubGlobal('fetch', vi.fn(diskFetch));
});

describe('without an account: reading and looking things up', () => {
  it('opens the Bible; the sidebar has the reading and look-up pages and a way to sign in', async () => {
    renderApp('/');
    expect(await screen.findByText('Jesus and Nicodemus')).toBeInTheDocument();
    expect(location()).toBe('/bsb/JHN/3');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link').map((l) => l.querySelector('span')?.textContent)).toEqual(['Bible', 'Journal', 'Notes', 'Original language']);
    expect(within(nav).getByRole('button', { name: /Sign in/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Study' })).toBeInTheDocument();
  });

  it('reads both Bibles, and reader settings are kept on the device', async () => {
    const user = userEvent.setup();
    renderApp('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');
    await user.selectOptions(screen.getByLabelText('Translation'), 'kjv');
    expect(location()).toMatch(/^\/kjv\/JHN\/3/);
    expect(await screen.findByText(/For God so loved the world, that he gave his only begotten Son/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const settings = await screen.findByRole('dialog', { name: 'Settings' });
    const redLetters = within(settings).getByRole('switch', { name: /Red letters/ });
    const before = getSettings().redLetters;
    await user.click(redLetters);
    expect(getSettings().redLetters).toBe(!before);
    expect(JSON.parse(localStorage.getItem('margins.settings.v1')!).redLetters).toBe(!before);
  });

  it('cross-references open from a verse, with "Show all"', async () => {
    const user = userEvent.setup();
    const { container } = renderApp('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');
    await user.click(verse(container, 16));
    await user.click(within(screen.getByRole('toolbar', { name: 'Selected: John 3:16' })).getByRole('button', { name: 'Cross-refs' }));
    const panel = screen.getByRole('complementary', { name: 'Study' });
    const refs = await within(panel).findByRole('region', { name: 'Cross-references' });
    expect(within(refs).getAllByRole('listitem')).toHaveLength(10);
    expect(within(refs).getAllByRole('listitem')[0]).toHaveTextContent('Romans 5:8');
    await user.click(within(refs).getByRole('button', { name: /Show all/ }));
    expect(within(refs).getAllByRole('listitem').length).toBeGreaterThan(10);
    // A reference opens as a preview, with its verses.
    await user.click(within(refs).getByRole('button', { name: 'Romans 5:8' }));
    expect(await within(panel).findByRole('heading', { name: 'Romans 5:8' })).toBeInTheDocument();
    expect(panel).toHaveTextContent(/still sinners, Christ died for us/);
  });

  it('the Original language area works, from a verse and on its own', async () => {
    const user = userEvent.setup();
    const { container, unmount } = renderApp('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');
    await user.click(verse(container, 16));
    await user.click(within(screen.getByRole('toolbar', { name: /Selected/ })).getByRole('button', { name: 'Original language' }));
    expect(location()).toBe(`/original/verse/${makeVerseId('JHN', 3, 16)}`);
    expect(await screen.findByRole('list', { name: 'Original words' })).toHaveTextContent('ἠγάπησεν');
    unmount();

    renderApp('/original/search?q=love');
    expect(await screen.findByRole('list', { name: 'Words' })).toHaveTextContent('ἀγάπη');
  });

  it('the study panel’s own tabs explain accounts; nothing is saved signed out', async () => {
    const user = userEvent.setup();
    renderApp('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');
    await user.click(screen.getByRole('button', { name: 'Study' }));
    const panel = screen.getByRole('complementary', { name: 'Study' });
    const card = within(panel).getByRole('region', { name: 'Your notes, questions and journal' });
    expect(card).toHaveTextContent('An account saves your notes, questions, highlights and journal');
    expect(within(card).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    // The safety net: the signed-out database refuses writes.
    expect(db.name).toBe('margins-guest');
    await expect(createNote([{ start: makeVerseId('JHN', 3, 16), end: makeVerseId('JHN', 3, 16) }])).rejects.toThrow(/needs an account/);
    expect(await db.items.count()).toBe(0);
  });
});

describe('without an account: anything that saves asks first', () => {
  it.each([
    ['Highlight yellow', 'Save highlights with an account'],
    ['Note', 'Save your notes with an account'],
    ['Question', 'Save your questions with an account'],
    ['Link', 'Save passage links with an account'],
    ['Answer', 'Save answers to your questions with an account'],
  ])('%s explains, with Sign in and Create account', async (button, heading) => {
    const user = userEvent.setup();
    const { container } = renderApp('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');
    await user.click(verse(container, 16));
    await user.click(within(screen.getByRole('toolbar', { name: /Selected/ })).getByRole('button', { name: button }));
    const dialog = await prompt();
    expect(within(dialog).getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('keeps them in sync on every device');
    expect(within(dialog).getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Save your study with an account' })).toBeNull());
    // Still reading, nothing saved.
    expect(screen.getByText('Jesus and Nicodemus')).toBeInTheDocument();
    expect(await db.items.count()).toBe(0);
  });

  it('Create account opens the sign-up form, and signing in comes back to the chapter', async () => {
    const user = userEvent.setup();
    const { container } = renderApp('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');
    await user.click(verse(container, 16));
    await user.click(within(screen.getByRole('toolbar', { name: /Selected/ })).getByRole('button', { name: 'Note' }));
    await user.click(within(await prompt()).getByRole('button', { name: 'Create account' }));
    expect(location()).toBe('/signin');
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    await signIn();
    await waitFor(() => expect(location()).toBe('/bsb/JHN/3'));
    // Now the tools work.
    await user.click(verse(container, 16) ?? (await screen.findByText(/For God so loved/)));
    expect(within(screen.getByRole('toolbar', { name: /Selected/ })).getByRole('button', { name: 'Note' })).toBeInTheDocument();
  });

  it('a "Link to another passage" in cross-references asks too', async () => {
    const user = userEvent.setup();
    const { container } = renderApp('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');
    await user.click(verse(container, 16));
    await user.click(within(screen.getByRole('toolbar', { name: /Selected/ })).getByRole('button', { name: 'Cross-refs' }));
    await user.click(await screen.findByRole('button', { name: 'Link to another passage…' }));
    expect(within(await prompt()).getByRole('heading', { name: 'Save passage links with an account' })).toBeInTheDocument();
  });

  it('Journal and Notes explain accounts in place; Keep reading goes back to the Bible', async () => {
    const user = userEvent.setup();
    for (const [path, title] of [
      ['/journal', 'Your journal'],
      ['/notes', 'Your notes and questions'],
    ]) {
      const { unmount } = renderApp(path!);
      const card = await screen.findByRole('region', { name: title });
      expect(within(card).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: 'Create account' })).toBeInTheDocument();
      expect(location()).toBe(path);
      // The sidebar is still there.
      expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
      unmount();
    }
    renderApp('/notes');
    await user.click(await screen.findByRole('button', { name: 'Keep reading' }));
    expect(location()).toBe('/bsb/JHN/3');
  });

  it('signing in from the Notes page opens your notes', async () => {
    const user = userEvent.setup();
    renderApp('/notes');
    const card = await screen.findByRole('region', { name: 'Your notes and questions' });
    await user.click(within(card).getByRole('button', { name: 'Sign in' }));
    expect(location()).toBe('/signin');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    await signIn();
    await waitFor(() => expect(location()).toBe('/notes'));
    expect(screen.queryByRole('region', { name: 'Your notes and questions' })).toBeNull();
  });

  it('the sign-in page is reachable from the sidebar and from Settings', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: /Sign in/ }));
    expect(location()).toBe('/signin');
    await user.click(screen.getByRole('button', { name: 'Keep reading without an account' }));
    expect(location()).toBe('/bsb/JHN/3');
    unmount();

    renderApp('/bsb/JHN/3');
    await screen.findByText('Jesus and Nicodemus');
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const account = await screen.findByRole('region', { name: 'Account' });
    expect(account).toHaveTextContent('You’re reading without an account');
    await user.click(within(account).getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
  });
});
