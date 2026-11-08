/**
 * Cross-references, from OpenBible.info (CC BY, ranked by readers' votes) and
 * the Treasury of Scripture Knowledge (public domain). Bundled per book in
 * public/xrefs and cached for offline use.
 */

import type { BookId } from '../bible/books';
import { parseVerseId } from '../bible/verseId';
import type { VerseRange } from '../bible/types';

export const XREF_CREDIT =
  'Cross-references from OpenBible.info (CC BY) and the Treasury of Scripture Knowledge (public domain).';

/** How many to show before "Show all". */
export const XREF_TOP = 10;

export interface CrossReference {
  range: VerseRange;
  /** Readers' votes on OpenBible.info (summed over a passage); null when only the TSK has it. */
  votes: number | null;
}

type BookXrefs = Record<string, [number, number, number][]>;

const books = new Map<BookId, Promise<BookXrefs>>();

function loadBook(book: BookId): Promise<BookXrefs> {
  let p = books.get(book);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}xrefs/${book}.json`).then((r) => {
      if (!r.ok) throw new Error(`Cross-references for ${book} couldn't load (${r.status})`);
      return r.json() as Promise<BookXrefs>;
    });
    p.catch(() => books.delete(book));
    books.set(book, p);
  }
  return p;
}

/**
 * Cross-references for a verse or a passage. For a passage, each verse's
 * references are merged: one target named by several verses counts once with
 * their votes added, and targets inside the passage itself are left out.
 * Ranked by votes; references without votes follow in their source order.
 */
export async function crossReferences(range: VerseRange): Promise<CrossReference[]> {
  const { book } = parseVerseId(range.start);
  const data = await loadBook(book);
  const merged = new Map<string, { ref: CrossReference; order: number }>();
  let order = 0;
  for (let id = range.start; id <= range.end; id++) {
    const list = data[String(id % 1_000_000)];
    if (!list) continue;
    for (const [start, end, votes] of list) {
      if (start >= range.start && end <= range.end) continue;
      const key = `${start}-${end}`;
      const existing = merged.get(key);
      const v = votes >= 0 ? votes : null;
      if (existing) {
        if (v !== null) existing.ref.votes = (existing.ref.votes ?? 0) + v;
      } else {
        merged.set(key, { ref: { range: { start, end }, votes: v }, order: order++ });
      }
    }
  }
  return [...merged.values()]
    .sort((a, b) => (b.ref.votes ?? 0) - (a.ref.votes ?? 0) || a.order - b.order)
    .map((x) => x.ref);
}
