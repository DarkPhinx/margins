/**
 * Invented placeholder passages for ESV tests. This is NOT ESV text and must
 * never be replaced with real ESV wording. Lives under tests/, so it is never
 * part of the app bundle.
 */
import type { EsvPassageRequest, EsvPassageResponse } from '../../shared/esv-contract';
import { parseVerseId } from '../../src/bible/verseId';
import type { EsvTransport } from '../../src/esv/transport';

export function placeholderPassage({ start, end }: EsvPassageRequest): EsvPassageResponse {
  const a = parseVerseId(start);
  const b = parseVerseId(end);
  const parts: string[] = [];
  for (let v = a.verse; v <= b.verse; v++) parts.push(`[${v}] Placeholder line ${v} for testing.`);
  return { canonical: `${a.book} ${a.chapter}:${a.verse}-${b.verse}`, text: parts.join(' ') };
}

export function placeholderTransport(): EsvTransport & { calls: EsvPassageRequest[] } {
  const calls: EsvPassageRequest[] = [];
  return {
    calls,
    async fetchPassage(request) {
      calls.push(request);
      return placeholderPassage(request);
    },
  };
}

export const PLACEHOLDER_NOTICE = 'Placeholder copyright notice for tests only.';
