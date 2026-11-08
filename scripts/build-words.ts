/**
 * Builds the original-language word data (Phase 4) into public/words/:
 *
 *   orig/<BOOK>.json        verse → its Hebrew/Greek words
 *   links/<t>/<BOOK>.json   verse → [start, end, word index] for BSB and KJV English words
 *   lex/<shard>.json        extended Strong's → lexicon entry
 *   occ/<shard>.json        extended Strong's → verses it appears in, and how many times
 *   index/english.json      English word → the original words it translates (for search)
 *   index/lemmas.json       every word that occurs: Strong's, lemma, transliteration, gloss, count
 *
 * Fails on a checksum mismatch or if a locked total changes.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { BOOKS } from '../src/bible/books';
import { verseTexts } from '../src/bible/verseText';
import { makeVerseId, parseVerseId } from '../src/bible/verseId';
import type { BookFile } from '../src/bible/types';
import { readPinned, root, sha256, sourceEntries } from './lib/pinned';
import {
  alignVerse,
  baseStrong,
  kjvPhrases,
  parseBsbTables,
  parseLexicon,
  parseTagged,
  shardOf,
  type LexResult,
  type MaxVerses,
  type OrigResult,
  type Phrase,
  type WordLink,
} from './lib/words';

const outDir = join(root, 'public', 'words');
const stampFile = join(root, 'src', 'generated', '.words-stamp');

/** Locked totals. A source update that changes any of these must be reviewed. */
export const WORDS_EXPECTED = {
  /** Hebrew and Greek words kept (reading text only). */
  minWords: 440_000,
  /** Share of English phrases that must line up with the text. */
  minAligned: { bsb: 0.97, kjv: 0.97 },
  /**
   * Every verse has its original words. (Joshua 21:36–37, missing from the
   * Leningrad Codex, come from STEP's restored text; 2 Corinthians 13:14,
   * numbered 13:13 in Greek editions, from STEP's KJV numbering.)
   */
  versesWithoutWords: [] as string[],
  /** Verses where the BSB's own words disagree most with the Hebrew/Greek we give it: none below this share. */
  minVerseAgreement: 0.6,
} as const;

const TAGGED = ['tahot-gen-deu', 'tahot-jos-est', 'tahot-job-sng', 'tahot-isa-mal', 'tagnt-mat-jhn', 'tagnt-act-rev'];

async function main(): Promise<void> {
  const ids = [...TAGGED, 'tbesh', 'tbesg', 'bsb-tables', 'kjv'];
  const fingerprint = sha256(
    [
      ...sourceEntries()
        .filter((s) => ids.includes(s.id))
        .map((s) => s.sha256),
      readFileSync(join(root, 'scripts', 'lib', 'words.ts'), 'utf8'),
      readFileSync(join(root, 'scripts', 'build-words.ts'), 'utf8'),
      readFileSync(join(root, 'src', 'generated', '.stamp'), 'utf8'),
    ].join('\n'),
  );
  const force = process.argv.includes('--force');
  if (!force && existsSync(stampFile) && readFileSync(stampFile, 'utf8') === fingerprint && existsSync(join(outDir, 'index', 'lemmas.json'))) {
    console.log('Word data is up to date.');
    return;
  }

  const max = (JSON.parse(readFileSync(join(root, 'src', 'generated', 'verse-index.json'), 'utf8')) as { maxVerse: MaxVerses }).maxVerse;

  // The BSB's words per verse: used to number Greek verses as our Bibles do, then to link English.
  const bsbPhrases = parseBsbTables((await readPinned('bsb-tables')).toString('utf8'));
  const bsbStrongs = new Map([...bsbPhrases].map(([id, ps]) => [id, new Set(ps.map((p) => baseStrong(p.strong)))]));

  // Hebrew and Greek words.
  const orig: OrigResult = { verses: new Map(), alts: new Map(), words: 0, skippedRefs: [] };
  for (const id of TAGGED) parseTagged((await readPinned(id)).toString('utf8'), max, orig, { bsb: bsbStrongs });

  // Lexicons.
  const lex: LexResult = { entries: new Map(), base: new Map(), formOf: new Map() };
  parseLexicon((await readPinned('tbesh')).toString('utf8'), lex);
  parseLexicon((await readPinned('tbesg')).toString('utf8'), lex);

  // English → original links.
  const kjvZip = unzipSync(await readPinned('kjv'));
  const kjvByVerse = new Map<number, Phrase[]>();
  for (const [name, data] of Object.entries(kjvZip)) {
    if (!name.endsWith('.usfm')) continue;
    const text = strFromU8(data);
    const id = /\\id\s+(\w{3})/.exec(text)?.[1];
    const book = BOOKS.find((b) => b.id === id);
    if (book) for (const [v, p] of kjvPhrases(text, book.id)) kjvByVerse.set(v, p);
  }

  const errors: string[] = [];
  if (orig.words < WORDS_EXPECTED.minWords) errors.push(`Only ${orig.words} original words`);
  // Every verse has its words.
  const withoutWords: string[] = [];
  for (const b of BOOKS) {
    (max[b.id] ?? []).forEach((n, ci) => {
      for (let v = 1; v <= n; v++) if (!orig.verses.has(makeVerseId(b.id, ci + 1, v))) withoutWords.push(`${b.id} ${ci + 1}:${v}`);
    });
  }
  if (withoutWords.join(',') !== WORDS_EXPECTED.versesWithoutWords.join(',')) {
    errors.push(`Verses without words changed: ${withoutWords.join(', ')}`);
  }
  // Each verse's words are the ones the BSB translates there (catches verses numbered differently).
  const misnumbered: string[] = [];
  for (const [id, strongs] of bsbStrongs) {
    const want = [...strongs].filter((s) => !/^[HG]0*$/.test(s));
    const have = new Set((orig.verses.get(id) ?? []).map((w) => baseStrong(w[0])));
    if (want.length && want.filter((s) => have.has(s)).length / want.length < WORDS_EXPECTED.minVerseAgreement) {
      const p = parseVerseId(id);
      misnumbered.push(`${p.book} ${p.chapter}:${p.verse}`);
    }
  }
  if (misnumbered.length) errors.push(`Original words don't match the BSB's in: ${misnumbered.slice(0, 10).join(', ')}`);
  if (orig.skippedRefs.length) errors.push(`${orig.skippedRefs.length} word lines with references outside the verse list, e.g. ${orig.skippedRefs.slice(0, 3).join('; ')}`);

  rmSync(outDir, { recursive: true, force: true });
  for (const d of ['orig', 'links/bsb', 'links/kjv', 'lex', 'occ', 'index']) mkdirSync(join(outDir, d), { recursive: true });

  const occ = new Map<string, { verses: number[]; count: number }>();
  const english = new Map<string, Map<string, number>>();
  const stats = { bsb: { phrases: 0, missed: 0 }, kjv: { phrases: 0, missed: 0 } };

  for (const book of BOOKS) {
    const origOut: Record<string, unknown> = {};
    const linkOut: Record<'bsb' | 'kjv', Record<string, WordLink[]>> = { bsb: {}, kjv: {} };
    const files = {
      bsb: JSON.parse(readFileSync(join(root, 'public', 'bibles', 'bsb', `${book.id}.json`), 'utf8')) as BookFile,
      kjv: JSON.parse(readFileSync(join(root, 'public', 'bibles', 'kjv', `${book.id}.json`), 'utf8')) as BookFile,
    };
    const texts = {
      bsb: files.bsb.chapters.map((c) => verseTexts(c)),
      kjv: files.kjv.chapters.map((c) => verseTexts(c)),
    };
    for (const [id, words] of orig.verses) {
      if (Math.floor(id / 1_000_000) !== BOOKS.indexOf(book) + 1) continue;
      const key = String(id % 1_000_000);
      origOut[key] = words;
      for (const w of words) {
        // A handful of words carry no Strong's number in the source; they stay in their verse but can't be looked up.
        if (!w[0]) continue;
        let o = occ.get(w[0]);
        if (!o) occ.set(w[0], (o = { verses: [], count: 0 }));
        if (o.verses[o.verses.length - 1] !== id) o.verses.push(id);
        o.count++;
      }
      const chapter = Math.floor(id / 1000) % 1000;
      const verse = id % 1000;
      for (const t of ['bsb', 'kjv'] as const) {
        const text = texts[t][chapter - 1]?.get(verse);
        const phrases = (t === 'bsb' ? bsbPhrases : kjvByVerse).get(id);
        if (!text || !phrases) continue;
        const { links, missed } = alignVerse(text, phrases, words, orig.alts.get(id) ?? [], lex.formOf);
        stats[t].phrases += phrases.length;
        stats[t].missed += missed;
        if (links.length) linkOut[t][key] = links;
        if (t === 'bsb') {
          // English word → original word counts, for search.
          for (const [s, e, i] of links) {
            const strong = words[i]![0];
            for (const token of text.slice(s, e).toLowerCase().match(/[\p{L}']+/gu) ?? []) {
              let m = english.get(token);
              if (!m) english.set(token, (m = new Map()));
              m.set(strong, (m.get(strong) ?? 0) + 1);
            }
          }
        }
      }
    }
    writeFileSync(join(outDir, 'orig', `${book.id}.json`), JSON.stringify(origOut));
    writeFileSync(join(outDir, 'links', 'bsb', `${book.id}.json`), JSON.stringify(linkOut.bsb));
    writeFileSync(join(outDir, 'links', 'kjv', `${book.id}.json`), JSON.stringify(linkOut.kjv));
  }

  for (const t of ['bsb', 'kjv'] as const) {
    const share = 1 - stats[t].missed / Math.max(1, stats[t].phrases);
    if (share < WORDS_EXPECTED.minAligned[t]) errors.push(`${t}: only ${(share * 100).toFixed(1)}% of English words linked`);
  }

  // Lexicon and occurrences, sharded by Strong's number ("H72", "G00", …).
  const lexShards = new Map<string, Record<string, unknown>>();
  const occShards = new Map<string, Record<string, unknown>>();
  const lemmas: [string, string, string, string, number][] = [];
  let noEntry = 0;
  for (const [strong, o] of occ) {
    const entry = lex.entries.get(strong) ?? lex.entries.get(lex.base.get(baseStrong(strong)) ?? '');
    if (!entry) noEntry++;
    const shard = shardOf(strong);
    if (!lexShards.has(shard)) lexShards.set(shard, {});
    if (!occShards.has(shard)) occShards.set(shard, {});
    if (entry) lexShards.get(shard)![strong] = entry;
    occShards.get(shard)![strong] = { v: o.verses, n: o.count };
    lemmas.push([strong, entry?.l ?? '', entry?.t ?? '', entry?.g ?? '', o.count]);
  }
  // Prefixes and particles (H9xxx) have no lexicon entries by design; everything else should.
  const realWords = [...occ.keys()].filter((s) => !/^H90\d\d/.test(s)).length;
  if (noEntry / realWords > 0.01) errors.push(`${noEntry} of ${realWords} words have no lexicon entry`);
  for (const [s, data] of lexShards) writeFileSync(join(outDir, 'lex', `${s}.json`), JSON.stringify(data));
  for (const [s, data] of occShards) writeFileSync(join(outDir, 'occ', `${s}.json`), JSON.stringify(data));
  lemmas.sort((a, b) => b[4] - a[4]);
  writeFileSync(join(outDir, 'index', 'lemmas.json'), JSON.stringify(lemmas));
  const englishOut: Record<string, [string, number][]> = {};
  for (const [word, m] of english) {
    englishOut[word] = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }
  writeFileSync(join(outDir, 'index', 'english.json'), JSON.stringify(englishOut));

  if (errors.length) throw new Error(`Word data validation failed:\n  ${errors.join('\n  ')}`);
  writeFileSync(stampFile, fingerprint);
  // The app adds this to word-data URLs, so a rebuilt data set is never served stale from the cache.
  writeFileSync(join(root, 'src', 'generated', 'words-version.json'), JSON.stringify({ version: fingerprint.slice(0, 12) }));
  const pct = (t: 'bsb' | 'kjv') => ((1 - stats[t].missed / stats[t].phrases) * 100).toFixed(1);
  console.log(
    `Built word data: ${orig.words.toLocaleString()} Hebrew/Greek words in ${orig.verses.size.toLocaleString()} verses; ` +
      `${occ.size.toLocaleString()} distinct words; English linked BSB ${pct('bsb')}%, KJV ${pct('kjv')}%; ` +
      `${noEntry} without a lexicon entry.`,
  );
}

await main();
