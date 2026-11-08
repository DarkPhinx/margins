# Phase 1 — "Done" checklist

Sign-off for Phase 1, The Reader. A box is ticked only when it has been checked. Automated items name the test that proves them; run everything with:

```
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

## 1. BSB and KJV display correctly and work fully offline after the first visit

- [x] Both Bibles are precached by the service worker in the background (132 book files, about 3.5 MB compressed). `e2e/offline.spec.ts`
- [x] With the network cut, a reload works, and books never opened online open in both translations. `e2e/offline.spec.ts`
- [x] Omitted-verse popups work offline. `e2e/offline.spec.ts`
- [x] Fits a phone screen with no sideways scrolling. `e2e/offline.spec.ts`

## 2. Validation passes for all 66 books, 1,189 chapters, verse counts and red-letter spans

`npm run data` fails the build if any check fails (`scripts/lib/validate.ts`):

- [x] Checksums of both pinned archives match `data/sources/SOURCES.json`.
- [x] 66 books and 1,189 chapters in each translation.
- [x] Verses: BSB 31,086 and KJV 31,102. The BSB is exactly the KJV minus the 16 curated omitted verses.
- [x] Red-letter spans: BSB 1,420 and KJV 2,038, matching the source per book.
- [x] Parsed text matches the source word for word, per book, in both translations.
- [x] BSB footnote wording was found for all 16 omitted verses, and the BSB's own footnote for both variant passages.
- [x] The same facts are checked again on the generated files. `tests/bible-data.test.ts`

## 3. Hand-checked passages

Automated checks cover structure; these need a person reading them in the app (`npm run dev`), in both BSB and KJV.

- [ ] John 3: headings (BSB), red letters, verse 16 intact.
- [ ] John 7–8: bracket opens before 7:53 with a note, closes after 8:11, and John 8 shows the note beside the closing bracket.
- [ ] Mark 16: bracket opens before verse 9 and closes after verse 20, with a note.
- [ ] Psalm 3: title before verse 1 (in both Bibles), poetry indents, Selah.
- [x] Psalm titles are never part of verse 1 (changed Nov 2026). The BSB's files put the verse 1 marker before each of its 116 Psalm titles; the build moves it to the start of the psalm's first line, as the KJV's files have it. The title is kept, shown above the psalm; it can't be selected as verse 1, and it isn't in verse 1's text (notes, previews, word links). Zechariah 12:1, marked the same way, is left alone: there that line really is the start of verse 1. The build fails if the count changes. `tests/usfm.test.ts`, `tests/bible-data.test.ts`
- [ ] Psalm 119: 22 letter headings, 176 verses.
- [ ] Jude: 25 verses, one chapter, no chapter number.
- [ ] Revelation 12: ends at verse 17 ("And the dragon stood on the shore of the sea" in the BSB).
- [ ] Omitted verses, such as Matt 17:21, Mark 9:44 and 46, John 5:4, Acts 8:37 and Rom 16:24: BSB marker and popup; KJV marker with "Show manuscript notes" on, and printed text with it off.

## 4. Navigation, translation switching at missing verses, and the red-letter setting

- [x] Previous and next chapter, across books. `tests/reader.test.tsx`
- [x] Book, chapter and verse picker. `tests/reader.test.tsx`
- [x] Switching translation at Matt 17:21 lands on the BSB marker, with a notice. `tests/reader.test.tsx`
- [x] Nearest-verse rule for translations without a marker. `tests/prepare.test.ts`
- [x] The red-letter setting turns red letters off and is remembered. `tests/reader.test.tsx`
- [x] "Show manuscript notes" switches the KJV between markers and printed text, without changing the stored KJV text. `tests/reader.test.tsx`, `tests/prepare.test.ts`
- [x] The last position is remembered and reopened. `tests/reader.test.tsx`
- [x] Continuous reading: scrolling from John 1 to John 15 and back keeps the header, address and saved position on the verse at the top of the screen. `e2e/continuous.spec.ts`
- [x] Continuous reading crosses books (Jude into Revelation). Chapters load above without moving the text, and chapters far away are dropped from the page. `e2e/continuous.spec.ts`
- [x] The settings panel stays open when continuous reading is switched on, and omitted-verse markers still work. `tests/reader.test.tsx`
- [x] Jumping while scrolling, on a slow connection: chapters from the old place are never added to the new one. From 1 Corinthians 2, jumping to Genesis 50 then scrolling up shows Genesis 49, and down shows Exodus 1. Chapters always appear in unbroken order, and the address keeps up during steady scrolling. `e2e/continuous-jumps.spec.ts` (shown to fail with the fix removed)
- [x] Choosing a chapter or verse in the picker lands exactly on it and stays there while the chapters around it load (e.g. Psalm 119, never Psalm 118), in both paged and continuous reading, from several starting places. `e2e/landing.spec.ts` (shown to fail with the fix removed)
- [ ] Hand-check continuous reading on a phone (touch scrolling) and with the scrollbar.

## 5. ESV cache, limits, rate limits, fallback and paging, against mock data

All tests use invented placeholder text (`tests/fixtures/esv-placeholder.ts`), never real ESV text.

- [x] Cache: 500 verses overall, least recently used evicted first, overlapping passages counted once. `tests/esv-rules.test.ts`
- [x] Cache: half-book limit; 2 John never holds more than 6 verses. `tests/esv-rules.test.ts`, `tests/esv-provider.test.ts`
- [x] Cache: a passage too big is refused, and entries expire after 30 days. `tests/esv-rules.test.ts`
- [x] Rate limits of 60 a minute, 1,000 an hour and 5,000 a day, plus back-off after a 429 using Retry-After. `tests/esv-rules.test.ts`, `tests/esv-provider.test.ts`
- [x] BSB fallback with a notice when offline, rate-limited, or over the limit. `tests/esv-provider.test.ts`
- [x] Paging splits exactly the six chapters over half their book (Obadiah, Philemon, 2 John, 3 John, Jude, Haggai 2). `tests/esv-rules.test.ts`

## 6. With the flag off, no ESV appears anywhere for users

- [x] No ESV option, page or notice in the app; `/esv/...` URLs go to the BSB. `e2e/offline.spec.ts`, `tests/reader.test.tsx`
- [x] The built JavaScript contains no ESV code or wording. The service worker precaches nothing ESV and has no runtime caching. `tests/esv-gate.test.ts` (after `npm run build`)

## 7. A test blocks turning the flag on while the ESV copyright notice is missing

- [x] `checkEsvGate` refuses `MARGINS_ESV=1` while `src/esv/notice.ts` is empty, and `vite build` fails. `tests/esv-gate.test.ts`
- [x] Any `VITE_` variable holding an ESV or Crossway key fails the build. `tests/esv-gate.test.ts`

## Open items for when the ESV key arrives

- Copy the exact notice wording from api.esv.org/#copyright into `src/esv/notice.ts`.
- Build the Supabase edge function to the contract in `shared/esv-contract.ts`, enforcing `shared/esv-limits.ts` for the whole key.
- Confirm whether the ESV has Revelation 12:18 and 3 John 15. Neither the BSB nor the KJV does, so they are not in the shared address list yet; adding them is a data change only.
- Confirm the caching rules with Crossway before public launch.
