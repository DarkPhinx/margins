import type { ChapterDoc } from './types';

/**
 * Plain text of each verse in a chapter, without footnotes; whitespace
 * collapsed. Omitted verses are left out. Word links (Phase 4) give positions
 * in exactly this text, so the build and the app must both use this function.
 */
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

/**
 * Where each character of the chapter's verse text lands in verseTexts():
 * "block:inline" → per character, its position in that verse's plain text,
 * or -1 for whitespace collapsed away. Lets the reader draw word highlights.
 */
export function textPositions(doc: ChapterDoc): Map<string, number[]> {
  const out = new Map<string, number[]>();
  /** Per verse: characters so far, and whether the last one was a space (or none yet). */
  const state = new Map<number, { n: number; space: boolean }>();
  let current = 0;
  const place = (verse: number, ch: string): number => {
    const s = state.get(verse) ?? { n: 0, space: true };
    state.set(verse, s);
    const ws = /\s/.test(ch);
    if (ws && s.space) return -1;
    s.space = ws;
    return s.n++;
  };
  doc.blocks.forEach((block, b) => {
    if (block.type !== 'para' && block.type !== 'descriptive') return;
    block.inline.forEach((item, i) => {
      if (item.type === 'verse') current = item.n;
      else if (item.type === 'text' && current) out.set(`${b}:${i}`, item.text.split('').map((ch) => place(current, ch)));
    });
    if (current) place(current, ' ');
  });
  // Spaces at the end of a verse aren't in its text either (it's trimmed).
  const verseOf = new Map<string, number>();
  current = 0;
  doc.blocks.forEach((block, b) => {
    if (block.type !== 'para' && block.type !== 'descriptive') return;
    block.inline.forEach((item, i) => {
      if (item.type === 'verse') current = item.n;
      else if (item.type === 'text' && current) verseOf.set(`${b}:${i}`, current);
    });
  });
  for (const [key, list] of out) {
    const s = state.get(verseOf.get(key)!)!;
    const length = s.space ? s.n - 1 : s.n;
    for (let k = 0; k < list.length; k++) if (list[k]! >= length) list[k] = -1;
  }
  return out;
}
