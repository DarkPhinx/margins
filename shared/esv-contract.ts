/**
 * Contract between the browser and the future Supabase edge function that
 * calls Crossway. Only the interface exists in Phase 1. The edge function holds
 * the key (a server secret, never a VITE_ variable) and applies the limits in
 * shared/esv-limits.ts for the whole key.
 */

export interface EsvPassageRequest {
  /** VerseIds, inclusive. At most MAX_VERSES_PER_QUERY verses. */
  start: number;
  end: number;
}

export interface EsvPassageResponse {
  canonical: string;
  /**
   * Passage text with verse numbers as [n] and paragraphs separated by blank
   * lines (Crossway's text endpoint without headings or footnotes).
   */
  text: string;
}

/** Error responses: 429 carries Retry-After; 413 means the passage is too long. */
export interface EsvErrorResponse {
  error: 'rate-limited' | 'too-long' | 'upstream';
  retryAfterSeconds?: number;
}
