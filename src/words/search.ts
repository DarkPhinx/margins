import { findReferences } from '../bible/refParser';
import type { VerseRange } from '../bible/types';
import { englishIndex, lemmaIndex, type LemmaRow } from './data';

export interface WordHit {
  strong: string;
  lemma: string;
  translit: string;
  gloss: string;
  /** Times the word appears in the Bible. */
  total: number;
  /** Times the BSB translates it with the English searched for. */
  viaEnglish: number;
}

export type OriginalQuery =
  | { kind: 'verse'; range: VerseRange }
  | { kind: 'words'; hits: WordHit[] }
  | { kind: 'empty' };

/** Lower case, accents and breathing marks removed, so "agape" finds ἀγάπη's transliteration "agapē". */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[.’'ʼ·-]/g, '')
    .toLowerCase()
    .trim();
}

const STRONG = /^([HG])\s*0*(\d{1,4})([A-Za-z]?)$/i;

/**
 * One search box for everything: a verse reference opens the verse; a Strong's
 * number, an English word, a Hebrew or Greek word, or a transliteration finds
 * the original words (with how often the BSB translates them that way).
 */
export async function searchOriginal(query: string, limit = 30): Promise<OriginalQuery> {
  const q = query.trim();
  if (!q) return { kind: 'empty' };
  const ref = findReferences(q)[0];
  if (ref && ref.index === 0 && ref.length >= q.replace(/[.\s]+$/, '').length - 1) {
    return { kind: 'verse', range: ref.range };
  }

  const lemmas = await lemmaIndex();
  const byStrong = new Map<string, LemmaRow>(lemmas.map((r) => [r[0], r]));
  const hits = new Map<string, WordHit>();
  const add = (row: LemmaRow, viaEnglish = 0) => {
    const existing = hits.get(row[0]);
    if (existing) existing.viaEnglish += viaEnglish;
    else hits.set(row[0], { strong: row[0], lemma: row[1], translit: row[2], gloss: row[3], total: row[4], viaEnglish });
  };

  const strong = STRONG.exec(q.replace(/\s+/g, ''));
  if (strong) {
    const base = `${strong[1]!.toUpperCase()}${strong[2]!.padStart(4, '0')}`;
    const suffix = strong[3]!.toUpperCase();
    for (const row of lemmas) {
      if (suffix ? row[0] === base + suffix : row[0].startsWith(base) && !/\d/.test(row[0].slice(base.length))) add(row);
    }
    return { kind: 'words', hits: [...hits.values()].slice(0, limit) };
  }

  // English: what the BSB uses this word to translate.
  const english = await englishIndex();
  for (const word of q.toLowerCase().match(/[\p{L}']+/gu) ?? []) {
    for (const [s, count] of english[word] ?? []) {
      const row = byStrong.get(s);
      if (row) add(row, count);
    }
  }
  // Hebrew or Greek letters, a transliteration, or a dictionary gloss.
  const f = fold(q);
  const original = /[Ͱ-Ͽἀ-῿֐-׿]/.test(q);
  for (const row of lemmas) {
    if (hits.size >= limit * 3) break;
    const matches = original
      ? fold(row[1]) === f || fold(row[1]).startsWith(f)
      : fold(row[2]) === f || (f.length >= 3 && fold(row[2]).startsWith(f)) || new RegExp(`\\b${f.replace(/[^\p{L}]/gu, '')}\\b`, 'iu').test(row[3]);
    if (matches) add(row);
  }
  const ranked = [...hits.values()].sort((a, b) => b.viaEnglish - a.viaEnglish || b.total - a.total);
  return { kind: 'words', hits: ranked.slice(0, limit) };
}
