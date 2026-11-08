/**
 * Cross-reference sources: OpenBible.info (CC BY, with votes) and the
 * Treasury of Scripture Knowledge (public domain, CrossWire SWORD module).
 */

import { inflateSync } from 'node:zlib';
import { BOOKS, type BookId } from '../../src/bible/books';
import { makeVerseId } from '../../src/bible/verseId';

export type MaxVerses = Record<string, number[]>;

export interface Pair {
  from: number;
  start: number;
  end: number;
}

function valid(max: MaxVerses, book: BookId | undefined, chapter: number, verse: number): book is BookId {
  const chapters = book ? max[book] : undefined;
  return !!chapters && chapter >= 1 && chapter <= chapters.length && verse >= 1 && verse <= (chapters[chapter - 1] ?? 0);
}

// ───────── OpenBible: "Gen.1.1<TAB>Prov.8.22-Prov.8.30<TAB>78"

const OSIS: Record<string, BookId> = {
  Gen: 'GEN', Exod: 'EXO', Lev: 'LEV', Num: 'NUM', Deut: 'DEU', Josh: 'JOS', Judg: 'JDG', Ruth: 'RUT',
  '1Sam': '1SA', '2Sam': '2SA', '1Kgs': '1KI', '2Kgs': '2KI', '1Chr': '1CH', '2Chr': '2CH', Ezra: 'EZR',
  Neh: 'NEH', Esth: 'EST', Job: 'JOB', Ps: 'PSA', Prov: 'PRO', Eccl: 'ECC', Song: 'SNG', Isa: 'ISA',
  Jer: 'JER', Lam: 'LAM', Ezek: 'EZK', Dan: 'DAN', Hos: 'HOS', Joel: 'JOL', Amos: 'AMO', Obad: 'OBA',
  Jonah: 'JON', Mic: 'MIC', Nah: 'NAM', Hab: 'HAB', Zeph: 'ZEP', Hag: 'HAG', Zech: 'ZEC', Mal: 'MAL',
  Matt: 'MAT', Mark: 'MRK', Luke: 'LUK', John: 'JHN', Acts: 'ACT', Rom: 'ROM', '1Cor': '1CO', '2Cor': '2CO',
  Gal: 'GAL', Eph: 'EPH', Phil: 'PHP', Col: 'COL', '1Thess': '1TH', '2Thess': '2TH', '1Tim': '1TI',
  '2Tim': '2TI', Titus: 'TIT', Phlm: 'PHM', Heb: 'HEB', Jas: 'JAS', '1Pet': '1PE', '2Pet': '2PE',
  '1John': '1JN', '2John': '2JN', '3John': '3JN', Jude: 'JUD', Rev: 'REV',
};

function osisRef(s: string): { book: BookId | undefined; chapter: number; verse: number } {
  const [b, c, v] = s.split('.');
  return { book: OSIS[b ?? ''], chapter: Number(c), verse: Number(v) };
}

export interface OpenBibleResult {
  /** Key "from>start" → end and votes. */
  pairs: Map<string, { from: number; start: number; end: number; votes: number }>;
  lines: number;
  invalid: string[];
}

export function parseOpenBible(text: string, max: MaxVerses): OpenBibleResult {
  const pairs: OpenBibleResult['pairs'] = new Map();
  const invalid: string[] = [];
  let lines = 0;
  for (const line of text.split('\n').slice(1)) {
    if (!line.trim()) continue;
    lines++;
    const [fromS, toS, votesS] = line.split('\t');
    const [t1S, t2S] = (toS ?? '').split('-');
    const f = osisRef(fromS ?? '');
    const t1 = osisRef(t1S ?? '');
    const t2 = t2S ? osisRef(t2S) : t1;
    // A range ending past a chapter's last verse (e.g. 3 John 15 in some versifications) ends at its last verse.
    if (t2.book && max[t2.book]?.[t2.chapter - 1] !== undefined) {
      t2.verse = Math.min(t2.verse, max[t2.book]![t2.chapter - 1]!);
    }
    if (!valid(max, f.book, f.chapter, f.verse) || !valid(max, t1.book, t1.chapter, t1.verse) || !valid(max, t2.book, t2.chapter, t2.verse)) {
      invalid.push(line);
      continue;
    }
    const from = makeVerseId(f.book, f.chapter, f.verse);
    const start = makeVerseId(t1.book, t1.chapter, t1.verse);
    const end = makeVerseId(t2.book, t2.chapter, t2.verse);
    if (end < start) {
      invalid.push(line);
      continue;
    }
    // A range running into the next book (a letter's closing greeting and the next one's opening) becomes one range per book.
    const pieces: [number, number][] = [];
    const firstBook = BOOKS.findIndex((b) => b.id === t1.book);
    const lastBook = BOOKS.findIndex((b) => b.id === t2.book);
    for (let bi = firstBook; bi <= lastBook; bi++) {
      const id = BOOKS[bi]!.id;
      const chapters = max[id]!;
      const s = bi === firstBook ? start : makeVerseId(id, 1, 1);
      const e = bi === lastBook ? end : makeVerseId(id, chapters.length, chapters[chapters.length - 1]!);
      pieces.push([s, e]);
    }
    for (const [s, e] of pieces) {
      // A verse pointing only at itself is noise; one pointing at its whole chapter is not.
      if (from === s && e === s) continue;
      pairs.set(`${from}>${s}`, { from, start: s, end: e, votes: Number(votesS) });
    }
  }
  return { pairs, lines, invalid };
}

// ───────── TSK: SWORD zCom module, ThML text with <scripRef>…</scripRef>

const TSK_BOOKS: Record<string, BookId> = {
  Ge: 'GEN', Ex: 'EXO', Le: 'LEV', Nu: 'NUM', De: 'DEU', Jos: 'JOS', Jud: 'JDG', Jg: 'JDG', Ru: 'RUT',
  '1Sa': '1SA', '2Sa': '2SA', '1Ki': '1KI', '2Ki': '2KI', '1Ch': '1CH', '2Ch': '2CH', Ezr: 'EZR', Ne: 'NEH',
  Es: 'EST', Job: 'JOB', Ps: 'PSA', Pr: 'PRO', Ec: 'ECC', So: 'SNG', Song: 'SNG', Isa: 'ISA', Jer: 'JER',
  La: 'LAM', Eze: 'EZK', Da: 'DAN', Ho: 'HOS', Joe: 'JOL', Am: 'AMO', Ob: 'OBA', Jon: 'JON', Mic: 'MIC',
  Na: 'NAM', Hab: 'HAB', Zep: 'ZEP', Hag: 'HAG', Zec: 'ZEC', Mal: 'MAL', Mt: 'MAT', Mr: 'MRK', Lu: 'LUK',
  Joh: 'JHN', Ac: 'ACT', Ro: 'ROM', '1Co': '1CO', '2Co': '2CO', Ga: 'GAL', Eph: 'EPH', Php: 'PHP',
  Col: 'COL', '1Th': '1TH', '2Th': '2TH', '1Ti': '1TI', '2Ti': '2TI', Tit: 'TIT', Phm: 'PHM', Heb: 'HEB',
  Jas: 'JAS', '1Pe': '1PE', '2Pe': '2PE', '1Jo': '1JN', '2Jo': '2JN', '3Jo': '3JN', Jude: 'JUD', Re: 'REV',
};

export interface TskParse {
  refs: { start: number; end: number }[];
  skipped: string[];
}

/**
 * Parses one TSK reference list, e.g. "Job 26:7,8,13; 37:11; Ps 104:2-4; 10,12".
 * A book carries over to the next item; a bare number list means the current
 * chapter; "c:v" changes chapter; "v-c:v" spans chapters. Editorial notes
 * ("*marg:", "*Heb:") are skipped, never guessed at.
 */
export function parseTskRefs(text: string, sourceBook: BookId, sourceChapter: number, max: MaxVerses): TskParse {
  const refs: TskParse['refs'] = [];
  const skipped: string[] = [];
  let book: BookId = sourceBook;
  let chapter: number | null = sourceChapter;
  for (const raw of text.split(';')) {
    const token = raw.trim();
    if (!token) continue;
    if (token.startsWith('*')) {
      skipped.push(token);
      continue;
    }
    let rest = token;
    const named = /^((?:[123])?[A-Z][a-z]+)\s+(.*)$/.exec(token);
    if (named) {
      const b = TSK_BOOKS[named[1]!];
      if (!b) {
        skipped.push(token);
        continue;
      }
      book = b;
      chapter = null;
      rest = named[2]!;
    }
    if (max[book]?.length === 1) chapter = 1;
    for (const partRaw of rest.split(',')) {
      const part = partRaw.trim();
      // "c:v", "c:v-v", "c:v-c:v", "v", "v-v", "v-c:v"
      const m = /^(?:(\d+):)?(\d+)(?:\s*-\s*(?:(\d+):)?(\d+))?$/.exec(part);
      if (!m) {
        skipped.push(`${token} [${part}]`);
        continue;
      }
      if (m[1]) chapter = Number(m[1]);
      if (chapter === null) {
        skipped.push(`${token} [${part}]`);
        continue;
      }
      const startVerse = Number(m[2]);
      const endChapter = m[3] ? Number(m[3]) : chapter;
      const endVerse = m[4] ? Number(m[4]) : startVerse;
      if (!valid(max, book, chapter, startVerse) || !valid(max, book, endChapter, endVerse)) {
        skipped.push(`${token} [${part}]`);
        continue;
      }
      const start = makeVerseId(book, chapter, startVerse);
      const end = makeVerseId(book, endChapter, endVerse);
      if (end < start) {
        skipped.push(`${token} [${part}]`);
        continue;
      }
      refs.push({ start, end });
      chapter = endChapter;
    }
  }
  return { refs, skipped };
}

interface ZComTestament {
  count: number;
  entry(i: number): string;
}

/** Reads a SWORD zCom testament: .bzv (entry → block, offset, size), .bzs (block → offset, size), .bzz (zlib blocks). */
export function readZCom(bzv: Uint8Array, bzs: Uint8Array, bzz: Uint8Array): ZComTestament {
  const v = Buffer.from(bzv);
  const s = Buffer.from(bzs);
  const z = Buffer.from(bzz);
  const blocks = new Map<number, Buffer>();
  const block = (n: number) => {
    let b = blocks.get(n);
    if (!b) {
      const off = s.readUInt32LE(n * 12);
      const size = s.readUInt32LE(n * 12 + 4);
      b = inflateSync(z.subarray(off, off + size));
      blocks.set(n, b);
    }
    return b;
  };
  return {
    count: v.length / 10,
    entry(i) {
      const b = v.readUInt32LE(i * 10);
      const off = v.readUInt32LE(i * 10 + 4);
      const size = v.readUInt16LE(i * 10 + 8);
      return size ? block(b).subarray(off, off + size).toString('utf8') : '';
    },
  };
}

export interface TskResult {
  /** Key "from>start" → end, in the TSK's own order per verse. */
  pairs: Map<string, Pair>;
  versesWithRefs: number;
  skipped: string[];
}

/**
 * Walks the module in KJV order. Entry 0 is the module header, 1 the
 * testament intro; each book has an intro entry and each chapter an intro
 * entry before its verses.
 */
export function parseTsk(ot: ZComTestament, nt: ZComTestament, max: MaxVerses): TskResult {
  const pairs: TskResult['pairs'] = new Map();
  const skipped: string[] = [];
  let versesWithRefs = 0;
  for (const [t, books] of [
    [ot, BOOKS.slice(0, 39)],
    [nt, BOOKS.slice(39)],
  ] as const) {
    let i = 2;
    for (const b of books) {
      i++; // book intro
      (max[b.id] ?? []).forEach((verses, ci) => {
        i++; // chapter intro
        for (let verse = 1; verse <= verses; verse++) {
          const raw = t.entry(i++);
          const from = makeVerseId(b.id, ci + 1, verse);
          // <scripRef passage="…"> marks the chapter summary's verse numbers, not cross-references.
          const lists = [...raw.matchAll(/<scripRef>([^<]*)<\/scripRef>/g)].map((m) => m[1]!);
          if (lists.length) versesWithRefs++;
          for (const list of lists) {
            const parsed = parseTskRefs(list, b.id, ci + 1, max);
            skipped.push(...parsed.skipped);
            for (const r of parsed.refs) {
              if (r.start === from && r.end === from) continue;
              const key = `${from}>${r.start}`;
              if (!pairs.has(key)) pairs.set(key, { from, start: r.start, end: r.end });
            }
          }
        }
      });
    }
    if (i !== t.count) throw new Error(`TSK layout mismatch: walked ${i} entries of ${t.count}`);
  }
  return { pairs, versesWithRefs, skipped };
}

/** One cross-reference as stored: [start, end, votes]; votes -1 means TSK only (no votes). */
export type StoredRef = [number, number, number];

/**
 * Merges both sources per verse and ranks them: voted references by votes,
 * then the rest (zero votes, and TSK-only) in their source order.
 * Down-voted references are left out.
 */
export function mergeAndRank(ob: OpenBibleResult['pairs'], tsk: TskResult['pairs']): Map<number, StoredRef[]> {
  const byVerse = new Map<number, { ref: StoredRef; order: number }[]>();
  let order = 0;
  const add = (from: number, ref: StoredRef) => {
    let list = byVerse.get(from);
    if (!list) byVerse.set(from, (list = []));
    list.push({ ref, order: order++ });
  };
  for (const p of ob.values()) if (p.votes >= 0) add(p.from, [p.start, p.end, p.votes]);
  for (const [key, p] of tsk) if (!ob.has(key)) add(p.from, [p.start, p.end, -1]);
  const out = new Map<number, StoredRef[]>();
  for (const [from, list] of byVerse) {
    list.sort((a, b) => {
      const va = a.ref[2] > 0 ? a.ref[2] : 0;
      const vb = b.ref[2] > 0 ? b.ref[2] : 0;
      return vb - va || a.order - b.order;
    });
    out.set(
      from,
      list.map((x) => x.ref),
    );
  }
  return out;
}
