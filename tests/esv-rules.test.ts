import { describe, expect, it } from 'vitest';
import { CROSSWAY_LIMITS, RateLimiter, retryAfterMs } from '../shared/esv-limits';
import { makeVerseId } from '../src/bible/verseId';
import type { ChapterDoc } from '../src/bible/types';
import { EsvCache } from '../src/esv/cache';
import { bookVerseLimit, esvPageFor, maxVersesPerPage, versesOf } from '../src/esv/paging';
import { esvTextToDoc } from '../src/esv/parse';

const doc = (book: ChapterDoc['book'] = 'JHN', chapter = 1): ChapterDoc => ({
  translation: 'esv', book, chapter, verses: [], blocks: [], notes: [],
});
const range = (book: ChapterDoc['book'], chapter: number, a: number, b: number) => ({
  start: makeVerseId(book, chapter, a),
  end: makeVerseId(book, chapter, b),
});

describe('ESV half-book limits', () => {
  it('rounds half a book down, using the smaller verse count', () => {
    expect(bookVerseLimit('2JN')).toBe(6);
    expect(bookVerseLimit('3JN')).toBe(7);
    expect(bookVerseLimit('JUD')).toBe(12);
    expect(bookVerseLimit('PHM')).toBe(12);
    expect(bookVerseLimit('OBA')).toBe(10);
    expect(bookVerseLimit('HAG')).toBe(19);
    // Matthew: BSB omits 3 verses, so 1071 - 3 = 1068, half is 534; the 500 cap wins.
    expect(maxVersesPerPage('MAT')).toBe(500);
  });
});

describe('ESV paging', () => {
  it('splits the six chapters that are over half their book, and no others', () => {
    const split: string[] = [];
    const books = ['OBA', 'PHM', '2JN', '3JN', 'JUD', 'HAG', 'PSA', 'JHN', 'RUT'] as const;
    for (const book of books) {
      for (let c = 1; c <= (book === 'PSA' ? 150 : book === 'JHN' ? 21 : book === 'HAG' ? 2 : book === 'RUT' ? 4 : 1); c++) {
        if (esvPageFor(makeVerseId(book, c, 1)).total > 1) split.push(`${book} ${c}`);
      }
    }
    expect(split).toEqual(['OBA 1', 'PHM 1', '2JN 1', '3JN 1', 'JUD 1', 'HAG 2']);
  });

  it('keeps every page within the limit and covers every verse once', () => {
    for (const book of ['OBA', 'PHM', '2JN', '3JN', 'JUD', 'HAG'] as const) {
      const chapter = book === 'HAG' ? 2 : 1;
      const first = esvPageFor(makeVerseId(book, chapter, 1));
      const seen: number[] = [];
      for (let i = 0, p = first; i < first.total; i++) {
        expect(versesOf(p.range).length).toBeLessThanOrEqual(bookVerseLimit(book));
        expect(p.index).toBe(i);
        seen.push(...versesOf(p.range));
        if (i < first.total - 1) p = esvPageFor(p.range.end + 1);
      }
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen.at(-1)).toBe(first.range.start + seen.length - 1);
    }
  });

  it('gives 2 John three pages of at most 6 verses', () => {
    const pages = [1, 6, 11].map((v) => esvPageFor(makeVerseId('2JN', 1, v)));
    expect(pages.map((p) => [p.range.start % 1000, p.range.end % 1000])).toEqual([[1, 5], [6, 10], [11, 13]]);
    expect(pages.every((p) => p.total === 3)).toBe(true);
  });

  it('turns edge-function text into a chapter document', () => {
    const d = esvTextToDoc('[1] One line.\n\n[2] Two. [3] Three.', '2JN', 1);
    expect(d.verses).toEqual([1, 2, 3]);
    expect(d.blocks).toHaveLength(2);
  });
});

describe('ESV cache', () => {
  it('never holds more than half of 2 John (6 verses), evicting the oldest page', () => {
    const cache = new EsvCache();
    expect(cache.put(range('2JN', 1, 1, 5), doc('2JN'))).toBe('stored');
    expect(cache.put(range('2JN', 1, 6, 10), doc('2JN'))).toBe('stored');
    expect(cache.bookVerseCount('2JN')).toBe(5);
    expect(cache.ranges()).toEqual([range('2JN', 1, 6, 10)]);
  });

  it('refuses a passage bigger than the book limit', () => {
    const cache = new EsvCache();
    expect(cache.put(range('2JN', 1, 1, 7), doc('2JN'))).toBe('refused');
    expect(cache.verseCount()).toBe(0);
  });

  it('refuses a passage over 500 verses', () => {
    const cache = new EsvCache({ bookLimit: () => 10_000 });
    expect(cache.put({ start: makeVerseId('PSA', 1, 1), end: makeVerseId('PSA', 40, 1) }, doc('PSA'))).toBe('refused');
  });

  it('never holds more than 500 verses in all, evicting least recently used', () => {
    const cache = new EsvCache();
    // Psalms 119 (176), Isaiah 1–4 and other long chapters from different books.
    const ranges = [
      range('PSA', 119, 1, 176),
      range('NUM', 7, 1, 89),
      range('1CH', 6, 1, 81),
      range('LUK', 1, 1, 80),
      range('MAT', 26, 1, 75),
    ];
    for (const r of ranges) cache.put(r, doc());
    expect(cache.verseCount()).toBeLessThanOrEqual(500);
    // 176+89+81+80 = 426; adding 75 makes 501, so Psalm 119 (oldest) goes.
    expect(cache.ranges()).not.toContainEqual(ranges[0]);
    expect(cache.verseCount()).toBe(325);
  });

  it('refreshes an entry when read, so it is evicted last', () => {
    const cache = new EsvCache();
    const a = range('PSA', 119, 1, 176);
    const b = range('NUM', 7, 1, 89);
    cache.put(a, doc());
    cache.put(b, doc());
    cache.put(range('1CH', 6, 1, 81), doc());
    cache.get(a);
    cache.put(range('LUK', 1, 1, 80), doc());
    cache.put(range('MAT', 26, 1, 75), doc());
    expect(cache.ranges()).toContainEqual(a);
    expect(cache.ranges()).not.toContainEqual(b);
  });

  it('counts overlapping passages once', () => {
    const cache = new EsvCache();
    cache.put(range('JHN', 3, 1, 20), doc());
    cache.put(range('JHN', 3, 11, 30), doc());
    expect(cache.verseCount()).toBe(30);
  });

  it('expires entries after 30 days', () => {
    let now = 0;
    const cache = new EsvCache({ now: () => now });
    cache.put(range('JHN', 3, 1, 20), doc());
    now = 29 * 86_400_000;
    expect(cache.get(range('JHN', 3, 1, 20))).toBeDefined();
    now = 30 * 86_400_000 + 1;
    expect(cache.get(range('JHN', 3, 1, 20))).toBeUndefined();
    expect(cache.verseCount()).toBe(0);
  });
});

describe('Crossway rate limits', () => {
  it('matches Crossway’s published limits', () => {
    expect(CROSSWAY_LIMITS.map((l) => [l.windowMs, l.max])).toEqual([
      [60_000, 60],
      [3_600_000, 1000],
      [86_400_000, 5000],
    ]);
  });

  it('allows 60 a minute, then waits for the oldest to age out', () => {
    let now = 1_000_000;
    const limiter = new RateLimiter({ now: () => now });
    for (let i = 0; i < 60; i++) {
      expect(limiter.tryAcquire().ok).toBe(true);
      now += 100;
    }
    const blocked = limiter.tryAcquire();
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterMs).toBe(60_000 - 6_000);
    now += 60_000;
    expect(limiter.tryAcquire().ok).toBe(true);
  });

  it('enforces the hourly and daily limits', () => {
    let now = 0;
    const limiter = new RateLimiter({ now: () => now });
    for (let i = 0; i < 1000; i++) {
      expect(limiter.tryAcquire().ok).toBe(true);
      now += 1_100; // under 60 a minute
    }
    expect(limiter.tryAcquire().ok).toBe(false);

    let t = 0;
    const daily = new RateLimiter({ now: () => t });
    for (let i = 0; i < 5000; i++) {
      expect(daily.tryAcquire().ok).toBe(true);
      t += 4_000; // under 1000 an hour
    }
    expect(daily.tryAcquire().ok).toBe(false);
  });

  it('honours a block after a 429', () => {
    let now = 0;
    const limiter = new RateLimiter({ now: () => now });
    limiter.blockFor(30_000);
    expect(limiter.tryAcquire()).toEqual({ ok: false, retryAfterMs: 30_000 });
    now = 30_000;
    expect(limiter.tryAcquire().ok).toBe(true);
  });

  it('reads Retry-After in seconds or as a date', () => {
    expect(retryAfterMs('120')).toBe(120_000);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 0)).toBe(10_000);
    expect(retryAfterMs(null)).toBe(60_000);
  });
});
