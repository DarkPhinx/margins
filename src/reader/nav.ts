import { BOOKS, bookInfo, bookNumber, type BookId } from '../bible/books';

export interface ChapterRef {
  book: BookId;
  chapter: number;
}

export function nextChapter({ book, chapter }: ChapterRef): ChapterRef | null {
  if (chapter < bookInfo(book).chapters) return { book, chapter: chapter + 1 };
  const next = BOOKS[bookNumber(book)];
  return next ? { book: next.id, chapter: 1 } : null;
}

export function previousChapter({ book, chapter }: ChapterRef): ChapterRef | null {
  if (chapter > 1) return { book, chapter: chapter - 1 };
  const prev = BOOKS[bookNumber(book) - 2];
  return prev ? { book: prev.id, chapter: prev.chapters } : null;
}

export function chapterTitle(book: BookId, chapter: number): string {
  const name = book === 'PSA' ? 'Psalm' : bookInfo(book).name;
  return bookInfo(book).chapters === 1 ? name : `${name} ${chapter}`;
}

export function readerPath(translation: string, book: BookId, chapter: number, verse?: number): string {
  return `/${translation}/${book}/${chapter}${verse && verse > 1 ? `?v=${verse}` : ''}`;
}
