import type { BookId } from '../bible/books';
import type { Block, ChapterDoc, Inline } from '../bible/types';

/** Turns the edge function's plain passage text ([n] verse numbers, blank-line paragraphs) into a chapter document. */
export function esvTextToDoc(text: string, book: BookId, chapter: number): ChapterDoc {
  const verses: number[] = [];
  const blocks: Block[] = [];
  for (const para of text.split(/\n\s*\n/)) {
    const inline: Inline[] = [];
    for (const part of para.replace(/\s+/g, ' ').trim().split(/(\[\d+\])/)) {
      const m = /^\[(\d+)\]$/.exec(part);
      if (m) {
        const n = Number(m[1]);
        verses.push(n);
        inline.push({ type: 'verse', n });
      } else if (part.trim()) {
        inline.push({ type: 'text', text: part.trim() + ' ' });
      }
    }
    const last = inline[inline.length - 1];
    if (last?.type === 'text') last.text = last.text.trimEnd();
    if (inline.length) blocks.push({ type: 'para', style: 'p', inline });
  }
  return { translation: 'esv', book, chapter, verses, blocks, notes: [] };
}
