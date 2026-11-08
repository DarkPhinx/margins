import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkEsvGate } from '../build/esv-gate';
import { NEVER_CACHE, pwaOptions, WORD_DATA } from '../build/pwa';
import { ESV_COPYRIGHT_NOTICE } from '../src/esv/notice';

describe('ESV feature flag gate', () => {
  it('blocks turning the flag on while the ESV copyright notice is missing', () => {
    // This uses the real notice. It stays failing-closed until the exact Crossway wording is added.
    if (!ESV_COPYRIGHT_NOTICE) {
      expect(() => checkEsvGate({ flag: '1', notice: ESV_COPYRIGHT_NOTICE, env: {} })).toThrow(/copyright notice is missing/);
    }
    expect(() => checkEsvGate({ flag: 'true', notice: '   ', env: {} })).toThrow(/copyright notice is missing/);
  });

  it('allows the flag on once a notice exists', () => {
    expect(checkEsvGate({ flag: '1', notice: 'Notice text', env: {} })).toBe(true);
  });

  it('is off by default', () => {
    expect(checkEsvGate({ flag: undefined, notice: null, env: {} })).toBe(false);
    expect(checkEsvGate({ flag: '0', notice: null, env: {} })).toBe(false);
  });

  it('refuses any ESV key exposed to the browser through a VITE_ variable', () => {
    expect(() => checkEsvGate({ flag: undefined, notice: null, env: { VITE_ESV_API_KEY: 'x' } })).toThrow(/VITE_ prefix/);
    expect(() => checkEsvGate({ flag: undefined, notice: null, env: { VITE_CROSSWAY_TOKEN: 'x' } })).toThrow();
    expect(checkEsvGate({ flag: undefined, notice: null, env: { ESV_API_KEY: 'x', VITE_SUPABASE_URL: 'u' } })).toBe(false);
  });
});

describe('service worker never caches ESV requests', () => {
  const esvUrls = [
    'https://api.esv.org/v3/passage/text/?q=John+3',
    'https://example.supabase.co/functions/v1/esv',
    '/esv/JHN/3',
  ];

  it('excludes ESV URLs from navigation fallback and runtime caching', () => {
    for (const url of esvUrls) expect(NEVER_CACHE.some((re) => re.test(url))).toBe(true);
    expect(pwaOptions.workbox?.navigateFallbackDenylist).toBe(NEVER_CACHE);
    // The only runtime cache is the original-language word data, and no ESV address can match it.
    const runtime = pwaOptions.workbox?.runtimeCaching ?? [];
    expect(runtime).toHaveLength(1);
    expect(runtime[0]!.urlPattern).toBe(WORD_DATA);
    for (const url of esvUrls) expect(WORD_DATA.test(url)).toBe(false);
    expect(WORD_DATA.test('/words/lex/G00.json?v=abc123')).toBe(true);
    expect(pwaOptions.workbox?.globIgnores).toContain('**/*esv*');
  });

  it('does not exclude the bundled Bibles', () => {
    for (const url of ['/bibles/bsb/JHN.json', '/bibles/kjv/REV.json', '/']) {
      expect(NEVER_CACHE.some((re) => re.test(url))).toBe(false);
    }
  });

  const dist = join(__dirname, '..', 'dist');
  const built = (() => {
    try {
      return statSync(join(dist, 'sw.js')).isFile();
    } catch {
      return false;
    }
  })();

  it.runIf(built)('the built service worker precaches nothing ESV and the app has no ESV code', () => {
    const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
    const precached = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]!);
    expect(precached.length).toBeGreaterThan(132);
    expect(precached.filter((u) => /esv/i.test(u))).toEqual([]);
    expect(precached.filter((u) => u.startsWith('bibles/'))).toHaveLength(132);
    // Only the navigation route is registered; it carries the ESV deny list.
    // The navigation route (with the ESV deny list) and the word-data cache.
    expect(sw.match(/registerRoute\(/g)).toHaveLength(2);
    expect(sw).toContain('margins-words');
    expect(precached.filter((u) => u.startsWith('words/'))).toEqual([]);
    expect(sw).toMatch(/denylist:\[\/api\\\\?\.esv\\\\?\.org\/i/);
    const files = readdirSync(join(dist, 'assets')).filter((f) => /\.(js|css)$/.test(f));
    for (const f of files) {
      const text = readFileSync(join(dist, 'assets', f), 'utf8');
      expect(text, f).not.toMatch(/\bESV\b|Crossway|api\.esv\.org|English Standard Version/);
    }
  });
});
