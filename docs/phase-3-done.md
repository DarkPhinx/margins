# Phase 3 — "Done" checklist

Sign-off for Phase 3, Cross-References and Linking. A box is ticked only when it has been checked; automated items name the test that proves them. Run everything with:

```
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

Plan's "done when": cross-references are accurate for sample passages; links save correctly.

## 1. Sources and data

- [x] Both sources pinned with checksums in `data/sources/SOURCES.json`: OpenBible.info cross references (CC BY 4.0, file dated 2026-11-02) and the Treasury of Scripture Knowledge (CrossWire SWORD module TSK 1.4, public domain, original c. 1880 work, not a modern "enhanced" edition).
- [x] `npm run data` builds `public/xrefs/<BOOK>.json` and fails if any locked total changes: 344,799 OpenBible lines (1 unusable: a reference from 3 John 15, not in our verse list); TSK references for 31,031 verses; no more than 0.5% of TSK fragments skipped (the 1,230 skipped are editorial notes such as "*marg:"). `scripts/build-xrefs.ts`
- [x] Spot checks in the build: John 3:16 ranks Romans 5:8 first; Genesis 1:1 references John 1:1.
- [x] 391,458 cross-references in all (344,816 from OpenBible, 47,859 found only in the TSK); every one is a real verse range within one book; no verse references only itself. `tests/xrefs.test.ts`
- [x] OpenBible ranges that run into the next book are split per book; ranges past a chapter's last verse end at its last verse. TSK shorthand is read exactly (book carry-over, bare verse lists, chapter changes, ranges across chapters, one-chapter books) and editorial notes are skipped, never guessed. `tests/xrefs.test.ts`
- [x] Down-voted references are left out. 2.3 MB compressed, cached for offline use. `e2e/xrefs.spec.ts`
- [x] Credited in Settings → Sources and under every cross-reference list, as CC BY requires.

## 2. Cross-references for a verse or a passage, ranked by votes, in a side panel

- [x] Select verses → Cross-refs: the study panel shows them beside the text, which stays where it was. `tests/phase3-ui.test.tsx`
- [x] Top 10 by votes, each with its verse text, then "Show all"; references only in the TSK follow the voted ones. `tests/phase3-ui.test.tsx`, `tests/xrefs.test.ts`
- [x] A passage of several verses merges its verses' references: a target named twice counts once with votes added; references inside the passage itself are left out. `tests/xrefs.test.ts`, `tests/phase3-ui.test.tsx`
- [x] Opening one shows it with its context (grey verses either side), still in the panel. `tests/phase3-ui.test.tsx`
- [x] Works offline. `e2e/xrefs.spec.ts`
- [ ] Hand-check: cross-references for a handful of passages you know well (e.g. Genesis 1:1, Psalm 23, Isaiah 53, John 1:1, Romans 8:28, Revelation 21) look right.

## 3. Linking passages together

- [x] Select verses → Link → type the other passage (any reference format) with an optional note; the dialog shows the passage it understood and refuses linking a passage to itself. `tests/phase3-ui.test.tsx`
- [x] A link shows on both passages: at the top of their cross-references, in the Chapter tab, and on the Notes page (with a Links filter). `tests/phase3-ui.test.tsx`
- [x] Links save, survive a reload (and a fresh database connection), and can be removed. `tests/study-store.test.ts`, `e2e/xrefs.spec.ts`

## 4. Linking verses to a question as answers

- [x] Select verses → Answer → choose a question (or start a new one answered by them). `tests/phase3-ui.test.tsx`
- [x] In a question: "Answered by" lists the verses; add one by typing a reference, follow one, or remove one. `tests/study-store.test.ts`
- [x] Question cards show what answers them. Answering verses save and survive a fresh connection; duplicates are ignored. `tests/study-store.test.ts`, `tests/phase3-ui.test.tsx`

## 5. Connection trail: removed

Built, then removed at the owner's request (Nov 2026). A different idea along these lines may come later.

## 6. Reader change

- [x] The BSB's parallel-passage lines under headings (e.g. "(Genesis 22:1–10; Romans 5:6–11)") are no longer shown; they stay in the data. `tests/reader.test.tsx`

## 7. Hand checks

- [ ] The cross-reference spot checks in section 2.
- [ ] On a phone: the selection bar (now three rows), cross-references in the sheet, the link dialog with the on-screen keyboard.
