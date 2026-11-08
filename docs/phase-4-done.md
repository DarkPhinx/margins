# Phase 4 — "Done" checklist

Sign-off for Phase 4, Word Lookup. A box is ticked only when it has been checked; automated items name the test that proves them. Run everything with:

```
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

Plan's "done when": lookups work for sample verses in both Testaments.

## 1. Sources and data

- [x] Pinned with checksums in `data/sources/SOURCES.json`: STEPBible TAHOT (4 files) and TAGNT (2 files), the TBESH and TBESG lexicons (CC BY 4.0, STEPBible-Data commit `5de0a47`), and the BSB tables (`bsb_tables.tsv`, public domain). These large files are downloaded on first `npm run data`, checked against their checksums and kept in the ignored `data/cache/` (about 190 MB), never committed. `scripts/lib/pinned.ts`
- [x] KJV word links come from the Strong's tags already in the pinned KJV USFM.
- [x] `npm run data` builds `public/words/` and fails if a locked total changes: at least 440,000 words; at least 97% of each translation's tagged English linked; every verse has its original words; and in every verse at least 60% of the BSB's own Strong's numbers are among the words we give it (this catches a verse numbered differently). `scripts/build-words.ts`
- [x] Result: 444,725 Hebrew/Greek words in all 31,102 verses; 16,997 distinct words, every one with a lexicon entry; English linked for 99.3% (BSB) and 99.6% (KJV).
- [x] Verses the sources number or contain differently: STEP numbers verses as the NRSV does and gives the other number where they differ. Where words are given two numbers, the verse whose BSB words match them is used (2 Cor 13:13–14 and 1 Kgs 18:34 as in our Bibles; Phil 1:16–17 and Acts 3:19–20 by the BSB's modern divisions). Joshua 21:36–37 and Nehemiah 7:68, missing from the Leningrad Codex, use STEP's restored text. The Textus Receptus notes at the end of the epistles on where each was written are left out; a closing "Amen" stays. Section and paragraph marks are not part of words or glosses. `tests/words-build.test.ts`, `tests/words-ui.test.tsx`
- [x] Reading the STEP files: main word chosen from prefixes/suffixes; only the main Hebrew text and main Greek editions; Psalm titles (verse 0) joined to verse 1; differently numbered verses mapped to ours; classic Strong's numbers (e.g. G2258 "was") matched to STEP's (G1510) through the alternative columns and the lexicon's "form of" links. Hebrew and Greek are stored in one Unicode form (NFC). `tests/words-build.test.ts`
- [x] Lexicon definitions keep bold, italics and line breaks; STEP's references become readable, clickable references. `tests/words-build.test.ts`
- [x] Grammar codes (Greek Robinson, Hebrew OSHB, Aramaic) read in plain English. `tests/words-build.test.ts`
- [x] Credited in Settings → Sources and on every Original language page, as CC BY requires.

## 2. The Original language area (sidebar)

- [x] "Original language" in the sidebar opens a search: a reference opens that verse; an English word, Hebrew/Greek, a transliteration or a Strong's number (G26, H1254) lists matching original words. `tests/words-ui.test.tsx`
- [x] Each word result shows how the BSB translates it and sample verses with the word marked; "Go deeper on this word" opens it. `tests/words-ui.test.tsx`
- [x] A verse (or several) shows word by word: the English is linked to each original word and back; BSB/KJV toggle; previous/next verse; "Open in the Bible". Hebrew reads right to left. `tests/words-ui.test.tsx`
- [x] A word page shows the word in the verse it came from (form, transliteration, gloss, grammar in plain English), its range of meanings, usage (times and verses, in this book, per book across its Testament) and every verse, 25 at a time. `tests/words-ui.test.tsx`
- [x] Sample lookups in both Testaments: John 3:16 "loved" → G0025, "world" → κόσμον; KJV John 1:1 "was" → G1510; Genesis 1:1 "created" → H1254A, "beginning" → H7225G; Psalm 23:1 "shepherd" → H7462; Romans 8:28 "love" → G0025; ἀγάπη appears 116 times. `tests/words-ui.test.tsx`

## 3. From the Bible

- [x] The verse pop-up now floats just above the selected verses (below them if there's no room) and has "Original language", which opens those verses word by word. `tests/words-ui.test.tsx`
- [x] Selecting a word (double-click, drag or long-press) shows a pop-up above it: "Original language for this word" opens that word's page in context; "Whole verse" opens the verse. Selecting across verses offers "These verses". Works for BSB and KJV, Old and New Testament. `e2e/words.spec.ts`
- [x] The selected-words pop-up has the same study actions as the verse pop-up — Note, Question, Cross-refs, Link, Answer — applied to the whole verse(s) the selection is in, which it names (e.g. "John 3:16"). Both pop-ups share one set of buttons (`src/study/VerseActions.tsx`). Its original-language buttons read "Original language for this word" and "Original language: whole verse" / "these verses". Fits a 375 px phone. `e2e/word-highlights.spec.ts`
- [x] Highlighting some words: the same pop-up has the five colours and "Remove highlight", for one word, a phrase, or a stretch running across verses. Whole-verse highlighting (the verse pop-up) still works alongside; a word's own colour shows over its verse's. Clearing part of a word highlight splits it; clearing a whole verse clears its word highlights too. Word highlights are stored as character positions in one translation's text, so they show only in that translation; the Chapter tab lists them with their words. Highlighted text keeps its colour under the pointer. `tests/study-store.test.ts`, `tests/word-highlights.test.tsx` (positions checked against every verse of both Bibles), `e2e/word-highlights.spec.ts`
- [x] Pop-ups and pages fit a 375 px phone screen with no sideways scrolling (checked by screenshot).

## 4. Offline

- [x] Word data is not part of the install (12 MB compressed); each file is cached the first time it's used, and pages already used then work offline. `e2e/words.spec.ts`, `tests/esv-gate.test.ts`
- [x] The ESV is untouched: no ESV request matches the word-data cache rule. `tests/esv-gate.test.ts`

## 5. Deferred

- ESV word links (alignment through the BSB) wait for an ESV key; they would store only links, never ESV text.
- Asking Crossway about a word-alignment licence is the owner's action.

## 6. Hand checks

- [ ] Look up a handful of words you know well in both Testaments (e.g. Genesis 1:1, Psalm 23, Isaiah 53, John 1:1, Romans 8:28) and check the meanings and usage read sensibly.
- [ ] On a phone: long-press a word and use the pop-up; the word and verse pages.
- [ ] Note: the BSB site says its tables are public domain, but doesn't name the tables file explicitly; worth a quick confirmation before any public release.
