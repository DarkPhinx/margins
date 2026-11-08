import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import type { VerseRange } from '../bible/types';
import { rangeLabel } from './ranges';
import { addAnswerRef, createQuestion, listByKind } from './store';
import { useStudy } from './StudyContext';
import { firstLine } from './text';

/** Adds the selected verses as an answer to one of your questions. */
export function AnswerPicker({ range, onClose }: { range: VerseRange; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { openNoteDialog } = useStudy();
  const [done, setDone] = useState<string | null>(null);
  const questions = (useLiveQuery(() => listByKind('question'), []) ?? [])
    .filter((q) => q.text.trim())
    .sort((a, b) => (a.status === b.status ? b.updatedAt - a.updatedAt : a.status === 'open' ? -1 : 1));

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open && typeof d.showModal === 'function') d.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="sheet answer-picker"
      aria-label={`${rangeLabel(range)} answers…`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="sheet-inner">
        <div className="note-dialog-head">
          <h2>
            <span className="note-dialog-ref">{rangeLabel(range)}</span> answers…
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {done ? (
          <p className="notice" role="status">
            Added as an answer to “{done}”.
          </p>
        ) : questions.length === 0 ? (
          <p className="empty-text">You have no questions yet.</p>
        ) : (
          <ul className="answer-list">
            {questions.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  className="journal-row"
                  onClick={async () => {
                    await addAnswerRef(q.id, range);
                    setDone(firstLine(q.text, 80));
                    window.setTimeout(onClose, 900);
                  }}
                >
                  <span className="journal-row-head">
                    <span className={`status status-${q.status}`}>{q.status === 'open' ? 'Open' : 'Answered'}</span>
                    {q.anchors[0] && <span className="journal-date">{rangeLabel(q.anchors[0])}</span>}
                  </span>
                  <span className="journal-title">{firstLine(q.text, 100)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="item-view-foot">
          <button
            type="button"
            onClick={async () => {
              // Ask a new question with these verses as its first answer.
              const q = await createQuestion([]);
              await addAnswerRef(q.id, range);
              onClose();
              openNoteDialog({ id: q.id, isNew: true });
            }}
          >
            New question answered by these verses
          </button>
        </div>
      </div>
    </dialog>
  );
}
