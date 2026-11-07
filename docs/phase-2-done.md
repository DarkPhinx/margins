# Phase 2 — "Done" checklist

Sign-off for Phase 2, Notes on Verses. A box is ticked only when it has been checked; automated items name the test that proves them. Run everything with:

```
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

Plan's "done when": notes save, edit, and reload reliably; tests cover verse attachment.

## 1. Notes, questions, highlights and journal entries attached to a verse or range

- [x] Hovering a verse tints the whole verse; clicking anywhere in its text (or its number) selects it, marked by a row of small dots under the verse, and the bar of actions (highlight, note, question) appears; clicking more verses adds them; clicking the only selected verse again clears it. Footnote markers and dragging to select words still work as before. `e2e/study.spec.ts`, `tests/study-ui.test.tsx`
- [x] Several selected verses can be highlighted at once, or given one note together. `e2e/study.spec.ts`, `tests/study-ui.test.tsx`
- [x] A note or question opens as a pop-up over the passage showing the verses' text; it saves as you type; Done, ✕, Esc or a click outside closes it (saving first) and returns to the passage; a new one closed empty is dropped. A verse's note dot reopens its note (or lists them in the panel if there are several). `e2e/study.spec.ts`, `tests/study-ui.test.tsx`
- [x] Notes and questions attach to the selected verses (any range, including across a chapter break). `tests/study-store.test.ts`, `tests/study-ui.test.tsx`
- [x] Highlights cover whole verses, show in BSB and KJV alike, and re-colouring part of a range splits it. `tests/study-store.test.ts`, `tests/study-ui.test.tsx`
- [x] Section headings inside a highlighted range are never coloured. `tests/study-ui.test.tsx`
- [x] A small dot marks a verse with a note or question; tapping it opens them. `tests/study-ui.test.tsx`
- [x] Everything is stored on the device (IndexedDB) with permanent ids, change times and soft deletes, ready for sync in Phase 5. `tests/study-store.test.ts`

## 2. Notes save, edit and reload reliably

- [x] A note typed in the real editor saves as you type, survives a reload, can be edited, and survives another reload. `e2e/study.spec.ts`
- [x] Reloading straight after typing loses nothing (typing is kept as a draft until saved, then applied on the next start if it is newer). `e2e/study.spec.ts`, `tests/study-store.test.ts`
- [x] Notes and highlights work offline. `e2e/study.spec.ts`
- [x] Tapping Note creates exactly one note, even if a key is pressed before the editor has focus. `e2e/study.spec.ts`
- [x] Delete has Undo; a new note or entry left empty is discarded. `tests/study-ui.test.tsx`

## 3. Questions stay open until marked answered

- [x] Open / Answered / All, with counts; mark answered, reopen, and an optional answer. `tests/study-store.test.ts`, `tests/study-ui.test.tsx`

## 4. Reading to study mode in one tap, without leaving the page

- [x] The Study button opens a panel beside the text (a sheet under it on phones); the text stays on the page; the panel remembers it was open. `tests/study-ui.test.tsx`, `e2e/study.spec.ts`
- [x] The Chapter tab follows the chapter being read, in paged and continuous reading. `tests/study-ui.test.tsx`
- [x] No sideways scrolling on a phone with the panel open. `e2e/study.spec.ts`

## 5. Search across notes and journal entries

- [x] Finds notes, questions (and answers) and journal entries containing every word; ignores deleted items; opening a result goes to its verse. `tests/study-store.test.ts`, `tests/study-ui.test.tsx`

## 6. Verse references detected and linked

- [x] Detects Gen 1:1, Gen. 1:1, Gn 1:1, Jn 3:16, 1 Cor 13, 1Co 13:4-7, ranges (including across chapters), chapter-only references, one-chapter books ("Jude 3"), and ordinals ("I Cor", "First Corinthians"). `tests/refParser.test.ts`
- [x] Ignores ordinary words ("this is 5 minutes", "I am 30") and references that don't exist. `tests/refParser.test.ts`
- [x] References are underlined while typing. `e2e/study.spec.ts`
- [x] Clicking a recognised reference while writing (journal page, note pop-up, panel) saves and goes to that verse in the reader, highlighted; a whole-chapter reference opens the chapter. Alt+click places the cursor to edit it instead; dragging across it still selects text. `e2e/references.spec.ts`
- [x] Hovering for 1.5 seconds previews the passage; long passages end with an ellipsis; a whole-chapter reference previews its first verse. `tests/study-ui.test.tsx`, `e2e/study.spec.ts`
- [x] Clicking opens the referenced verses in normal ink with three verses either side in grey; clicking the grey context opens the full passage in the reader. A whole-chapter reference opens the chapter. `tests/study-ui.test.tsx`

## 7. Journal and the home page

- [x] The app opens on a home page: Continue reading (your last place) and the Journal. The reader's Home button returns to it. `tests/home.test.tsx`, `e2e/home.spec.ts`
- [x] Journal entries are standalone, or tied to a chapter (the one you were reading, or any chapter picked). A chapter can be added, changed or removed later. `tests/home.test.tsx`, `e2e/home.spec.ts`
- [x] Entries are written on their own page, saving as you type; listed newest first with their chapter or "Standalone", filterable; blank abandoned entries are tidied away (never one being started). `tests/home.test.tsx`, `e2e/home.spec.ts`
- [x] A chapter's entries show in the Study panel while reading it, and the panel can start one on that chapter. `tests/home.test.tsx`, `e2e/home.spec.ts`
- [x] Dated entries with an optional title; references in them are detected and linked. `tests/study-store.test.ts`, `tests/study-ui.test.tsx`, `e2e/study.spec.ts`
- [x] Home and journal pages work offline. `e2e/home.spec.ts`
- [x] The home page is an ordered list of self-contained sections (`src/home/sections/`), so it can grow later without changing existing sections. `tests/home.test.tsx`

## 7b. Sidebar, Journal page and Notes page

- [x] A sidebar on the left of every screen (Home, Bible, Journal, Notes; Settings at the bottom) marks the current page; Bible opens the reader at your place with the sidebar still beside the text. `tests/home.test.tsx`, `e2e/home.spec.ts`
- [x] On a phone the sidebar is a drawer behind the menu button; nothing scrolls sideways. `e2e/home.spec.ts`
- [x] The sidebar is an ordered list of items in one file (`src/shell/navItems.tsx`), so it can grow later.
- [x] Journal page: every entry with filters, and the ways to start one; Home shows the latest five. `tests/home.test.tsx`, `e2e/home.spec.ts`
- [x] Notes page: every note and question, filterable (all, notes, questions, standalone) and searchable; New note / New question write a standalone one in the pop-up; Home shows the latest five. A reference in a saved note goes to the verse. `tests/home.test.tsx`, `e2e/home.spec.ts`
- [x] With the study panel open, the text narrows so it never sits under the panel at in-between widths.

## 8. Hand checks

- [ ] Write a few real notes and questions over several days; check nothing is lost and the panel feels right.
- [ ] On a phone: selecting verses by tap, the sheet, and the editor with the on-screen keyboard.
- [ ] The 1.5-second hover delay feels right (one constant: `REF_PREVIEW_DELAY_MS` in `src/study/RefLink.tsx`).
- [ ] Highlight colours are readable in light and dark mode, including over red letters.

## Not in Phase 2

- Notes are on this device only; accounts and sync are Phase 5.
- Linking passages, and verses as answers to questions, are Phase 3.
