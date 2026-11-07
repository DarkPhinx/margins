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
• Textual variants (e.g. John 7:53–8:11) shown the way standard Bibles do: in the text, bracketed, with a note.
• Platforms: web app and Windows desktop app first; iOS and Android later.
Tech Stack
• Interface: React + TypeScript, Tailwind CSS, dnd-kit (drag and drop), TipTap (rich text editor).
• Desktop: Electron (chosen for consistency across machines).
• Mobile (future): Capacitor wrapping the same web app.
• Backend: Supabase — Postgres database, authentication, file storage, edge functions. Free tier for development.
• Offline-first: data saved locally first (IndexedDB), then synced to Supabase.
• AI (Phase 5): Python, pgvector, open embedding model, open-weight LLM fine-tuned with LoRA (Unsloth / Hugging Face).
Data Sources
• BSB, KJV: public domain, bundled as static files. Web version caches them in the background on first visit.
• ESV: Crossway API (api.esv.org), free for non-commercial use. Key stored in a .env file, never in code, and called through a Supabase edge function so it is never exposed in the browser.
• Original languages: STEPBible tagged Greek NT and Hebrew OT (CC BY, credit required), extended Strong's numbers, lexicons.
• Cross-references: OpenBible.info dataset (ranked by votes) and the Treasury of Scripture Knowledge.
• Commentaries (Phase 4): public-domain works, checked individually for copyright.
ESV Caching Rules
• Never store more than 500 ESV verses locally, and never more than half of any single book.
• Use an LRU (least recently used) cache counted in verses, built with a JavaScript Map.
• When over the limit, evict the least recently viewed passages until back under.
• Respect API limits: 5,000 queries/day, 1,000/hour, 60/minute, max 500 verses per query.
• If the limit is hit or the user is offline, fall back to BSB with a small notice.
• Confirm caching rules with Crossway before public launch.
Phase 1 — The Reader
Goal: a clean, reliable Bible reader.
Temporary note (ESV key pending): Crossway is reviewing the API application (reply expected in a few weeks). Until the key arrives, build every translation through one shared translation layer, and ship BSB and KJV fully working. The ESV provider, cache, and limit rules are built and tested against mock sample data only, kept behind a disabled feature flag and hidden from users. Turn it on once the key is approved; if Crossway declines, the app runs on BSB and KJV with no rework.
• BSB and KJV bundled as static files, working fully offline (included in the Windows installer; cached in the background on the web).
• ESV through the Crossway API via a Supabase edge function, with the key kept in .env.
    ◦ ESV guidelines: show the required copyright notice (exact wording from api.esv.org/#copyright) wherever ESV text appears; never display more than 500 consecutive verses or half a book on one page; strictly noncommercial use.
• ESV LRU cache (500-verse and half-book limits) and automatic BSB fallback with a small notice. Display limit: never show more than 500 consecutive ESV verses, or half a book, on one page, so no whole-book view for the ESV. Required Crossway copyright notice and esv.org link shown on any page displaying ESV text. Use stays strictly noncommercial: no ads, donations, or paid plans.
• Red letters for the words of Jesus, on by default, with a setting to turn them off.
• Textual variants bracketed with a note, as standard Bibles do.
• Book, chapter, and verse navigation; switching translations. Section headings shown as each translation provides them (BSB and ESV have their own; the KJV has none), since headings differ by translation and editor.
Done when: all three translations display correctly; the cache never breaks Crossway's limits; tests cover the cache and fallback.
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
Foundation rule: design the data model so every item (note, question, link, block) is attached to verses, ready for later phases.
Done when: notes save, edit, and reload reliably; tests cover verse attachment.
Phase 3 — Cross-References and Linking
Goal: connecting passages becomes easy.
• Cross-references for a single verse or a whole passage (merged and ranked by votes), from OpenBible.info and the Treasury of Scripture Knowledge.
• Cross-references open in a side panel without losing your place.
• Linking passages together, and linking verses to a question as answers.
• A visible connection trail of where you've been.
Done when: cross-references are accurate for sample passages; links and trails save correctly.
Phase 4 — Word Lookup
Goal: the original languages one tap away.
• Tap a word to see the Hebrew or Greek, extended Strong's number, in-context gloss, and range of meanings (STEPBible data, credited).
• See every other verse where the word appears, plus usage stats: how often it's used in the current book, and how it's used across the Old Testament (Hebrew) or New Testament (Greek).
Linking English words to STEPBible, per translation:
• KJV: use a 1769 KJV with Strong's tagging (e.g. CrossWire or eBible.org; check licenses) for word-by-word links.
• BSB: use the BSB's public-domain interlinear tables for word-by-word links.
• ESV: automatic word-by-word alignment using the BSB as a bridge. Match ESV words to BSB words (exact and root-word matching), use an aligner such as awesome-align or SimAlign for the rest, and store only the links (e.g. word 5 → G26), never the ESV text. When confidence is low, show that verse's original-language words with the best guess highlighted so the user can pick.
• Ask Crossway whether a word-alignment license is available.
Done when: lookups work for sample verses in both Testaments.
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