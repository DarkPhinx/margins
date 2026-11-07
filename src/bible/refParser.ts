/**
 * Finds Bible references in free text: "John 3:16", "Gen. 1:1", "Gn 1:1",
 * "Jn 3:16", "1 Cor 13", "1Co 13:4-7", "Rom 8:28–9:5", "Ps 23", "Jude 3".
 */

import { BOOKS, bookInfo, type BookId } from './books';
import { chapterCount, versesInChapter } from './verseIndex';
import { makeVerseId } from './verseId';
import type { VerseRange } from './types';

export interface FoundReference {
  /** Position in the text. */
  index: number;
  length: number;
  text: string;
  range: VerseRange;
  /** "Psalm 23" with no verse: previews the first verse, opens the chapter. */
  chapterOnly: boolean;
}

/**
 * Names and abbreviations per book, beyond the full name. Abbreviations that
 * are also common English words ("Is", "Am", "Job", "Song", "Acts", "Mark")
 * are matched only when capitalised, and short ones only with a number after.
 */
const ALIASES: Record<BookId, string[]> = {
  GEN: ['Gen', 'Ge', 'Gn'],
  EXO: ['Exod', 'Exo', 'Ex'],
  LEV: ['Lev', 'Le', 'Lv'],
  NUM: ['Num', 'Nu', 'Nm', 'Nb'],
  DEU: ['Deut', 'Deu', 'Dt', 'De'],
  JOS: ['Josh', 'Jos', 'Jsh'],
  JDG: ['Judg', 'Jdg', 'Jg', 'Jdgs'],
  RUT: ['Ruth', 'Rth', 'Ru'],
  '1SA': ['1 Sam', '1 Sa', '1 Sm', '1 Samuel'],
  '2SA': ['2 Sam', '2 Sa', '2 Sm', '2 Samuel'],
  '1KI': ['1 Kgs', '1 Ki', '1 Kin', '1 Kings'],
  '2KI': ['2 Kgs', '2 Ki', '2 Kin', '2 Kings'],
  '1CH': ['1 Chr', '1 Ch', '1 Chron', '1 Chronicles'],
  '2CH': ['2 Chr', '2 Ch', '2 Chron', '2 Chronicles'],
  EZR: ['Ezra', 'Ezr'],
  NEH: ['Neh', 'Ne'],
  EST: ['Esth', 'Est', 'Es'],
  JOB: ['Job', 'Jb'],
  PSA: ['Psalm', 'Psalms', 'Pss', 'Psa', 'Psm', 'Ps'],
  PRO: ['Prov', 'Pro', 'Prv', 'Pr'],
  ECC: ['Eccl', 'Eccles', 'Ecc', 'Ec', 'Qoh'],
  SNG: ['Song of Songs', 'Song of Solomon', 'Song', 'Sos', 'So', 'Sg', 'Cant'],
  ISA: ['Isa', 'Is'],
  JER: ['Jer', 'Je', 'Jr'],
  LAM: ['Lam', 'La'],
  EZK: ['Ezek', 'Eze', 'Ezk'],
  DAN: ['Dan', 'Da', 'Dn'],
  HOS: ['Hos', 'Ho'],
  JOL: ['Joel', 'Jl'],
  AMO: ['Amos', 'Am'],
  OBA: ['Obad', 'Oba', 'Ob'],
  JON: ['Jonah', 'Jon', 'Jnh'],
  MIC: ['Mic', 'Mc'],
  NAM: ['Nah', 'Na'],
  HAB: ['Hab', 'Hb'],
  ZEP: ['Zeph', 'Zep', 'Zp'],
  HAG: ['Hag', 'Hg'],
  ZEC: ['Zech', 'Zec', 'Zc'],
  MAL: ['Mal', 'Ml'],
  MAT: ['Matt', 'Mat', 'Mt'],
  MRK: ['Mark', 'Mrk', 'Mar', 'Mk', 'Mr'],
  LUK: ['Luke', 'Luk', 'Lk'],
  JHN: ['John', 'Joh', 'Jhn', 'Jn'],
  ACT: ['Acts', 'Act', 'Ac'],
  ROM: ['Rom', 'Ro', 'Rm'],
  '1CO': ['1 Cor', '1 Co', '1 Corinthians'],
  '2CO': ['2 Cor', '2 Co', '2 Corinthians'],
  GAL: ['Gal', 'Ga'],
  EPH: ['Eph', 'Ephes'],
  PHP: ['Phil', 'Php', 'Pp'],
  COL: ['Col', 'Co'],
  '1TH': ['1 Thess', '1 Thes', '1 Th', '1 Thessalonians'],
  '2TH': ['2 Thess', '2 Thes', '2 Th', '2 Thessalonians'],
  '1TI': ['1 Tim', '1 Ti', '1 Timothy'],
  '2TI': ['2 Tim', '2 Ti', '2 Timothy'],
  TIT: ['Titus', 'Tit', 'Ti'],
  PHM: ['Philem', 'Phlm', 'Phm', 'Pm'],
  HEB: ['Heb', 'He'],
  JAS: ['Jas', 'Jm', 'Ja'],
  '1PE': ['1 Pet', '1 Pe', '1 Pt', '1 Peter'],
  '2PE': ['2 Pet', '2 Pe', '2 Pt', '2 Peter'],
  '1JN': ['1 John', '1 Jn', '1 Jhn', '1 Jo'],
  '2JN': ['2 John', '2 Jn', '2 Jhn', '2 Jo'],
  '3JN': ['3 John', '3 Jn', '3 Jhn', '3 Jo'],
  JUD: ['Jude', 'Jud', 'Jd'],
  REV: ['Rev', 'Re', 'Rv', 'Revelations', 'Revelation of John', 'Apoc'],
};

/** Ordinary words: matched only with a capital first letter. */
const CASE_SENSITIVE = new Set(['is', 'am', 'job', 'song', 'acts', 'act', 'mark', 'ruth', 'joel', 'amos', 'jonah', 'jude', 'luke', 'john', 'titus', 'so', 'he', 'me', 'ex', 'ho', 'ti', 'co', 'na', 'la', 'da', 'es', 'de', 'ge', 'le', 'nu', 'ne', 'pr', 'ob', 'ac', 'ro', 'ga', 're', 'ja', 'mr', 'mar', 'pp', 'pm']);

const ORDINAL_WORDS: Record<string, string> = {
  first: '1', second: '2', third: '3', i: '1', ii: '2', iii: '3', '1st': '1', '2nd': '2', '3rd': '3',
};

interface Alias {
  /** Lower case, single spaces, numerals for ordinals. */
  key: string;
  book: BookId;
  caseSensitive: boolean;
  original: string;
}

function buildAliases(): Alias[] {
  const out: Alias[] = [];
  for (const b of BOOKS) {
    const names = new Set<string>([b.name, ...ALIASES[b.id]]);
    for (const name of names) {
      const key = name.toLowerCase();
      out.push({ key, book: b.id, caseSensitive: CASE_SENSITIVE.has(key), original: name });
    }
  }
  // Longest first, so "1 John" wins over "John" and "Song of Songs" over "Song".
  return out.sort((a, b) => b.key.length - a.key.length);
}

const ALIAS_LIST = buildAliases();

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "1 Cor" also matches "1Cor", "1 cor.", "I Cor", "First Corinthians". */
function aliasPattern(key: string): string {
  const m = /^([123]) (.*)$/.exec(key);
  const body = (m ? m[2]! : key).split(' ').map(escape).join('\\s+');
  if (!m) return body;
  const n = m[1]!;
  const words = Object.entries(ORDINAL_WORDS)
    .filter(([, v]) => v === n)
    .map(([w]) => escape(w));
  // "1Cor" and "1 Cor", but a word ordinal needs a space: "I Cor", never "Is".
  return `(?:${n}\\s*|(?:${words.join('|')})\\s+)${body}`;
}

const BOOK_PATTERN = ALIAS_LIST.map((a) => aliasPattern(a.key)).join('|');

// Book, optional period, chapter, then optionally :verse, -verse, -chapter:verse.
const REF_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(${BOOK_PATTERN})\\.?\\s*(\\d{1,3})(?::(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3})(?::(\\d{1,3}))?)?|\\s*[-–—]\\s*(\\d{1,3})(?!\\s*:))?(?![\\p{L}\\p{N}:])`,
  'giu',
);

function normaliseBookText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^(first|second|third|iii|ii|i|1st|2nd|3rd)\s+/, (w) => `${ORDINAL_WORDS[w.trim()]} `)
    .replace(/^([123])\s*/, '$1 ')
    .trim();
}

function resolveBook(raw: string): BookId | null {
  const norm = normaliseBookText(raw);
  const alias = ALIAS_LIST.find((a) => a.key === norm);
  if (!alias) return null;
  if (alias.caseSensitive) {
    // Must start with a capital letter (or a numeral prefix): "Is 53:5", not "is 5".
    const first = raw.trim()[0] ?? '';
    if (first !== first.toUpperCase() || first === first.toLowerCase()) return null;
  }
  return alias.book;
}

function clampChapter(book: BookId, chapter: number): boolean {
  return chapter >= 1 && chapter <= chapterCount(book);
}

/** All references in the text, in order. Invalid ones ("John 30:1") are skipped. */
export function findReferences(text: string): FoundReference[] {
  const out: FoundReference[] = [];
  REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_RE.exec(text))) {
    const [whole, bookText, c1, v1, v2OrC2, v2b, c2Only] = m;
    const book = resolveBook(bookText!);
    if (!book) {
      // Try again just after the start, so "is John 3" still finds "John 3".
      REF_RE.lastIndex = m.index + 1;
      continue;
    }
    const range = toRange(book, Number(c1), v1, v2OrC2, v2b, c2Only);
    if (range) {
      out.push({ index: m.index, length: whole.length, text: whole, range: range.range, chapterOnly: range.chapterOnly });
    }
  }
  return out;
}

function toRange(
  book: BookId,
  c1: number,
  v1?: string,
  v2OrC2?: string,
  v2b?: string,
  c2Only?: string,
): { range: VerseRange; chapterOnly: boolean } | null {
  const oneChapter = bookInfo(book).chapters === 1;
  // "Jude 3" and "Obadiah 5" name a verse; a one-chapter book has no chapter 3.
  if (oneChapter && !v1) {
    const verse = c1;
    const end = c2Only ? Number(c2Only) : verse;
    if (verse < 1 || end < verse || end > versesInChapter(book, 1)) return null;
    return { range: { start: makeVerseId(book, 1, verse), end: makeVerseId(book, 1, end) }, chapterOnly: false };
  }
  if (!clampChapter(book, c1)) return null;
  if (!v1) {
    const last = c2Only ? Number(c2Only) : c1;
    if (last < c1 || !clampChapter(book, last)) return null;
    return {
      range: { start: makeVerseId(book, c1, 1), end: makeVerseId(book, last, versesInChapter(book, last)) },
      chapterOnly: true,
    };
  }
  const startVerse = Number(v1);
  if (startVerse < 1 || startVerse > versesInChapter(book, c1)) return null;
  let endChapter = c1;
  let endVerse = startVerse;
  if (v2OrC2 && v2b) {
    endChapter = Number(v2OrC2);
    endVerse = Number(v2b);
  } else if (v2OrC2) {
    endVerse = Number(v2OrC2);
  }
  if (!clampChapter(book, endChapter)) return null;
  endVerse = Math.min(endVerse, versesInChapter(book, endChapter));
  const start = makeVerseId(book, c1, startVerse);
  const end = makeVerseId(book, endChapter, endVerse);
  if (end < start) return null;
  return { range: { start, end }, chapterOnly: false };
}

/** "John 3:16", "John 3:16–18", "Romans 8:28–9:5", "Psalm 23", "Jude 3". */
export function formatRange(range: VerseRange, chapterOnly = false): string {
  const s = splitId(range.start);
  const e = splitId(range.end);
  const name = s.book === 'PSA' && (chapterOnly || s.chapter === e.chapter) ? 'Psalm' : bookInfo(s.book).name;
  const one = bookInfo(s.book).chapters === 1;
  if (chapterOnly) {
    // A one-chapter book is named on its own: "Jude", not "Jude 1".
    if (one) return bookInfo(s.book).name;
    return s.chapter === e.chapter ? `${name} ${s.chapter}` : `${bookInfo(s.book).name} ${s.chapter}–${e.chapter}`;
  }
  const head = one ? `${name} ${s.verse}` : `${name} ${s.chapter}:${s.verse}`;
  if (range.start === range.end) return head;
  if (s.chapter === e.chapter) return `${head}–${e.verse}`;
  return `${head}–${e.chapter}:${e.verse}`;
}

function splitId(id: number) {
  return { book: BOOKS[Math.floor(id / 1_000_000) - 1]!.id, chapter: Math.floor(id / 1000) % 1000, verse: id % 1000 };
}
