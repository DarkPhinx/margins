import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeVerseId } from '../src/bible/verseId';
import { isValidVerse } from '../src/bible/verseIndex';
import indexData from '../src/generated/verse-index.json';
import { mergeAndRank, parseOpenBible, parseTskRefs } from '../scripts/lib/xrefs';
import { crossReferences } from '../src/xrefs/xrefs';
import { diskFetch } from './helpers';

const v = makeVerseId;
const max = (indexData as { maxVerse: Record<string, number[]> }).maxVerse;

describe('TSK reference lists', () => {
  const refs = (text: string, book: 'GEN' | 'JHN' | 'JUD' = 'GEN', chapter = 1) =>
    parseTskRefs(text, book, chapter, max).refs.map((r) => [r.start, r.end]);

  it('carries the book over and reads verse lists and ranges', () => {
    expect(refs('Job 26:7,8; 37:11; Ps 104:2-4')).toEqual([
      [v('JOB', 26, 7), v('JOB', 26, 7)],
      [v('JOB', 26, 8), v('JOB', 26, 8)],
      [v('JOB', 37, 11), v('JOB', 37, 11)],
      [v('PSA', 104, 2), v('PSA', 104, 4)],
    ]);
  });

  it('reads a bare number list as the current chapter, and "c:v" as the current book', () => {
    expect(refs('10,12; 8:22')).toEqual([
      [v('GEN', 1, 10), v('GEN', 1, 10)],
      [v('GEN', 1, 12), v('GEN', 1, 12)],
      [v('GEN', 8, 22), v('GEN', 8, 22)],
    ]);
  });

  it('reads ranges across chapters and chapter changes inside a list', () => {
    expect(refs('Isa 36:1-39:8')).toEqual([[v('ISA', 36, 1), v('ISA', 39, 8)]]);
    expect(refs('Le 2:11, 21:6')).toEqual([
      [v('LEV', 2, 11), v('LEV', 2, 11)],
      [v('LEV', 21, 6), v('LEV', 21, 6)],
    ]);
  });

  it('reads a number after a one-chapter book as a verse', () => {
    expect(refs('Jude 3,4')).toEqual([
      [v('JUD', 1, 3), v('JUD', 1, 3)],
      [v('JUD', 1, 4), v('JUD', 1, 4)],
    ]);
  });

  it('skips editorial notes and references that don’t exist, never guessing', () => {
    const r = parseTskRefs('*marg:; Ge 99:1; Joh 3:16', 'GEN', 1, max);
    expect(r.refs).toEqual([{ start: v('JHN', 3, 16), end: v('JHN', 3, 16) }]);
    expect(r.skipped).toHaveLength(2);
  });
});

describe('OpenBible lines', () => {
  const head = 'From Verse\tTo Verse\tVotes\n';

  it('reads verses, ranges and votes', () => {
    const { pairs, invalid } = parseOpenBible(`${head}Gen.1.1\tProv.8.22-Prov.8.30\t78\nGen.1.1\tRev.4.11\t209\n`, max);
    expect(invalid).toEqual([]);
    expect([...pairs.values()]).toEqual([
      { from: v('GEN', 1, 1), start: v('PRO', 8, 22), end: v('PRO', 8, 30), votes: 78 },
      { from: v('GEN', 1, 1), start: v('REV', 4, 11), end: v('REV', 4, 11), votes: 209 },
    ]);
  });

  it('splits a range running into the next book, and ends a range at the last verse there is', () => {
    const { pairs } = parseOpenBible(`${head}Rom.1.7\tEph.6.23-Phil.1.2\t3\n1Pet.5.1\t2John.1.1-3John.1.15\t8\n`, max);
    expect([...pairs.values()].map((p) => [p.start, p.end])).toEqual([
      [v('EPH', 6, 23), v('EPH', 6, 24)],
      [v('PHP', 1, 1), v('PHP', 1, 2)],
      [v('2JN', 1, 1), v('2JN', 1, 13)],
      [v('3JN', 1, 1), v('3JN', 1, 14)],
    ]);
  });

  it('rejects a reference from a verse not in the address list', () => {
    expect(parseOpenBible(`${head}3John.1.15\tJohn.10.3\t2\n`, max).invalid).toHaveLength(1);
  });
});

describe('merging and ranking', () => {
  it('ranks by votes, leaves out down-voted ones, then TSK-only in order', () => {
    const from = v('JHN', 3, 16);
    const ob = new Map([
      [`${from}>1`, { from, start: v('ROM', 5, 8), end: v('ROM', 5, 8), votes: 900 }],
      [`${from}>2`, { from, start: v('1JN', 4, 9), end: v('1JN', 4, 9), votes: 700 }],
      [`${from}>3`, { from, start: v('GEN', 1, 1), end: v('GEN', 1, 1), votes: -3 }],
      [`${from}>4`, { from, start: v('EPH', 2, 4), end: v('EPH', 2, 4), votes: 0 }],
    ]);
    const tsk = new Map([
      [`${from}>9`, { from, start: v('LUK', 2, 14), end: v('LUK', 2, 14) }],
      [`${from}>1`, { from, start: v('ROM', 5, 8), end: v('ROM', 5, 8) }],
    ]);
    expect(mergeAndRank(ob, tsk).get(from)).toEqual([
      [v('ROM', 5, 8), v('ROM', 5, 8), 900],
      [v('1JN', 4, 9), v('1JN', 4, 9), 700],
      [v('EPH', 2, 4), v('EPH', 2, 4), 0],
      [v('LUK', 2, 14), v('LUK', 2, 14), -1],
    ]);
  });
});

describe('the generated cross-references', () => {
  const dir = join(__dirname, '..', 'public', 'xrefs');

  it('has a file per book, and every reference is a real verse range in one book', () => {
    const files = readdirSync(dir);
    expect(files).toHaveLength(66);
    let total = 0;
    for (const f of files) {
      const data = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<string, [number, number, number][]>;
      for (const [key, refs] of Object.entries(data)) {
        for (const [start, end, votes] of refs) {
          total++;
          if (!isValidVerse(start) || !isValidVerse(end) || end < start || Math.floor(start / 1e6) !== Math.floor(end / 1e6) || votes < -1) {
            throw new Error(`${f} ${key}: bad reference ${start}-${end} (${votes})`);
          }
        }
      }
    }
    expect(total).toBeGreaterThan(390_000);
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(diskFetch));
  });

  it('ranks Romans 5:8 first for John 3:16, and shows the TSK’s own references too', async () => {
    const refs = await crossReferences({ start: v('JHN', 3, 16), end: v('JHN', 3, 16) });
    expect(refs[0]).toEqual({ range: { start: v('ROM', 5, 8), end: v('ROM', 5, 8) }, votes: expect.any(Number) });
    expect(refs[1]!.range.start).toBe(v('1JN', 4, 9));
    const votes = refs.filter((r) => r.votes !== null).map((r) => r.votes!);
    expect(votes).toEqual([...votes].sort((a, b) => b - a));
    expect(refs.some((r) => r.votes === null)).toBe(true);
    expect(refs.findIndex((r) => r.votes === null)).toBeGreaterThan(refs.findLastIndex((r) => (r.votes ?? 0) > 0));
  });

  it('merges a passage: shared targets count once with votes added, and the passage itself is left out', async () => {
    const one = await crossReferences({ start: v('JHN', 3, 16), end: v('JHN', 3, 16) });
    const two = await crossReferences({ start: v('JHN', 3, 16), end: v('JHN', 3, 17) });
    const keys = two.map((r) => `${r.range.start}-${r.range.end}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(two.some((r) => r.range.start >= v('JHN', 3, 16) && r.range.end <= v('JHN', 3, 17))).toBe(false);
    const rom = (list: typeof one) => list.find((r) => r.range.start === v('ROM', 5, 8))!.votes!;
    expect(rom(two)).toBeGreaterThanOrEqual(rom(one));
    // John 3:15 is a cross-reference of 3:16, so it stays (it's outside 3:16–17).
    expect(two.some((r) => r.range.start === v('JHN', 3, 15))).toBe(true);
  });

  it('includes well-known references', async () => {
    const gen = await crossReferences({ start: v('GEN', 1, 1), end: v('GEN', 1, 1) });
    expect(gen.some((r) => r.range.start === v('JHN', 1, 1))).toBe(true);
    const ps = await crossReferences({ start: v('PSA', 23, 1), end: v('PSA', 23, 1) });
    expect(ps.some((r) => r.range.start === v('JHN', 10, 11))).toBe(true);
  });
});
