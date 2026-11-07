import Dexie, { type EntityTable } from 'dexie';
import type { StudyItem } from './types';

/** Everything is saved on this device first (IndexedDB); Phase 5 adds sync. */
export class MarginsDB extends Dexie {
  items!: EntityTable<StudyItem, 'id'>;

  constructor(name = 'margins') {
    super(name);
    this.version(1).stores({
      // *chapterKeys: multi-entry index, so one item spanning chapters is found from each.
      items: 'id, kind, updatedAt, deletedAt, *chapterKeys, date',
    });
  }
}

export let db = new MarginsDB();

/** Tests use a fresh database each time. */
export async function resetDatabase(name = `margins-test-${Math.random().toString(36).slice(2)}`): Promise<void> {
  db.close();
  db = new MarginsDB(name);
  await db.open();
}
