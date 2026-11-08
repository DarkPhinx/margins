/**
 * Strict USFM parser for the two pinned sources. An unknown marker throws, so
 * a source update can never silently drop content.
 */

import type { BookId } from '../../src/bible/books';
import { makeVerseId } from '../../src/bible/verseId';
import type {
  Block,
  ChapterDoc,
  Inline,
  Note,
  NoteRun,
  ParaStyle,
  TextInline,
  TranslationId,
} from '../../src/bible/types';

export interface ParsedBook {
  chapters: ChapterDoc[];
  redLetterSpans: number;
  /** Psalm titles that had verse 1's marker before them (see psalmTitlesBeforeVerse). */
  psalmTitlesMoved: number;
}

const HEADER_LINE = /^\\(id|usfm|h|toc[123]|mt[12]|rem|ide)\b.*$/gm;
/**
 * A marker. An opening marker consumes one following space (it is part of the
 * marker's syntax); a closing marker does not, so "\add sent\add* by" keeps its space.
 */
const MARKER = /\\(\+?)([a-z]+[0-9]*)(?:(\*)| ?)/g;
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const PARA_STYLES = new Set<string>(['p', 'pmo', 'pc', 'q1', 'q2', 'qr', 'li1', 'li2']);

type InlineBlock = Extract<Block, { inline: Inline[] }>;

function noteFromTokens(raw: string): NoteRun[] {
  const runs: NoteRun[] = [];
  let quote = false;
  const push = (text: string, verse = false): void => {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && !verse && !last.verse && Boolean(last.quote) === quote) {
      last.text += text;
      return;
    }
    runs.push({ text, ...(quote ? { quote: true as const } : {}), ...(verse ? { verse: true as const } : {}) });
  };

  const re = MARKER;
  re.lastIndex = 0;
  let pos = 0;
  let mode: 'skip' | 'text' = 'skip';
  let inVerse = false;
  let inRef = false;
  let m: RegExpExecArray | null;
  const text = (s: string): void => {
    if (mode === 'skip' || !s) return;
    if (inVerse) push(s.trim(), true);
    else push(inRef ? s.split('|')[0]! : s);
  };
  while ((m = re.exec(raw))) {
    text(raw.slice(pos, m.index));
    pos = re.lastIndex;
    const [, , name, closing] = m;
    if (name === 'fr') mode = 'skip';
    else if (name === 'ft') { mode = 'text'; quote = false; }
    else if (name === 'fqa') { mode = 'text'; quote = true; }
    else if (name === 'fv') inVerse = !closing;
    else if (name === 'ref' || name === 'w') inRef = !closing;
    else if (name !== 'nd' && name !== 'add') throw new Error(`Unknown note marker \\${name}`);
  }
  text(raw.slice(pos));
  if (runs.length) runs[0]!.text = runs[0]!.text.trimStart();
  if (runs.length) runs[runs.length - 1]!.text = runs[runs.length - 1]!.text.trimEnd();
  return runs.filter((r) => r.text);
}

function trimInline(inline: Inline[]): void {
  const first = inline.find((i): i is TextInline => i.type === 'text');
  if (first && inline[0] === first) first.text = first.text.trimStart();
  for (let i = inline.length - 1; i >= 0; i--) {
    const item = inline[i]!;
    if (item.type === 'note') continue;
    if (item.type === 'text') item.text = item.text.trimEnd();
    break;
  }
  for (let i = inline.length - 1; i >= 0; i--) {
    const item = inline[i]!;
    if (item.type === 'text' && !item.text) inline.splice(i, 1);
  }
}

/** A \d straight after a \ms is the division's subtitle ("Psalms 1–41"). */
function mergeDivisionSubtitles(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    const prev = out[out.length - 1];
    if (
      block.type === 'descriptive' &&
      prev?.type === 'division' &&
      block.inline.every((i) => i.type === 'text')
    ) {
      prev.subtitle = block.inline.map((i) => (i as TextInline).text).join('');
      continue;
    }
    out.push(block);
  }
  return out;
}

/**
 * A Psalm's title isn't part of verse 1 in English Bibles: verse 1 starts with
 * the psalm itself. The BSB's files open the title with the verse 1 marker
 * ("\d \v 1 For the choirmaster…"), so the marker moves to the start of the
 * first line after the title, as in the KJV's files. Nothing is removed.
 * (Only Psalms: Zechariah 12:1's opening line really is part of verse 1.)
 */
export function psalmTitlesBeforeVerse(blocks: Block[]): number {
  let moved = 0;
  blocks.forEach((block, b) => {
    if (block.type !== 'descriptive' || block.inline[0]?.type !== 'verse') return;
    const next = blocks.slice(b + 1).find((x): x is Extract<Block, { type: 'para' }> => x.type === 'para' && x.inline.some((i) => i.type === 'text'));
    if (!next) return;
    const marker = block.inline.shift()!;
    trimInline(block.inline);
    next.inline.unshift(marker);
    moved++;
  });
  return moved;
}

export function parseUsfm(source: string, translation: TranslationId, book: BookId): ParsedBook {
  const text = stripBom(source)
    .replace(HEADER_LINE, '')
    .replace(/\s+/g, ' ');

  const chapters: ChapterDoc[] = [];
  let doc: ChapterDoc | null = null;
  let block: InlineBlock | Extract<Block, { type: 'division' | 'parallelRefs' }> | null = null;
  let verse = 0;
  let jesus = false;
  let added = 0;
  let divineName = 0;
  let wordDepth = 0;
  let refDepth = 0;
  let spans = 0;

  const flush = (): void => {
    if (!block || !doc) return;
    if ('inline' in block) {
      trimInline(block.inline);
      if (block.inline.length) doc.blocks.push(block);
    } else {
      block.text = block.text.trim();
      if (block.text) doc.blocks.push(block);
    }
    block = null;
  };

  const need = (): ChapterDoc => {
    if (!doc) throw new Error(`${book}: content before the first chapter`);
    return doc;
  };

  const inlineBlock = (): InlineBlock => {
    if (!block) block = { type: 'para', style: 'p', inline: [] };
    if (!('inline' in block)) throw new Error(`${book} ${doc?.chapter}: inline content in a plain block`);
    return block;
  };

  const addText = (raw: string): void => {
    let value = raw;
    if (wordDepth > 0 || refDepth > 0) value = value.split('|')[0]!;
    if (!value) return;
    if (block && !('inline' in block)) {
      block.text += value;
      return;
    }
    if (!value.trim() && !block) return;
    const target = inlineBlock();
    const flags: Omit<TextInline, 'type' | 'text'> = {
      ...(jesus ? { jesus: true as const } : {}),
      ...(added > 0 ? { added: true as const } : {}),
      ...(divineName > 0 ? { divineName: true as const } : {}),
    };
    const last = target.inline[target.inline.length - 1];
    if (
      last?.type === 'text' &&
      Boolean(last.jesus) === jesus &&
      Boolean(last.added) === added > 0 &&
      Boolean(last.divineName) === divineName > 0
    ) {
      last.text += value;
      return;
    }
    target.inline.push({ type: 'text', text: value, ...flags });
  };

  const re = new RegExp(MARKER.source, 'g');
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const between = text.slice(pos, m.index);
    pos = re.lastIndex;
    if (between) addText(between);
    const name = m[2]!;
    const closing = m[3] === '*';

    switch (name) {
      case 'c': {
        flush();
        if (jesus) throw new Error(`${book}: red-letter span crosses a chapter`);
        const cm = /^(\d+) ?/.exec(text.slice(pos));
        if (!cm) throw new Error(`${book}: bad chapter marker`);
        pos += cm[0].length;
        re.lastIndex = pos;
        doc = { translation, book, chapter: Number(cm[1]), verses: [], blocks: [], notes: [] };
        chapters.push(doc);
        verse = 0;
        break;
      }
      case 'v': {
        const vm = /^(\d+) ?/.exec(text.slice(pos));
        if (!vm) throw new Error(`${book} ${doc?.chapter}: bad verse marker`);
        pos += vm[0].length;
        re.lastIndex = pos;
        verse = Number(vm[1]);
        need().verses.push(verse);
        inlineBlock().inline.push({ type: 'verse', n: verse });
        break;
      }
      case 'f': {
        if (closing) throw new Error(`${book}: stray note close`);
        const end = text.indexOf('\\f*', pos);
        if (end < 0) throw new Error(`${book}: unterminated note`);
        const d = need();
        const body = text.slice(pos, end).replace(/^\+ ?/, '');
        const note: Note = {
          id: `${d.chapter}-${d.notes.length + 1}`,
          anchor: makeVerseId(book, d.chapter, Math.max(verse, 1)),
          text: noteFromTokens(body),
        };
        d.notes.push(note);
        inlineBlock().inline.push({ type: 'note', id: note.id });
        pos = end + 3;
        re.lastIndex = pos;
        break;
      }
      case 'wj':
        if (closing) jesus = false;
        else { jesus = true; spans++; }
        break;
      case 'add':
        added += closing ? -1 : 1;
        break;
      case 'nd':
        divineName += closing ? -1 : 1;
        break;
      case 'w':
        wordDepth += closing ? -1 : 1;
        break;
      case 'ref':
        refDepth += closing ? -1 : 1;
        break;
      case 'tl':
        break;
      case 's1':
      case 's2': {
        flush();
        need();
        // In the KJV, \s1 marks Psalm 119's letters (\tl) and the epistle colophons.
        const isColophon = translation === 'kjv' && !text.startsWith('\\tl', pos);
        block = isColophon
          ? { type: 'colophon', inline: [] }
          : { type: 'heading', level: name === 's2' ? 2 : 1, inline: [] };
        break;
      }
      case 'qa': {
        if (block?.type === 'heading' && block.level === 'acrostic') {
          const last = block.inline[block.inline.length - 1];
          if (last?.type === 'text' && !last.text.endsWith(' ')) addText(' ');
          break;
        }
        flush();
        need();
        block = { type: 'heading', level: 'acrostic', inline: [] };
        break;
      }
      case 'ms':
      case 'mr':
        flush();
        need();
        block = { type: 'division', text: '' };
        break;
      case 'r':
        flush();
        need();
        block = { type: 'parallelRefs', text: '' };
        break;
      case 'd':
        flush();
        need();
        block = { type: 'descriptive', inline: [] };
        break;
      case 'b':
        flush();
        need().blocks.push({ type: 'break' });
        break;
      default:
        if (!PARA_STYLES.has(name)) throw new Error(`${book} ${doc?.chapter}: unknown marker \\${name}`);
        flush();
        need();
        block = { type: 'para', style: name as ParaStyle, inline: [] };
    }
  }
  const rest = text.slice(pos);
  if (rest) addText(rest);
  flush();

  if (jesus || added !== 0 || divineName !== 0 || wordDepth !== 0 || refDepth !== 0) {
    throw new Error(`${book}: unbalanced character markers at end of book`);
  }
  let psalmTitlesMoved = 0;
  for (const chapter of chapters) {
    chapter.blocks = mergeDivisionSubtitles(chapter.blocks);
    if (book === 'PSA') psalmTitlesMoved += psalmTitlesBeforeVerse(chapter.blocks);
  }
  return { chapters, redLetterSpans: spans, psalmTitlesMoved };
}
