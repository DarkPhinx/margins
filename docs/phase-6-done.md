# Phase 6 — "Done" checklist

Sign-off for Phase 6, the Windows App. A box is ticked only when it has been checked; automated items name the test that proves them. Run everything with:

```
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
npm run test:desktop                      # builds the Windows app, then drives it with Playwright
npm run dist:win && npm run test:installer  # builds the installer, installs it, tests it, uninstalls it
```

Plan's "done when": the installer works on a clean Windows machine and matches the web app.

Decisions (Nov 2026): Electron 45 with electron-builder; an NSIS installer for the current Windows user (no administrator needed) that lets you choose the folder; the program is built from the same code as the web app (`vite build --mode desktop`), with everything inside it, word data included, so it needs no service worker and works offline from the first launch.

## 0. Setting up (owner)

1. `npm run supabase:setup` once more: it now also allows `margins://app` as a place sign-in may return to (Google, confirmation and password-reset emails opened from the Windows app).
2. Not yet signed: Windows SmartScreen will warn ("Windows protected your PC" → More info → Run anyway) until the installer is signed with a code-signing certificate. Before handing it to anyone else, get a certificate and set `CSC_LINK` / `CSC_KEY_PASSWORD` for electron-builder.

- [ ] Step 1 done; it prints `margins://app` among the allowed addresses.

## 1. The program

- [x] Its own window titled Margins, no menu bar, opening on the Bible (signed out) and remembering its size and place. `e2e-desktop/desktop.spec.ts`
- [x] Dark mode and text size (Settings → This device) apply in the program and are kept between launches; the window's background follows Windows' dark setting until the page draws. `e2e-desktop/desktop.spec.ts`
- [x] One copy at a time: opening it again comes back to the open window. `e2e-desktop/desktop.spec.ts`
- [x] The app is served from its own address, `margins://app`, out of the files inside the program: page addresses open the app; a missing file is a 404; nothing outside the program's folder can be read. `tests/desktop-paths.test.ts`, `e2e-desktop/desktop.spec.ts`
- [x] Outside links (credits, links in notes, Google sign-in) open in the person's own browser, never in the window; the window can't be sent to another site. `tests/desktop-paths.test.ts`, `e2e-desktop/desktop.spec.ts`
- Nothing the app does needs the camera, microphone or location: every such request is refused (`electron/main.ts`).

## 2. Full offline use

- [x] Both Bibles, cross-references and all Original language word data are inside the program: with every internet request refused from the very first launch, BSB and KJV read (Psalm 119 in both), cross-references show, and word pages and verse-by-verse pages open (John 3:16 "loved", Genesis 1:1). No request leaves the computer. `e2e-desktop/desktop.spec.ts`
- [x] Settings says "Ready to read offline." straight away; there's no service worker and nothing to download. `e2e-desktop/desktop.spec.ts`
- [x] Notes are kept between launches, in the program's own profile (under `%APPDATA%`). `e2e-desktop/desktop.spec.ts`

## 3. Matches the web app

- [x] Same code and same features: the desktop build is the web app built with `--mode desktop` (the only differences: no service worker, and offline is ready at once). Every web test still passes.
- [x] Signing in works from the program's own address, and a note written in one copy reaches another through the real account (Realtime). `e2e-desktop/sync.spec.ts` (runs when `SUPABASE_ACCESS_TOKEN` is set; makes and deletes a throwaway account)
- [x] Sign-in links come back to the program: `margins://app/…` is registered with Windows, so a confirmation or password-reset email, or Google after signing in in the browser, opens Margins at the sign-in page and finishes there; if Margins is already open, the link goes to that window. `e2e-desktop/desktop.spec.ts` (link handling), `scripts/test-installer.ts` (registration)
- [x] Half-written notes stay on the device (web app and Windows app alike, same code): a note being typed in uploads only once typing pauses for about two seconds, or when it's closed (or the app is hidden); a brand-new note, question or journal entry uploads only once it has some text (or a journal title). `tests/sync.test.ts` ("half-written notes stay on the device")
- Note: a copy started with `npm run desktop` (not installed) leaves the registry alone, so links from emails and Google only come back to an installed copy.

## 4. The installer

- [x] `npm run dist:win` makes `release/Margins-Setup-<version>.exe` (about 130 MB): the program, both Bibles and the word data, no development files.
- [x] `npm run test:installer` installs it silently for this Windows user into a temporary folder, checks the desktop and Start menu shortcuts and the `margins://` registration, runs `e2e-desktop/desktop.spec.ts` against the installed `Margins.exe`, then uninstalls and checks the program, shortcuts and registration are gone. It refuses to run if Margins is already installed. `scripts/test-installer.ts`
- Uninstalling leaves the person's profile (their notes) in place, so reinstalling finds them (`deleteAppDataOnUninstall: false`).

## 5. Hand checks

- [ ] On a clean Windows machine (or a fresh Windows Sandbox): run the installer, choose a folder, start Margins from the desktop icon.
- [ ] With Wi-Fi off from the start: read both Bibles, open a cross-reference, look up a word.
- [ ] Sign in with email; write a note; see it in the web app in a browser.
- [ ] Google sign-in: the browser opens, then "Open Margins?" brings you back signed in.
- [ ] Forgot password from the program: the email's link opens Margins and asks for a new password.
- [ ] The usual keys: copy and paste, zoom (Ctrl +/−/0), full screen (F11). Right-click in a note: Cut / Copy / Paste / Select all and spelling suggestions; on selected Bible text: Copy.
- [ ] Move the window to a second monitor, close it, unplug the monitor, start Margins: it opens on the remaining screen.
- [ ] Uninstall from Settings → Apps; reinstall and sign in: the notes are there.
