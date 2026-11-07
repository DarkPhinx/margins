import { describe, expect, it } from 'vitest';
import { findReferences, formatRange } from '../src/bible/refParser';
import { makeVerseId } from '../src/bible/verseId';

const one = (text: string) => {
  const found = findReferences(text);
  expect(found, text).toHaveLength(1);
  return found[0]!;
};
const id = makeVerseId;

describe('finding references', () => {
  it.each([
    ['John 3:16', id('JHN', 3, 16), id('JHN', 3, 16)],
    ['Jn 3:16', id('JHN', 3, 16), id('JHN', 3, 16)],
    ['jn 3:16', id('JHN', 3, 16), id('JHN', 3, 16)],
    ['Gen 1:1', id('GEN', 1, 1), id('GEN', 1, 1)],
    ['Gen. 1:1', id('GEN', 1, 1), id('GEN', 1, 1)],
    ['Gn 1:1', id('GEN', 1, 1), id('GEN', 1, 1)],
    ['1Co 13:4-7', id('1CO', 13, 4), id('1CO', 13, 7)],
    ['1 Cor 13:4–7', id('1CO', 13, 4), id('1CO', 13, 7)],
    ['1 Corinthians 13:4 - 7', id('1CO', 13, 4), id('1CO', 13, 7)],
    ['I Cor 13:4', id('1CO', 13, 4), id('1CO', 13, 4)],
    ['First Corinthians 13:4', id('1CO', 13, 4), id('1CO', 13, 4)],
    ['Rom 8:28–9:5', id('ROM', 8, 28), id('ROM', 9, 5)],
    ['Ps 23:1', id('PSA', 23, 1), id('PSA', 23, 1)],
    ['Psalm 119:105', id('PSA', 119, 105), id('PSA', 119, 105)],
    ['Song of Songs 2:4', id('SNG', 2, 4), id('SNG', 2, 4)],
    ['Song of Solomon 2:4', id('SNG', 2, 4), id('SNG', 2, 4)],
    ['1 John 4:8', id('1JN', 4, 8), id('1JN', 4, 8)],
    ['3 Jn 4', id('3JN', 1, 4), id('3JN', 1, 4)],
    ['Phil 4:13', id('PHP', 4, 13), id('PHP', 4, 13)],
    ['Phlm 6', id('PHM', 1, 6), id('PHM', 1, 6)],
    ['Rev 21:4', id('REV', 21, 4), id('REV', 21, 4)],
  ])('%s', (text, start, end) => {
    const r = one(text);
    expect(r.range).toEqual({ start, end });
    expect(r.chapterOnly).toBe(false);
    expect(r.text).toBe(text);
  });

  it('reads chapter-only references as the whole chapter', () => {
    const r = one('1 Cor 13');
    expect(r.chapterOnly).toBe(true);
    expect(r.range).toEqual({ start: id('1CO', 13, 1), end: id('1CO', 13, 13) });
    expect(one('Gen 1').range.end).toBe(id('GEN', 1, 31));
    expect(one('Psalms 1-2')).toMatchObject({ chapterOnly: true, range: { start: id('PSA', 1, 1), end: id('PSA', 2, 12) } });
  });

  it('reads a number after a one-chapter book as a verse', () => {
    expect(one('Jude 3').range).toEqual({ start: id('JUD', 1, 3), end: id('JUD', 1, 3) });
    expect(one('Obadiah 1-4').range).toEqual({ start: id('OBA', 1, 1), end: id('OBA', 1, 4) });
    expect(one('Jude 1:3').range).toEqual({ start: id('JUD', 1, 3), end: id('JUD', 1, 3) });
  });

  it('finds several references in a sentence, with their positions', () => {
    const text = 'Compare Jn 3:16 with Rom. 5:8, and see 1 Cor 13.';
    const found = findReferences(text);
    expect(found.map((f) => f.text)).toEqual(['Jn 3:16', 'Rom. 5:8', '1 Cor 13']);
    for (const f of found) expect(text.slice(f.index, f.index + f.length)).toBe(f.text);
  });

  it('prefers the longest book name', () => {
    expect(one('1 John 1:9').range.start).toBe(id('1JN', 1, 9));
    expect(one('see 2 Kings 5:1').range.start).toBe(id('2KI', 5, 1));
  });

  it('ignores ordinary words that look like abbreviations', () => {
    expect(findReferences('This is 5 minutes away')).toEqual([]);
    expect(findReferences('I am 30 today')).toEqual([]);
    expect(findReferences('my job 2 days a week')).toEqual([]);
    expect(findReferences('the song 3 times')).toEqual([]);
    expect(findReferences('so 4 of them')).toEqual([]);
    // Capitalised, they are references.
    expect(one('Is 53:5').range.start).toBe(id('ISA', 53, 5));
    expect(one('Am 5:24').range.start).toBe(id('AMO', 5, 24));
    expect(one('Job 38:4').range.start).toBe(id('JOB', 38, 4));
  });

  it('skips references that do not exist', () => {
    expect(findReferences('John 22:1')).toEqual([]);
    expect(findReferences('John 3:99')).toEqual([]);
    expect(findReferences('Jude 30')).toEqual([]);
    expect(findReferences('Obadiah 2')).toEqual([{ index: 0, length: 10, text: 'Obadiah 2', range: { start: id('OBA', 1, 2), end: id('OBA', 1, 2) }, chapterOnly: false }].map((r) => ({ ...r, length: 9 })));
  });

  it('does not match inside words or numbers', () => {
    expect(findReferences('Genesis1:1x')).toEqual([]);
    expect(findReferences('ref123John 3:16')).toEqual([]);
  });

  it('clamps an over-long end verse to the chapter', () => {
    expect(one('Ps 23:1-99').range.end).toBe(id('PSA', 23, 6));
  });
});

describe('formatting references', () => {
  it('formats verses, ranges and chapters', () => {
    expect(formatRange({ start: id('JHN', 3, 16), end: id('JHN', 3, 16) })).toBe('John 3:16');
    expect(formatRange({ start: id('JHN', 3, 16), end: id('JHN', 3, 18) })).toBe('John 3:16–18');
    expect(formatRange({ start: id('ROM', 8, 28), end: id('ROM', 9, 5) })).toBe('Romans 8:28–9:5');
    expect(formatRange({ start: id('PSA', 23, 1), end: id('PSA', 23, 6) }, true)).toBe('Psalm 23');
    expect(formatRange({ start: id('PSA', 23, 4), end: id('PSA', 23, 4) })).toBe('Psalm 23:4');
    expect(formatRange({ start: id('JUD', 1, 3), end: id('JUD', 1, 3) })).toBe('Jude 3');
  });
});
