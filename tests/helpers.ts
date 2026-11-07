import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BookId } from '../src/bible/books';
import type { BookFile, ChapterDoc, Inline, TranslationId } from '../src/bible/types';

const root = join(__dirname, '..');

/** Reads a generated book file from public/bibles (built by npm run data). */
export function loadBook(translation: TranslationId, book: BookId): BookFile {
  return JSON.parse(readFileSync(join(root, 'public', 'bibles', translation, `${book}.json`), 'utf8')) as BookFile;
}

export function loadChapter(translation: TranslationId, book: BookId, chapter: number): ChapterDoc {
  const doc = loadBook(translation, book).chapters[chapter - 1];
  if (!doc) throw new Error(`No ${book} ${chapter}`);
  return doc;
}

export function allInline(doc: ChapterDoc): Inline[] {
  return doc.blocks.flatMap((b) => ('inline' in b ? b.inline : []));
}

/** Text of one verse, across blocks. */
export function verseText(doc: ChapterDoc, verse: number): string {
  let current = 0;
  let out = '';
  for (const block of doc.blocks) {
    if (block.type !== 'para' && block.type !== 'descriptive') continue;
    for (const item of block.inline) {
      if (item.type === 'verse') current = item.n;
      else if (item.type === 'text' && current === verse) out += item.text;
    }
    if (current === verse) out += ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** A fetch stub serving public/ from disk. */
export function diskFetch(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  const path = join(root, 'public', decodeURIComponent(new URL(url, 'http://local').pathname));
  try {
    const body = readFileSync(path, 'utf8');
    return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }));
  } catch {
    return Promise.resolve(new Response('not found', { status: 404 }));
  }
}
