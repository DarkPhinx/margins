/**
 * Syncs account settings (scope "account" in ./registry.ts) with the account.
 *
 * One exchange: this device sends the settings it changed, the server merges
 * them in (per setting, the newer change wins; see
 * supabase/migrations/0002_account_settings.sql) and sends back the account's
 * settings, which this device then uses. With nothing to send, it's a plain read.
 */

import { pendingAccountChanges, receiveAccountSettings, settingsAccount, type AccountRecord } from './store';

/** The account's settings on the server: Supabase in the app, a fake in tests. */
export interface SettingsRemote {
  /** Merges `changes` into the account's settings and returns all of them. */
  exchange(changes: AccountRecord): Promise<AccountRecord>;
}

let running: Promise<void> | null = null;
let again = false;

/** Syncs once; if a sync is already running, runs one more after it. Does nothing signed out. */
export function syncSettings(remote: SettingsRemote): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        const userId = settingsAccount();
        if (!userId) return;
        const sent = pendingAccountChanges();
        const record = await remote.exchange(sent);
        receiveAccountSettings(userId, sent, record && typeof record === 'object' ? record : {});
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}
