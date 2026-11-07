/**
 * A safety net for typing. Saving to IndexedDB is asynchronous, and a page that
 * closes or reloads mid-save can lose the last words. Every change is also
 * written at once (synchronously) to localStorage as a draft, removed when the
 * real save completes. Drafts left behind are applied on the next start, if
 * they are newer than what was saved.
 */

import { db } from './db';
import { saveAnswer, saveBody, saveJournalMeta } from './store';
import type { RichDoc } from './types';

const PREFIX = 'margins.draft.';
export type DraftField = 'body' | 'answer' | 'meta';

interface Draft {
  value: unknown;
  at: number;
}

export function writeDraft(id: string, field: DraftField, value: unknown): void {
  try {
    localStorage.setItem(`${PREFIX}${id}.${field}`, JSON.stringify({ value, at: Date.now() } satisfies Draft));
  } catch {
    // Storage full or blocked; the normal save still runs.
  }
}

export function clearDraft(id: string, field: DraftField): void {
  try {
    localStorage.removeItem(`${PREFIX}${id}.${field}`);
  } catch {
    // Nothing to clear.
  }
}

/** Applies drafts left by a page that closed before saving. Returns how many were applied. */
export async function recoverDrafts(): Promise<number> {
  let keys: string[];
  try {
    keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
  } catch {
    return 0;
  }
  let applied = 0;
  for (const key of keys) {
    const rest = key.slice(PREFIX.length);
    const dot = rest.lastIndexOf('.');
    const id = rest.slice(0, dot);
    const field = rest.slice(dot + 1) as DraftField;
    let draft: Draft | null;
    try {
      draft = JSON.parse(localStorage.getItem(key) ?? 'null') as Draft | null;
    } catch {
      draft = null;
    }
    const item = await db.items.get(id);
    if (draft && item && item.deletedAt === null && draft.at > item.updatedAt) {
      if (field === 'body') await saveBody(id, draft.value as RichDoc);
      else if (field === 'answer') await saveAnswer(id, draft.value as RichDoc);
      else if (field === 'meta') await saveJournalMeta(id, draft.value as { date?: string; title?: string });
      applied++;
    }
    localStorage.removeItem(key);
  }
  return applied;
}
