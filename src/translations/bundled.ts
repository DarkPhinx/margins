import type { BookId } from '../bible/books';
import { versesInChapter } from '../bible/verseIndex';
import { makeVerseId, parseVerseId } from '../bible/verseId';
import type { BookFile, PageRef, TranslationMeta, TranslationProvider, VerseId } from '../bible/types';

export type BookLoader = (translation: string, book: BookId) => Promise<BookFile>;

/** Loads /bibles/<translation>/<book>.json; the service worker serves it offline. */
export const fetchBook: BookLoader = async (translation, book) => {
  const res = await fetch(`${import.meta.env.BASE_URL}bibles/${translation}/${book}.json`);
  if (!res.ok) throw new Error(`Could not load ${book} (${res.status})`);
  return (await res.json()) as BookFile;
};

export function chapterPage(id: VerseId): PageRef {
  const { book, chapter } = parseVerseId(id);
  return {
    range: { start: makeVerseId(book, chapter, 1), end: makeVerseId(book, chapter, versesInChapter(book, chapter)) },
    index: 0,
    total: 1,
  };
}

/** Bundled translations show one whole chapter per page. */
export function createBundledProvider(meta: TranslationMeta, load: BookLoader = fetchBook): TranslationProvider {
  const books = new Map<BookId, Promise<BookFile>>();
  const getBook = (book: BookId): Promise<BookFile> => {
    let p = books.get(book);
    if (!p) {
      p = load(meta.id, book);
      p.catch(() => books.delete(book));
      books.set(book, p);
    }
    return p;
  };

  return {
    meta,
    pageFor: chapterPage,
    async read(page) {
      const { book, chapter } = parseVerseId(page.range.start);
      const file = await getBook(book);
      const doc = file.chapters[chapter - 1];
      if (!doc) throw new Error(`${meta.abbreviation} has no ${book} ${chapter}`);
      return { status: 'ok', doc, page };
    },
  };
}
