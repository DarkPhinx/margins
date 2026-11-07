import { MAX_VERSES_PER_QUERY, RateLimiter } from '../../shared/esv-limits';
import { parseVerseId } from '../bible/verseId';
import type {
  FallbackReason,
  PageRef,
  ReadResult,
  TranslationMeta,
  TranslationProvider,
} from '../bible/types';
import { EsvCache } from './cache';
import { ESV_COPYRIGHT_NOTICE, ESV_LINK } from './notice';
import { esvPageFor, maxVersesPerPage, versesOf } from './paging';
import { esvTextToDoc } from './parse';
import { EsvHttpError, type EsvTransport } from './transport';

export const FALLBACK_NOTICES: Record<FallbackReason, string> = {
  offline: 'The ESV needs a connection, so this is the BSB for now.',
  'rate-limited': 'The ESV is busy right now, so this is the BSB. Try again in a few minutes.',
  'over-limit': 'This passage is longer than the ESV can show on one page, so this is the BSB.',
};

export interface EsvProviderOptions {
  transport: EsvTransport;
  fallback: TranslationProvider;
  cache?: EsvCache;
  limiter?: RateLimiter;
  online?: () => boolean;
  notice?: string | null;
}

export function esvMeta(notice: string | null = ESV_COPYRIGHT_NOTICE): TranslationMeta {
  if (!notice) throw new Error('The ESV cannot be shown without its copyright notice');
  return { id: 'esv', name: 'English Standard Version', abbreviation: 'ESV', source: 'remote', notice, noticeUrl: ESV_LINK };
}

export function createEsvProvider(options: EsvProviderOptions): TranslationProvider {
  const cache = options.cache ?? new EsvCache();
  const limiter = options.limiter ?? new RateLimiter();
  const online = options.online ?? (() => navigator.onLine);
  const meta = esvMeta(options.notice === undefined ? ESV_COPYRIGHT_NOTICE : options.notice);

  const fallback = async (page: PageRef, reason: FallbackReason): Promise<ReadResult> => {
    const bsbPage = options.fallback.pageFor(page.range.start);
    const result = await options.fallback.read(bsbPage);
    return { status: 'fallback', doc: result.doc, page: bsbPage, reason, notice: FALLBACK_NOTICES[reason] };
  };

  return {
    meta,
    pageFor: esvPageFor,
    async read(page) {
      const { book, chapter } = parseVerseId(page.range.start);
      const count = versesOf(page.range).length;
      if (count > MAX_VERSES_PER_QUERY || count > maxVersesPerPage(book)) return fallback(page, 'over-limit');

      const cached = cache.get(page.range);
      if (cached) return { status: 'ok', doc: cached, page };
      if (!online()) return fallback(page, 'offline');
      if (!limiter.tryAcquire().ok) return fallback(page, 'rate-limited');

      try {
        const res = await options.transport.fetchPassage({ start: page.range.start, end: page.range.end });
        const doc = esvTextToDoc(res.text, book, chapter);
        cache.put(page.range, doc);
        return { status: 'ok', doc, page };
      } catch (error) {
        if (error instanceof EsvHttpError && error.status === 429) {
          limiter.blockFor(error.retryAfterMs);
          return fallback(page, 'rate-limited');
        }
        if (error instanceof EsvHttpError && error.status === 413) return fallback(page, 'over-limit');
        return fallback(page, 'offline');
      }
    },
  };
}
