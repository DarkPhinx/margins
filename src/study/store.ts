/**
 * Reading and writing study items. All writes go through here so that derived
 * fields (chapter index, plain text, detected references, change times) are
 * always kept in step.
 */

import type { BookId } from '../bible/books';
import { chapterKey, chapterKeysOf } from '../bible/verseIndex';
import type { VerseRange } from '../bible/types';
import { db } from './db';
import { overlaps, subtractRange } from './ranges';
import { emptyDoc, refsIn, textOf, todayLocal } from './text';
import type {
  HighlightColor,
  HighlightItem,
  JournalItem,
  NoteItem,
  QuestionItem,
  RichDoc,
  StudyItem,
} from './types';

let clock: () => number = () => Date.now();
/** For tests. */
export function setClock(fn: () => number): void {
  clock = fn;
}

function newId(): string {
  return crypto.randomUUID();
}

function keysOf(anchors: VerseRange[]): number[] {
  return [...new Set(anchors.flatMap(chapterKeysOf))];
}

let persistAsked = false;
/** Ask the browser not to clear our storage under pressure. Harmless if refused. */
function askPersistence(): void {
  if (persistAsked) return;
  persistAsked = true;
  try {
    void navigator.storage?.persist?.();
  } catch {
    // Not available; storage still works.
  }
}

function base(anchors: VerseRange[]) {
  const now = clock();
  return { id: newId(), createdAt: now, updatedAt: now, deletedAt: null, anchors, chapterKeys: keysOf(anchors) };
}

function written(body: RichDoc) {
  const text = textOf(body);
  return { body, text, refs: refsIn(text) };
}

export async function createNote(anchors: VerseRange[], body: RichDoc = emptyDoc()): Promise<NoteItem> {
  const item: NoteItem = { kind: 'note', ...base(anchors), ...written(body) };
  await db.items.add(item);
  askPersistence();
  return item;
}

export async function createQuestion(anchors: VerseRange[], body: RichDoc = emptyDoc()): Promise<QuestionItem> {
  const item: QuestionItem = {
    kind: 'question',
    ...base(anchors),
    ...written(body),
    status: 'open',
    answeredAt: null,
    answer: null,
    answerText: '',
  };
  await db.items.add(item);
  askPersistence();
  return item;
}

/** A journal entry: standalone (no anchors), or tied to a chapter or passage. */
export async function createJournal(
  date = todayLocal(),
  body: RichDoc = emptyDoc(),
  title = '',
  anchors: VerseRange[] = [],
): Promise<JournalItem> {
  const item: JournalItem = { kind: 'journal', ...base(anchors), ...written(body), date, title };
  await db.items.add(item);
  askPersistence();
  return item;
}

export async function getItem(id: string): Promise<StudyItem | undefined> {
  return db.items.get(id);
}

/** Saves the body of a note, question or journal entry. */
export async function saveBody(id: string, body: RichDoc): Promise<void> {
  await db.items.update(id, { ...written(body), updatedAt: clock() } as Partial<StudyItem>);
}

export async function saveJournalMeta(id: string, patch: { date?: string; title?: string }): Promise<void> {
  await db.items.update(id, { ...patch, updatedAt: clock() } as Partial<StudyItem>);
}

export async function setAnchors(id: string, anchors: VerseRange[]): Promise<void> {
  await db.items.update(id, { anchors, chapterKeys: keysOf(anchors), updatedAt: clock() } as Partial<StudyItem>);
}

export async function markAnswered(id: string, answered: boolean): Promise<void> {
  const now = clock();
  await db.items.update(id, {
    status: answered ? 'answered' : 'open',
    answeredAt: answered ? now : null,
    updatedAt: now,
  } as Partial<StudyItem>);
}

export async function saveAnswer(id: string, answer: RichDoc): Promise<void> {
  await db.items.update(id, { answer, answerText: textOf(answer), updatedAt: clock() } as Partial<StudyItem>);
}

/** Soft delete: kept as a tombstone for sync, hidden everywhere. */
export async function deleteItem(id: string): Promise<void> {
  const now = clock();
  await db.items.update(id, { deletedAt: now, updatedAt: now });
}

export async function restoreItem(id: string): Promise<void> {
  await db.items.update(id, { deletedAt: null, updatedAt: clock() });
}

/**
 * Removes a just-created item that was never written in (an empty new note
 * left without typing). It was never real, so no tombstone is kept.
 */
export async function discardIfEmpty(id: string): Promise<boolean> {
  const item = await db.items.get(id);
  if (!item || item.kind === 'highlight' || item.text.trim() || (item.kind === 'journal' && item.title.trim())) {
    return false;
  }
  await db.items.delete(id);
  return true;
}

/**
 * Removes journal entries that were started but never written in (no text, no
 * title). Called when the home page opens, so abandoned blank entries don't pile up.
 */
export async function discardEmptyJournals(): Promise<number> {
  // Only ones over a minute old, so an entry being started right now is never touched.
  const before = clock() - 60_000;
  const blank = (await db.items.where('kind').equals('journal').toArray()).filter(
    (i) => i.kind === 'journal' && i.deletedAt === null && !i.text.trim() && !i.title.trim() && i.createdAt < before,
  );
  await db.items.bulkDelete(blank.map((i) => i.id));
  return blank.length;
}

const live = (i: StudyItem) => i.deletedAt === null;

/** Every live item attached to a chapter (including ranges that run through it). */
export async function itemsForChapter(book: BookId, chapter: number): Promise<StudyItem[]> {
  const items = await db.items.where('chapterKeys').equals(chapterKey(book, chapter)).toArray();
  return items.filter(live);
}

export async function listByKind<K extends StudyItem['kind']>(kind: K): Promise<Extract<StudyItem, { kind: K }>[]> {
  const items = await db.items.where('kind').equals(kind).toArray();
  return items.filter(live) as Extract<StudyItem, { kind: K }>[];
}

/**
 * Colours whole verses. Older highlights under the range are trimmed (split if
 * needed), so each verse has at most one colour. `null` removes highlighting.
 */
export async function setHighlight(range: VerseRange, color: HighlightColor | null): Promise<void> {
  await db.transaction('rw', db.items, async () => {
    const keys = chapterKeysOf(range);
    const candidates = await db.items.where('chapterKeys').anyOf(keys).toArray();
    const now = clock();
    for (const item of candidates) {
      if (item.kind !== 'highlight' || !live(item)) continue;
      if (!item.anchors.some((a) => overlaps(a, range))) continue;
      const pieces = item.anchors.flatMap((a) => subtractRange(a, range));
      if (!pieces.length) {
        await db.items.update(item.id, { deletedAt: now, updatedAt: now });
        continue;
      }
      // Keep the first piece in this item and give any others their own, so each stays one range.
      const [first, ...rest] = pieces;
      await db.items.update(item.id, { anchors: [first!], chapterKeys: keysOf([first!]), updatedAt: now } as Partial<StudyItem>);
      for (const piece of rest) {
        const split: HighlightItem = { kind: 'highlight', ...base([piece]), color: item.color };
        await db.items.add(split);
      }
    }
    if (color) {
      const item: HighlightItem = { kind: 'highlight', ...base([range]), color };
      await db.items.add(item);
    }
  });
  askPersistence();
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘]/g, "'");
}

export interface SearchHit {
  item: Exclude<StudyItem, HighlightItem>;
  /** A short piece of text around the first match. */
  snippet: string;
}

/** Notes, questions (with answers) and journal entries containing every word of the query. */
export async function search(query: string): Promise<SearchHit[]> {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const items = (await db.items.toArray()).filter(
    (i): i is Exclude<StudyItem, HighlightItem> => live(i) && i.kind !== 'highlight',
  );
  const hits: SearchHit[] = [];
  for (const item of items) {
    const full = [item.kind === 'journal' ? item.title : '', item.text, item.kind === 'question' ? item.answerText : '']
      .filter(Boolean)
      .join('\n');
    const hay = normalise(full);
    if (!words.every((w) => hay.includes(w))) continue;
    const at = hay.indexOf(words[0]!);
    const from = Math.max(0, at - 40);
    const raw = full.slice(from, at + 100).replace(/\s+/g, ' ').trim();
    hits.push({ item, snippet: `${from > 0 ? '…' : ''}${raw}${at + 100 < full.length ? '…' : ''}` });
  }
  return hits.sort((a, b) => b.item.updatedAt - a.item.updatedAt);
}
