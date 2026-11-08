/**
 * Builds the bundled cross-references from the pinned OpenBible.info and TSK
 * archives: public/xrefs/<BOOK>.json, one file per book, keyed by
 * chapter*1000+verse. Fails on a checksum mismatch or any validation error.
 *
 *   npm run data           build if inputs changed
 *   npm run data -- --force
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import { BOOKS } from '../src/bible/books';
import { makeVerseId } from '../src/bible/verseId';
import { mergeAndRank, parseOpenBible, parseTsk, readZCom, type MaxVerses } from './lib/xrefs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcesDir = join(root, 'data', 'sources');
const outDir = join(root, 'public', 'xrefs');
const stampFile = join(root, 'src', 'generated', '.xrefs-stamp');

/** Locked totals. A source update that changes any of these must be reviewed. */
export const XREF_EXPECTED = {
  openBibleLines: 344_799,
  // The one line left: a reference from 3 John 15, a verse not in our address list.
  openBibleInvalid: 1,
  tskVersesWithRefs: 31_031,
} as const;

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function main(): void {
  const manifest = JSON.parse(readFileSync(join(sourcesDir, 'SOURCES.json'), 'utf8')) as {
    sources: { id: string; file: string; sha256: string }[];
  };
  const archive = (id: string) => {
    const entry = manifest.sources.find((s) => s.id === id);
    if (!entry) throw new Error(`No source listed for ${id}`);
    const bytes = readFileSync(join(sourcesDir, entry.file));
    if (sha256(bytes) !== entry.sha256) throw new Error(`Checksum mismatch for ${entry.file}`);
    return bytes;
  };
  const obZip = archive('openbible');
  const tskZip = archive('tsk');

  const fingerprint = sha256(
    Buffer.concat([
      obZip,
      tskZip,
      readFileSync(join(root, 'scripts', 'lib', 'xrefs.ts')),
      readFileSync(join(root, 'scripts', 'build-xrefs.ts')),
    ]),
  );
  const force = process.argv.includes('--force');
  if (!force && existsSync(stampFile) && readFileSync(stampFile, 'utf8') === fingerprint && existsSync(join(outDir, 'REV.json'))) {
    console.log('Cross-references are up to date.');
    return;
  }

  const max = (JSON.parse(readFileSync(join(root, 'src', 'generated', 'verse-index.json'), 'utf8')) as { maxVerse: MaxVerses })
    .maxVerse;

  const obFiles = unzipSync(obZip);
  const obText = Object.entries(obFiles).find(([n]) => n.endsWith('.txt'))?.[1];
  if (!obText) throw new Error('OpenBible archive has no .txt file');
  const ob = parseOpenBible(strFromU8(obText), max);

  const tskFiles = unzipSync(tskZip);
  const file = (suffix: string) => {
    const hit = Object.entries(tskFiles).find(([n]) => n.endsWith(suffix));
    if (!hit) throw new Error(`TSK archive is missing ${suffix}`);
    return hit[1];
  };
  const tsk = parseTsk(
    readZCom(file('ot.bzv'), file('ot.bzs'), file('ot.bzz')),
    readZCom(file('nt.bzv'), file('nt.bzs'), file('nt.bzz')),
    max,
  );

  const errors: string[] = [];
  if (ob.lines !== XREF_EXPECTED.openBibleLines) errors.push(`OpenBible: ${ob.lines} lines`);
  if (ob.invalid.length !== XREF_EXPECTED.openBibleInvalid) {
    errors.push(`OpenBible: ${ob.invalid.length} invalid lines:\n    ${ob.invalid.join('\n    ')}`);
  }
  if (tsk.versesWithRefs !== XREF_EXPECTED.tskVersesWithRefs) errors.push(`TSK: ${tsk.versesWithRefs} verses with references`);
  // Nearly everything parses; what's skipped is editorial notes and a few malformed ranges.
  const skippedShare = tsk.skipped.length / (tsk.pairs.size + tsk.skipped.length);
  if (skippedShare > 0.005) errors.push(`TSK: ${(skippedShare * 100).toFixed(2)}% of references skipped`);
  const merged = mergeAndRank(ob.pairs, tsk.pairs);
  // Spot checks against well-known references.
  const top = (b: (typeof BOOKS)[number]['id'], c: number, v: number) => merged.get(makeVerseId(b, c, v))?.[0]?.[0];
  if (top('JHN', 3, 16) !== makeVerseId('ROM', 5, 8)) errors.push('John 3:16 should rank Romans 5:8 first');
  if (!merged.get(makeVerseId('GEN', 1, 1))?.some((r) => r[0] === makeVerseId('JHN', 1, 1))) {
    errors.push('Genesis 1:1 should reference John 1:1');
  }
  if (errors.length) throw new Error(`Cross-reference validation failed:\n  ${errors.join('\n  ')}`);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  let total = 0;
  for (const book of BOOKS) {
    const out: Record<string, unknown> = {};
    for (const [from, refs] of merged) {
      if (Math.floor(from / 1_000_000) !== BOOKS.indexOf(book) + 1) continue;
      // Compact: [start] for one verse with no votes info needed is not used; keep [start, end, votes].
      out[String(from % 1_000_000)] = refs;
      total += refs.length;
    }
    writeFileSync(join(outDir, `${book.id}.json`), JSON.stringify(out));
  }
  mkdirSync(dirname(stampFile), { recursive: true });
  writeFileSync(stampFile, fingerprint);
  const tskOnly = [...merged.values()].flat().filter((r) => r[2] === -1).length;
  console.log(
    `Built cross-references: ${total.toLocaleString()} (OpenBible ${ob.pairs.size.toLocaleString()}, TSK only ${tskOnly.toLocaleString()}; TSK skipped ${tsk.skipped.length} editorial fragments).`,
  );
}

main();
