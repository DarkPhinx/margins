import type { BookId } from '../bible/books';
import { formatRange } from '../bible/refParser';
import { nextVerseId, previousVerseId, versesInChapter } from '../bible/verseIndex';
import { makeVerseId, parseVerseId } from '../bible/verseId';
import type { VerseRange } from '../bible/types';

/** Every verse of a chapter: how a journal entry is tied to a chapter. */
export function chapterRange(book: BookId, chapter: number): VerseRange {
  return { start: makeVerseId(book, chapter, 1), end: makeVerseId(book, chapter, versesInChapter(book, chapter)) };
}

export function isWholeChapter(range: VerseRange): boolean {
  const s = parseVerseId(range.start);
  const e = parseVerseId(range.end);
  return s.book === e.book && s.chapter === e.chapter && s.verse === 1 && e.verse === versesInChapter(s.book, s.chapter);
}

/** "John 3" for a whole chapter, otherwise "John 3:16–18". */
export function rangeLabel(range: VerseRange): string {
  return formatRange(range, isWholeChapter(range));
}

export function overlaps(a: VerseRange, b: VerseRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export function contains(range: VerseRange, id: number): boolean {
  return id >= range.start && id <= range.end;
}

/** What is left of `a` after removing `b`: none, one or two pieces. */
export function subtractRange(a: VerseRange, b: VerseRange): VerseRange[] {
  if (!overlaps(a, b)) return [a];
  const out: VerseRange[] = [];
  if (a.start < b.start) {
    const end = previousVerseId(b.start);
    if (end !== null && end >= a.start) out.push({ start: a.start, end });
  }
  if (a.end > b.end) {
    const start = nextVerseId(b.end);
    if (start !== null && start <= a.end) out.push({ start, end: a.end });
  }
  return out;
}

export function sameBook(a: number, b: number): boolean {
  return parseVerseId(a).book === parseVerseId(b).book;
}

/** Sort key for showing items in reading order. */
export const byStart = (a: { anchors: VerseRange[] }, b: { anchors: VerseRange[] }) =>
  (a.anchors[0]?.start ?? 0) - (b.anchors[0]?.start ?? 0);
