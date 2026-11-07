/** Plain verse text for reference previews and the passage view. */

import { nextVerseId, previousVerseId } from '../bible/verseIndex';
import { makeVerseId, parseVerseId } from '../bible/verseId';
import type { ChapterDoc, TranslationId, VerseId, VerseRange } from '../bible/types';
import { getProvider } from '../translations/registry';

export interface PassageVerse {
  id: VerseId;
  chapter: number;
  verse: number;
  text: string;
  inRange: boolean;
}

/** Text of each verse in a chapter, without footnotes. Omitted verses are left out. */
export function verseTexts(doc: ChapterDoc): Map<number, string> {
  const out = new Map<number, string>();
  let current = 0;
  for (const block of doc.blocks) {
    if (block.type !== 'para' && block.type !== 'descriptive') continue;
    for (const item of block.inline) {
      if (item.type === 'verse') {
        current = item.n;
        out.set(current, out.get(current) ?? '');
      } else if (item.type === 'text' && current) {
        out.set(current, (out.get(current) ?? '') + item.text);
      }
    }
    if (current) out.set(current, `${out.get(current) ?? ''} `);
  }
  for (const [k, v] of out) out.set(k, v.replace(/\s+/g, ' ').trim());
  return out;
}

async function chapterDoc(translation: TranslationId, book: ChapterDoc['book'], chapter: number): Promise<ChapterDoc> {
  const provider = getProvider(translation);
  // Previews always use a bundled translation so they work offline and stay within any display limits.
  const source = provider.meta.source === 'bundled' ? provider : getProvider('bsb');
  const result = await source.read(source.pageFor(makeVerseId(book, chapter, 1)));
  return result.doc;
}

/** The verses of a range, with up to `context` verses either side (same book). */
export async function loadPassage(translation: TranslationId, range: VerseRange, context = 0): Promise<PassageVerse[]> {
  let start = range.start;
  let end = range.end;
  for (let i = 0; i < context; i++) {
    start = previousVerseId(start) ?? start;
    end = nextVerseId(end) ?? end;
  }
  const s = parseVerseId(start);
  const e = parseVerseId(end);
  const out: PassageVerse[] = [];
  for (let c = s.chapter; c <= e.chapter; c++) {
    const texts = verseTexts(await chapterDoc(translation, s.book, c));
    for (const [verse, text] of texts) {
      const id = makeVerseId(s.book, c, verse);
      if (id < start || id > end) continue;
      out.push({ id, chapter: c, verse, text, inRange: id >= range.start && id <= range.end });
    }
  }
  return out;
}

/** A short preview: the referenced verses (or a chapter's first verse), cut with an ellipsis. */
export async function previewText(
  translation: TranslationId,
  range: VerseRange,
  chapterOnly: boolean,
  max = 280,
): Promise<string> {
  const target = chapterOnly ? { start: range.start, end: range.start } : range;
  const verses = await loadPassage(translation, target);
  const text = verses.map((v) => (verses.length > 1 ? `${v.verse} ${v.text}` : v.text)).join(' ');
  const more = chapterOnly && range.end !== range.start;
  if (text.length <= max) return more ? `${text} …` : text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}
