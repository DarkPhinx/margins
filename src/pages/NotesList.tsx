import { useLiveQuery } from 'dexie-react-hooks';
import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router-dom';
import { ItemCard, LinkCard } from '../study/ItemCard';
import { rangeLabel } from '../study/ranges';
import { useStudy } from '../study/StudyContext';
import { createNote, createQuestion, listByKind } from '../study/store';
import type { LinkItem, NoteItem, QuestionItem } from '../study/types';

type Filter = 'all' | 'notes' | 'questions' | 'links' | 'standalone';
type Listed = NoteItem | QuestionItem | LinkItem;

const FILTER_LABEL: Record<Filter, string> = {
  all: 'All',
  notes: 'Notes',
  questions: 'Questions',
  links: 'Links',
  standalone: 'Standalone',
};

async function allListed(): Promise<Listed[]> {
  const [notes, questions, links] = await Promise.all([listByKind('note'), listByKind('question'), listByKind('link')]);
  return [...notes, ...questions, ...links];
}

function normalise(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

function searchable(i: Listed): string {
  if (i.kind === 'link') return `${i.note}\n${i.anchors.map(rangeLabel).join(' ')}`;
  return `${i.text}\n${i.kind === 'question' ? i.answerText : ''}`;
}

function matches(i: Listed, f: Filter): boolean {
  if (f === 'notes') return i.kind === 'note';
  if (f === 'questions') return i.kind === 'question';
  if (f === 'links') return i.kind === 'link';
  if (f === 'standalone') return i.kind !== 'link' && i.anchors.length === 0;
  return true;
}

/**
 * Notes, questions and links, newest first, with the ways to write a
 * standalone note or question (not tied to any verse). With `limit` it shows
 * only the latest few (for the home page) and links to the full list.
 */
export function NotesList({ limit }: { limit?: number }) {
  const { openNoteDialog } = useStudy();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);

  // A blank note isn't worth listing (one being written right now is in the pop-up).
  const items = (useLiveQuery(allListed, []) ?? [])
    .filter((i) => i.kind === 'link' || i.text.trim() || (i.kind === 'question' && i.answerText.trim()))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const words = normalise(deferred).split(/\s+/).filter(Boolean);
  const filtered = items.filter((i) => {
    if (!matches(i, filter)) return false;
    if (!words.length) return true;
    const hay = normalise(searchable(i));
    return words.every((w) => hay.includes(w));
  });
  const shown = limit ? filtered.slice(0, limit) : filtered;

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
            placeholder="Find in notes, questions and links"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="segmented" role="group" aria-label="Show">
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {`${FILTER_LABEL[f]} (${items.filter((i) => matches(i, f)).length})`}
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
          {shown.map((i) => (i.kind === 'link' ? <LinkCard key={i.id} item={i} /> : <ItemCard key={i.id} item={i} />))}
        </div>
      )}
      {limit && items.length > limit && (
        <Link className="see-all" to="/notes">
          All {items.length} notes, questions and links →
        </Link>
      )}
    </>
  );
}
