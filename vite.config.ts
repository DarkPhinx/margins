/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { checkEsvGate } from './build/esv-gate.ts';
import { pwaOptions } from './build/pwa.ts';
import { ESV_COPYRIGHT_NOTICE } from './src/esv/notice.ts';

export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };
  const esvEnabled = checkEsvGate({
    flag: env.MARGINS_ESV,
    notice: ESV_COPYRIGHT_NOTICE,
    env,
  });

  // The Windows app (Phase 6) is built from the same code: its files are all
  // inside the program, so it needs no service worker.
  const desktop = mode === 'desktop';

  return {
    plugins: [react(), tailwindcss(), VitePWA({ ...pwaOptions, disable: desktop })],
    define: {
      __ESV_ENABLED__: JSON.stringify(mode === 'test' ? false : esvEnabled),
      __DESKTOP__: JSON.stringify(desktop),
    },
    build: desktop ? { outDir: 'dist-desktop' } : {},
    test: {
      environment: 'jsdom',
      setupFiles: ['tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}'],
      testTimeout: 30_000,
    },
  };
});
