import { useNavigate } from 'react-router-dom';
import { parseVerseId } from '../bible/verseId';
import type { VerseRange } from '../bible/types';
import { readerPath } from '../reader/nav';
import { getSettings } from '../settings';
import { rangeLabel } from './ranges';
import { RichText } from './RichText';
import { useStudy } from './StudyContext';
import { markAnswered } from './store';
import { firstLine } from './text';
import type { JournalItem, LinkItem, NoteItem, QuestionItem } from './types';
import { deleteWithUndo } from './undo';

export function formatDay(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** A button that takes the reader to the verses. */
export function AnchorLink({ range }: { range: VerseRange }) {
  const navigate = useNavigate();
  const { place } = useStudy();
  const { book, chapter, verse } = parseVerseId(range.start);
  return (
    <button
      type="button"
      className="anchor-link"
      onClick={() => navigate(readerPath(place?.translation ?? getSettings().translation, book, chapter, verse))}
    >
      {rangeLabel(range)}
    </button>
  );
}

export const KIND_LABEL = { note: 'Note', question: 'Question', journal: 'Journal' } as const;

export function ItemCard({ item, emphasis }: { item: NoteItem | QuestionItem; emphasis?: boolean }) {
  const { openNoteDialog } = useStudy();
  const label = item.anchors[0]
    ? `${KIND_LABEL[item.kind]} on ${rangeLabel(item.anchors[0])}`
    : `Standalone ${KIND_LABEL[item.kind].toLowerCase()}`;
  return (
    <article className={emphasis ? 'item-card emphasis' : 'item-card'} aria-label={label}>
      <header className="item-head">
        <span className={`kind kind-${item.kind}`}>{KIND_LABEL[item.kind]}</span>
        {item.anchors.map((a) => (
          <AnchorLink key={`${a.start}-${a.end}`} range={a} />
        ))}
        {item.anchors.length === 0 && <span className="journal-chip standalone">Standalone</span>}
        {item.kind === 'question' && (
          <span className={`status status-${item.status}`}>{item.status === 'open' ? 'Open' : 'Answered'}</span>
        )}
      </header>
      {item.text ? <RichText doc={item.body} /> : <p className="empty-text">Nothing written yet.</p>}
      {item.kind === 'question' && (item.answerRefs ?? []).length > 0 && (
        <p className="answered-by">
          <span className="answer-label">Answered by</span>{' '}
          {(item.answerRefs ?? []).map((r) => (
            <AnchorLink key={`${r.start}-${r.end}`} range={r} />
          ))}
        </p>
      )}
      {item.kind === 'question' && item.status === 'answered' && item.answerText && (
        <div className="answer">
          <span className="answer-label">Answer</span>
          <RichText doc={item.answer} />
        </div>
      )}
      <footer className="item-actions">
        <button type="button" onClick={() => openNoteDialog({ id: item.id })}>
          Edit
        </button>
        {item.kind === 'question' && (
          <button type="button" onClick={() => void markAnswered(item.id, item.status === 'open')}>
            {item.status === 'open' ? 'Mark answered' : 'Reopen'}
          </button>
        )}
        <button type="button" className="danger" onClick={() => void deleteWithUndo(item.id, KIND_LABEL[item.kind])}>
          Delete
        </button>
      </footer>
    </article>
  );
}

/** One journal entry in a list: date, the chapter it's on (if any), title or first line. */
export function JournalRow({ item, onOpen }: { item: JournalItem; onOpen?: () => void }) {
  const { push } = useStudy();
  const anchor = item.anchors[0];
  return (
    <li>
      <button type="button" className="journal-row" onClick={onOpen ?? (() => push({ type: 'item', id: item.id }))}>
        <span className="journal-row-head">
          <span className="journal-date">{formatDay(item.date)}</span>
          {anchor ? <span className="journal-chip">{rangeLabel(anchor)}</span> : <span className="journal-chip standalone">Standalone</span>}
        </span>
        <span className="journal-title">{item.title || firstLine(item.text, 80) || 'Untitled entry'}</span>
        {item.title && item.text && <span className="journal-snippet">{firstLine(item.text, 110)}</span>}
      </button>
    </li>
  );
}

/** A link you made between two passages: both ends open the passage; the note says why. */
export function LinkCard({ item, onOpen }: { item: LinkItem; onOpen?: (target: VerseRange) => void }) {
  const [a, b] = item.anchors as [VerseRange, VerseRange];
  const navigate = useNavigate();
  const { place } = useStudy();
  const go =
    onOpen ??
    ((target: VerseRange) => {
      const { book, chapter, verse } = parseVerseId(target.start);
      navigate(readerPath(place?.translation ?? getSettings().translation, book, chapter, verse));
    });
  return (
    <article className="item-card link-card" aria-label={`Link ${rangeLabel(a)} and ${rangeLabel(b)}`}>
      <header className="item-head">
        <span className="kind kind-link">Link</span>
        <button type="button" className="anchor-link" onClick={() => go(a)}>
          {rangeLabel(a)}
        </button>
        <span aria-hidden="true">↔</span>
        <button type="button" className="anchor-link" onClick={() => go(b)}>
          {rangeLabel(b)}
        </button>
      </header>
      {item.note ? <p className="link-note">{item.note}</p> : null}
      <footer className="item-actions">
        <button type="button" className="danger" onClick={() => void deleteWithUndo(item.id, 'Link')}>
          Delete
        </button>
      </footer>
    </article>
  );
}
