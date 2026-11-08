import 'fake-indexeddb/auto';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeVerseId } from '../src/bible/verseId';
import { db, switchDatabase } from '../src/study/db';
import { createNote, saveBody } from '../src/study/store';
import { docFromText } from '../src/study/text';
import type { NoteItem } from '../src/study/types';
import { MemoryRouter } from 'react-router-dom';
import { AuthGate, useAccount } from '../src/sync/AuthGate';
import type { PushResult, Remote, RemoteRow } from '../src/sync/engine';
import { CLAIMED_KEY } from '../src/sync/localData';
import { SignInPage } from '../src/sync/SignInPage';
import { AccountSection, SyncStatus } from '../src/sync/SyncStatus';

// A stand-in for the Supabase connection: no test reaches a real server.
const server = vi.hoisted(() => ({ rows: new Map<string, unknown>(), seq: 0 }));
const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => undefined } } })),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  updateUser: vi.fn(),
}));
vi.mock('../src/sync/supabase', () => {
  const channel = { on: () => channel, subscribe: () => channel };
  const remote: Remote = {
    async push(item, base): Promise<PushResult> {
      const cur = server.rows.get(item.id) as RemoteRow | undefined;
      if (cur && cur.version !== base) return { status: 'conflict', row: structuredClone(cur) };
      const row = { id: item.id, version: (cur?.version ?? 0) + 1, data: structuredClone(item), seq: ++server.seq };
      server.rows.set(item.id, row);
      return { status: 'ok', version: row.version, seq: row.seq };
    },
    async pull(since) {
      return ([...server.rows.values()] as RemoteRow[]).filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq);
    },
  };
  return {
    AUTH_STORAGE_KEY: 'margins.auth',
    isConfigured: () => true,
    supabase: () => ({ auth, channel: () => channel, removeChannel: async () => undefined }),
    supabaseRemote: () => remote,
  };
});

const user1 = { id: 'user-1', email: 'reader@example.com' };
const jn316 = { start: makeVerseId('JHN', 3, 16), end: makeVerseId('JHN', 3, 16) };

function Signed() {
  const account = useAccount();
  return (
    <div>
      <p>Signed in: {account?.user.email}</p>
      <SyncStatus />
      <AccountSection />
    </div>
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  server.rows.clear();
  server.seq = 0;
  for (const name of await Dexie.getDatabaseNames()) await Dexie.delete(name);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ external: { google: false } }))));
  auth.getSession.mockResolvedValue({ data: { session: null } });
});

describe('signing in', () => {
  it('signs in with email and password, explaining a wrong password plainly', async () => {
    const user = userEvent.setup();
    auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    render(<SignInPage />);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'reader@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-one');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That email and password don’t match an account.');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'reader@example.com', password: 'wrong-one' });
  });

  it('creates an account, asking for a long enough password, then to confirm the email', async () => {
    const user = userEvent.setup();
    auth.signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    render(<SignInPage />);
    await user.click(screen.getByRole('button', { name: 'Create an account' }));
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(auth.signUp).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Password'), '-but-longer');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('We sent a link to new@example.com');
  });

  it('sends a password reset link', async () => {
    const user = userEvent.setup();
    auth.resetPasswordForEmail.mockResolvedValueOnce({ error: null });
    render(<SignInPage />);
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await user.type(screen.getByLabelText('Email'), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/choose a new password/)).toBeInTheDocument();
  });

  it('offers Google only when the project has it switched on', async () => {
    const { unmount } = render(<SignInPage />);
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    unmount();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ external: { google: true } }))));
    const user = userEvent.setup();
    auth.signInWithOAuth.mockResolvedValueOnce({ error: null });
    render(<SignInPage />);
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    expect(auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google' }));
  });
});

describe('the account gate', () => {
  it('signed out, opens for reading only, with an empty local database', async () => {
    render(
      <MemoryRouter>
        <AuthGate>
          <Signed />
        </AuthGate>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('region', { name: 'Account' })).toHaveTextContent('You’re reading without an account');
    expect(screen.getByText('Signed in:')).toBeInTheDocument();
    expect(db.name).toBe('margins-guest');
    expect(await db.items.count()).toBe(0);
  });

  it('opens offline for the account last signed in here, with its own notes', async () => {
    // The stored session can't be refreshed offline, so getSession gives none.
    localStorage.setItem('margins.auth', JSON.stringify({ user: user1, access_token: 'x' }));
    render(
      <MemoryRouter>
        <AuthGate>
          <Signed />
        </AuthGate>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Signed in: reader@example.com')).toBeInTheDocument();
    expect(db.name).toBe('margins-user-1');
  });

  it('the first account on a device takes over the notes written before accounts, and uploads them', async () => {
    // A note saved before accounts existed, in the old shared database.
    await switchDatabase('margins');
    await createNote([jn316], docFromText('Before accounts'));
    db.close();
    auth.getSession.mockResolvedValue({ data: { session: { user: user1 } } });
    render(
      <MemoryRouter>
        <AuthGate>
          <Signed />
        </AuthGate>
      </MemoryRouter>,
    );
    await screen.findByText('Signed in: reader@example.com');
    const items = (await db.items.toArray()) as NoteItem[];
    expect(items.map((i) => i.text)).toEqual(['Before accounts']);
    expect(localStorage.getItem(CLAIMED_KEY)).toBe('user-1');
    await waitFor(() => expect([...server.rows.values()]).toHaveLength(1), { timeout: 4000 });
    // The old database is left as it was.
    expect(await Dexie.exists('margins')).toBe(true);
  });
});

describe('when a note changed on two devices', () => {
  it('asks straight away, shows both copies, and keeps the chosen one', async () => {
    const user = userEvent.setup();
    auth.getSession.mockResolvedValue({ data: { session: { user: user1 } } });
    render(
      <MemoryRouter>
        <AuthGate>
          <Signed />
        </AuthGate>
      </MemoryRouter>,
    );
    await screen.findByText('Signed in: reader@example.com');
    const note = await createNote([jn316], docFromText('Start'));
    await waitFor(() => expect(server.rows.size).toBe(1), { timeout: 4000 });
    await waitFor(async () => expect((await db.items.get(note.id))?.dirty).toBe(0));

    // Another device changes it on the server, while this one changes it here.
    const row = server.rows.get(note.id) as RemoteRow;
    server.rows.set(note.id, { ...row, version: row.version + 1, seq: ++server.seq, data: { ...row.data, text: 'From the phone', updatedAt: Date.now() } });
    await saveBody(note.id, docFromText('From the laptop'));

    const dialog = await screen.findByRole('dialog', { name: 'Changed on two devices' }, { timeout: 4000 });
    const item = await within(dialog).findByRole('listitem', { name: 'Note on John 3:16' });
    expect(within(item).getByRole('region', { name: 'On this device' })).toHaveTextContent('From the laptop');
    expect(within(item).getByRole('region', { name: 'On your other device' })).toHaveTextContent('From the phone');
    expect(screen.getByRole('button', { name: '1 item needs your choice' })).toBeInTheDocument();

    await user.click(within(item).getByRole('button', { name: 'Keep the other device’s' }));
    await waitFor(async () => expect(((await db.items.get(note.id)) as NoteItem).text).toBe('From the phone'));
    expect(await db.conflicts.count()).toBe(0);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Changed on two devices' })).toBeNull());
  });
});

describe('signing out', () => {
  it('warns about changes not yet synced, then removes this device’s copy', async () => {
    const user = userEvent.setup();
    auth.getSession.mockResolvedValue({ data: { session: { user: user1 } } });
    render(
      <MemoryRouter>
        <AuthGate>
          <Signed />
        </AuthGate>
      </MemoryRouter>,
    );
    await screen.findByText('Signed in: reader@example.com');
    const account = screen.getByRole('region', { name: 'Account' });
    expect(account).toHaveTextContent('Signed in as reader@example.com');
    // Offline, a note can't reach the account.
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await createNote([jn316], docFromText('Not synced yet'));
    // Straight away: the count is taken when Sign out is pressed.
    await user.click(within(account).getByRole('button', { name: 'Sign out' }));
    expect(await within(account).findByRole('alert')).toHaveTextContent('1 change on this device hasn’t reached your account yet');
    await user.click(within(account).getByRole('button', { name: 'Stay signed in' }));
    expect(within(account).queryByRole('alert')).toBeNull();
    await user.click(within(account).getByRole('button', { name: 'Sign out' }));
    await user.click(await within(account).findByRole('button', { name: 'Sign out anyway' }));
    expect(await screen.findByText('You’re reading without an account', { exact: false })).toBeInTheDocument();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    await waitFor(async () => expect(await Dexie.exists('margins-user-1')).toBe(false));
    online.mockRestore();
  });

  it('online, syncs first and then signs out without asking', async () => {
    const user = userEvent.setup();
    auth.getSession.mockResolvedValue({ data: { session: { user: user1 } } });
    render(
      <MemoryRouter>
        <AuthGate>
          <Signed />
        </AuthGate>
      </MemoryRouter>,
    );
    await screen.findByText('Signed in: reader@example.com');
    const note = await createNote([jn316], docFromText('Just written'));
    await user.click(within(screen.getByRole('region', { name: 'Account' })).getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('You’re reading without an account', { exact: false })).toBeInTheDocument();
    expect(server.rows.has(note.id)).toBe(true);
  });
});
