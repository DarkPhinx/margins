/**
 * Study items. Every item except a standalone journal entry is attached to
 * verses through the shared verse addresses, so it shows in every translation.
 *
 * Built for Phase 5 sync: permanent ids, change times on everything, and
 * deletes kept as tombstones (deletedAt) rather than removed.
 */

import type { VerseRange } from '../bible/types';

/** TipTap/ProseMirror document JSON. */
export interface RichDoc {
  type: 'doc';
  content?: RichNode[];
}

export interface RichNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichNode[];
}

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

interface BaseItem {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** Set when deleted; kept so a deletion can sync to other devices later. */
  deletedAt: number | null;
  /** The verses this item is attached to. */
  anchors: VerseRange[];
  /** Derived from anchors (BBCCC per chapter) so a chapter's items load fast. */
  chapterKeys: number[];
}

interface WrittenItem {
  body: RichDoc;
  /** Plain text of the body, for search. */
  text: string;
  /** Verse references found in the text. */
  refs: VerseRange[];
}

export interface NoteItem extends BaseItem, WrittenItem {
  kind: 'note';
}

export interface QuestionItem extends BaseItem, WrittenItem {
  kind: 'question';
  status: 'open' | 'answered';
  answeredAt: number | null;
  answer: RichDoc | null;
  answerText: string;
  /** Verses that answer the question. Missing on questions saved before Phase 3. */
  answerRefs?: VerseRange[];
}

/** Two passages you linked yourself. anchors[0] is where you linked from, anchors[1] the other passage. */
export interface LinkItem extends BaseItem {
  kind: 'link';
  /** Why they belong together (optional). */
  note: string;
}

/**
 * Part of the text rather than whole verses: from `start` in the first
 * verse's plain text (see verseTexts) to `end` in the last verse's. Character
 * positions belong to one translation, so it shows only there.
 */
export interface HighlightSegment {
  translation: string;
  start: number;
  end: number;
}

export interface HighlightItem extends BaseItem {
  kind: 'highlight';
  color: HighlightColor;
  /** Set for a highlight on some words; absent for whole verses. */
  segment?: HighlightSegment;
}

export interface JournalItem extends BaseItem, WrittenItem {
  kind: 'journal';
  /** The entry's day, YYYY-MM-DD, in the reader's own time zone. */
  date: string;
  title: string;
}

export type StudyItem = NoteItem | QuestionItem | HighlightItem | JournalItem | LinkItem;
/** Items with written text: searchable, and edited in the editor. */
export type TextItem = NoteItem | QuestionItem | JournalItem;

export function isTextItem(item: StudyItem): item is TextItem {
  return item.kind === 'note' || item.kind === 'question' || item.kind === 'journal';
}
export type StudyKind = StudyItem['kind'];
export type WrittenKind = 'note' | 'question' | 'journal';
