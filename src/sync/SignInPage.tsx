/**
 * Signing in: email and password (with a "forgot password" email), or Google
 * when the project has it switched on. New accounts confirm their email
 * address first if the project asks for that.
 */

import type { User } from '@supabase/supabase-js';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { lastReadingPath, useReadingOnly, type SignInState } from './access';
import { supabase } from './supabase';

type Mode = 'in' | 'up' | 'forgot';
type Sent = { kind: 'confirm' | 'reset'; email: string } | null;

const MIN_PASSWORD = 8;

/** Plain-English versions of the server's messages. */
export function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match an account.';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email address first: open the link we sent you.';
  if (/already registered|already exists/i.test(message)) return 'There’s already an account with that email. Sign in instead.';
  if (/rate limit|too many/i.test(message)) return 'Too many tries just now. Please wait a minute and try again.';
  if (/fetch|network/i.test(message)) return 'Can’t reach the server. Check your connection and try again.';
  if (/password/i.test(message) && /least|short|weak/i.test(message)) return `Please use a longer password (at least ${MIN_PASSWORD} characters).`;
  return message;
}

/** Whether Google sign-in is switched on for this project. */
function useGoogleEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    const url = import.meta.env.VITE_SUPABASE_URL as string;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => (r.ok ? (r.json() as Promise<{ external?: { google?: boolean } }>) : null))
      .then((s) => {
        if (alive) setOn(Boolean(s?.external?.google));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return on;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function SignInPage({ onContinue, initialMode = 'in' }: { onContinue?: () => void; initialMode?: 'in' | 'up' } = {}) {
  const sb = supabase();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent>(null);
  const google = useGoogleEnabled();
  const online = useOnline();
  const back = window.location.origin + window.location.pathname;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'in') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) setError(friendlyAuthError(error.message));
      } else if (mode === 'up') {
        if (password.length < MIN_PASSWORD) {
          setError(`Please use a longer password (at least ${MIN_PASSWORD} characters).`);
          return;
        }
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: back } });
        if (error) setError(friendlyAuthError(error.message));
        // No session yet: the project wants the email address confirmed first.
        else if (!data.session) setSent({ kind: 'confirm', email });
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: back });
        if (error) setError(friendlyAuthError(error.message));
        else setSent({ kind: 'reset', email });
      }
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const withGoogle = async () => {
    setError(null);
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back } });
    if (error) setError(friendlyAuthError(error.message));
  };

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setSent(null);
  };

  return (
    <div className="auth-page">
      <main className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">Margins</div>
        <p className="auth-tagline">Your studies, on every device.</p>

        {sent ? (
          <section className="auth-sent" role="status">
            <h1 id="auth-title">Check your email</h1>
            <p>
              {sent.kind === 'confirm'
                ? `We sent a link to ${sent.email}. Open it to confirm your address, then sign in.`
                : `We sent a link to ${sent.email}. Open it to choose a new password.`}
            </p>
            <button type="button" className="auth-link" onClick={() => switchTo('in')}>
              Back to sign in
            </button>
          </section>
        ) : (
          <>
            <h1 id="auth-title">{mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create your account' : 'Reset your password'}</h1>
            {!online && <p className="auth-notice">You’re offline. Signing in needs a connection the first time on a device.</p>}
            <form onSubmit={(e) => void submit(e)} className="auth-form">
              <label>
                Email
                <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              {mode !== 'forgot' && (
                <label>
                  Password
                  <input
                    type="password"
                    autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                    required
                    minLength={mode === 'up' ? MIN_PASSWORD : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              )}
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="auth-primary" disabled={busy || !online}>
                {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}
              </button>
            </form>

            {google && mode !== 'forgot' && (
              <>
                <div className="auth-or" aria-hidden="true">
                  or
                </div>
                <button type="button" className="auth-google" onClick={() => void withGoogle()} disabled={!online}>
                  Continue with Google
                </button>
              </>
            )}

            <div className="auth-switch">
              {mode === 'in' && (
                <>
                  <button type="button" className="auth-link" onClick={() => switchTo('forgot')}>
                    Forgot password?
                  </button>
                  <span>
                    New here?{' '}
                    <button type="button" className="auth-link" onClick={() => switchTo('up')}>
                      Create an account
                    </button>
                  </span>
                </>
              )}
              {mode !== 'in' && (
                <button type="button" className="auth-link" onClick={() => switchTo('in')}>
                  Back to sign in
                </button>
              )}
            </div>
          </>
        )}
        {onContinue && (
          <p className="auth-continue">
            <button type="button" className="auth-link" onClick={onContinue}>
              Keep reading without an account
            </button>
            <span>Reading, cross-references and the original languages don’t need an account; saving your notes, highlights and journal does.</span>
          </p>
        )}
      </main>
    </div>
  );
}

/**
 * The sign-in page as a route (/signin), for someone reading signed out.
 * Once signed in, it goes back to the page that needed an account.
 */
export function SignInRoute() {
  const readingOnly = useReadingOnly();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as SignInState | null;
  if (!readingOnly) return <Navigate replace to={state?.back ?? '/'} />;
  // Keep reading: back where you were, unless that page needs an account.
  const readable = state?.back && !/^\/(journal|notes)(\/|$)|^\/$/.test(state.back.split('?')[0]!) ? state.back : lastReadingPath();
  return <SignInPage initialMode={state?.mode ?? 'in'} onContinue={() => navigate(readable)} />;
}

/** After following a "reset password" link: choose the new password. */
export function SetPasswordPage({ onDone }: { onDone: (user: User) => void }) {
  const sb = supabase();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Please use a longer password (at least ${MIN_PASSWORD} characters).`);
      return;
    }
    setBusy(true);
    const { data, error } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(friendlyAuthError(error.message));
    else onDone(data.user);
  };

  return (
    <div className="auth-page">
      <main className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">Margins</div>
        <h1 id="auth-title">Choose a new password</h1>
        <form onSubmit={(e) => void submit(e)} className="auth-form">
          <label>
            New password
            <input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="auth-primary" disabled={busy}>
            {busy ? 'One moment…' : 'Save password'}
          </button>
        </form>
      </main>
    </div>
  );
}
