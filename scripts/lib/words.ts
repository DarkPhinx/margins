/**
 * Original-language word data (Phase 4).
 *
 * - STEPBible TAHOT / TAGNT (CC BY): every Hebrew and Greek word, with
 *   extended Strong's number, transliteration, gloss in context and grammar.
 * - STEPBible TBESH / TBESG (CC BY): brief lexicons.
 * - BSB translation tables (public domain): which English words of the BSB
 *   translate which original word.
 * - The KJV source (public domain): a Strong's number on each word.
 */

import { BOOKS, type BookId } from '../../src/bible/books';
import { findReferences } from '../../src/bible/refParser';
import { makeVerseId } from '../../src/bible/verseId';

export type MaxVerses = Record<string, number[]>;

/** One original-language word: [extended Strong's, word, transliteration, gloss in context, grammar code]. */
export type OrigWord = [string, string, string, string, string];

const STEP_BOOKS: Record<string, BookId> = {
  Gen: 'GEN', Exo: 'EXO', Lev: 'LEV', Num: 'NUM', Deu: 'DEU', Jos: 'JOS', Jdg: 'JDG', Rut: 'RUT', '1Sa': '1SA',
  '2Sa': '2SA', '1Ki': '1KI', '2Ki': '2KI', '1Ch': '1CH', '2Ch': '2CH', Ezr: 'EZR', Neh: 'NEH', Est: 'EST',
  Job: 'JOB', Psa: 'PSA', Pro: 'PRO', Ecc: 'ECC', Sng: 'SNG', Isa: 'ISA', Jer: 'JER', Lam: 'LAM', Ezk: 'EZK',
  Dan: 'DAN', Hos: 'HOS', Jol: 'JOL', Amo: 'AMO', Oba: 'OBA', Jon: 'JON', Mic: 'MIC', Nam: 'NAM', Hab: 'HAB',
  Zep: 'ZEP', Hag: 'HAG', Zec: 'ZEC', Mal: 'MAL', Mat: 'MAT', Mrk: 'MRK', Luk: 'LUK', Jhn: 'JHN', Act: 'ACT',
  Rom: 'ROM', '1Co': '1CO', '2Co': '2CO', Gal: 'GAL', Eph: 'EPH', Php: 'PHP', Col: 'COL', '1Th': '1TH',
  '2Th': '2TH', '1Ti': '1TI', '2Ti': '2TI', Tit: 'TIT', Phm: 'PHM', Heb: 'HEB', Jas: 'JAS', '1Pe': '1PE',
  '2Pe': '2PE', '1Jn': '1JN', '2Jn': '2JN', '3Jn': '3JN', Jud: 'JUD', Rev: 'REV',
};

/** "Gen.1.1#01=L", "Act.2.11[2.10]#01=NKO", "Psa.3.0(3.1)#01=L": English numbering first. */
const REF = /^([1-3]?[A-Za-z]{2,3})\.(\d+)\.(\d+)(?:\([^)]*\)|\[[^\]]*\]|\{[^}]*\})*#(\d+)=(\S*)/;

/** "H0430G" → "H0430"; "G25" → "G0025". */
export function baseStrong(s: string): string {
  const m = /^([HG])0*(\d+)/.exec(s);
  return m ? `${m[1]}${m[2]!.padStart(4, '0')}` : s;
}

/** Shard of the lexicon/occurrence files a Strong's number lives in: "H7225G" → "H72". */
export function shardOf(dStrong: string): string {
  const b = baseStrong(dStrong);
  return b.slice(0, 3);
}

export interface OrigResult {
  /** Verse id → its words in original order. */
  verses: Map<number, OrigWord[]>;
  /** Verse id → per word, other Strong's numbers the sources give for it (e.g. ἦν: G2258 beside G1510). Used only to line up English. */
  alts: Map<number, string[][]>;
  words: number;
  skippedRefs: string[];
}

/** A gloss without STEP's verse markers ("[13] Greet", "{14.26} only") or closing punctuation ("kiss."). */
function glossOf(s: string): string {
  return clean(s.replace(/^\s*(?:\[[\d.]+\]|\{[\d.]+\}|\([\d.]+\))\s*/, '')).replace(/[.,;:¶]+$/, '');
}

/** Drops STEPBible's internal separators: "/" between word parts, "\" before punctuation such as ׃. */
function clean(s: string): string {
  return s.replace(/[/\\]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Reads TAHOT or TAGNT text. Keeps the reading text: for Hebrew the Leningrad
 * text and Qere readings (not bare Ketiv); for Greek words in the main
 * editions (N: Nestle-Aland, K: the KJV's Textus Receptus). Psalm titles,
 * numbered verse 0 in this data, belong to verse 1 as in the BSB.
 */
export interface TaggedOptions {
  /** Verse id (BSB numbering) → the base Strong's numbers the BSB's tables have in it. */
  bsb?: Map<number, Set<string>>;
}

/**
 * A STEP line that gives a second verse number: for Greek the KJV's, in
 * square brackets; for Hebrew the Hebrew Bible's, in round brackets.
 */
function numberedTwice(line: string): { key: string; book: BookId; hebrew: boolean; main: [number, number]; alt: [number, number]; strong: string } | null {
  const m = /^([1-3]?[A-Za-z]{2,3})\.(\d+)\.(\d+)([^#\t]*)#\d+=(\S*)/.exec(line);
  const book = m ? STEP_BOOKS[m[1]!] : undefined;
  // Psalm titles (verse 0) and restored text (R, e.g. Neh 7:68) keep the English number.
  if (!m || !book || m[3] === '0' || m[5] === 'R') return null;
  const hebrew = BOOKS.findIndex((b) => b.id === book) < 39;
  const alt = (hebrew ? /\((\d+)\.(\d+)\)/ : /\[(\d+)\.(\d+)\]/).exec(m[4]!);
  if (!alt) return null;
  const cols = line.split('\t');
  const strong = hebrew ? ((cols[4] ?? '').match(/\{([^}]+)\}/)?.[1] ?? '') : (cols[3] ?? '').split('=')[0]!.trim();
  return {
    key: `${book}.${m[2]}.${m[3]}>${alt[1]}.${alt[2]}`,
    book,
    hebrew,
    main: [Number(m[2]), Number(m[3])],
    alt: [Number(alt[1]), Number(alt[2])],
    strong: baseStrong(strong),
  };
}

/**
 * STEP numbers verses as the NRSV does and gives the other number where
 * they differ. Our Bibles mostly follow the KJV's (2 Cor 13:14, 3 John 14,
 * 1 Kgs 18:34) but modern verse divisions in places (Phil 1:16–17, the end
 * of Acts 3:19). So for each run of words given two numbers, use the verse
 * whose BSB words match them best. With no telling: the KJV's number for
 * Greek, the English number for Hebrew (as in every Psalm title).
 */
function chooseVerses(lines: string[], max: MaxVerses, bsb: Map<number, Set<string>> | undefined): Map<string, [number, number]> {
  const groups = new Map<string, NonNullable<ReturnType<typeof numberedTwice>> & { strongs: string[] }>();
  for (const line of lines) {
    const g = numberedTwice(line);
    if (!g) continue;
    let group = groups.get(g.key);
    if (!group) groups.set(g.key, (group = { ...g, strongs: [] }));
    group.strongs.push(g.strong);
  }
  const exists = (book: BookId, [c, v]: [number, number]) => !!max[book] && c <= max[book]!.length && v <= (max[book]![c - 1] ?? 0);
  const score = (book: BookId, [c, v]: [number, number], strongs: string[]) => {
    const have = bsb?.get(makeVerseId(book, c, v));
    return have ? strongs.filter((s) => have.has(s)).length / strongs.length : -1;
  };
  const out = new Map<string, [number, number]>();
  for (const [key, g] of groups) {
    if (!exists(g.book, g.alt)) out.set(key, g.main);
    else if (!exists(g.book, g.main)) out.set(key, g.alt);
    else {
      const main = score(g.book, g.main, g.strongs);
      const alt = score(g.book, g.alt, g.strongs);
      out.set(key, alt > main || (alt === main && !g.hebrew) ? g.alt : g.main);
    }
  }
  return out;
}

/**
 * The Textus Receptus ends most epistles with a note on where the letter was
 * written ("πρὸς Κορινθίους δευτέρα ἐγράφη ἀπὸ Φιλίππων…"). It's not verse
 * text, so it's left out: a run of TR-only words that ends its book, starting
 * with πρός and containing ἐγράφη.
 */
function subscriptionLines(lines: string[]): Set<number> {
  const out = new Set<number>();
  const isRef = (l: string) => /^[1-3]?[A-Z][a-z]{1,2}\.\d+\.\d+/.test(l);
  const trOnly = (l: string) => /^[^\t]*#\d+=K\t/.test(l);
  for (let i = 0; i < lines.length; i++) {
    if (!trOnly(lines[i]!) || !/^G4314\b/.test(lines[i]!.split('\t')[3] ?? '')) continue;
    let j = i;
    while (j < lines.length && (trOnly(lines[j]!) || !isRef(lines[j]!))) j++;
    const run = lines.slice(i, j).filter(isRef);
    const endsBook = j === lines.length || lines[j]!.slice(0, 4) !== lines[i]!.slice(0, 4);
    if (endsBook && run.some((l) => /^G1125\b/.test(l.split('\t')[3] ?? ''))) for (let k = i; k < j; k++) out.add(k);
  }
  return out;
}

export function parseTagged(text: string, max: MaxVerses, into: OrigResult, options: TaggedOptions = {}): void {
  const lines = text.split('\n');
  const numbered = chooseVerses(lines, max, options.bsb);
  const subscriptions = subscriptionLines(lines);
  for (const [n, line] of lines.entries()) {
    if (!/^[1-3]?[A-Z][a-z]{1,2}\.\d+\.\d+/.test(line) || subscriptions.has(n)) continue;
    const m = REF.exec(line);
    if (!m) {
      into.skippedRefs.push(line.slice(0, 40));
      continue;
    }
    const book = STEP_BOOKS[m[1]!];
    const type = m[5]!;
    const cols = line.split('\t');
    const hebrew = book ? BOOKS.findIndex((b) => b.id === book) < 39 : false;
    if (!book) {
      into.skippedRefs.push(line.slice(0, 40));
      continue;
    }
    // R: verses missing from the Leningrad codex that STEP restores (Jos 21:36–37 from 1 Chr 6, Neh 7:67b).
    if (hebrew ? !/[LQR]/.test(type) : !/[NK]/.test(type)) continue;
    const exists = (c: number, v: number) => !!max[book] && c <= max[book]!.length && v <= (max[book]![c - 1] ?? 0);
    let chapter = Number(m[2]);
    let verse = Math.max(1, Number(m[3]));
    const chosen = numbered.get(numberedTwice(line)?.key ?? '');
    if (chosen) [chapter, verse] = chosen;
    if (!exists(chapter, verse)) {
      // "3Jn.1.15[1.14]": a verse our Bibles don't have; use the alternative number given in brackets.
      const alt = /^[^#]*?[[(](\d+)\.(\d+)[\])]/.exec(line);
      if (alt && exists(Number(alt[1]), Number(alt[2]))) {
        chapter = Number(alt[1]);
        verse = Number(alt[2]);
      } else {
        into.skippedRefs.push(line.slice(0, 40));
        continue;
      }
    }
    let word: OrigWord;
    if (hebrew) {
      // Hebrew  Transliteration  Translation  dStrongs  Grammar
      const parts = (cols[4] ?? '').split(/[/\\]/);
      const main = (cols[4] ?? '').match(/\{([^}]+)\}/)?.[1] ?? parts.filter((p) => !/^H90\d\d/.test(p)).pop() ?? parts[0] ?? '';
      // A section mark after the word (setumah ס, petuchah פ) isn't part of it; a word's own last ס is.
      const surface = clean(cols[1] ?? '').replace(/(?:\s+|(?<=׃))[ספ]$/, '');
      word = [main, surface.normalize('NFC'), clean((cols[2] ?? '').replace(/\./g, '')).toLowerCase(), glossOf(cols[3] ?? ''), (cols[5] ?? '').trim()];
    } else {
      // Greek (translit)  English  dStrong=Grammar
      const gm = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(cols[1] ?? '');
      const [strong, grammar] = (cols[3] ?? '').split('=');
      // Punctuation attached to a Greek word ("κόσμον,") is left out; elision marks (δ’) stay.
      // Paragraph marks (¶) and the raised dot (· or ·) go too.
      const surface = (gm?.[1] ?? cols[1] ?? '').trim().replace(/[.,;:!?()[\]··¶]+/g, '');
      // The gloss without a verse marker ("[13] Greet") or closing punctuation ("kiss.").
      const gloss = glossOf(cols[2] ?? '');
      word = [(strong ?? '').trim(), surface.normalize('NFC'), (gm?.[2] ?? '').trim(), gloss, (grammar ?? '').trim()];
    }
    const id = makeVerseId(book, chapter, verse);
    let list = into.verses.get(id);
    if (!list) into.verses.set(id, (list = []));
    let altList = into.alts.get(id);
    if (!altList) into.alts.set(id, (altList = []));
    // TAHOT: root and alternative Strong's (cols 8, 9); TAGNT: sStrong and alt Strong's (cols 11, 12).
    const altText = hebrew ? `${cols[8] ?? ''} ${cols[9] ?? ''}` : `${cols[11] ?? ''} ${cols[12] ?? ''}`;
    const alts = [...new Set((altText.match(/[HG]\d+/g) ?? []).map(baseStrong))];
    // A Psalm title (verse 0) comes before verse 1's words.
    if (Number(m[3]) === 0) {
      const titleCount = list.filter((w) => (w as unknown as { title?: boolean }).title).length;
      list.splice(titleCount, 0, word);
      altList.splice(titleCount, 0, alts);
      Object.defineProperty(word, 'title', { value: true, enumerable: false });
    } else {
      list.push(word);
      altList.push(alts);
    }
    into.words++;
  }
}

export interface LexEntry {
  /** Lemma (dictionary form). */
  l: string;
  /** Transliteration. */
  t: string;
  /** Part of speech, e.g. "H:N-F", "G:V". */
  m: string;
  /** Short gloss. */
  g: string;
  /** Range of meanings: limited markup (<b>, <i>, <br>); verse references as plain text. */
  d: string;
}

const STEP_REF_BOOK = /\b([1-3]?[A-Z][a-z]{1,2})\.(\d)/g;

/** Turns STEP lexicon HTML into the small markup the app renders. */
export function cleanDefinition(html: string): string {
  return html
    .replace(/<ref='[^']*'>(.*?)<\/ref>/g, '$1')
    .replace(/<ref='[^']*'>/g, '')
    .replace(/<\/ref>/g, '')
    .replace(STEP_REF_BOOK, '$1 $2')
    .replace(/<br\s*\/?>/gi, '<br>')
    .replace(/<(\/?)(b|i)>/gi, '<$1$2>')
    .replace(/<(?!\/?(b|i|br)>)[^>]*>/gi, '')
    .replace(/__/g, '')
    .replace(/\s+/g, ' ')
    .replace(/(\s*<br>\s*)+/g, '<br>')
    .replace(/^<br>|<br>$/g, '')
    .trim();
}

export interface LexResult {
  entries: Map<string, LexEntry>;
  /** Plain Strong's → the first extended form, e.g. H7225 → H7225G. */
  base: Map<string, string>;
  /** A form numbered on its own in classic Strong's → its dictionary word, e.g. G2258 (ἦν) → G1510 (εἰμί). */
  formOf: Map<string, string>;
}

export function parseLexicon(text: string, into: LexResult): void {
  for (const line of text.split('\n')) {
    if (!/^[HG]\d+[a-zA-Z]?\t/.test(line)) continue;
    const c = line.split('\t');
    const key = (c[1] ?? '').trim().split(/\s/)[0] ?? '';
    if (!/^[HG]\d+[A-Za-z]?$/.test(key)) continue;
    if (!into.entries.has(key)) {
      into.entries.set(key, {
        l: (c[3] ?? '').trim().normalize('NFC'),
        // Syllable dots ("a.hav") are left out of the transliteration shown.
        t: (c[4] ?? '').trim().replace(/\./g, ''),
        m: (c[5] ?? '').trim(),
        g: (c[6] ?? '').trim(),
        d: cleanDefinition(c[7] ?? ''),
      });
    }
    const b = baseStrong(key);
    if (!into.base.has(b)) into.base.set(b, key);
    if (/a Form of/i.test(c[1] ?? '') && c[2]) into.formOf.set(b, baseStrong(c[2].trim()));
  }
}

// ───────── Linking English words to original words

export interface Phrase {
  text: string;
  /** Plain Strong's, e.g. "G0025". */
  strong: string;
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;

function tokens(s: string): { word: string; start: number; end: number }[] {
  return [...s.matchAll(WORD)].map((m) => ({ word: m[0].toLowerCase().replace(/’/g, "'"), start: m.index!, end: m.index! + m[0].length }));
}

/** A link: [start, end) in the verse text → index of the original word. */
export type WordLink = [number, number, number];

/**
 * Lines the English phrases (in order) up with the verse text and ties each to
 * an original word with the same Strong's number. Phrases that can't be found
 * a short way ahead are skipped, never forced.
 */
export function alignVerse(
  verseText: string,
  phrases: Phrase[],
  orig: OrigWord[],
  alts: string[][] = [],
  formOf: ReadonlyMap<string, string> = new Map(),
): { links: WordLink[]; missed: number } {
  // A word matches by its own number, an alternative the source gives, or a "form of" mapping from the lexicon.
  const matches = (i: number, strong: string) => {
    const own = baseStrong(orig[i]![0]);
    return own === strong || (alts[i] ?? []).includes(strong) || formOf.get(strong) === own;
  };
  const toks = tokens(verseText);
  const used = new Set<number>();
  const links: WordLink[] = [];
  let cursor = 0;
  let missed = 0;
  for (const phrase of phrases) {
    const p = tokens(phrase.text);
    if (!p.length) continue;
    let found = -1;
    for (let i = cursor; i <= Math.min(toks.length - p.length, cursor + 12); i++) {
      if (p.every((t, k) => toks[i + k]!.word === t.word)) {
        found = i;
        break;
      }
    }
    // Word order differs between English and the original; look back a little too.
    if (found < 0) {
      for (let i = Math.max(0, cursor - 6); i < cursor; i++) {
        if (i + p.length <= toks.length && p.every((t, k) => toks[i + k]!.word === t.word)) {
          found = i;
          break;
        }
      }
    }
    if (found < 0) {
      missed++;
      continue;
    }
    let index = orig.findIndex((_, i) => !used.has(i) && matches(i, phrase.strong));
    if (index < 0) index = orig.findIndex((_, i) => matches(i, phrase.strong));
    if (index < 0) {
      missed++;
      continue;
    }
    used.add(index);
    links.push([toks[found]!.start, toks[found + p.length - 1]!.end, index]);
    cursor = Math.max(cursor, found + p.length);
  }
  return { links, missed };
}

/** BSB tables: per verse, the English phrases in English order with their Strong's numbers. */
export function parseBsbTables(text: string): Map<number, Phrase[]> {
  const out = new Map<number, Phrase[]>();
  let current: number | null = null;
  for (const line of text.split('\n').slice(1)) {
    if (!line) continue;
    const c = line.split('\t');
    if (c[12]) {
      const ref = findReferences(c[12].trim())[0];
      current = ref ? ref.range.start : null;
    }
    if (current === null) continue;
    const english = (c[18] ?? '').trim();
    if (!english || /^-+$/.test(english) || /vvv/.test(english)) continue;
    const lang = c[4] === 'Greek' ? 'G' : 'H';
    const num = (lang === 'G' ? c[11] : c[10])?.trim();
    if (!num || !/^\d+$/.test(num)) continue;
    let list = out.get(current);
    if (!list) out.set(current, (list = []));
    list.push({ text: english.replace(/[[\]]/g, ''), strong: baseStrong(`${lang}${num}`) });
  }
  return out;
}

/** KJV USFM: per verse, each \w word with its Strong's number, in order. */
export function kjvPhrases(usfm: string, book: BookId): Map<number, Phrase[]> {
  const out = new Map<number, Phrase[]>();
  let chapter = 0;
  let verse = 0;
  const re = /\\c\s+(\d+)|\\v\s+(\d+)|\\\+?w\s+([^|\\]*)\|strong="([HG]\d+)"\\\+?w\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(usfm))) {
    if (m[1]) {
      chapter = Number(m[1]);
      verse = 0;
    } else if (m[2]) {
      verse = Number(m[2]);
    } else if (chapter && verse) {
      const id = makeVerseId(book, chapter, verse);
      let list = out.get(id);
      if (!list) out.set(id, (list = []));
      list.push({ text: m[3]!.trim(), strong: baseStrong(m[4]!) });
    }
  }
  return out;
}
