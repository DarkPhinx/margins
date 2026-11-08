/**
 * What sync is doing, in the sidebar; the account in Settings; and the
 * dialog that asks which copy to keep when a note was changed on two devices.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { formatRange } from '../bible/refParser';
import { db, type SyncConflict } from '../study/db';
import type { StudyItem } from '../study/types';
import { useAccount } from './AuthGate';
import { unsyncedCount } from './localData';
import { useReadingOnly, useSignIn } from './access';
import { resolveConflict, type Choice } from './engine';
import { useSync, type SyncState } from './SyncContext';

const KIND: Record<string, string> = { note: 'Note', question: 'Question', journal: 'Journal entry', highlight: 'Highlight', link: 'Link' };

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function when(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function statusText(s: Pick<SyncState, 'status' | 'unsynced'>): string {
  switch (s.status) {
    case 'syncing':
      return 'Syncing…';
    case 'synced':
      return 'Synced';
    case 'offline':
      return s.unsynced ? `Offline · ${plural(s.unsynced, 'change')} saved on this device` : 'Offline';
    case 'error':
      return 'Couldn’t sync';
  }
}

/** In the sidebar, above Settings. */
export function SyncStatus() {
  const sync = useSync();
  const [open, setOpen] = useState(false);
  // Ask each time: open the dialog whenever a conflict appears that wasn't there before.
  const seen = useRef(new Set<string>());
  const ids = sync?.conflicts.map((c) => c.id).join(',') ?? '';
  useEffect(() => {
    if (!ids) return;
    const fresh = ids.split(',').filter((id) => !seen.current.has(id));
    fresh.forEach((id) => seen.current.add(id));
    if (fresh.length) setOpen(true);
  }, [ids]);
  if (!sync) return null;
  const n = sync.conflicts.length;
  return (
    <div className="sync-status">
      <span className={`sync-dot sync-${sync.status}`} aria-hidden="true" />
      <span role="status" title={sync.lastSynced ? `Last synced ${when(sync.lastSynced)}` : undefined}>
        {statusText(sync)}
      </span>
      {sync.status === 'error' && (
        <button type="button" className="link-btn" onClick={() => void sync.syncNow()}>
          Retry
        </button>
      )}
      {n > 0 && (
        <button type="button" className="sync-conflicts" onClick={() => setOpen(true)}>
          {plural(n, 'item')} need{n === 1 ? 's' : ''} your choice
        </button>
      )}
      {open && n > 0 && <ConflictDialog conflicts={sync.conflicts} onClose={() => setOpen(false)} onResolved={() => void sync.syncNow()} />}
    </div>
  );
}

function describe(item: StudyItem): string {
  const ref = item.anchors[0] ? formatRange(item.anchors[0]) : '';
  if (item.kind === 'journal') return [item.title || 'Untitled entry', item.date].filter(Boolean).join(' · ');
  return [KIND[item.kind] ?? item.kind, ref].filter(Boolean).join(' on ');
}

function Copy({ label, item }: { label: string; item: StudyItem }) {
  let body = '';
  if (item.kind === 'note' || item.kind === 'journal') body = item.text;
  else if (item.kind === 'question') body = [item.text, item.answerText && `Answer: ${item.answerText}`].filter(Boolean).join('\n\n');
  else if (item.kind === 'link') body = item.note;
  return (
    <section className="conflict-copy" aria-label={label}>
      <h4>{label}</h4>
      <p className="conflict-when">{item.deletedAt !== null ? `Deleted ${when(item.deletedAt)}` : `Changed ${when(item.updatedAt)}`}</p>
      {item.kind === 'journal' && item.title && <p className="conflict-title">{item.title}</p>}
      <div className="conflict-text">{item.deletedAt !== null ? <em>Deleted</em> : body || <em>(empty)</em>}</div>
    </section>
  );
}

function ConflictRow({ conflict, onResolved }: { conflict: SyncConflict; onResolved: () => void }) {
  const local = useLiveQuery(() => db.items.get(conflict.id), [conflict.id]);
  if (!local) return null;
  const choose = async (choice: Choice) => {
    await resolveConflict(conflict.id, choice);
    onResolved();
  };
  return (
    <li className="conflict" aria-label={describe(local)}>
      <h3>{describe(local)}</h3>
      <div className="conflict-copies">
        <Copy label="On this device" item={local} />
        <Copy label="On your other device" item={conflict.remote} />
      </div>
      <div className="conflict-actions">
        <button type="button" className="bar-action" onClick={() => void choose('mine')}>
          Keep this device’s
        </button>
        <button type="button" className="bar-action" onClick={() => void choose('theirs')}>
          Keep the other device’s
        </button>
        <button type="button" className="bar-action" onClick={() => void choose('both')}>
          Keep both
        </button>
      </div>
    </li>
  );
}

export function ConflictDialog({ conflicts, onClose, onResolved }: { conflicts: SyncConflict[]; onClose: () => void; onResolved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open && typeof d.showModal === 'function') d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet conflict-dialog"
      aria-label="Changed on two devices"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="sheet-inner">
        <header className="sheet-head">
          <span />
          <h2>Changed on two devices</h2>
          <button type="button" className="link-btn" onClick={onClose}>
            Later
          </button>
        </header>
        <p className="conflict-intro">
          {conflicts.length === 1 ? 'This was' : 'These were'} changed on this device and on another before they could sync. Choose
          which to keep. Until you do, nothing is overwritten.
        </p>
        <ul className="conflict-list">
          {conflicts.map((c) => (
            <ConflictRow key={c.id} conflict={c} onResolved={onResolved} />
          ))}
        </ul>
      </div>
    </dialog>
  );
}

/** Settings → Account. */
export function AccountSection() {
  const account = useAccount();
  const sync = useSync();
  /** Changes that would be lost, counted when Sign out was pressed; null when not asking. */
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const readingOnly = useReadingOnly();
  const signIn = useSignIn();
  if (readingOnly) {
    return (
      <section aria-label="Account">
        <h3 className="sheet-section">Account</h3>
        <p>
          You’re reading without an account. An account saves your notes, questions, highlights and journal, and keeps them in
          sync on every device.
        </p>
        <button type="button" className="bar-action" onClick={() => signIn('in')}>
          Sign in
        </button>{' '}
        <button type="button" className="bar-action" onClick={() => signIn('up')}>
          Create account
        </button>
      </section>
    );
  }
  if (!account) return null;
  const unsynced = confirming ?? 0;

  const signOut = async () => {
    setBusy(true);
    try {
      // One last sync first, then count straight from the database (not a moment-old figure).
      if (navigator.onLine) await sync?.syncNow();
      const left = await unsyncedCount();
      if (left > 0) setConfirming(left);
      else await account.signOut();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Account">
      <h3 className="sheet-section">Account</h3>
      <p>
        Signed in as <strong>{account.user.email ?? 'you'}</strong>
      </p>
      {sync && (
        <p className="account-sync">
          {statusText(sync)}
          {sync.lastSynced && sync.status !== 'syncing' ? ` · last synced ${when(sync.lastSynced)}` : ''}
          {sync.error && sync.status === 'error' ? ` (${sync.error})` : ''}{' '}
          <button type="button" className="link-btn" onClick={() => void sync.syncNow()}>
            Sync now
          </button>
        </p>
      )}
      {confirming !== null ? (
        <div className="account-signout" role="alert">
          <p>
            {plural(unsynced, 'change')} on this device {unsynced === 1 ? 'hasn’t' : 'haven’t'} reached your account yet. Signing out
            removes this device’s copy, so {unsynced === 1 ? 'it' : 'they'} would be lost.
          </p>
          <button type="button" className="bar-action" onClick={() => setConfirming(null)}>
            Stay signed in
          </button>{' '}
          <button type="button" className="bar-action danger" onClick={() => void account.signOut()}>
            Sign out anyway
          </button>
        </div>
      ) : (
        <button type="button" className="bar-action" disabled={busy} onClick={() => void signOut()}>
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      )}
    </section>
  );
}
