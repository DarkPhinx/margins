/**
 * Signed out, Margins is a Bible reader only; anything more (highlights,
 * notes, the journal, the Original language area…) asks you to sign in.
 * Once signed in on a device, the app opens offline too (the session is kept
 * on the device), with that account's own local database, and keeps it
 * synced.
 */

import type { User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { openAccountDatabase, removeAccountDatabase } from './localData';
import { SetPasswordPage } from './SignInPage';
import { ReadingOnlyProvider } from './access';
import { setReadOnly, switchDatabase } from '../study/db';
import { AUTH_STORAGE_KEY, isConfigured, supabase, supabaseRemote } from './supabase';
import { SyncProvider } from './SyncContext';

export interface AccountUser {
  id: string;
  email: string | null;
}

export interface Account {
  user: AccountUser;
  /** Signs out and removes this device's copy (call only once everything has synced, or the person agreed). */
  signOut: () => Promise<void>;
}

const AccountContext = createContext<Account | null>(null);

/** The signed-in account, or null outside one (e.g. in tests of single pages). */
export function useAccount(): Account | null {
  return useContext(AccountContext);
}

/** Signed out: an empty database, never written to. */
export const GUEST_DATABASE = 'margins-guest';
setReadOnly(GUEST_DATABASE, true);
const GUEST = '(guest)';

type Gate = { kind: 'loading' } | { kind: 'out' } | { kind: 'recovery' } | { kind: 'in'; user: AccountUser };

const toUser = (u: User | { id: string; email?: string | null }): AccountUser => ({ id: u.id, email: u.email ?? null });

/** The account last signed in on this device, read straight from storage (works offline). */
function storedUser(): AccountUser | null {
  try {
    const raw = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? 'null') as { user?: { id?: string; email?: string } } | null;
    return raw?.user?.id ? toUser({ id: raw.user.id, email: raw.user.email }) : null;
  } catch {
    return null;
  }
}

function Splash() {
  return (
    <div className="auth-page" aria-busy="true">
      <div className="auth-brand">Margins</div>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">Margins</div>
        <p role="alert">
          Accounts aren’t set up for this copy of Margins: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing from its
          build.
        </p>
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  if (!isConfigured()) return <NotConfigured />;
  return <Gatekeeper>{children}</Gatekeeper>;
}

function Gatekeeper({ children }: { children: ReactNode }) {
  const sb = supabase();
  const [gate, setGate] = useState<Gate>({ kind: 'loading' });
  /** The account whose database is open. */
  const [openFor, setOpenFor] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      // Offline with an expired session, getSession can't refresh it: the stored account still opens.
      const user = data.session?.user ? toUser(data.session.user) : storedUser();
      setGate((g) => (g.kind === 'loading' ? (user ? { kind: 'in', user } : { kind: 'out' }) : g));
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setGate({ kind: 'recovery' });
      else if (event === 'SIGNED_OUT') setGate({ kind: 'out' });
      else if (session?.user) {
        const user = toUser(session.user);
        setGate((g) => (g.kind === 'recovery' || (g.kind === 'in' && g.user.id === user.id) ? g : { kind: 'in', user }));
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [sb]);

  const userId = gate.kind === 'in' ? gate.user.id : null;
  const signedOut = gate.kind === 'out';
  useEffect(() => {
    if (!userId && !signedOut) return;
    let alive = true;
    // Signed out: an empty database nothing is ever written to, so no one's notes show.
    void (userId ? openAccountDatabase(userId) : switchDatabase(GUEST_DATABASE)).then(() => {
      if (alive) setOpenFor(userId ?? GUEST);
    });
    return () => {
      alive = false;
    };
  }, [userId, signedOut]);

  const signOut = useCallback(async () => {
    if (!userId) return;
    setOpenFor(null);
    setGate({ kind: 'out' });
    const { error } = await sb.auth.signOut({ scope: 'local' });
    // Offline, the server can't be told; forget the session here anyway.
    if (error) {
      try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem(`${AUTH_STORAGE_KEY}-code-verifier`);
      } catch {
        // Nothing stored.
      }
    }
    await removeAccountDatabase(userId);
  }, [sb, userId]);

  const remote = useMemo(() => supabaseRemote(sb), [sb]);
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!userId) return () => undefined;
      const channel = sb
        .channel(`study-items-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'study_items', filter: `user_id=eq.${userId}` }, onChange)
        .subscribe();
      return () => {
        void sb.removeChannel(channel);
      };
    },
    [sb, userId],
  );

  const account = useMemo(() => (gate.kind === 'in' ? { user: gate.user, signOut } : null), [gate, signOut]);

  if (gate.kind === 'loading') return <Splash />;
  if (gate.kind === 'out') {
    // Signed out: the Bible reader only; anything more asks you to sign in (the /signin page).
    if (openFor !== GUEST) return <Splash />;
    return <ReadingOnlyProvider>{children}</ReadingOnlyProvider>;
  }
  if (gate.kind === 'recovery') return <SetPasswordPage onDone={(user) => setGate({ kind: 'in', user: toUser(user) })} />;
  if (openFor !== gate.user.id || !account) return <Splash />;
  return (
    <AccountContext.Provider value={account}>
      <SyncProvider remote={remote} subscribe={subscribe}>
        {children}
      </SyncProvider>
    </AccountContext.Provider>
  );
}
