/**
 * Reading and writing study items. All writes go through here so that derived
 * fields (chapter index, plain text, detected references, change times) are
 * always kept in step.
 */

import type { BookId } from '../bible/books';
import { chapterKey, chapterKeysOf, nextVerseId, previousVerseId } from '../bible/verseIndex';
import type { VerseRange } from '../bible/types';
import { db } from './db';
import { overlaps, pointOffset, pointVerse, subtractRange, subtractSpan, textPoint } from './ranges';
import { emptyDoc, refsIn, textOf, todayLocal } from './text';
import type {
  HighlightColor,
  HighlightItem,
  HighlightSegment,
  JournalItem,
  LinkItem,
  NoteItem,
  QuestionItem,
  RichDoc,
  StudyItem,
  TextItem,
} from './types';
import { isTextItem } from './types';

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
  if (!item || !isTextItem(item) || item.text.trim() || (item.kind === 'journal' && item.title.trim())) {
    return false;
  }
  await removeBlank([item]);
  return true;
}

/**
 * Blank items are removed outright, unless they've already reached the
 * account: then they're marked deleted, so other devices drop them too.
 */
async function removeBlank(items: StudyItem[]): Promise<void> {
  const now = clock();
  const synced = items.filter((i) => i.syncedVersion !== undefined);
  await db.items.bulkDelete(items.filter((i) => i.syncedVersion === undefined).map((i) => i.id));
  for (const i of synced) await db.items.update(i.id, { deletedAt: now, updatedAt: now });
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
  await removeBlank(blank);
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

/** A word highlight as one stretch of text points. */
function spanOf(item: HighlightItem): [number, number] {
  const a = item.anchors[0]!;
  return [textPoint(a.start, item.segment!.start), textPoint(a.end, item.segment!.end)];
}

/**
 * A stretch of text back as verses and character positions; null if nothing
 * is left. A stretch ending at the very start of a verse ends with the verse
 * before; one starting past a verse's end starts with the next.
 */
function segmentOf([p0, p1]: [number, number], translation: string): { anchor: VerseRange; segment: HighlightSegment } | null {
  let startVerse = pointVerse(p0);
  let start = pointOffset(p0);
  let endVerse = pointVerse(p1);
  let end = pointOffset(p1);
  if (start === WHOLE_VERSE_END) {
    const next = nextVerseId(startVerse);
    if (next === null) return null;
    [startVerse, start] = [next, 0];
  }
  if (end === 0 && endVerse > startVerse) {
    const prev = previousVerseId(endVerse);
    if (prev === null) return null;
    [endVerse, end] = [prev, WHOLE_VERSE_END];
  }
  if (textPoint(startVerse, start) >= textPoint(endVerse, end)) return null;
  return { anchor: { start: startVerse, end: endVerse }, segment: { translation, start, end } };
}

/** An end position past any verse's last character: "to the end of the verse". */
const WHOLE_VERSE_END = 99_999;

/** Removes [b0, b1) from word highlights it touches (in one translation, or all). */
async function trimSegments(range: VerseRange, cut: [number, number], translation: string | null, now: number): Promise<void> {
  const candidates = await db.items.where('chapterKeys').anyOf(chapterKeysOf(range)).toArray();
  for (const item of candidates) {
    if (item.kind !== 'highlight' || !item.segment || !live(item)) continue;
    if (translation !== null && item.segment.translation !== translation) continue;
    const [a0, a1] = spanOf(item);
    if (a1 <= cut[0] || cut[1] <= a0) continue;
    const pieces = subtractSpan([a0, a1], cut)
      .map((p) => segmentOf(p, item.segment!.translation))
      .filter((p) => p !== null);
    if (!pieces.length) {
      await db.items.update(item.id, { deletedAt: now, updatedAt: now });
      continue;
    }
    const [first, ...rest] = pieces;
    await db.items.update(item.id, { anchors: [first!.anchor], chapterKeys: keysOf([first!.anchor]), segment: first!.segment, updatedAt: now } as Partial<StudyItem>);
    for (const p of rest) {
      const split: HighlightItem = { kind: 'highlight', ...base([p.anchor]), color: item.color, segment: p.segment };
      await db.items.add(split);
    }
  }
}

/**
 * Colours some words: from `start` in the first verse of `range` to `end` in
 * its last (character positions in that translation's plain verse text).
 * Word highlights already there are trimmed, so each word has one colour;
 * `null` removes word highlighting there. Whole-verse highlights are left as
 * they are; a word's own colour shows over them.
 */
export async function setSegmentHighlight(
  translation: string,
  range: VerseRange,
  start: number,
  end: number,
  color: HighlightColor | null,
): Promise<void> {
  const cut: [number, number] = [textPoint(range.start, start), textPoint(range.end, end)];
  if (cut[0] >= cut[1]) return;
  await db.transaction('rw', db.items, async () => {
    const now = clock();
    await trimSegments(range, cut, translation, now);
    if (color) {
      const item: HighlightItem = { kind: 'highlight', ...base([range]), color, segment: { translation, start, end } };
      await db.items.add(item);
    }
  });
  askPersistence();
}

/**
 * Colours whole verses. Older highlights under the range are trimmed (split if
 * needed), so each verse has at most one colour. `null` removes highlighting,
 * word highlights in those verses included.
 */
export async function setHighlight(range: VerseRange, color: HighlightColor | null): Promise<void> {
  await db.transaction('rw', db.items, async () => {
    const keys = chapterKeysOf(range);
    const candidates = await db.items.where('chapterKeys').anyOf(keys).toArray();
    const now = clock();
    if (!color) await trimSegments(range, [textPoint(range.start, 0), textPoint(range.end, WHOLE_VERSE_END)], null, now);
    for (const item of candidates) {
      if (item.kind !== 'highlight' || item.segment || !live(item)) continue;
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
  item: TextItem;
  /** A short piece of text around the first match. */
  snippet: string;
}

/** Notes, questions (with answers) and journal entries containing every word of the query. */
export async function search(query: string): Promise<SearchHit[]> {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const items = (await db.items.toArray()).filter((i): i is TextItem => live(i) && isTextItem(i));
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

// ───────── Links between passages

/** Links two passages you chose yourself; shows on both. */
export async function createLink(from: VerseRange, to: VerseRange, note = ''): Promise<LinkItem> {
  const item: LinkItem = { kind: 'link', ...base([from, to]), note: note.trim() };
  await db.items.add(item);
  askPersistence();
  return item;
}

export async function saveLinkNote(id: string, note: string): Promise<void> {
  await db.items.update(id, { note, updatedAt: clock() } as Partial<StudyItem>);
}

/** Your links touching a passage (either end). */
export async function linksFor(range: VerseRange): Promise<LinkItem[]> {
  const items = await db.items.where('chapterKeys').anyOf(chapterKeysOf(range)).toArray();
  const seen = new Set<string>();
  return items.filter((i): i is LinkItem => {
    if (i.kind !== 'link' || !live(i) || seen.has(i.id)) return false;
    seen.add(i.id);
    return i.anchors.some((a) => overlaps(a, range));
  });
}

// ───────── Verses that answer a question

export async function addAnswerRef(id: string, range: VerseRange): Promise<void> {
  const item = await db.items.get(id);
  if (item?.kind !== 'question') return;
  const refs = item.answerRefs ?? [];
  if (refs.some((r) => r.start === range.start && r.end === range.end)) return;
  await db.items.update(id, { answerRefs: [...refs, range], updatedAt: clock() } as Partial<StudyItem>);
}

export async function removeAnswerRef(id: string, range: VerseRange): Promise<void> {
  const item = await db.items.get(id);
  if (item?.kind !== 'question') return;
  const refs = (item.answerRefs ?? []).filter((r) => !(r.start === range.start && r.end === range.end));
  await db.items.update(id, { answerRefs: refs, updatedAt: clock() } as Partial<StudyItem>);
}
