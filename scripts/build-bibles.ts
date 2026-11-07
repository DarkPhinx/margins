/**
 * Builds the bundled Bibles from the pinned archives in data/sources.
 * Fails on a checksum mismatch or any validation error.
 *
 *   npm run data           build if inputs changed
 *   npm run data -- --force
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { BOOKS, isBookId, type BookId } from '../src/bible/books';
import { OMITTED_VERSES, VARIANT_PASSAGES } from '../src/bible/manuscripts';
import { parseVerseId } from '../src/bible/verseId';
import type { BookFile, TranslationId, VerseIndexData } from '../src/bible/types';
import { parseUsfm } from './lib/usfm';
import { extractManuscriptData, insertOmittedMarkers } from './lib/manuscript';
import { validate, type ParsedTranslation } from './lib/validate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcesDir = join(root, 'data', 'sources');
const outDir = join(root, 'public', 'bibles');
const genDir = join(root, 'src', 'generated');
const stampFile = join(genDir, '.stamp');

interface SourceEntry {
  id: TranslationId;
  file: string;
  sha256: string;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function inputFingerprint(archives: Uint8Array[]): string {
  const hash = createHash('sha256');
  for (const a of archives) hash.update(a);
  const dirs = [join(root, 'scripts'), join(root, 'scripts', 'lib')];
  for (const dir of dirs) {
    for (const name of readdirSync(dir).sort()) {
      if (name.endsWith('.ts')) hash.update(readFileSync(join(dir, name)));
    }
  }
  hash.update(readFileSync(join(root, 'src', 'bible', 'manuscripts.ts')));
  hash.update(readFileSync(join(root, 'src', 'bible', 'types.ts')));
  return hash.digest('hex');
}

function readArchive(bytes: Uint8Array): Map<BookId, string> {
  const files = unzipSync(bytes);
  const out = new Map<BookId, string>();
  for (const [name, data] of Object.entries(files)) {
    if (!name.toLowerCase().endsWith('.usfm')) continue;
    const text = strFromU8(data);
    const id = /\\id\s+(\w{3})/.exec(text)?.[1];
    if (!id) throw new Error(`No \\id in ${basename(name)}`);
    if (isBookId(id)) out.set(id, text);
    else throw new Error(`Unexpected book ${id} in ${basename(name)}`);
  }
  return out;
}

function parseTranslation(id: TranslationId, sources: Map<BookId, string>): ParsedTranslation {
  const chapters: ParsedTranslation['chapters'] = new Map();
  const spans: ParsedTranslation['spans'] = new Map();
  for (const book of BOOKS) {
    const source = sources.get(book.id);
    if (!source) throw new Error(`${id}: source missing ${book.id}`);
    const parsed = parseUsfm(source, id, book.id);
    chapters.set(book.id, parsed.chapters);
    spans.set(book.id, parsed.redLetterSpans);
  }
  return { id, sources, chapters, spans };
}

function main(): void {
  const manifest = JSON.parse(readFileSync(join(sourcesDir, 'SOURCES.json'), 'utf8')) as {
    sources: SourceEntry[];
  };
  const archives = manifest.sources.map((entry) => {
    const bytes = readFileSync(join(sourcesDir, entry.file));
    const actual = sha256(bytes);
    if (actual !== entry.sha256) {
      throw new Error(`Checksum mismatch for ${entry.file}: ${actual}`);
    }
    return { entry, bytes };
  });

  const fingerprint = inputFingerprint(archives.map((a) => a.bytes));
  const force = process.argv.includes('--force');
  const stampOk = existsSync(stampFile) && readFileSync(stampFile, 'utf8') === fingerprint;
  if (!force && stampOk && existsSync(join(outDir, 'kjv', 'REV.json'))) {
    console.log('Bibles are up to date.');
    return;
  }

  const load = (id: TranslationId): ParsedTranslation => {
    const archive = archives.find((a) => a.entry.id === id);
    if (!archive) throw new Error(`No source listed for ${id}`);
    return parseTranslation(id, readArchive(archive.bytes));
  };
  const bsb = load('bsb');
  const kjv = load('kjv');

  const errors = validate(bsb, kjv);
  if (errors.length) {
    throw new Error(`Validation failed:\n  ${errors.join('\n  ')}`);
  }

  const manuscript = extractManuscriptData(bsb.chapters);
  for (const id of OMITTED_VERSES) {
    const { book, chapter } = parseVerseId(id);
    const doc = bsb.chapters.get(book)?.[chapter - 1];
    if (!doc) throw new Error(`No BSB chapter for ${id}`);
    insertOmittedMarkers(doc, manuscript, [id]);
  }
  if (Object.keys(manuscript.variantNotes).length !== VARIANT_PASSAGES.length) {
    throw new Error('Every variant passage needs a BSB footnote');
  }

  rmSync(outDir, { recursive: true, force: true });
  for (const t of [bsb, kjv]) {
    mkdirSync(join(outDir, t.id), { recursive: true });
    for (const book of BOOKS) {
      const file: BookFile = {
        translation: t.id,
        book: book.id,
        chapters: t.chapters.get(book.id) ?? [],
      };
      writeFileSync(join(outDir, t.id, `${book.id}.json`), JSON.stringify(file));
    }
  }

  const index: VerseIndexData = {
    maxVerse: Object.fromEntries(
      BOOKS.map((book) => [
        book.id,
        (kjv.chapters.get(book.id) ?? []).map((d) => Math.max(...d.verses)),
      ]),
    ),
    absent: { bsb: [...OMITTED_VERSES], kjv: [] },
  };
  mkdirSync(genDir, { recursive: true });
  writeFileSync(join(genDir, 'verse-index.json'), JSON.stringify(index));
  writeFileSync(join(genDir, 'manuscripts.json'), JSON.stringify(manuscript, null, 2));
  writeFileSync(stampFile, fingerprint);

  console.log(
    `Built BSB and KJV: 66 books, 1,189 chapters, ${OMITTED_VERSES.length} omitted verses with wording, ` +
      `${Object.keys(manuscript.variantNotes).length} variant notes.`,
  );
}

main();
