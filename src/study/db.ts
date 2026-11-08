import Dexie, { type EntityTable } from 'dexie';
import type { StudyItem } from './types';

/**
 * A study item changed on two devices: this device's copy stays in `items`
 * until the person chooses; the other device's copy waits here.
 */
export interface SyncConflict {
  /** The item's id. */
  id: string;
  /** The other device's copy, as on the server. */
  remote: StudyItem;
  /** The server version of that copy. */
  remoteVersion: number;
  detectedAt: number;
}

/** Small values this device keeps for syncing, e.g. how far it has read the server's changes. */
export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * Everything is saved on this device first (IndexedDB) and synced to the
 * person's account. One database per account on a device.
 */
export class MarginsDB extends Dexie {
  items!: EntityTable<StudyItem, 'id'>;
  conflicts!: EntityTable<SyncConflict, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor(name = 'margins') {
    super(name);
    this.version(1).stores({
      // *chapterKeys: multi-entry index, so one item spanning chapters is found from each.
      items: 'id, kind, updatedAt, deletedAt, *chapterKeys, date',
    });
    // Phase 5: sync.
    this.version(2)
      .stores({
        items: 'id, kind, updatedAt, deletedAt, *chapterKeys, date, dirty',
        conflicts: 'id',
        meta: 'key',
      })
      .upgrade((tx) => tx.table('items').toCollection().modify({ dirty: 1 }));

    // Every change made by the app marks the item as needing upload. Sync's own
    // writes (made through syncWrite) set `dirty` themselves.
    this.items.hook('creating', (_key, item, tx) => {
      refuseIfReadOnly(this);
      if (!syncTransactions.has(tx)) item.dirty = 1;
    });
    this.items.hook('updating', (_changes, _key, _item, tx) => {
      refuseIfReadOnly(this);
      return syncTransactions.has(tx) ? undefined : { dirty: 1 };
    });
    this.items.hook('deleting', () => refuseIfReadOnly(this));
  }
}

const syncTransactions = new WeakSet<object>();

/** Databases nothing may be written to (the one used while signed out). */
const readOnlyNames = new Set<string>();

/** Signed out, nothing is saved: writing needs an account. The UI asks first; this is the safety net. */
export function setReadOnly(name: string, readOnly: boolean): void {
  if (readOnly) readOnlyNames.add(name);
  else readOnlyNames.delete(name);
}

function refuseIfReadOnly(database: Dexie): void {
  if (readOnlyNames.has(database.name)) throw new Error('Saving needs an account: sign in to keep notes, highlights and your journal.');
}

/** Runs sync's own writes: they don't mark items as changed on this device. */
export function syncWrite<T>(fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', db.items, db.conflicts, db.meta, (tx) => {
    syncTransactions.add(tx);
    return fn();
  });
}

export let db = new MarginsDB();

/** Opens a database by name in place of the current one (an account's own, or a test's). */
export async function switchDatabase(name: string): Promise<MarginsDB> {
  db.close();
  db = new MarginsDB(name);
  await db.open();
  return db;
}

/** Tests use a fresh database each time. */
export async function resetDatabase(name = `margins-test-${Math.random().toString(36).slice(2)}`): Promise<void> {
  await switchDatabase(name);
}
