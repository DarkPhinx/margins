/**
 * Margins has two levels.
 *
 * Without an account — reading and looking things up:
 *   the BSB and KJV with every reader setting, cross-references, the
 *   Original language area, reference previews and links. Reader settings
 *   are kept on the device.
 *
 * With an account — anything you write:
 *   notes, questions and answers, highlights (whole verses and words),
 *   journal entries, passage links, and sync across devices.
 *
 * Signed out, the writing tools are still there; using one opens a friendly
 * prompt explaining that an account saves and syncs your study, with Sign in
 * and Create account. The reader is never blocked.
 *
 * The sign-in gate turns "reading only" on when nobody is signed in; without
 * the gate (e.g. a page rendered on its own in a test) everything is available.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { readerPath } from '../reader/nav';
import { getSettings } from '../settings';

interface ReadingOnlyValue {
  /** Shows the "an account saves your study" prompt. */
  ask: (what?: string) => void;
}

const ReadingOnly = createContext<ReadingOnlyValue | null>(null);

/** True when nobody is signed in: reading and looking things up only. */
export function useReadingOnly(): boolean {
  return useContext(ReadingOnly) !== null;
}

/**
 * For a tool that writes something: call it first. Signed out, it shows the
 * prompt and returns true (so don't go on); signed in it returns false.
 */
export function useNeedAccount(): (what?: string) => boolean {
  const ctx = useContext(ReadingOnly);
  return useCallback(
    (what?: string) => {
      if (!ctx) return false;
      ctx.ask(what);
      return true;
    },
    [ctx],
  );
}

/** Where the Bible opens: your last place. */
export function lastReadingPath(): string {
  const { translation, last } = getSettings();
  return readerPath(translation, last.book, last.chapter, last.verse);
}

export interface SignInState {
  /** Where to go once signed in. */
  back?: string;
  /** Open on "Create your account" rather than "Sign in". */
  mode?: 'in' | 'up';
}

/** Goes to the sign-in page, coming back here (or to `back`) afterwards. */
export function useSignIn(): (mode?: 'in' | 'up', back?: string) => void {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    (mode = 'in', back) =>
      navigate('/signin', { state: { back: back ?? location.pathname + location.search, mode } satisfies SignInState }),
    [navigate, location.pathname, location.search],
  );
}

const WHY =
  'An account saves your notes, questions, highlights and journal, and keeps them in sync on every device. Reading, cross-references and the original languages stay free without one.';

/** Sign in / Create account, for the prompt and the pages that need an account. */
function AccountButtons({ onChoose }: { onChoose?: () => void }) {
  const signIn = useSignIn();
  return (
    <>
      <button
        type="button"
        className="auth-primary"
        onClick={() => {
          onChoose?.();
          signIn('in');
        }}
      >
        Sign in
      </button>
      <button
        type="button"
        className="auth-google"
        onClick={() => {
          onChoose?.();
          signIn('up');
        }}
      >
        Create account
      </button>
    </>
  );
}

/** The friendly prompt, shown when a signed-out reader tries a tool that saves something. */
function AccountPromptDialog({ what, onClose }: { what?: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open && typeof d.showModal === 'function') d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="account-prompt"
      aria-label="Save your study with an account"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <h2>{what ? `Save ${what} with an account` : 'Save your study with an account'}</h2>
      <p>{WHY}</p>
      <div className="account-prompt-actions">
        <AccountButtons onChoose={onClose} />
        <button type="button" className="auth-link" onClick={onClose}>
          Not now
        </button>
      </div>
    </dialog>
  );
}

/** Turned on by the sign-in gate when nobody is signed in. */
export function ReadingOnlyProvider({ children }: { children: ReactNode }) {
  const [asking, setAsking] = useState<{ what?: string } | null>(null);
  const value = useMemo<ReadingOnlyValue>(() => ({ ask: (what) => setAsking({ what }) }), []);
  return (
    <ReadingOnly.Provider value={value}>
      {children}
      {asking && <AccountPromptDialog what={asking.what} onClose={() => setAsking(null)} />}
    </ReadingOnly.Provider>
  );
}

/** In place of something that needs an account (a page, or a part of the study panel). */
export function AccountNeeded({ title = 'Your study, saved', compact = false }: { title?: string; compact?: boolean }) {
  return (
    <section className={compact ? 'account-needed compact' : 'account-needed'} aria-label={title}>
      <h2>{title}</h2>
      <p>{WHY}</p>
      <div className="account-prompt-actions">
        <AccountButtons />
      </div>
    </section>
  );
}

/**
 * A page that needs an account. Signed out it explains why, with Sign in and
 * Create account, in place (the sidebar stays); home opens the Bible instead.
 */
export function AccountOnly({ children, title, readInstead = false }: { children: ReactNode; title?: string; readInstead?: boolean }) {
  const readingOnly = useReadingOnly();
  if (!readingOnly) return <>{children}</>;
  if (readInstead) return <Navigate replace to={lastReadingPath()} />;
  return (
    <div className="account-needed-page">
      <AccountNeeded title={title} />
      <p className="account-needed-read">
        <KeepReading />
      </p>
    </div>
  );
}

function KeepReading() {
  const navigate = useNavigate();
  return (
    <button type="button" className="auth-link" onClick={() => navigate(lastReadingPath())}>
      Keep reading
    </button>
  );
}
