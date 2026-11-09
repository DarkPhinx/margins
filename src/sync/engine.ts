/**
 * Syncs this device's study items with the person's account.
 *
 * Everything is saved on the device first; a sync then
 *  1. pulls changes made elsewhere since the last pull, and
 *  2. pushes changes made here.
 *
 * Every server copy has a version that goes up on each change. A device sends
 * the version its copy was based on; if the server has moved on, the server's
 * copy comes back instead and it's a conflict:
 *  - notes, questions and journal entries: the person is asked which to keep
 *    (this device's, the other's, or both); until then the item isn't pushed;
 *  - highlights and links (no writing to lose): the newer change wins.
 * Identical copies are never a conflict.
 *
 * Half-written notes stay on the device: an item being typed in is uploaded
 * once typing pauses or the note closes (see ./writing), and a new note,
 * question or journal entry isn't uploaded until something is written in it.
 */

import { db, syncWrite, type SyncConflict } from '../study/db';
import type { StudyItem } from '../study/types';
import { isTextItem } from '../study/types';
import { isTyping } from './writing';

/** A server copy of an item. */
export interface RemoteRow {
  id: string;
  version: number;
  data: StudyItem;
  seq: number;
}

export type PushResult = { status: 'ok'; version: number; seq: number } | { status: 'conflict'; row: RemoteRow };

/** The account's store: Supabase in the app, a fake in tests. */
export interface Remote {
  /** Saves an item if the server's copy is still at `base` (null: never synced). */
  push(item: StudyItem, base: number | null): Promise<PushResult>;
  /** Changes after `since`, oldest first, at most `limit`. */
  pull(since: number, limit: number): Promise<RemoteRow[]>;
}

export interface SyncReport {
  pulled: number;
  pushed: number;
  /** New conflicts waiting for the person. */
  conflicts: number;
}

const CURSOR = 'pullCursor';
const PAGE = 500;

/** The item as uploaded: without this device's sync fields. */
export function forUpload(item: StudyItem): StudyItem {
  const rest: Record<string, unknown> = { ...item };
  delete rest.dirty;
  delete rest.syncedVersion;
  return rest as unknown as StudyItem;
}

/** Same content, ignoring sync fields. */
function sameContent(a: StudyItem, b: StudyItem): boolean {
  return stableJson(forUpload(a)) === stableJson(forUpload(b));
}

function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

/** Keeps the server's copy here, as synced. */
async function takeRemote(row: RemoteRow): Promise<void> {
  await syncWrite(() => db.items.put({ ...forUpload(row.data), syncedVersion: row.version, dirty: 0 }));
}

/**
 * This device's copy and the server's differ, and both changed. Returns true
 * if the person has to choose.
 */
async function settle(local: StudyItem, row: RemoteRow): Promise<boolean> {
  if (sameContent(local, row.data)) {
    await syncWrite(() => db.items.update(local.id, { syncedVersion: row.version, dirty: 0 }));
    return false;
  }
  if (isTextItem(local) || isTextItem(row.data)) {
    const conflict: SyncConflict = { id: local.id, remote: forUpload(row.data), remoteVersion: row.version, detectedAt: Date.now() };
    await syncWrite(() => db.conflicts.put(conflict));
    return true;
  }
  // Highlights and links: the newer change wins.
  if (row.data.updatedAt > local.updatedAt) await takeRemote(row);
  else await syncWrite(() => db.items.update(local.id, { syncedVersion: row.version, dirty: 1 }));
  return false;
}

async function pull(remote: Remote, report: SyncReport): Promise<void> {
  let since = ((await db.meta.get(CURSOR))?.value as number | undefined) ?? 0;
  for (;;) {
    const rows = await remote.pull(since, PAGE);
    for (const row of rows) {
      const local = await db.items.get(row.id);
      if (!local) await takeRemote(row);
      else if ((local.syncedVersion ?? 0) >= row.version) {
        // Already have it (often our own change coming back).
      } else if (!local.dirty) await takeRemote(row);
      else if (await settle(local, row)) report.conflicts++;
      report.pulled++;
      since = Math.max(since, row.seq);
    }
    await db.meta.put({ key: CURSOR, value: since });
    if (rows.length < PAGE) break;
  }
}

/** A new note, question or journal entry nothing has been written in yet. */
export function blankAndNew(item: StudyItem): boolean {
  if (item.syncedVersion !== undefined || item.deletedAt !== null || !isTextItem(item)) return false;
  if (item.text.trim()) return false;
  if (item.kind === 'journal' && item.title.trim()) return false;
  if (item.kind === 'question' && item.answerText.trim()) return false;
  return true;
}

/** Not uploaded yet: still being typed in, or new and still blank. */
function notReady(item: StudyItem): boolean {
  return isTyping(item.id) || blankAndNew(item);
}

async function push(remote: Remote, report: SyncReport): Promise<void> {
  const waiting = new Set((await db.conflicts.toArray()).map((c) => c.id));
  const dirty = await db.items.where('dirty').equals(1).toArray();
  for (const item of dirty) {
    if (waiting.has(item.id) || notReady(item)) continue;
    const result = await remote.push(forUpload(item), item.syncedVersion ?? null);
    if (result.status === 'ok') {
      // Mark it clean only if it wasn't changed again while uploading.
      await syncWrite(async () => {
        const now = await db.items.get(item.id);
        if (!now) return;
        await db.items.update(item.id, {
          syncedVersion: result.version,
          dirty: now.updatedAt === item.updatedAt && sameContent(now, item) ? 0 : 1,
        });
      });
      report.pushed++;
    } else {
      const now = (await db.items.get(item.id)) ?? item;
      if (await settle(now, result.row)) report.conflicts++;
    }
  }
}

let running: Promise<SyncReport> | null = null;
let again = false;

/** Syncs once; if a sync is already running, runs one more after it. */
export function sync(remote: Remote): Promise<SyncReport> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    const report: SyncReport = { pulled: 0, pushed: 0, conflicts: 0 };
    try {
      do {
        again = false;
        await pull(remote, report);
        await push(remote, report);
      } while (again);
      return report;
    } finally {
      running = null;
    }
  })();
  return running;
}

export type Choice = 'mine' | 'theirs' | 'both';

/**
 * Settles a conflict the way the person chose:
 *  - mine: this device's copy replaces the other;
 *  - theirs: the other device's copy replaces this one;
 *  - both: this device's copy stays, and the other is kept as a separate item.
 */
export async function resolveConflict(id: string, choice: Choice, newId: () => string = () => crypto.randomUUID()): Promise<void> {
  await syncWrite(async () => {
    const conflict = await db.conflicts.get(id);
    if (!conflict) return;
    if (choice === 'theirs') {
      await db.items.put({ ...conflict.remote, syncedVersion: conflict.remoteVersion, dirty: 0 });
    } else {
      // Ours goes up over the version we've now seen.
      await db.items.update(id, { syncedVersion: conflict.remoteVersion, dirty: 1 });
      if (choice === 'both') {
        const copy = { ...conflict.remote, id: newId(), updatedAt: Date.now() } as StudyItem;
        if (copy.kind === 'journal') copy.title = copy.title ? `${copy.title} (other device)` : 'From another device';
        delete copy.syncedVersion;
        copy.dirty = 1;
        await db.items.add(copy);
      }
    }
    await db.conflicts.delete(id);
  });
}

/** Forgets how far this device has read the server's changes (e.g. for a different account). */
export async function resetCursor(): Promise<void> {
  await db.meta.delete(CURSOR);
}
