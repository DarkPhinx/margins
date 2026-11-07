import type { VitePWAOptions } from 'vite-plugin-pwa';

/** Requests that must never be cached by the service worker. */
export const NEVER_CACHE: RegExp[] = [/api\.esv\.org/i, /\/functions\/v1\/esv/i, /\besv\b/i];

/** Service worker setup. The app shell and both bundled Bibles are precached. */
export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  injectRegister: false,
  manifest: {
    name: 'Margins',
    short_name: 'Margins',
    description: 'A user-led Bible study desk.',
    theme_color: '#f7f4ee',
    background_color: '#f7f4ee',
    display: 'standalone',
    start_url: '/',
    icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,woff2}', 'bibles/**/*.json'],
    globIgnores: ['**/*esv*'],
    // Psalms is the largest book file.
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    navigateFallback: 'index.html',
    navigateFallbackDenylist: NEVER_CACHE,
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    skipWaiting: true,
    runtimeCaching: [],
  },
};
