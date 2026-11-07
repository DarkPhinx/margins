/**
 * In-memory ESV cache, least recently used first, counted in unique verses.
 *
 * Rules: at most 500 verses in all; at most half of any one book; entries
 * expire after 30 days; a passage too big to store is refused.
 */

import type { BookId } from '../bible/books';
import { parseVerseId } from '../bible/verseId';
import type { ChapterDoc, VerseId, VerseRange } from '../bible/types';
import { bookVerseLimit, versesOf } from './paging';

export interface CachePolicy {
  maxVerses: number;
  maxBookFraction: number;
  ttlDays: number;
}

export const DEFAULT_CACHE_POLICY: CachePolicy = { maxVerses: 500, maxBookFraction: 0.5, ttlDays: 30 };

interface Entry {
  range: VerseRange;
  book: BookId;
  verses: VerseId[];
  doc: ChapterDoc;
  storedAt: number;
}

export interface EsvCacheOptions {
  policy?: CachePolicy;
  now?: () => number;
  bookLimit?: (book: BookId) => number;
}

const key = (r: VerseRange): string => `${r.start}-${r.end}`;

export class EsvCache {
  private readonly map = new Map<string, Entry>();
  private readonly policy: CachePolicy;
  private readonly now: () => number;
  private readonly bookLimit: (book: BookId) => number;

  constructor(options: EsvCacheOptions = {}) {
    this.policy = options.policy ?? DEFAULT_CACHE_POLICY;
    this.now = options.now ?? (() => Date.now());
    this.bookLimit = options.bookLimit ?? ((b) => bookVerseLimit(b, this.policy.maxBookFraction));
  }

  get(range: VerseRange): ChapterDoc | undefined {
    this.expire();
    const k = key(range);
    const entry = this.map.get(k);
    if (!entry) return undefined;
    this.map.delete(k);
    this.map.set(k, entry);
    return entry.doc;
  }

  /** Stores a passage, evicting the oldest as needed. */
  put(range: VerseRange, doc: ChapterDoc): 'stored' | 'refused' {
    this.expire();
    const verses = versesOf(range);
    const book = parseVerseId(range.start).book;
    if (verses.length > this.policy.maxVerses || verses.length > this.bookLimit(book)) return 'refused';

    const k = key(range);
    this.map.delete(k);
    this.map.set(k, { range, book, verses, doc, storedAt: this.now() });

    while (this.bookVerseCount(book) > this.bookLimit(book)) {
      this.evictOldest((e) => e.book === book && key(e.range) !== k);
    }
    while (this.verseCount() > this.policy.maxVerses) {
      this.evictOldest((e) => key(e.range) !== k);
    }
    return 'stored';
  }

  verseCount(): number {
    return this.unique([...this.map.values()]);
  }

  bookVerseCount(book: BookId): number {
    return this.unique([...this.map.values()].filter((e) => e.book === book));
  }

  /** Cached ranges, oldest first. */
  ranges(): VerseRange[] {
    return [...this.map.values()].map((e) => e.range);
  }

  clear(): void {
    this.map.clear();
  }

  private unique(entries: Entry[]): number {
    const set = new Set<VerseId>();
    for (const e of entries) for (const v of e.verses) set.add(v);
    return set.size;
  }

  private evictOldest(match: (e: Entry) => boolean): void {
    for (const [k, e] of this.map) {
      if (match(e)) {
        this.map.delete(k);
        return;
      }
    }
    throw new Error('ESV cache could not evict to meet its limits');
  }

  private expire(): void {
    const cutoff = this.now() - this.policy.ttlDays * 86_400_000;
    for (const [k, e] of this.map) if (e.storedAt < cutoff) this.map.delete(k);
  }
}
