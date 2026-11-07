/**
 * Crossway display rule: never more than 500 consecutive ESV verses, or half a
 * book, on one page. Half a book rounds down and uses the smaller verse count
 * of the bundled translations (the BSB's, where it omits verses).
 */

import { MAX_VERSES_PER_QUERY } from '../../shared/esv-limits';
import type { BookId } from '../bible/books';
import { bookVerseCount, versesInChapter } from '../bible/verseIndex';
import { makeVerseId, parseVerseId } from '../bible/verseId';
import type { PageRef, VerseId, VerseRange } from '../bible/types';

export const BOOK_FRACTION = 0.5;

export function bookVerseLimit(book: BookId, fraction = BOOK_FRACTION): number {
  return Math.floor(bookVerseCount(book) * fraction);
}

export function maxVersesPerPage(book: BookId): number {
  return Math.min(MAX_VERSES_PER_QUERY, bookVerseLimit(book));
}

/** Every address in a range, chapter by chapter. Counts generously, which is the safe side. */
export function versesOf(range: VerseRange): VerseId[] {
  const out: VerseId[] = [];
  const start = parseVerseId(range.start);
  const end = parseVerseId(range.end);
  if (start.book !== end.book) throw new RangeError('ESV passages stay within one book');
  for (let c = start.chapter; c <= end.chapter; c++) {
    const first = c === start.chapter ? start.verse : 1;
    const last = c === end.chapter ? Math.min(end.verse, versesInChapter(start.book, c)) : versesInChapter(start.book, c);
    for (let v = first; v <= last; v++) out.push(makeVerseId(start.book, c, v));
  }
  return out;
}

/** Splits a chapter into the fewest even pages that fit the limit. */
export function esvPageFor(id: VerseId): PageRef {
  const { book, chapter, verse } = parseVerseId(id);
  const count = versesInChapter(book, chapter);
  const limit = maxVersesPerPage(book);
  const total = Math.max(1, Math.ceil(count / limit));
  const size = Math.ceil(count / total);
  const index = Math.min(total - 1, Math.floor((Math.max(verse, 1) - 1) / size));
  const first = index * size + 1;
  const last = Math.min(count, first + size - 1);
  return {
    range: { start: makeVerseId(book, chapter, first), end: makeVerseId(book, chapter, last) },
    index,
    total,
  };
}
