import { bookByNumber, bookInfo, bookNumber, type BookId } from './books';
import type { VerseId, VerseRange } from './types';

export interface VerseParts {
  book: BookId;
  chapter: number;
  verse: number;
}

export function makeVerseId(book: BookId, chapter: number, verse: number): VerseId {
  return bookNumber(book) * 1_000_000 + chapter * 1_000 + verse;
}

export function parseVerseId(id: VerseId): VerseParts {
  return {
    book: bookByNumber(Math.floor(id / 1_000_000)).id,
    chapter: Math.floor(id / 1_000) % 1_000,
    verse: id % 1_000,
  };
}

export function formatVerseId(id: VerseId): string {
  const { book, chapter, verse } = parseVerseId(id);
  return `${bookInfo(book).name} ${chapter}:${verse}`;
}

export function inRange(id: VerseId, range: VerseRange): boolean {
  return id >= range.start && id <= range.end;
}
