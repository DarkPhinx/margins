# Phase 5 — "Done" checklist

Sign-off for Phase 5, Accounts and Sync. A box is ticked only when it has been checked; automated items name the test that proves them. Run everything with:

```
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

Plan's "done when": notes created offline sync correctly across two devices; tests cover sync.

Decisions (Nov 2026): sign in with email and password, or Google; two levels — reading and looking things up need no account, anything you write does; when the same note is changed on two devices, the person is asked each time; the database is set up with a Supabase access token.

## 0. Setting up the Supabase project (owner)

1. In `.env` (see `.env.example`): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (already there), and `SUPABASE_ACCESS_TOKEN` — a personal access token from supabase.com → Account → Access Tokens. Never prefix the token with `VITE_`.
2. `npm run supabase:setup` — creates the table, its security rules and the sync function (`supabase/migrations/`), records which migrations have run, and sets where sign-in may send people back to (`SITE_URL`, default `http://localhost:5173`, plus local dev and test addresses).
3. Google (optional): create an OAuth client ("Web application") in Google Cloud with the redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`; put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`; run `npm run supabase:setup` again. The Google button appears on the sign-in page only once it's switched on.
4. Before a public launch: set up your own email sender (SMTP) in Supabase — the built-in one sends only a few emails an hour — and set `SITE_URL` to the real address.

- [x] Steps 1–2 done; `npm run supabase:setup` prints "Applied 0001_study_items.sql".
- [x] Google sign-in switched on (optional).

## 1. Accounts

- [x] Without an account (reading and looking things up): the BSB and KJV with every reader setting (red letters, manuscript notes, continuous reading, dark mode), cross-references with "Show all", the Original language area (word lookup and search, from the reader too), reference previews and links. Reader settings are kept on the device. Reading works offline once the Bibles are stored. `tests/reading-signed-out.test.tsx`, `e2e/signed-out.spec.ts`
- [x] With an account (anything you write): notes, questions and answers; highlights, whole-verse and partial; journal entries; passage links; sync across devices.
- [x] Signed out, the writing tools are still there; using one (a highlight colour, Note, Question, Link, Answer, "Link to another passage…") opens a friendly prompt: an account saves your notes, questions, highlights and journal and keeps them in sync on every device, with Sign in, Create account and Not now. The reader is never blocked. `tests/reading-signed-out.test.tsx`, `e2e/signed-out.spec.ts`
- [x] Journal and Notes explain the same in place, with Sign in, Create account and Keep reading; the study panel opens, with cross-references and previews working and its own tabs explaining accounts. Home opens the Bible instead. `tests/reading-signed-out.test.tsx`
- [x] The sign-in page is reachable from the sidebar (Sign in, under the pages) and Settings → Account (Sign in, Create account); Create account opens the sign-up form. Once signed in it returns to where you were. `tests/reading-signed-out.test.tsx`
- [x] Signed out, the app uses an empty local database that refuses writes (the safety net behind the prompts), so no one's notes show and nothing is saved where it would be lost; draft recovery waits for an account. Signing out of an account goes back to reading. `tests/reading-signed-out.test.tsx`, `tests/account-ui.test.tsx`
- [x] Sign in with email and password; a wrong password is explained plainly. `tests/account-ui.test.tsx`
- [x] Create an account (password of at least 8 characters); if the project asks for email confirmation, "Check your email" says where the link went. `tests/account-ui.test.tsx`
- [x] Forgot password: a reset link by email; following it asks for a new password. `tests/account-ui.test.tsx` (reset email)
- [x] Google: shown only when switched on for the project. `tests/account-ui.test.tsx`
- [x] Once signed in on a device, the app opens offline too, even when the session can't be refreshed. `tests/account-ui.test.tsx`
- [x] Each account has its own database on a device, so two people on one computer never see each other's notes. `tests/account-ui.test.tsx`
- [x] Notes written before accounts: the first account to sign in on a device takes them over and uploads them; the old database is left as a backup. `tests/account-ui.test.tsx`
- [x] Settings → Account: who's signed in, sync status, Sync now, Sign out. Signing out syncs first; if something still hasn't reached the account (offline, or a choice not yet made), it says how many changes would be lost and asks. Signing out removes this device's copy. `tests/account-ui.test.tsx`
- [x] Each person sees and changes only their own items (row-level security); items are never deleted on the server, only marked deleted, so deletions reach every device. `supabase/migrations/0001_study_items.sql`

## 2. Sync

- [x] Everything is saved on the device first; every change marks the item for upload automatically. `tests/sync.test.ts`
- [x] A note written offline reaches the other device once back online, and isn't sent back. `tests/sync.test.ts`
- [x] Edits and deletions travel both ways; word highlights too; a blank note that had synced is marked deleted rather than vanishing. `tests/sync.test.ts`
- [x] A change made while uploading is uploaded next time; a large backlog arrives in pages. `tests/sync.test.ts`
- [x] Only the item itself is uploaded, never this device's sync bookkeeping. `tests/sync.test.ts`
- [x] When it syncs: on opening, a moment after any change (including further typing in a note waiting to sync), when the connection comes back, when the app comes back into view, straight away when another device changes something (Supabase Realtime), and every minute.
- [x] The sidebar shows Synced / Syncing… / Offline · N changes saved on this device / Couldn't sync (Retry).

## 3. Changed on two devices

- [x] Notes, questions and journal entries changed on both: the person is asked straight away, with both copies side by side ("On this device", "On your other device"), and chooses: keep this device's, keep the other device's, or keep both. Until then nothing is overwritten and the item isn't uploaded; "Later" leaves it waiting, shown in the sidebar. `tests/sync.test.ts`, `tests/account-ui.test.tsx`
- [x] Identical changes on both devices aren't a conflict. `tests/sync.test.ts`
- [x] Highlights and links (nothing written to lose): the newer change wins, without asking. `tests/sync.test.ts`

## 4. Two real devices

- [x] `e2e/sync.spec.ts` against the real project (runs when `SUPABASE_ACCESS_TOKEN` is set; makes and then deletes a throwaway account): a note written offline on one device appears on the other; editing it on both while offline asks on the second, and "Keep both" leaves both notes on both devices.

## 5. Other browser tests

- [x] Every other browser test runs signed in as a test account that exists only in the page, with all requests to Supabase blocked, so they never touch the real project. `e2e/fixtures.ts`
- Note: on a machine short of memory, run them with fewer workers (`npx playwright test --workers=2`).

## 6. Hand checks

- [ ] Create an account, confirm the email, sign in on a second device or browser, and watch a note appear.
- [ ] Turn off Wi-Fi, write, turn it back on.
- [ ] Edit the same note on both while one is offline; choose in the dialog.
- [ ] Google sign-in, if switched on.
- [ ] On a phone: the sign-in page and the conflict dialog.
