import { useLiveQuery } from 'dexie-react-hooks';
import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router-dom';
import { ItemCard } from '../study/ItemCard';
import { useStudy } from '../study/StudyContext';
import { createNote, createQuestion, listByKind } from '../study/store';
import type { NoteItem, QuestionItem } from '../study/types';

type Filter = 'all' | 'notes' | 'questions' | 'standalone';

async function allWritten(): Promise<(NoteItem | QuestionItem)[]> {
  const [notes, questions] = await Promise.all([listByKind('note'), listByKind('question')]);
  return [...notes, ...questions];
}

function normalise(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/**
 * Notes and questions, newest first, with the ways to write a standalone one
 * (not tied to any verse). With `limit` it shows only the latest few (for the
 * home page) and links to the full list.
 */
export function NotesList({ limit }: { limit?: number }) {
  const { openNoteDialog } = useStudy();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);

  // A blank note isn't worth listing (one being written right now is in the pop-up).
  const items = (useLiveQuery(allWritten, []) ?? [])
    .filter((i) => i.text.trim() || (i.kind === 'question' && i.answerText.trim()))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const words = normalise(deferred).split(/\s+/).filter(Boolean);
  const filtered = items.filter((i) => {
    if (filter === 'notes' && i.kind !== 'note') return false;
    if (filter === 'questions' && i.kind !== 'question') return false;
    if (filter === 'standalone' && i.anchors.length > 0) return false;
    if (!words.length) return true;
    const hay = normalise(`${i.text}\n${i.kind === 'question' ? i.answerText : ''}`);
    return words.every((w) => hay.includes(w));
  });
  const shown = limit ? filtered.slice(0, limit) : filtered;
  const count = (f: Filter) =>
    items.filter((i) =>
      f === 'all' ? true : f === 'notes' ? i.kind === 'note' : f === 'questions' ? i.kind === 'question' : i.anchors.length === 0,
    ).length;

  return (
    <>
      <div className="list-actions">
        <button
          type="button"
          className="primary-btn"
          onClick={async () => {
            const note = await createNote([]);
            openNoteDialog({ id: note.id, isNew: true });
          }}
        >
          New note
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={async () => {
            const q = await createQuestion([]);
            openNoteDialog({ id: q.id, isNew: true });
          }}
        >
          New question
        </button>
      </div>

      {!limit && items.length > 0 && (
        <>
          <label className="sr-only" htmlFor="notes-filter">
            Find in notes
          </label>
          <input
            id="notes-filter"
            className="search-input"
            type="search"
            placeholder="Find in notes and questions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="segmented" role="group" aria-label="Show">
            {(['all', 'notes', 'questions', 'standalone'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {`${f === 'all' ? 'All' : f === 'notes' ? 'Notes' : f === 'questions' ? 'Questions' : 'Standalone'} (${count(f)})`}
              </button>
            ))}
          </div>
        </>
      )}

      {items.length === 0 ? (
        <p className="empty-text">
          Notes you write on verses show here. You can also write a standalone note that isn’t tied to any verse.
        </p>
      ) : shown.length === 0 ? (
        <p className="empty-text">Nothing matches.</p>
      ) : (
        <div className="notes-list">
          {shown.map((i) => (
            <ItemCard key={i.id} item={i} />
          ))}
        </div>
      )}
      {limit && items.length > limit && (
        <Link className="see-all" to="/notes">
          All {items.length} notes and questions →
        </Link>
      )}
    </>
  );
}
