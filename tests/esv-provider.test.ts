import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../shared/esv-limits';
import { makeVerseId } from '../src/bible/verseId';
import { EsvCache } from '../src/esv/cache';
import { createEsvProvider, FALLBACK_NOTICES, esvMeta } from '../src/esv/provider';
import { EsvHttpError, type EsvTransport } from '../src/esv/transport';
import { createBundledProvider } from '../src/translations/bundled';
import { BSB_META } from '../src/translations/meta';
import { PLACEHOLDER_NOTICE, placeholderTransport } from './fixtures/esv-placeholder';
import { loadBook } from './helpers';

const bsb = createBundledProvider(BSB_META, async (_t, book) => loadBook('bsb', book));

function setup(overrides: { transport?: EsvTransport; online?: boolean; limiter?: RateLimiter } = {}) {
  const transport = overrides.transport ?? placeholderTransport();
  const online = { value: overrides.online ?? true };
  const provider = createEsvProvider({
    transport,
    fallback: bsb,
    cache: new EsvCache(),
    limiter: overrides.limiter ?? new RateLimiter(),
    online: () => online.value,
    notice: PLACEHOLDER_NOTICE,
  });
  return { provider, transport, online };
}

describe('ESV provider (placeholder data only)', () => {
  it('cannot be created without a copyright notice', () => {
    expect(() => esvMeta(null)).toThrow(/copyright notice/);
    expect(() => createEsvProvider({ transport: placeholderTransport(), fallback: bsb, notice: null })).toThrow();
  });

  it('reads a page, then serves it from the cache', async () => {
    const { provider, transport } = setup();
    const page = provider.pageFor(makeVerseId('JHN', 3, 16));
    const first = await provider.read(page);
    expect(first.status).toBe('ok');
    expect(first.doc.translation).toBe('esv');
    expect(first.doc.verses).toHaveLength(36);
    await provider.read(page);
    expect((transport as ReturnType<typeof placeholderTransport>).calls).toHaveLength(1);
  });

  it('falls back to the BSB with a notice when offline', async () => {
    const { provider, online } = setup();
    online.value = false;
    const result = await provider.read(provider.pageFor(makeVerseId('JHN', 3, 16)));
    expect(result).toMatchObject({ status: 'fallback', reason: 'offline', notice: FALLBACK_NOTICES.offline });
    expect(result.doc.translation).toBe('bsb');
    expect(result.doc.chapter).toBe(3);
  });

  it('still serves cached pages when offline', async () => {
    const { provider, online } = setup();
    const page = provider.pageFor(makeVerseId('JHN', 3, 1));
    await provider.read(page);
    online.value = false;
    expect((await provider.read(page)).status).toBe('ok');
  });

  it('falls back when the browser limiter says no', async () => {
    let now = 0;
    const limiter = new RateLimiter({ now: () => now, limits: [{ windowMs: 60_000, max: 1 }] });
    const { provider } = setup({ limiter });
    expect((await provider.read(provider.pageFor(makeVerseId('JHN', 1, 1)))).status).toBe('ok');
    const second = await provider.read(provider.pageFor(makeVerseId('JHN', 2, 1)));
    expect(second).toMatchObject({ status: 'fallback', reason: 'rate-limited' });
    now = 60_001;
    expect((await provider.read(provider.pageFor(makeVerseId('JHN', 2, 1)))).status).toBe('ok');
  });

  it('backs off after a 429 from the edge function', async () => {
    let now = 0;
    let calls = 0;
    const transport: EsvTransport = {
      async fetchPassage() {
        calls++;
        throw new EsvHttpError(429, 120_000);
      },
    };
    const { provider } = setup({ transport, limiter: new RateLimiter({ now: () => now }) });
    const page = provider.pageFor(makeVerseId('JHN', 1, 1));
    expect(await provider.read(page)).toMatchObject({ status: 'fallback', reason: 'rate-limited' });
    now = 60_000;
    expect(await provider.read(page)).toMatchObject({ status: 'fallback', reason: 'rate-limited' });
    expect(calls).toBe(1);
  });

  it('treats network errors as offline and 413 as over the limit', async () => {
    const net = setup({ transport: { fetchPassage: async () => Promise.reject(new TypeError('Failed to fetch')) } });
    expect(await net.provider.read(net.provider.pageFor(makeVerseId('JHN', 1, 1)))).toMatchObject({ reason: 'offline' });
    const big = setup({ transport: { fetchPassage: async () => Promise.reject(new EsvHttpError(413, 0)) } });
    expect(await big.provider.read(big.provider.pageFor(makeVerseId('JHN', 1, 1)))).toMatchObject({ reason: 'over-limit' });
  });

  it('refuses a page wider than the half-book limit without calling the network', async () => {
    const { provider, transport } = setup();
    const tooWide = { range: { start: makeVerseId('2JN', 1, 1), end: makeVerseId('2JN', 1, 13) }, index: 0, total: 1 };
    expect(await provider.read(tooWide)).toMatchObject({ status: 'fallback', reason: 'over-limit' });
    expect((transport as ReturnType<typeof placeholderTransport>).calls).toHaveLength(0);
  });

  it('pages 2 John and keeps no more than 6 of its verses', async () => {
    const cache = new EsvCache();
    const transport = placeholderTransport();
    const provider = createEsvProvider({ transport, fallback: bsb, cache, online: () => true, notice: PLACEHOLDER_NOTICE });
    for (const v of [1, 6, 11]) {
      const page = provider.pageFor(makeVerseId('2JN', 1, v));
      expect((await provider.read(page)).status).toBe('ok');
      expect(cache.bookVerseCount('2JN')).toBeLessThanOrEqual(6);
    }
    expect(transport.calls.map((c) => [c.start % 1000, c.end % 1000])).toEqual([[1, 5], [6, 10], [11, 13]]);
  });
});
