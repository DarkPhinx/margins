import { defineConfig } from '@playwright/test';

/**
 * The Windows app's tests (Phase 6): Electron itself, run against
 * `npm run build:desktop` (`npm run test:desktop` builds it first).
 */
export default defineConfig({
  testDir: 'e2e-desktop',
  timeout: 90_000,
  // One program at a time: each opens a real window.
  workers: 1,
});
