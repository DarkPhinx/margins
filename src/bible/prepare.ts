/**
 * Display transforms applied to a chapter before rendering. The stored text is
 * never changed; these return a new document.
 */

import manuscriptJson from '../generated/manuscripts.json';
import { OMITTED_SET, VARIANT_PASSAGES } from './manuscripts';
import { makeVerseId } from './verseId';
import type { Block, ChapterDoc, Inline, ManuscriptData, Note, TranslationId } from './types';

const manuscripts = manuscriptJson as ManuscriptData;

export interface DisplayOptions {
  /** KJV only: show the 16 verses as faded markers instead of in the text. */
  showManuscriptNotes: boolean;
}

function clone(doc: ChapterDoc): ChapterDoc {
  return structuredClone(doc);
}

/**
 * Replaces each omitted verse with a marker holding the translation's own
 * wording. Notes inside the verse go with it.
 */
export function collapseOmittedVerses(doc: ChapterDoc, wordingSource: 'KJV'): ChapterDoc {
  const out = clone(doc);
  const dropped = new Set<string>();
  let capture: { marker: Extract<Inline, { type: 'omitted' }> } | null = null;

  const blocks: Block[] = [];
  for (const block of out.blocks) {
    if (block.type !== 'para' && block.type !== 'descriptive') {
      blocks.push(block);
      continue;
    }
    const kept: Inline[] = [];
    for (const item of block.inline) {
      if (item.type === 'verse') {
        capture = null;
        if (OMITTED_SET.has(makeVerseId(doc.book, doc.chapter, item.n))) {
          const marker = { type: 'omitted' as const, n: item.n, wording: '', wordingSource };
          capture = { marker };
          kept.push(marker);
          continue;
        }
      }
      if (capture) {
        if (item.type === 'text') capture.marker.wording += item.text;
        else if (item.type === 'note') dropped.add(item.id);
        continue;
      }
      kept.push(item);
    }
    if (kept.length) blocks.push({ ...block, inline: kept });
  }
  for (const b of blocks) {
    if ('inline' in b) {
      for (const i of b.inline) if (i.type === 'omitted') i.wording = i.wording.replace(/\s+/g, ' ').trim();
    }
  }
  out.blocks = blocks;
  out.notes = out.notes.filter((n) => !dropped.has(n.id));
  return out;
}

function verseBlocks(doc: ChapterDoc): Extract<Block, { type: 'para' | 'descriptive' }>[] {
  return doc.blocks.filter(
    (b): b is Extract<Block, { type: 'para' | 'descriptive' }> => b.type === 'para' || b.type === 'descriptive',
  );
}

/**
 * Brackets for the curated variant passages. In a translation that has no
 * footnote of its own (the KJV), and in a chapter where the passage continues
 * from the previous one, the BSB's note wording is added as an app note.
 */
export function applyVariants(doc: ChapterDoc, translation: TranslationId): ChapterDoc {
  const out = clone(doc);
  const chapterStart = makeVerseId(doc.book, doc.chapter, 0);
  const chapterEnd = makeVerseId(doc.book, doc.chapter, 999);

  for (const variant of VARIANT_PASSAGES) {
    if (!variant.bracketed || !variant.appliesTo.includes(translation)) continue;
    const { start, end } = variant.range;
    if (end < chapterStart || start > chapterEnd) continue;
    const opensHere = start >= chapterStart;
    const closesHere = end <= chapterEnd;
    const ownNote = translation === 'bsb' && opensHere;
    const noteText = manuscripts.variantNotes[variant.noteId];

    let current = 0;
    let openDone = false;
    let lastIn: { inline: Inline[]; index: number } | null = null;
    for (const block of verseBlocks(out)) {
      for (let i = 0; i < block.inline.length; i++) {
        const item = block.inline[i]!;
        if (item.type === 'verse') current = item.n;
        const id = makeVerseId(doc.book, doc.chapter, current);
        if (opensHere && !openDone && item.type === 'verse' && id === start) {
          block.inline.splice(i, 0, { type: 'bracket', side: 'open' });
          i++;
          openDone = true;
        }
        if (current > 0 && id >= start && id <= end) lastIn = { inline: block.inline, index: i };
      }
    }

    const target = lastIn as { inline: Inline[]; index: number } | null;
    if (closesHere && target) {
      target.inline.splice(target.index + 1, 0, { type: 'bracket', side: 'close' });
    }

    if (!ownNote && noteText) {
      const note: Note = {
        id: `${variant.noteId}-${doc.chapter}`,
        anchor: opensHere ? start : end,
        text: noteText,
        origin: 'app',
      };
      out.notes.push(note);
      // Beside the opening bracket, or beside the closing one when the passage began earlier.
      for (const block of verseBlocks(out)) {
        const idx = block.inline.findIndex((x) => x.type === 'bracket' && x.side === (opensHere ? 'open' : 'close'));
        if (idx >= 0) {
          block.inline.splice(idx + 1, 0, { type: 'note', id: note.id });
          break;
        }
      }
    }
  }
  return out;
}

export function prepareChapter(doc: ChapterDoc, options: DisplayOptions): ChapterDoc {
  let out = doc;
  if (doc.translation === 'kjv' && options.showManuscriptNotes) out = collapseOmittedVerses(out, 'KJV');
  return applyVariants(out, doc.translation);
}

/** Footnote labels in reading order: a, b, … z, aa, ab, … */
export function noteLabels(doc: ChapterDoc): Map<string, string> {
  const labels = new Map<string, string>();
  const label = (n: number): string => {
    let s = '';
    let k = n;
    do {
      s = String.fromCharCode(97 + (k % 26)) + s;
      k = Math.floor(k / 26) - 1;
    } while (k >= 0);
    return s;
  };
  for (const block of doc.blocks) {
    if (!('inline' in block)) continue;
    for (const item of block.inline) {
      if (item.type === 'note' && !labels.has(item.id)) labels.set(item.id, label(labels.size));
    }
  }
  return labels;
}
