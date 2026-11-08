import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import type { BookId } from '../bible/books';
import { makeVerseId } from '../bible/verseId';
import { versesInChapter } from '../bible/verseIndex';
import { itemsForChapter } from './store';
import type { HighlightColor, StudyItem } from './types';

export interface ChapterStudy {
  items: StudyItem[];
  /** Verse number → highlight colour, for whole verses. */
  highlights: Map<number, HighlightColor>;
  /** Verse number → highlighted words: character positions in its plain text (end may be past the end). */
  segments: Map<number, VerseSegment[]>;
  /** Verse number (where a note or question starts) → how many. */
  notes: Map<number, number>;
}

export interface VerseSegment {
  translation: string;
  start: number;
  end: number;
  color: HighlightColor;
}

const EMPTY: StudyItem[] = [];

/** Live study items for one chapter, updated whenever anything is saved. */
export function useChapterStudy(book: BookId, chapter: number): ChapterStudy {
  const items = useLiveQuery(() => itemsForChapter(book, chapter), [book, chapter]) ?? EMPTY;
  return useMemo(() => {
    const highlights = new Map<number, HighlightColor>();
    const segments = new Map<number, VerseSegment[]>();
    const notes = new Map<number, number>();
    const first = makeVerseId(book, chapter, 1);
    const last = makeVerseId(book, chapter, versesInChapter(book, chapter));
    for (const item of items) {
      for (const a of item.anchors) {
        if (item.kind === 'highlight' && item.segment) {
          const { translation, start, end } = item.segment;
          for (let id = Math.max(a.start, first); id <= Math.min(a.end, last); id++) {
            const list = segments.get(id % 1000) ?? [];
            list.push({ translation, start: id === a.start ? start : 0, end: id === a.end ? end : Infinity, color: item.color });
            segments.set(id % 1000, list);
          }
        } else if (item.kind === 'highlight') {
          for (let id = Math.max(a.start, first); id <= Math.min(a.end, last); id++) highlights.set(id % 1000, item.color);
        } else if (item.kind === 'note' || item.kind === 'question') {
          // The marker sits on the first verse of the range shown in this chapter.
          const at = Math.max(a.start, first);
          if (at <= last) notes.set(at % 1000, (notes.get(at % 1000) ?? 0) + 1);
        }
      }
    }
    return { items, highlights, segments, notes };
  }, [items, book, chapter]);
}
