/**
 * The shared verse address list: every verse any translation has. Each
 * translation lists the addresses it lacks.
 */

import indexData from '../generated/verse-index.json';
import { BOOKS, type BookId } from './books';
import { makeVerseId, parseVerseId } from './verseId';
import type { TranslationId, VerseIndexData, VerseId } from './types';

const data = indexData as VerseIndexData;
const absentSets = new Map<TranslationId, Set<VerseId>>(
  Object.entries(data.absent).map(([t, ids]) => [t as TranslationId, new Set(ids)]),
);

export function chapterCount(book: BookId): number {
  return data.maxVerse[book]?.length ?? 0;
}

export function versesInChapter(book: BookId, chapter: number): number {
  return data.maxVerse[book]?.[chapter - 1] ?? 0;
}

export function isValidVerse(id: VerseId): boolean {
  try {
    const { book, chapter, verse } = parseVerseId(id);
    return verse >= 1 && verse <= versesInChapter(book, chapter);
  } catch {
    return false;
  }
}

export function hasVerse(translation: TranslationId, id: VerseId): boolean {
  return isValidVerse(id) && !absentSets.get(translation)?.has(id);
}

/** Verses in a book, counted for the given translations; uses the smallest count. */
export function bookVerseCount(book: BookId, translations: TranslationId[] = ['bsb', 'kjv']): number {
  const all = (data.maxVerse[book] ?? []).reduce((a, b) => a + b, 0);
  const counts = translations.map((t) => {
    const absent = [...(absentSets.get(t) ?? [])].filter((id) => parseVerseId(id).book === book);
    return all - absent.length;
  });
  return Math.min(...counts);
}

/**
 * The closest verse the translation has, preferring the next one in the same
 * chapter, then the previous one.
 */
export function nearestVerse(translation: TranslationId, id: VerseId): VerseId {
  if (hasVerse(translation, id)) return id;
  const { book, chapter, verse } = parseVerseId(id);
  const max = versesInChapter(book, chapter);
  for (let d = 1; d <= max; d++) {
    const after = makeVerseId(book, chapter, verse + d);
    if (verse + d <= max && hasVerse(translation, after)) return after;
    const before = makeVerseId(book, chapter, verse - d);
    if (verse - d >= 1 && hasVerse(translation, before)) return before;
  }
  return makeVerseId(book, chapter, 1);
}

export function firstBook(): BookId {
  return BOOKS[0].id;
}
