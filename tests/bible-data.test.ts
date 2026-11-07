/** Checks on the generated Bibles (npm run data builds them before tests). */
import { describe, expect, it } from 'vitest';
import manuscripts from '../src/generated/manuscripts.json';
import { BOOKS } from '../src/bible/books';
import { OMITTED_VERSES } from '../src/bible/manuscripts';
import { chapterCount, hasVerse, isValidVerse, versesInChapter } from '../src/bible/verseIndex';
import { makeVerseId } from '../src/bible/verseId';
import { EXPECTED } from '../scripts/lib/validate';
import { allInline, loadBook, loadChapter, verseText } from './helpers';

describe('generated Bibles', () => {
  it.each(['bsb', 'kjv'] as const)('%s has every book, chapter and verse, and every red-letter span', (t) => {
    let chapters = 0;
    let verses = 0;
    let redLetterRuns = 0;
    for (const book of BOOKS) {
      const file = loadBook(t, book.id);
      expect(file.chapters).toHaveLength(book.chapters);
      chapters += file.chapters.length;
      for (const c of file.chapters) {
        verses += c.verses.length;
        redLetterRuns += allInline(c).filter((i) => i.type === 'text' && i.jesus).length;
      }
    }
    expect(chapters).toBe(EXPECTED.chapters);
    expect(verses).toBe(EXPECTED[t].verses);
    expect(redLetterRuns).toBeGreaterThanOrEqual(EXPECTED[t].redLetterSpans);
  });

  it('shares one address list: the KJV’s 31,102 verses', () => {
    let total = 0;
    for (const b of BOOKS) for (let c = 1; c <= chapterCount(b.id); c++) total += versesInChapter(b.id, c);
    expect(total).toBe(31102);
    expect(isValidVerse(makeVerseId('MAT', 17, 21))).toBe(true);
    expect(hasVerse('bsb', makeVerseId('MAT', 17, 21))).toBe(false);
    expect(hasVerse('kjv', makeVerseId('MAT', 17, 21))).toBe(true);
    expect(isValidVerse(makeVerseId('REV', 12, 18))).toBe(false);
    expect(isValidVerse(makeVerseId('3JN', 1, 15))).toBe(false);
  });

  it('has BSB footnote wording for all 16 omitted verses', () => {
    expect(Object.keys(manuscripts.omitted)).toHaveLength(16);
    for (const id of OMITTED_VERSES) expect((manuscripts.omitted as Record<string, string>)[String(id)]).toBeTruthy();
    expect((manuscripts.omitted as Record<string, string>)[String(makeVerseId('ACT', 8, 37))]).toMatch(/^And Philip said/);
  });

  it('places a BSB marker for each omitted verse, inside the text', () => {
    const matt = loadChapter('bsb', 'MAT', 17);
    const para = matt.blocks.find((b) => 'inline' in b && b.inline.some((i) => i.type === 'omitted'));
    expect(para?.type).toBe('para');
    const marker = allInline(matt).find((i) => i.type === 'omitted');
    expect(marker).toMatchObject({ n: 21, wordingSource: 'BSB footnote', wording: 'But this kind does not come out except by prayer and fasting' });
  });

  it('keeps John 3:16 intact, in red, in both Bibles', () => {
    const bsb = loadChapter('bsb', 'JHN', 3);
    expect(verseText(bsb, 16)).toBe(
      'For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life.',
    );
    const kjv = loadChapter('kjv', 'JHN', 3);
    expect(verseText(kjv, 16)).toBe(
      '¶ For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
    );
    expect(allInline(kjv).some((i) => i.type === 'text' && i.jesus && i.text.includes('For God so loved'))).toBe(true);
  });

  it('keeps Psalm 3 titles, poetry and Selah', () => {
    const bsb = loadChapter('bsb', 'PSA', 3);
    expect(bsb.blocks.some((b) => b.type === 'descriptive')).toBe(true);
    expect(bsb.blocks.some((b) => b.type === 'para' && b.style === 'qr')).toBe(true);
    expect(bsb.blocks.filter((b) => b.type === 'para' && b.style.startsWith('q')).length).toBeGreaterThan(8);
    const kjv = loadChapter('kjv', 'PSA', 3);
    expect(kjv.blocks[0]?.type).toBe('descriptive');
  });

  it('keeps Psalm 119’s 22 letter headings and 176 verses', () => {
    for (const t of ['bsb', 'kjv'] as const) {
      const doc = loadChapter(t, 'PSA', 119);
      expect(doc.verses).toHaveLength(176);
      const headings = doc.blocks.filter((b) => b.type === 'heading' && (t === 'kjv' || b.level === 'acrostic'));
      expect(headings).toHaveLength(22);
    }
  });

  it('keeps Jude whole, and Revelation 12 ends at verse 17 in both', () => {
    expect(loadChapter('bsb', 'JUD', 1).verses).toHaveLength(25);
    expect(loadChapter('kjv', 'JUD', 1).verses).toHaveLength(25);
    expect(loadChapter('bsb', 'REV', 12).verses.at(-1)).toBe(17);
    expect(loadChapter('kjv', 'REV', 12).verses.at(-1)).toBe(17);
    expect(verseText(loadChapter('bsb', 'REV', 12), 17)).toMatch(/And the dragon stood on the shore of the sea\.$/);
  });

  it('marks KJV epistle colophons', () => {
    const rom = loadChapter('kjv', 'ROM', 16);
    expect(rom.blocks.at(-1)?.type).toBe('colophon');
  });
});
