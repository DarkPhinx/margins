import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import type { BookId } from '../bible/books';
import { makeVerseId } from '../bible/verseId';
import { versesInChapter } from '../bible/verseIndex';
import { itemsForChapter } from './store';
import type { HighlightColor, StudyItem } from './types';

export interface ChapterStudy {
  items: StudyItem[];
  /** Verse number → highlight colour. */
  highlights: Map<number, HighlightColor>;
  /** Verse number (where a note or question starts) → how many. */
  notes: Map<number, number>;
}

const EMPTY: StudyItem[] = [];

/** Live study items for one chapter, updated whenever anything is saved. */
export function useChapterStudy(book: BookId, chapter: number): ChapterStudy {
  const items = useLiveQuery(() => itemsForChapter(book, chapter), [book, chapter]) ?? EMPTY;
  return useMemo(() => {
    const highlights = new Map<number, HighlightColor>();
    const notes = new Map<number, number>();
    const first = makeVerseId(book, chapter, 1);
    const last = makeVerseId(book, chapter, versesInChapter(book, chapter));
    for (const item of items) {
      for (const a of item.anchors) {
        if (item.kind === 'highlight') {
          for (let id = Math.max(a.start, first); id <= Math.min(a.end, last); id++) highlights.set(id % 1000, item.color);
        } else if (item.kind !== 'journal') {
          // The marker sits on the first verse of the range shown in this chapter.
          const at = Math.max(a.start, first);
          if (at <= last) notes.set(at % 1000, (notes.get(at % 1000) ?? 0) + 1);
        }
      }
    }
    return { items, highlights, notes };
  }, [items, book, chapter]);
}
