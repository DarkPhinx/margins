# margins

A user-led Bible study desk. See [plan.md](plan.md) for the project plan and [docs/phase-1-done.md](docs/phase-1-done.md) for the Phase 1 checklist.

## Commands

```
npm install
npm run dev        # builds the Bibles if needed, then starts Vite
npm test           # unit and component tests (Vitest)
npm run build      # type-check and production build with the service worker
npm run test:e2e   # offline tests against the production build (Playwright; run `npx playwright install chromium` once)
npm run lint

npm run desktop        # the Windows app (Electron), built from the same code
npm run test:desktop   # drives the Windows app with Playwright
npm run dist:win       # release/Margins-Setup-<version>.exe
npm run test:installer # installs it, tests it, uninstalls it
```

## Bible data

The BSB and KJV are built from the pinned archives in `data/sources/` (URLs and SHA-256 checksums are in `SOURCES.json`). `npm run data` (run automatically before `dev`, `build` and `test`) checks the checksums, parses the USFM, validates the result and writes `public/bibles/<translation>/<BOOK>.json` and `src/generated/`. Both outputs are generated and not committed. Add `-- --force` to rebuild when nothing has changed.

## ESV

The ESV is behind the `MARGINS_ESV` build flag and is off. The build refuses to turn it on until the Crossway copyright notice is in `src/esv/notice.ts`. The API key will live only in the Supabase edge function, never in a `VITE_` variable (the build refuses one).
