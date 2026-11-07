import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { BookId } from '../bible/books';
import { journalPath } from '../home/paths';
import { Picker } from '../reader/Picker';
import { chapterTitle } from '../reader/nav';
import { getSettings } from '../settings';
import { JournalRow } from '../study/ItemCard';
import { chapterRange } from '../study/ranges';
import { createJournal, discardEmptyJournals, listByKind } from '../study/store';
import type { JournalItem } from '../study/types';

type Filter = 'all' | 'standalone' | 'chapter';

/**
 * Journal entries with the ways to start one: standalone, on the chapter you
 * were reading, or on any chapter. With `limit` it shows only the latest few
 * (for the home page) and links to the full list.
 */
export function JournalList({ limit }: { limit?: number }) {
  const navigate = useNavigate();
  const { last } = getSettings();
  const [filter, setFilter] = useState<Filter>('all');
  const [picking, setPicking] = useState(false);

  // Entries started but never written in are tidied away.
  useEffect(() => {
    void discardEmptyJournals();
  }, []);

  const entries = (useLiveQuery(() => listByKind('journal'), []) ?? [])
    .filter((e) => e.text.trim() || e.title.trim())
    .sort((a: JournalItem, b: JournalItem) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const filtered = entries.filter((e) =>
    filter === 'all' ? true : filter === 'standalone' ? e.anchors.length === 0 : e.anchors.length > 0,
  );
  const shown = limit ? filtered.slice(0, limit) : filtered;
  const standaloneCount = entries.filter((e) => e.anchors.length === 0).length;

  const startEntry = async (book?: BookId, chapter?: number) => {
    const entry = await createJournal(undefined, undefined, '', book && chapter ? [chapterRange(book, chapter)] : []);
    navigate(journalPath(entry.id, true));
  };
  const lastTitle = chapterTitle(last.book, last.chapter);

  return (
    <>
      <div className="list-actions">
        <button type="button" className="primary-btn" onClick={() => void startEntry()}>
          New entry
        </button>
        <button type="button" className="secondary-btn" onClick={() => void startEntry(last.book, last.chapter)}>
          New entry on {lastTitle}
        </button>
        <button type="button" className="secondary-btn" onClick={() => setPicking(true)}>
          On another chapter…
        </button>
      </div>

      {!limit && entries.length > 0 && (
        <div className="segmented" role="group" aria-label="Show entries">
          {(['all', 'standalone', 'chapter'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all'
                ? `All (${entries.length})`
                : f === 'standalone'
                  ? `Standalone (${standaloneCount})`
                  : `On a chapter (${entries.length - standaloneCount})`}
            </button>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="empty-text">
          Write about anything: a standalone entry, or one tied to a chapter you’re studying. References like Jn 3:16
          become links.
        </p>
      ) : shown.length === 0 ? (
        <p className="empty-text">No entries here yet.</p>
      ) : (
        <ul className="journal-list">
          {shown.map((e) => (
            <JournalRow key={e.id} item={e} onOpen={() => navigate(journalPath(e.id))} />
          ))}
        </ul>
      )}
      {limit && entries.length > limit && (
        <Link className="see-all" to="/journal">
          All {entries.length} journal entries →
        </Link>
      )}

      {picking && (
        <Picker
          book={last.book}
          chapterOnly
          onClose={() => setPicking(false)}
          onPick={(book, chapter) => {
            setPicking(false);
            void startEntry(book, chapter);
          }}
        />
      )}
    </>
  );
}
