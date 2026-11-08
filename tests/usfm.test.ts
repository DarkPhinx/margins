import { describe, expect, it } from 'vitest';
import { parseUsfm } from '../scripts/lib/usfm';
import { wordingFromNote } from '../scripts/lib/manuscript';
import { plainTextOfSource, wordsOfSource } from '../scripts/lib/validate';
import type { Block, Inline } from '../src/bible/types';

const inlines = (b: Block | undefined): Inline[] => (b && 'inline' in b ? b.inline : []);
const texts = (b: Block | undefined) =>
  inlines(b)
    .filter((i) => i.type === 'text')
    .map((i) => (i as { text: string }).text)
    .join('');

describe('USFM parser', () => {
  it('carries a red-letter span across verse boundaries', () => {
    const src = '\\id JHN\n\\c 1\n\\p \\v 1 He said, \\wj “Come. \\v 2 And see.”\\wj* So they went.';
    const { chapters, redLetterSpans } = parseUsfm(src, 'bsb', 'JHN');
    const block = chapters[0]!.blocks[0];
    expect(redLetterSpans).toBe(1);
    expect(inlines(block)).toEqual([
      { type: 'verse', n: 1 },
      { type: 'text', text: 'He said, ' },
      { type: 'text', text: '“Come. ', jesus: true },
      { type: 'verse', n: 2 },
      { type: 'text', text: 'And see.”', jesus: true },
      { type: 'text', text: ' So they went.' },
    ]);
  });

  it('allows a red-letter span to open before the verse marker', () => {
    const src = '\\id JHN\n\\c 1\n\\p \\wj \\v 39 “Come and see,”\\wj* He replied.';
    const block = parseUsfm(src, 'bsb', 'JHN').chapters[0]!.blocks[0];
    expect(inlines(block)[0]).toEqual({ type: 'verse', n: 39 });
    expect(inlines(block)[1]).toMatchObject({ text: '“Come and see,”', jesus: true });
  });

  it('keeps the space after a closing marker', () => {
    const src = '\\id ROM\n\\c 16\n\\p \\v 27 Amen.\n\\s1 Written from Corinthus, \\add and sent\\add* by Phebe.';
    const colophon = parseUsfm(src, 'kjv', 'ROM').chapters[0]!.blocks[1];
    expect(colophon?.type).toBe('colophon');
    expect(texts(colophon)).toBe('Written from Corinthus, and sent by Phebe.');
  });

  it('strips Strong’s attributes, including a divine name nested in a word', () => {
    const src = '\\id PSA\n\\c 3\n\\q1\n\\v 1 \\w \\+nd LORD\\+nd*|strong="H3068"\\w*, how \\w many|strong="H7231"\\w*!';
    const block = parseUsfm(src, 'kjv', 'PSA').chapters[0]!.blocks[0];
    expect(inlines(block)).toEqual([
      { type: 'verse', n: 1 },
      { type: 'text', text: 'LORD', divineName: true },
      { type: 'text', text: ', how many!' },
    ]);
  });

  it('keeps a Psalm title before verse 1 in both Bibles (the BSB’s files put verse 1’s marker before it)', () => {
    const parsed = parseUsfm('\\id PSA\n\\c 3\n\\d \\v 1 A Psalm of David.\n\\b\n\\q1 O LORD, how my foes\n\\q1 \\v 2 Many', 'bsb', 'PSA');
    expect(parsed.psalmTitlesMoved).toBe(1);
    const bsb = parsed.chapters[0]!;
    expect(bsb.blocks[0]?.type).toBe('descriptive');
    expect(texts(bsb.blocks[0])).toBe('A Psalm of David.');
    expect(inlines(bsb.blocks[0]).some((i) => i.type === 'verse')).toBe(false);
    // Verse 1 starts with the psalm itself.
    const first = bsb.blocks.find((b) => b.type === 'para')!;
    expect(inlines(first)[0]).toEqual({ type: 'verse', n: 1 });
    expect(texts(first)).toBe('O LORD, how my foes');
    // Outside Psalms an opening line marked this way is part of verse 1 (Zechariah 12:1).
    const zec = parseUsfm('\\id ZEC\n\\c 12\n\\d \\v 1 This is the burden.\n\\p Thus declares the LORD', 'bsb', 'ZEC');
    expect(zec.psalmTitlesMoved).toBe(0);
    expect(inlines(zec.chapters[0]!.blocks[0])[0]).toEqual({ type: 'verse', n: 1 });
    const kjv = parseUsfm('\\id PSA\n\\c 3\n\\d A Psalm of David.\n\\q1\n\\v 1 LORD,', 'kjv', 'PSA').chapters[0]!;
    expect(texts(kjv.blocks[0])).toBe('A Psalm of David.');
    expect(inlines(kjv.blocks[0]).some((i) => i.type === 'verse')).toBe(false);
  });

  it('merges acrostic letters and division subtitles', () => {
    const src = '\\id PSA\n\\c 1\n\\ms BOOK I\n\\d Psalms 1–41\n\\qa א\n\\qa ALEPH\n\\q1 \\v 1 Blessed';
    const blocks = parseUsfm(src, 'bsb', 'PSA').chapters[0]!.blocks;
    expect(blocks[0]).toEqual({ type: 'division', text: 'BOOK I', subtitle: 'Psalms 1–41' });
    expect(blocks[1]).toMatchObject({ type: 'heading', level: 'acrostic' });
    expect(texts(blocks[1])).toBe('א ALEPH');
  });

  it('reads Psalm 119 letter headings in the KJV as headings, not colophons', () => {
    const src = '\\id PSA\n\\c 119\n\\s1 \\tl  א ALEPH.\\tl*\n\\q1\n\\v 1 Blessed';
    const block = parseUsfm(src, 'kjv', 'PSA').chapters[0]!.blocks[0];
    expect(block).toMatchObject({ type: 'heading', level: 1 });
    expect(texts(block)).toBe('א ALEPH.');
  });

  it('parses footnotes into runs with quotes and verse numbers', () => {
    const src =
      '\\id MAT\n\\c 17\n\\p \\v 20 for you.\\f + \\fr 17:20 \\ft BYZ and TR include \\fqa \\fv 21\\fv*But this kind does not come out\\ft ; see \\ref Mark 9:29|MRK 9:29\\ref*.\\f*';
    const doc = parseUsfm(src, 'bsb', 'MAT').chapters[0]!;
    expect(doc.notes[0]).toEqual({
      id: '17-1',
      anchor: 40017020,
      text: [
        { text: 'BYZ and TR include ' },
        { text: '21', quote: true, verse: true },
        { text: 'But this kind does not come out', quote: true },
        { text: '; see Mark 9:29.' },
      ],
    });
    expect(wordingFromNote(doc.notes[0]!.text, 21)).toBe('But this kind does not come out');
    expect(wordingFromNote(doc.notes[0]!.text, 22)).toBeNull();
  });

  it('throws on a marker it does not know', () => {
    expect(() => parseUsfm('\\id JHN\n\\c 1\n\\zz odd \\v 1 text', 'bsb', 'JHN')).toThrow(/unknown marker/);
  });

  it('throws when a red-letter span is left open at a chapter break', () => {
    expect(() => parseUsfm('\\id JHN\n\\c 1\n\\p \\v 1 \\wj open\n\\c 2\n\\p \\v 1 x', 'bsb', 'JHN')).toThrow(/crosses a chapter/);
  });
});

describe('source text checks', () => {
  it('reduce USFM to its words independently of the parser', () => {
    const src = '\\id X\n\\c 1\n\\p \\v 1 \\w In|strong="G1"\\w* the \\add very\\add* start.\\f + \\fr 1:1 \\ft note\\f*';
    expect(plainTextOfSource(src)).toBe('Intheverystart.');
    expect(wordsOfSource(src)).toEqual(['In', 'the', 'very', 'start.']);
  });
});
