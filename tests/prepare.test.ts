import { describe, expect, it } from 'vitest';
import { applyVariants, collapseOmittedVerses, noteLabels, prepareChapter } from '../src/bible/prepare';
import { nearestVerse } from '../src/bible/verseIndex';
import { makeVerseId, parseVerseId } from '../src/bible/verseId';
import { allInline, loadChapter, verseText } from './helpers';

const on = { showManuscriptNotes: true };
const off = { showManuscriptNotes: false };

describe('omitted verses in the KJV', () => {
  it('shows a marker with the KJV’s own wording when manuscript notes are on', () => {
    const raw = loadChapter('kjv', 'MAT', 17);
    const doc = prepareChapter(raw, on);
    const marker = allInline(doc).find((i) => i.type === 'omitted');
    expect(marker).toEqual({
      type: 'omitted',
      n: 21,
      wordingSource: 'KJV',
      wording: verseText(raw, 21),
    });
    expect(verseText(doc, 21)).toBe('');
    expect(doc.verses).toEqual(raw.verses);
  });

  it('prints the verse exactly as stored when manuscript notes are off', () => {
    const raw = loadChapter('kjv', 'MAT', 17);
    const doc = prepareChapter(raw, off);
    expect(allInline(doc).some((i) => i.type === 'omitted')).toBe(false);
    expect(verseText(doc, 21)).toBe(verseText(raw, 21));
    expect(verseText(doc, 21)).toMatch(/Howbeit this kind goeth not out but by prayer and fasting/);
  });

  it('collapses all 16 verses and never changes the stored chapter', () => {
    const cases: [Parameters<typeof loadChapter>[1], number, number][] = [
      ['MAT', 17, 21], ['MAT', 18, 11], ['MAT', 23, 14], ['MRK', 7, 16], ['MRK', 9, 44], ['MRK', 9, 46],
      ['MRK', 11, 26], ['MRK', 15, 28], ['LUK', 17, 36], ['LUK', 23, 17], ['JHN', 5, 4], ['ACT', 8, 37],
      ['ACT', 15, 34], ['ACT', 24, 7], ['ACT', 28, 29], ['ROM', 16, 24],
    ];
    for (const [book, chapter, verse] of cases) {
      const raw = loadChapter('kjv', book, chapter);
      const before = JSON.stringify(raw);
      const doc = collapseOmittedVerses(raw, 'KJV');
      const markers = allInline(doc).filter((i) => i.type === 'omitted');
      expect(markers.map((m) => (m as { n: number }).n)).toContain(verse);
      expect(JSON.stringify(raw)).toBe(before);
      // The neighbours are untouched.
      expect(verseText(doc, verse - 1)).toBe(verseText(raw, verse - 1));
    }
  });

  it('drops footnotes that belonged to a collapsed verse', () => {
    const raw = loadChapter('kjv', 'MRK', 9);
    const doc = collapseOmittedVerses(raw, 'KJV');
    const refs = new Set(allInline(doc).filter((i) => i.type === 'note').map((i) => (i as { id: string }).id));
    for (const n of doc.notes) expect(refs.has(n.id)).toBe(true);
  });

  it('leaves BSB chapters alone (their markers are built in)', () => {
    const raw = loadChapter('bsb', 'MAT', 17);
    expect(allInline(prepareChapter(raw, off)).filter((i) => i.type === 'omitted')).toHaveLength(1);
  });
});

describe('variant passages', () => {
  const brackets = (d: ReturnType<typeof loadChapter>) =>
    allInline(d).filter((i) => i.type === 'bracket').map((i) => (i as { side: string }).side);

  it('brackets John 7:53–8:11 across the chapter break in both translations', () => {
    for (const t of ['bsb', 'kjv'] as const) {
      const seven = applyVariants(loadChapter(t, 'JHN', 7), t);
      const eight = applyVariants(loadChapter(t, 'JHN', 8), t);
      expect(brackets(seven)).toEqual(['open']);
      expect(brackets(eight)).toEqual(['close']);
      // Chapter 8 shows the note beside its closing bracket.
      expect(eight.notes.some((n) => n.origin === 'app')).toBe(true);
    }
  });

  it('uses the BSB’s own footnote in the BSB and adds the same wording as an app note in the KJV', () => {
    const bsb = applyVariants(loadChapter('bsb', 'JHN', 7), 'bsb');
    expect(bsb.notes.some((n) => n.origin === 'app')).toBe(false);
    expect(bsb.notes.some((n) => n.text[0]?.text.startsWith('Some early manuscripts do not include John 7:53 through John 8:11'))).toBe(true);

    const kjv = applyVariants(loadChapter('kjv', 'JHN', 7), 'kjv');
    const note = kjv.notes.find((n) => n.origin === 'app');
    expect(note?.text[0]?.text).toBe('Some early manuscripts do not include John 7:53 through John 8:11.');
    const inline = allInline(kjv);
    const open = inline.findIndex((i) => i.type === 'bracket');
    expect(inline[open + 1]).toEqual({ type: 'note', id: note?.id });
    expect(inline[open + 2]).toEqual({ type: 'verse', n: 53 });
  });

  it('brackets Mark 16:9–20 in both translations, closing after verse 20', () => {
    for (const t of ['bsb', 'kjv'] as const) {
      const doc = applyVariants(loadChapter(t, 'MRK', 16), t);
      expect(brackets(doc)).toEqual(['open', 'close']);
      const inline = allInline(doc);
      const close = inline.findIndex((i) => i.type === 'bracket' && i.side === 'close');
      const lastVerse = inline.slice(0, close).filter((i) => i.type === 'verse').at(-1);
      expect(lastVerse).toEqual({ type: 'verse', n: 20 });
      expect(inline.indexOf(inline.find((i) => i.type === 'verse' && i.n === 9)!)).toBeGreaterThan(
        inline.findIndex((i) => i.type === 'bracket'),
      );
    }
  });

  it('labels footnotes in reading order', () => {
    const doc = prepareChapter(loadChapter('kjv', 'PSA', 119), on);
    const labels = [...noteLabels(doc).values()];
    expect(labels.slice(0, 3)).toEqual(['a', 'b', 'c']);
    expect(labels[26]).toBe('aa');
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('nearest verse', () => {
  it('finds the next verse a translation has, else the previous', () => {
    expect(parseVerseId(nearestVerse('bsb', makeVerseId('MAT', 17, 21))).verse).toBe(22);
    expect(parseVerseId(nearestVerse('bsb', makeVerseId('ROM', 16, 24))).verse).toBe(25);
    expect(nearestVerse('kjv', makeVerseId('MAT', 17, 21))).toBe(makeVerseId('MAT', 17, 21));
  });
});
