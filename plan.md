Margins — Project Plan
Vision
A personal Bible study workspace where the user leads and the app serves. Most Bible apps guide you through a set path. This app is a desk: it keeps your threads, hands you the right tools, and stays out of the way. It brings scattered notes (notebooks, phone notes, other Bible apps) into one place, and helps turn reading into real study.
Core Principles
• The user guides the study; the app never assigns paths or tells you what to study next.
• No streaks, guilt notifications, or gamification. People come back because the tool is genuinely useful.
• Every note, question, link, and block is attached to verses.
• Flexibility over prescription: templates are starting points, not rules.
• Each phase must be solid, with a written "done" checklist and automated tests, before the next phase begins.
Scope Decisions
• Canon: the 66-book Protestant canon. No Apocrypha.
• Translations: BSB and KJV (public domain, bundled, work offline) and ESV (via Crossway API, online only).
• Red-letter text for the words of Jesus, on by default, with a setting to turn it off.
• Textual variants (John 7:53–8:11, Mark 16:9–20) shown the way standard Bibles do: in the text, bracketed, with a note. The 16 verses the BSB keeps only in footnotes (e.g. Matt 17:21, Acts 8:37) appear as small, faded verse numbers that open the verse's wording.
• Platforms: web app and Windows desktop app first; iOS and Android later.
Tech Stack
• Interface: React + TypeScript, Tailwind CSS, dnd-kit (drag and drop), TipTap (rich text editor).
• Desktop: Electron (chosen for consistency across machines).
• Mobile (future): Capacitor wrapping the same web app.
• Backend: Supabase — Postgres database, authentication, file storage, edge functions. Free tier for development.
• Offline-first: data saved locally first (IndexedDB), then synced to Supabase.
• AI (Phases 14–15): Python, pgvector, open embedding model, open-weight LLM fine-tuned with LoRA (Unsloth / Hugging Face).
Data Sources
• BSB, KJV: public domain, bundled as static files. Web version caches them in the background on first visit.
    ◦ BSB: the publisher's own USFM (bereanbible.com/bsb_usfm.zip), which carries the red-letter tags (1,420 spans).
    ◦ KJV: eBible.org's eng-kjv2006 (1769 text with Strong's numbers, 2,038 red-letter spans). Printing it in the UK, or importing printed copies, needs permission.
    ◦ Both archives are pinned with checksums in data/sources/. The build fails if a checksum, verse count, red-letter span count or word-for-word text check doesn't match.
• ESV: Crossway API (api.esv.org), free for non-commercial use. The key is a server secret for the Supabase edge function, never in code and never a VITE_ variable (Vite ships those to the browser; the build refuses one).
• Original languages: STEPBible tagged Greek NT and Hebrew OT (CC BY, credit required), extended Strong's numbers, lexicons.
• Cross-references: OpenBible.info dataset (ranked by votes) and the Treasury of Scripture Knowledge.
• Commentaries (Phase 13): public-domain works, checked individually for copyright.
ESV Caching Rules
• Never store more than 500 ESV verses locally, and never more than half of any single book.
• Use an LRU (least recently used) cache counted in verses, built with a JavaScript Map.
• When over the limit, evict the least recently viewed passages until back under.
• Respect API limits: 5,000 queries/day, 1,000/hour, 60/minute, max 500 verses per query. The limits apply to the whole key across all users, so the edge function enforces them; the browser also stops on a 429 and honours Retry-After.
• Half a book rounds down and uses the smaller verse count (the BSB's). Cached entries expire after 30 days. A passage too big to store is refused.
• If the limit is hit or the user is offline, fall back to BSB with a small notice.
• The service worker never caches ESV requests.
• Confirm caching rules with Crossway before public launch.
Phase 1 — The Reader
Goal: a clean, reliable Bible reader.
Temporary note (ESV key pending): Crossway is reviewing the API application (reply expected in a few weeks). Until the key arrives, build every translation through one shared translation layer, and ship BSB and KJV fully working. The ESV provider, cache, and limit rules are built and tested against mock sample data only, kept behind a disabled feature flag and hidden from users. Turn it on once the key is approved; if Crossway declines, the app runs on BSB and KJV with no rework.
Stack: Vite, React, strict TypeScript, Tailwind, React Router, vite-plugin-pwa, Vitest + Testing Library, Playwright for offline tests.
• BSB and KJV bundled as static files (one JSON file per book, built by scripts/build-bibles.ts from the pinned sources), working fully offline (included in the Windows installer; cached in the background on the web).
• One translation layer: every translation is a provider with pageFor() and read(). Verses share one address (BBCCCVVV, John 3:16 = 43003016) across translations; the address list is the union of all translations, and each translation lists the addresses it lacks.
• Omitted verses: the BSB omits 16 verses (e.g. Matt 17:21, Acts 8:37) and keeps them in footnotes. They are not put in the text. Where each belongs, a small, faded, tappable verse number opens a popup with the verse's wording in italics (from the BSB footnote) and a short note that it isn't found in the earliest manuscripts. The verse keeps its shared address so notes can attach to it. The build fails if any BSB footnote lacks the wording.
• KJV setting "Show manuscript notes" (on by default): when on, the KJV shows the same 16 verses with the same marker, with the KJV wording in the popup. When off, the KJV shows them in the text exactly as printed. The KJV text itself is never changed.
• Textual variants: John 7:53–8:11 and Mark 16:9–20 are bracketed with a footnote in both translations, using the BSB's own footnote wording (in the KJV it is marked as a Margins note, not part of the KJV text). The brackets come from a small curated list in the app; the BSB's [ ] marks elsewhere are quotation marks, not variants.
• Switching translation at a verse another translation prints differently goes to its marker, or to the nearest verse, with a small notice.
• Red letters for the words of Jesus, on by default, with a setting to turn them off.
• Continuous reading (setting, off by default): scroll straight from one chapter into the next and across books, up or down. The verse at the top of the screen is tracked as you scroll, and the header, address and saved position follow it. BSB and KJV only; the ESV stays paged because it may never show more than half a book at once.
• Book, chapter, and verse navigation; switching translations; last position remembered. Section headings shown as each translation provides them (the BSB and ESV have their own; the KJV has only Psalm 119's letters and the epistles' closing notes), since headings differ by translation and editor.
• ESV behind a disabled feature flag (MARGINS_ESV): provider, cache, limiter, paging, fallback and notices, built and tested against invented placeholder text only, never real ESV text, kept out of the production bundle. With the flag off, no ESV code is in the build. The build refuses to turn the flag on while the Crossway copyright notice is missing.
    ◦ ESV guidelines: show the required copyright notice (exact wording from api.esv.org/#copyright) and esv.org link wherever ESV text appears; never display more than 500 consecutive verses or half a book on one page, so no whole-book view. Six chapters are over half their book (Obadiah, Philemon, 2 John, 3 John, Jude, Haggai 2) and are split across pages. Strictly noncommercial: no ads, donations, or paid plans.
    ◦ The ESV cache lives in memory for now.
• Left for later: the Supabase edge function (Phase 1 defines only its interface, in shared/esv-contract.ts, and the shared limiter it will reuse), Supabase itself, Electron, notes, search.
Done when (checklist in docs/phase-1-done.md):
• BSB and KJV display correctly and work fully offline after the first visit.
• Validation passes for all 66 books, 1,189 chapters, verse counts and red-letter spans.
• Hand-checked: John 3, John 7–8, Mark 16, Psalms 3 and 119, Jude, Revelation 12.
• Navigation, translation switching at missing verses, and the red-letter setting work.
• Tests cover the cache and limits (including 2 John's limit of 6 verses), rate limits, fallback and paging, against mock data.
• With the flag off, no ESV appears anywhere for users.
• A test blocks turning the flag on while the ESV copyright notice is missing.
Phase 2 — Notes on Verses
Goal: one home for every note, saved locally on one device.
• Notes, questions, highlights, and journal entries attached to a verse or range.
• Questions stay open until marked answered.
• Switching from reading to any study mode in one tap, without leaving the page.
• Search across all notes and journal entries.
• Auto-detected verse references: any reference typed in a note or journal entry (e.g. John 3:16) is recognized and shown as a link. Detection handles common abbreviations and formats (e.g. Gen 1:1, Gen. 1:1, Gn 1:1, Jn 3:16, 1 Cor 13, 1Co 13:4-7, ranges, and chapter-only references).
    ◦ Hover for a few seconds to preview the verse; long passages are cut off with an ellipsis. A whole-chapter reference (e.g. Gen 1) previews the chapter's first verse; clicking opens the chapter.
    ◦ Click to open the reference: the referenced verses in normal black text, surrounding verses in a gray tint for context.
    ◦ Click the gray context to open and read the full passage.
• Standalone journal: dated entries not tied to any verse, in the same place as notes. Verse references typed in them are still detected and linked.
• App layout: a sidebar on the left of every screen (a slide-out drawer on phones) with Home, Bible, Journal and Notes, and Settings at the bottom. Opening the Bible keeps the sidebar beside the text. The sidebar is an ordered list of items in one file, so later phases add entries (studies, templates, the library…) without changing the others.
• Notes page: every note and question, on verses or standalone, filterable and searchable. Standalone notes and questions (not tied to any verse) are allowed, like standalone journal entries; this relaxes the foundation rule below for these two kinds.
• Journal page: every entry, standalone or on a chapter, with the ways to start one.
• Home page: the app opens on it. For now it holds Continue reading and the Journal (standalone entries, or entries tied to a chapter, written on their own page). It is built as an ordered list of self-contained sections, so later phases can add sections (e.g. open questions, recent notes, studies, templates, the library) without changing existing ones.
• Highlights cover whole verses (decided Nov 2026), so they show in every translation through the shared verse addresses. Five colours; re-colouring part of a highlighted range splits it.
• Built: hover a verse to see it tinted; click its text to select it (click more verses to add them); a bar offers highlight colours, Note and Question. A note or question opens as a pop-up over the passage, showing the verses, saving as you type; click outside (or Done, or Esc) to return to reading. A Study button opens a panel beside the text (a sheet under it on phones) with Chapter, Questions, Journal and Search. Notes are written in a TipTap editor that saves as you type; references are underlined while typing and become links. Hovering a link for 1.5 seconds previews it.
• Storage: IndexedDB on the device. Items have permanent ids, change times and soft deletes, ready for Phase 5 sync. Typing is also kept as a local draft until saved, so closing the page mid-save loses nothing.
Foundation rule: design the data model so every item (note, question, link, block) is attached to verses, ready for later phases.
Done when: notes save, edit, and reload reliably; tests cover verse attachment.
Phase 3 — Cross-References and Linking
Goal: connecting passages becomes easy.
• Cross-references for a single verse or a whole passage (merged and ranked by votes), from OpenBible.info and the Treasury of Scripture Knowledge.
• Cross-references open in a side panel without losing your place.
• Linking passages together, and linking verses to a question as answers.
• (Removed, Nov 2026, at the owner's request: a visible connection trail of where you've been. A different idea along these lines may come later.)
• Built (Nov 2026): sources are OpenBible.info's cross references (CC BY 4.0, credited) and CrossWire's public-domain TSK module (the original work, not a modern enhanced edition), pinned with checksums. 391,458 references, bundled per book and cached offline (2.3 MB compressed). Shown as the top 10 by votes with "Show all"; TSK-only references follow the voted ones; down-voted ones are hidden. Links are made from the selection bar (type the other passage, optional note) and show on both passages and on the Notes page. Selected verses can be added as answers to a question. The BSB's parallel-passage lines under headings are kept in the data but not shown.
Done when: cross-references are accurate for sample passages; links save correctly. Checklist: docs/phase-3-done.md.
Phase 4 — Word Lookup
Goal: the original languages one tap away.
• Tap a word to see the Hebrew or Greek, extended Strong's number, in-context gloss, and range of meanings (STEPBible data, credited).
• See every other verse where the word appears, plus usage stats: how often it's used in the current book, and how it's used across the Old Testament (Hebrew) or New Testament (Greek).
Linking English words to STEPBible, per translation:
• KJV: use a 1769 KJV with Strong's tagging (e.g. CrossWire or eBible.org; check licenses) for word-by-word links.
• BSB: use the BSB's public-domain interlinear tables for word-by-word links.
• ESV: automatic word-by-word alignment using the BSB as a bridge. Match ESV words to BSB words (exact and root-word matching), use an aligner such as awesome-align or SimAlign for the rest, and store only the links (e.g. word 5 → G26), never the ESV text. When confidence is low, show that verse's original-language words with the best guess highlighted so the user can pick.
• Ask Crossway whether a word-alignment license is available.
• Built (Nov 2026): an "Original language" area in the sidebar with one search box for a reference, an English word, Hebrew/Greek, a transliteration or a Strong's number. A word search lists the original words with sample verses ("Go deeper on this word"); a verse shows word by word, with the English linked both ways. A word page shows the word in its verse with plain-English grammar, its range of meanings, usage by book and across its Testament, and every verse. From the Bible: the verse pop-up (now floating just above the selected verses) has "Original language", and selecting a word or phrase offers "Original language for this word" / "Whole verse" / "These verses", and the highlighter colours for just those words (whole-verse highlighting stays in the verse pop-up; word highlights belong to one translation's text), plus the verse pop-up's Note, Question, Cross-refs, Link and Answer, applied to the whole verse(s). Data: STEPBible TAHOT/TAGNT and TBESH/TBESG lexicons (CC BY, credited) and the BSB tables, pinned with checksums and downloaded at build time (about 190 MB, not committed); 444,725 Hebrew/Greek words in all 31,102 verses (verses the sources number differently are matched to ours by the BSB's own words; text missing from the Leningrad Codex comes from STEP's restored text), English linked for 99.3% of BSB and 99.6% of KJV tagged words. Word data (12 MB compressed) is not precached: it is cached as it's used and then works offline. ESV alignment is deferred until there is an ESV key; asking Crossway about a licence is the owner's action.
Done when: lookups work for sample verses in both Testaments. Checklist: docs/phase-4-done.md.
Phase 5 — Accounts and Sync
Goal: your studies on every device.
• Supabase accounts and login.
• Offline-first: data saved locally (IndexedDB), then synced to Supabase.
• Conflict handling when the same note is edited on two devices.
Done when: notes created offline sync correctly across two devices; tests cover sync.
Phase 6 — Windows App
Goal: a real desktop program.
• Package the web app with Electron: installer, desktop icon, own window.
• Bundled BSB and KJV; full offline use.
Done when: the installer works on a clean Windows machine and matches the web app.
Phase 7 — The Block System
Goal: the building blocks every template is made from.
Block types (each configurable):
• Text: passage, translation comparison, quote.
• Writing: prompt with answer box, free journal, prayer box, checklist.
• Digging: word lookup, cross-references, question.
• Structure: heading, divider, columns, collapsible section.
• Visual: custom highlight colors, image, drawing (iPad).
• Organizing: tags, come-back-later list, link to another study, key verse (marked to memorize or revisit). Analysis: observation list (Who, What, When, Where, Why), table (e.g. comparing Gospel accounts), passage outline (split a chapter into titled sections).
Blocks are built as plugins with one shared, documented interface, so adding a new block type later means adding one plugin, with no changes to existing code. Future candidates: maps, timelines.
Done when: every block type works, saves, and reloads on its own.
Phase 8 — Built-in Templates
Goal: popular study methods ready to use.
• SOAP, HEAR, Swedish method, verse mapping, inductive study, topical study, all built from blocks.
Done when: all six templates work end to end.
Phase 9 — Custom Templates and Nested Studies
Goal: users build their own methods.
• Start from blank or copy any template and modify it.
• Personalize with colors, icons, and fonts.
• Nested studies: any study can hold smaller studies on a verse range, each with its own template.
Done when: custom templates save and nested studies open and close correctly.
Phase 10 — Smart Templates
Goal: the app grows with the user's method.
• Tweak in place: add or change blocks mid-study. The app compares structure only (never typed content) and asks whether to update the template, save as new, or keep the change for this study.
• Pattern suggestions: if the same block is added in several studies, gently suggest adding it to the template.
• Template versions, so old studies keep their original layout.
• Templates are stored in the user's account, ready to be shared in Phase 11.
Done when: tweaks are detected correctly; versions work.
Phase 11 — Friends and Sharing
Goal: share study methods with others.
• Friends list: add and remove friends on the platform.
• Send templates directly to friends.
• Public share links so any platform user, not just friends, can use a template.
• Built so more friend features can be added in future updates.
Done when: friends can be added, and templates shared directly and by public link open correctly for the recipient.
Phase 12 — Paper Notes
Goal: paper becomes a first-class way to study.
Note: this is a best-effort feature. Results depend on things the app can't control, like handwriting and photo quality. In-app notes remain the main way to study, with more freedom and creativity.
• Snap a photo of notebook pages; keep the original image, compressed to around 300 KB.
• Handwriting converted to searchable text.
• Verse references detected and confirmed by the user before linking.
• Import old notes from notes apps by pasting text.
Done when: a photographed page is searchable and attached to the right verses across devices.
Phase 13 — The Library
Goal: a trusted, searchable commentary shelf.
• Starter set of public-domain commentaries covering the whole Bible, e.g. Matthew Henry, Barnes, Gill, Clarke, Wesley; Calvin optional.
• Each source labeled by tradition; users choose default commentators and hide others.
• Modern paraphrases generated ahead of time, clearly labeled, with the original one tap away.
• Later additions: early church fathers, apologetics, Septuagint, permission-based sources (e.g. Constable, NET notes).
Resources as plugins: adding a new resource works like adding a block, through one shared interface with no changes to existing code. Each resource is tagged with a genre from an expandable list, not just commentaries, e.g. commentary, lexicon, apologetics, church fathers, devotional, theology, church history, sermons. Only the app's developer adds resources; users cannot upload their own.
Done when: commentaries are cleaned, linked to verses, and searchable.
Phase 14 — AI Foundation
Goal: safe, accurate retrieval before any AI voice.
• Retrieval over Scripture and the library with pgvector and an open embedding model.
• Verse safety: the model outputs only references; the app fills in the text and rejects any reference that doesn't exist or wasn't retrieved.
• Topic filter that declines off-topic questions.
Done when: no invented verses get through and off-topic questions are declined.
Phase 15 — The AI Librarian
Goal: a research assistant that gathers material, not one that gives answers.
• Question rewriting: converts a modern question into biblical themes, shown on screen and editable.
• Answers in three parts: what the commentators say (labeled and linked), a grouped verse trail, and questions back to the user.
• A short bridge connects the themes back to the original question, clearly marked as the app's connection, never attributed to a commentator.
• LoRA fine-tuning of an open-weight model for the librarian voice.
Done when: every answer cites real sources and stays in the librarian role.
Phase 16 — Personal Resources
Goal: users bring their own material for the AI librarian to search.
• Users upload their own resources (e.g. a church sermon, a book they own, class notes).
• Uploads stay private to that user: never shared, never used for model training.
• The AI librarian searches uploads alongside the library and pulls key insights when the user asks a question.
• Results from uploads are clearly labeled (e.g. "from your uploads") and kept separate from the trusted library.
User tip shown in the app: for the best experience, upload clear, detailed, well-organized resources. Better material gives better search results and insights.
Done when: uploads are private, searchable by the AI, and always labeled in answers.
Future Ideas
• iOS and Android apps via Capacitor.
• Apple Pencil handwriting.
• Adding friends and in-app template sharing.
• Quiet history page showing past studies and answered questions.
• More translations added later through the shared translation layer (e.g. NLT via Tyndale's free non-commercial API, NET Bible). Not in the current plan.