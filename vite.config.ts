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

  return {
    plugins: [react(), tailwindcss(), VitePWA(pwaOptions)],
    define: {
      __ESV_ENABLED__: JSON.stringify(mode === 'test' ? false : esvEnabled),
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}'],
      testTimeout: 30_000,
    },
  };
});
