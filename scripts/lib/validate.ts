import { BOOKS, type BookId } from '../../src/bible/books';
import { OMITTED_SET, OMITTED_VERSES } from '../../src/bible/manuscripts';
import { makeVerseId } from '../../src/bible/verseId';
import type { ChapterDoc, TranslationId } from '../../src/bible/types';

export interface ParsedTranslation {
  id: TranslationId;
  sources: Map<BookId, string>;
  chapters: Map<BookId, ChapterDoc[]>;
  spans: Map<BookId, number>;
}

/** Locked totals. A source update that changes any of these must be reviewed. */
export const EXPECTED = {
  books: 66,
  chapters: 1189,
  bsb: { verses: 31086, redLetterSpans: 1420 },
  kjv: { verses: 31102, redLetterSpans: 2038 },
} as const;

/** Independent of the parser: reduces raw USFM to its words. */
export function plainTextOfSource(source: string): string {
  return source
    .replace(/^\uFEFF/, '')
    .replace(/^\\(id|usfm|h|toc[123]|mt[12])\b.*$/gm, '')
    .replace(/\\f \+.*?\\f\*/gs, '')
    .replace(/\\c \d+/g, '')
    .replace(/\\v \d+/g, '')
    .replace(/\|[^\\]*(?=\\)/g, '')
    .replace(/\\\+?[a-z]+\d*\*?/g, '')
    .replace(/\s+/g, '');
}

/**
 * Word list of raw USFM. Opening markers separate words and closing markers do
 * not, which catches words run together ("7:53through") or split apart.
 */
export function wordsOfSource(source: string): string[] {
  return source
    .replace(/^\uFEFF/, '')
    .replace(/^\\(id|usfm|h|toc[123]|mt[12])\b.*$/gm, '')
    .replace(/\\f \+.*?\\f\*/gs, '')
    .replace(/\\c \d+/g, ' ')
    .replace(/\\v \d+/g, ' ')
    .replace(/\|[^\\]*(?=\\)/g, '')
    .replace(/\\\+?[a-z]+\d*\*/g, '')
    // Character markers sit inside running text; their following space is syntax.
    .replace(/\\\+?(wj|add|nd|w|ref|tl) ?/g, '')
    .replace(/\\\+?[a-z]+\d*/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function textOfChapters(chapters: ChapterDoc[], verseSeparator: string): string {
  const parts: string[] = [];
  for (const chapter of chapters) {
    for (const block of chapter.blocks) {
      let text = '';
      if ('inline' in block) {
        for (const item of block.inline) {
          if (item.type === 'text') text += item.text;
          else if (item.type === 'verse') text += verseSeparator;
        }
      } else if (block.type === 'division') {
        text = `${block.text} ${block.subtitle ?? ''}`;
      } else if (block.type === 'parallelRefs') {
        text = block.text;
      }
      parts.push(text);
    }
  }
  return parts.join(' ');
}

function plainTextOfChapters(chapters: ChapterDoc[]): string {
  return textOfChapters(chapters, '').replace(/\s+/g, '');
}

function wordsOfChapters(chapters: ChapterDoc[]): string[] {
  // Verse markers are word boundaries in the source too.
  return textOfChapters(chapters, ' ').split(/\s+/).filter(Boolean);
}

function firstWordDifference(a: string[], b: string[]): string | null {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return `word ${i}: source "${a.slice(i, i + 4).join(' ')}" vs parsed "${b.slice(i, i + 4).join(' ')}"`;
  }
  return null;
}

export function validate(bsb: ParsedTranslation, kjv: ParsedTranslation): string[] {
  const errors: string[] = [];

  for (const t of [bsb, kjv]) {
    const expected = EXPECTED[t.id as 'bsb' | 'kjv'];
    if (t.chapters.size !== EXPECTED.books) errors.push(`${t.id}: ${t.chapters.size} books`);
    let chapters = 0;
    let verses = 0;
    let spans = 0;
    for (const book of BOOKS) {
      const docs = t.chapters.get(book.id);
      if (!docs) {
        errors.push(`${t.id}: missing ${book.id}`);
        continue;
      }
      if (docs.length !== book.chapters) errors.push(`${t.id} ${book.id}: ${docs.length} chapters`);
      docs.forEach((doc, i) => {
        if (doc.chapter !== i + 1) errors.push(`${t.id} ${book.id}: chapter ${doc.chapter} out of order`);
        if (!doc.verses.length) errors.push(`${t.id} ${book.id} ${doc.chapter}: no verses`);
      });
      chapters += docs.length;
      verses += docs.reduce((n, d) => n + d.verses.length, 0);
      spans += t.spans.get(book.id) ?? 0;

      const source = t.sources.get(book.id) ?? '';
      const sourceSpans = (source.match(/\\wj\s/g) ?? []).length;
      if (sourceSpans !== (t.spans.get(book.id) ?? 0)) {
        errors.push(`${t.id} ${book.id}: red-letter spans ${t.spans.get(book.id)} != source ${sourceSpans}`);
      }
      if (plainTextOfSource(source) !== plainTextOfChapters(docs)) {
        errors.push(`${t.id} ${book.id}: parsed text differs from source`);
      }
      const wordDiff = firstWordDifference(wordsOfSource(source), wordsOfChapters(docs));
      if (wordDiff) errors.push(`${t.id} ${book.id}: ${wordDiff}`);
    }
    if (chapters !== EXPECTED.chapters) errors.push(`${t.id}: ${chapters} chapters`);
    if (verses !== expected.verses) errors.push(`${t.id}: ${verses} verses, expected ${expected.verses}`);
    if (spans !== expected.redLetterSpans) {
      errors.push(`${t.id}: ${spans} red-letter spans, expected ${expected.redLetterSpans}`);
    }
  }

  // The BSB must be exactly the KJV's verses minus the curated omitted list.
  const found: number[] = [];
  for (const book of BOOKS) {
    const b = bsb.chapters.get(book.id) ?? [];
    (kjv.chapters.get(book.id) ?? []).forEach((doc, i) => {
      const have = new Set(b[i]?.verses);
      for (const v of doc.verses) if (!have.has(v)) found.push(makeVerseId(book.id, doc.chapter, v));
      const shared = new Set(doc.verses);
      for (const v of b[i]?.verses ?? []) {
        if (!shared.has(v)) errors.push(`${book.id} ${doc.chapter}:${v} is in the BSB but not the KJV`);
      }
    });
  }
  const extra = found.filter((id) => !OMITTED_SET.has(id));
  if (extra.length) errors.push(`Verses absent from the BSB but not curated: ${extra.join(', ')}`);
  if (found.length !== OMITTED_VERSES.length) {
    errors.push(`Omitted verses: found ${found.length}, curated ${OMITTED_VERSES.length}`);
  }
  return errors;
}
