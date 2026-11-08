/**
 * Original-language word data (Phase 4), from STEPBible (CC BY) and the BSB
 * translation tables (public domain). Loaded per book or per shard and cached
 * by the service worker as it is used.
 */

import versionJson from '../generated/words-version.json';
import { BOOKS, type BookId } from '../bible/books';
import { parseVerseId } from '../bible/verseId';
import type { TranslationId, VerseId } from '../bible/types';

export const WORDS_CREDIT = 'Hebrew and Greek words, grammar and lexicons from STEP Bible (STEPBible.org, CC BY).';

/** [extended Strong's, word, transliteration, gloss in this verse, grammar code] */
export type OrigWord = [string, string, string, string, string];

export interface LexEntry {
  /** Lemma (dictionary form). */
  l: string;
  t: string;
  /** Part of speech, e.g. "H:N-F". */
  m: string;
  /** Short gloss. */
  g: string;
  /** Range of meanings, limited markup: <b>, <i>, <br>. */
  d: string;
}

export interface Occurrences {
  /** Verses the word appears in. */
  v: VerseId[];
  /** Times it appears. */
  n: number;
}

/** [start, end, index of the original word] in the verse's plain text. */
export type WordLink = [number, number, number];

const VERSION = (versionJson as { version: string }).version;

const cache = new Map<string, Promise<unknown>>();
function load<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}words/${path}?v=${VERSION}`).then((r) => {
      if (!r.ok) throw new Error(`Word data couldn’t load (${r.status})`);
      return r.json() as Promise<T>;
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

const verseKey = (id: VerseId) => String(id % 1_000_000);

export function isHebrew(strong: string): boolean {
  return strong.startsWith('H');
}

/** "H7225G" → "H72", the shard its lexicon entry and occurrences live in. */
export function shardOf(strong: string): string {
  const m = /^([HG])0*(\d+)/.exec(strong);
  return m ? `${m[1]}${m[2]!.padStart(4, '0').slice(0, 2)}` : strong.slice(0, 3);
}

/** A verse's original words, in order. */
export async function originalWords(id: VerseId): Promise<OrigWord[]> {
  const { book } = parseVerseId(id);
  const data = await load<Record<string, OrigWord[]>>(`orig/${book}.json`);
  return data[verseKey(id)] ?? [];
}

/** Links from a translation's English words to the original words (BSB and KJV). */
export async function wordLinks(translation: TranslationId, id: VerseId): Promise<WordLink[]> {
  const t = translation === 'kjv' ? 'kjv' : 'bsb';
  const { book } = parseVerseId(id);
  const data = await load<Record<string, WordLink[]>>(`links/${t}/${book}.json`);
  return data[verseKey(id)] ?? [];
}

export async function lexiconEntry(strong: string): Promise<LexEntry | null> {
  const data = await load<Record<string, LexEntry>>(`lex/${shardOf(strong)}.json`);
  return data[strong] ?? null;
}

export async function occurrences(strong: string): Promise<Occurrences> {
  const data = await load<Record<string, Occurrences>>(`occ/${shardOf(strong)}.json`);
  return data[strong] ?? { v: [], n: 0 };
}

/** [Strong's, lemma, transliteration, gloss, times it appears], most frequent first. */
export type LemmaRow = [string, string, string, string, number];

export function lemmaIndex(): Promise<LemmaRow[]> {
  return load<LemmaRow[]>('index/lemmas.json');
}

/** English word → [Strong's, times the BSB translates it with that word]. */
export function englishIndex(): Promise<Record<string, [string, number][]>> {
  return load<Record<string, [string, number][]>>('index/english.json');
}

/** Verses per book for a word, in canonical order. */
export function countByBook(verses: VerseId[]): Map<BookId, number> {
  const out = new Map<BookId, number>();
  for (const id of verses) {
    const book = BOOKS[Math.floor(id / 1_000_000) - 1]!.id;
    out.set(book, (out.get(book) ?? 0) + 1);
  }
  return out;
}

/**
 * Where a selected word sits in its verse's plain text: the nth occurrence of
 * the selected text. Matches the text the links were built from.
 */
export function offsetOf(verseText: string, selected: string, occurrence: number): number | null {
  const needle = selected.replace(/\s+/g, ' ').trim();
  if (!needle) return null;
  let from = 0;
  for (let n = 0; n <= occurrence; n++) {
    const at = verseText.indexOf(needle, from);
    if (at < 0) return null;
    if (n === occurrence) return at;
    from = at + 1;
  }
  return null;
}

/** The link covering a position in the verse text (or the first one overlapping a span). */
export function linkAt(links: WordLink[], start: number, end = start + 1): WordLink | null {
  return links.find((l) => l[0] < end && start < l[1]) ?? null;
}
