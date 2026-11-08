/**
 * Each account has its own database on a device ("margins-<user id>"), so two
 * people signing in on one computer never see each other's notes.
 *
 * Before accounts, everything was in one database called "margins". The first
 * account to sign in on a device takes those items over: they're copied into
 * its database, marked as changed, and so uploaded on the first sync. The old
 * database is left in place, untouched, as a backup.
 */

import Dexie from 'dexie';
import { db, MarginsDB, switchDatabase } from '../study/db';
import type { StudyItem } from '../study/types';
import { forUpload } from './engine';

const LEGACY = 'margins';
/** Which account took over the pre-account notes on this device. */
export const CLAIMED_KEY = 'margins.legacyClaimedBy';

export const accountDatabaseName = (userId: string) => `margins-${userId}`;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Opens the account's database; returns how many earlier notes it took over. */
export async function openAccountDatabase(userId: string): Promise<number> {
  await switchDatabase(accountDatabaseName(userId));
  if (read(CLAIMED_KEY) || !(await Dexie.exists(LEGACY))) return 0;
  const old = new MarginsDB(LEGACY);
  let items: StudyItem[];
  try {
    await old.open();
    items = await old.items.toArray();
  } finally {
    old.close();
  }
  // Fresh copies: never synced, so all uploaded (the hook marks them changed).
  const copies = items.map((i) => forUpload(i));
  await db.items.bulkPut(copies);
  try {
    localStorage.setItem(CLAIMED_KEY, userId);
  } catch {
    // Without storage it would be offered again next time; bulkPut is idempotent.
  }
  return copies.length;
}

/** How many items here haven't reached the account yet. */
export async function unsyncedCount(): Promise<number> {
  return db.items.where('dirty').equals(1).count();
}

/** Removes this device's copy of the account's data (on signing out). */
export async function removeAccountDatabase(userId: string): Promise<void> {
  // Signing out may already have switched to the signed-out database.
  if (db.name === accountDatabaseName(userId)) db.close();
  await Dexie.delete(accountDatabaseName(userId));
}
