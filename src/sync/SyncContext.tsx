/**
 * Keeps this device in step with the account: syncs when the app opens, a
 * moment after any change, when the connection comes back, when the app comes
 * back into view, when another device changes something (Supabase Realtime),
 * when typing in a note pauses or the note closes, and every minute as a fallback.
 * Account settings sync along with the items, and a moment after one changes.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { onAccountSettingsChange, pendingAccountChangeCount, subscribeSettings, syncSettings, type SettingsRemote } from '../settings';
import { db, type SyncConflict } from '../study/db';
import { sync, type Remote } from './engine';
import { onTypingDone } from './writing';

export type SyncStatus = 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  /** When the last sync finished without error. */
  lastSynced: number | null;
  error: string | null;
  /** Items changed on two devices, waiting for the person to choose. */
  conflicts: SyncConflict[];
  /** Changes here not yet in the account. */
  unsynced: number;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncState | null>(null);

/** Sync state, or null outside an account (e.g. in tests of single pages). */
export function useSync(): SyncState | null {
  return useContext(SyncContext);
}

const AFTER_CHANGE_MS = 1500;
const NO_CONFLICTS: SyncConflict[] = [];
const EVERY_MS = 60_000;

const looksOffline = (e: unknown) =>
  !navigator.onLine || (e instanceof Error && /fetch|network|offline|Failed to fetch|Load failed/i.test(e.message));

export function SyncProvider({
  remote,
  settings,
  subscribe,
  children,
}: {
  remote: Remote;
  /** The account's settings; without it (e.g. tests of items alone) only items sync. */
  settings?: SettingsRemote;
  /** Calls back when another device changes something; returns an unsubscribe. */
  subscribe?: (onChange: () => void) => () => void;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<SyncStatus>(navigator.onLine ? 'syncing' : 'offline');
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const conflicts = useLiveQuery(() => db.conflicts.toArray(), []) ?? NO_CONFLICTS;
  // How many changes are waiting, and the latest change time: further typing in
  // an already-changed note moves the time, so it syncs again too.
  const waiting = useLiveQuery(async () => {
    const dirty = await db.items.where('dirty').equals(1).toArray();
    return { n: dirty.length, latest: Math.max(0, ...dirty.map((i) => i.updatedAt)) };
  }, []);
  const pendingSettings = useSyncExternalStore(subscribeSettings, pendingAccountChangeCount, pendingAccountChangeCount);
  const unsynced = (waiting?.n ?? 0) + (settings ? pendingSettings : 0);
  const latestChange = waiting?.latest ?? 0;

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }
    setStatus('syncing');
    try {
      await sync(remote);
      if (settings) await syncSettings(settings);
      setLastSynced(Date.now());
      setError(null);
      setStatus('synced');
    } catch (e) {
      if (looksOffline(e)) setStatus('offline');
      else {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    }
  }, [remote, settings]);

  // Open, back online, back in view, every minute, on other devices' changes, and when typing stops.
  useEffect(() => {
    // First sync straight after opening (not inside the effect itself).
    const first = window.setTimeout(() => void syncNow(), 0);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };
    const onOffline = () => setStatus('offline');
    window.addEventListener('online', syncNow);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => void syncNow(), EVERY_MS);
    const unsubscribe = subscribe?.(() => void syncNow());
    const stopTyping = onTypingDone(() => void syncNow());
    return () => {
      stopTyping();
      window.removeEventListener('online', syncNow);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
      window.clearTimeout(first);
      unsubscribe?.();
    };
  }, [syncNow, subscribe]);

  // A moment after an account setting changes here.
  const settingsPending = useRef(0);
  useEffect(() => {
    if (!settings) return;
    const stop = onAccountSettingsChange(() => {
      window.clearTimeout(settingsPending.current);
      settingsPending.current = window.setTimeout(() => void syncNow(), AFTER_CHANGE_MS);
    });
    return () => {
      stop();
      window.clearTimeout(settingsPending.current);
    };
  }, [settings, syncNow]);

  // A moment after anything changes here.
  const pending = useRef(0);
  useEffect(() => {
    if (!unsynced) return;
    window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => void syncNow(), AFTER_CHANGE_MS);
    return () => window.clearTimeout(pending.current);
  }, [unsynced, latestChange, syncNow]);

  const value = useMemo(
    () => ({ status, lastSynced, error, conflicts, unsynced, syncNow }),
    [status, lastSynced, error, conflicts, unsynced, syncNow],
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
