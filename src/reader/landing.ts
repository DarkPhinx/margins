import { hasVerse, nearestVerse } from '../bible/verseIndex';
import { formatVerseId, makeVerseId, parseVerseId } from '../bible/verseId';
import type { ChapterDoc, TranslationMeta } from '../bible/types';

export interface Landing {
  /** The verse number to scroll to. */
  verse: number;
  /** Shown when the requested verse is printed differently in this translation. */
  notice: string | null;
}

/** Where a requested verse lands in a displayed chapter. */
export function findLanding(doc: ChapterDoc, verse: number, meta: TranslationMeta): Landing {
  const id = makeVerseId(doc.book, doc.chapter, verse);
  const abbr = meta.abbreviation;
  const isMarker = doc.blocks.some((b) => 'inline' in b && b.inline.some((i) => i.type === 'omitted' && i.n === verse));
  if (isMarker) {
    return {
      verse,
      notice: `${formatVerseId(id)} isn’t in the ${abbr}’s main text. Its faded number shows where it belongs; tap it to read the verse.`,
    };
  }
  if (doc.verses.includes(verse) && hasVerse(meta.id, id)) return { verse, notice: null };
  const near = parseVerseId(nearestVerse(meta.id, id)).verse;
  return {
    verse: near,
    notice: near === verse ? null : `${formatVerseId(id)} isn’t in the ${abbr}, so this is the nearest verse.`,
  };
}

/** Briefly highlights a verse the reader jumped to. */
export function flashVerse(el: Element | null): () => void {
  if (!el) return () => {};
  el.classList.add('verse-target');
  const timer = window.setTimeout(() => el.classList.remove('verse-target'), 2400);
  return () => window.clearTimeout(timer);
}
