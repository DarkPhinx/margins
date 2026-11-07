import type { BookId } from '../../src/bible/books';
import { OMITTED_VERSES, VARIANT_NOTE_SOURCES } from '../../src/bible/manuscripts';
import { parseVerseId } from '../../src/bible/verseId';
import type { ChapterDoc, Inline, ManuscriptData, Note, NoteRun, VerseId } from '../../src/bible/types';

/**
 * Wording of an omitted verse from a BSB footnote: the quoted text straight
 * after the note's verse number, up to the next verse number or the end of the
 * quote. Returns null rather than guessing.
 */
export function wordingFromNote(runs: NoteRun[], verse: number): string | null {
  const start = runs.findIndex((r) => r.verse && r.text === String(verse));
  if (start < 0) return null;
  const next = runs[start + 1];
  if (!next?.quote || next.verse) return null;
  const wording = next.text.trim();
  return wording || null;
}

function isOmissionNote(note: Note): boolean {
  // "BYZ and TR include ...": the note is about text left out, not a rendering.
  const lead = note.text[0];
  return Boolean(lead && !lead.quote && /\binclude[s]?\s*$/.test(lead.text.trim()));
}

export function extractManuscriptData(
  chaptersByBook: ReadonlyMap<BookId, ChapterDoc[]>,
): ManuscriptData {
  const omitted: Record<string, string> = {};
  const missing: string[] = [];

  for (const id of OMITTED_VERSES) {
    const { book, chapter, verse } = parseVerseId(id);
    const doc = chaptersByBook.get(book)?.[chapter - 1];
    const notes = doc?.notes.filter((n) => n.anchor === id - 1 && isOmissionNote(n)) ?? [];
    const wording = notes.map((n) => wordingFromNote(n.text, verse)).find(Boolean);
    if (wording) omitted[String(id)] = wording;
    else missing.push(`${book} ${chapter}:${verse}`);
  }
  if (missing.length) {
    throw new Error(`BSB footnote wording not found for: ${missing.join(', ')}`);
  }

  const variantNotes: Record<string, NoteRun[]> = {};
  for (const [noteId, anchor] of Object.entries(VARIANT_NOTE_SOURCES)) {
    const { book, chapter } = parseVerseId(anchor);
    const note = chaptersByBook
      .get(book)
      ?.[chapter - 1]?.notes.find((n) => n.anchor === anchor && /early manuscripts/.test(n.text[0]?.text ?? ''));
    if (!note) throw new Error(`BSB variant footnote not found: ${noteId}`);
    variantNotes[noteId] = note.text;
  }
  return { omitted, variantNotes };
}

/**
 * Places a marker for each omitted verse in the BSB, directly after the last
 * inline of the preceding verse. The BSB's wording is untouched.
 */
export function insertOmittedMarkers(doc: ChapterDoc, data: ManuscriptData, ids: readonly VerseId[]): void {
  for (const id of ids) {
    const { verse } = parseVerseId(id);
    let current = 0;
    let target: { inline: Inline[]; index: number } | null = null;
    for (const block of doc.blocks) {
      if (block.type !== 'para' && block.type !== 'descriptive') continue;
      block.inline.forEach((item, index) => {
        if (item.type === 'verse') current = item.n;
        if (current === verse - 1) target = { inline: block.inline, index };
      });
    }
    const found = target as { inline: Inline[]; index: number } | null;
    const wording = data.omitted[String(id)];
    if (!found || !wording) throw new Error(`No place for omitted verse ${id}`);
    found.inline.splice(found.index + 1, 0, {
      type: 'omitted',
      n: verse,
      wording,
      wordingSource: 'BSB footnote',
    });
  }
}
