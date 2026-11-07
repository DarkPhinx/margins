/**
 * Curated manuscript decisions. The BSB and KJV sources do not mark these
 * passages themselves, so the app holds this short list. The wording shown to
 * readers always comes from the sources: the pipeline fails if it cannot find it.
 */

import { makeVerseId } from './verseId';
import type { VariantPassage, VerseId } from './types';

/** Verses in the KJV that the BSB keeps only in footnotes. */
export const OMITTED_VERSES: readonly VerseId[] = [
  makeVerseId('MAT', 17, 21),
  makeVerseId('MAT', 18, 11),
  makeVerseId('MAT', 23, 14),
  makeVerseId('MRK', 7, 16),
  makeVerseId('MRK', 9, 44),
  makeVerseId('MRK', 9, 46),
  makeVerseId('MRK', 11, 26),
  makeVerseId('MRK', 15, 28),
  makeVerseId('LUK', 17, 36),
  makeVerseId('LUK', 23, 17),
  makeVerseId('JHN', 5, 4),
  makeVerseId('ACT', 8, 37),
  makeVerseId('ACT', 15, 34),
  makeVerseId('ACT', 24, 7),
  makeVerseId('ACT', 28, 29),
  makeVerseId('ROM', 16, 24),
];

export const OMITTED_SET: ReadonlySet<VerseId> = new Set(OMITTED_VERSES);

export const OMITTED_EXPLANATION = 'This verse isn’t found in the earliest manuscripts.';

export const VARIANT_PASSAGES: readonly VariantPassage[] = [
  {
    range: { start: makeVerseId('MRK', 16, 9), end: makeVerseId('MRK', 16, 20) },
    appliesTo: ['bsb', 'kjv'],
    bracketed: true,
    noteId: 'variant-mark-16',
  },
  {
    range: { start: makeVerseId('JHN', 7, 53), end: makeVerseId('JHN', 8, 11) },
    appliesTo: ['bsb', 'kjv'],
    bracketed: true,
    noteId: 'variant-john-7',
  },
];

/** Where the BSB prints the footnote for each variant passage. */
export const VARIANT_NOTE_SOURCES: Readonly<Record<string, VerseId>> = {
  'variant-mark-16': makeVerseId('MRK', 16, 8),
  'variant-john-7': makeVerseId('JHN', 7, 52),
};
