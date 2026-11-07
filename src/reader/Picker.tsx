import { useEffect, useRef, useState } from 'react';
import { BOOKS, OLD_TESTAMENT_BOOKS, bookInfo, type BookId } from '../bible/books';
import { versesInChapter } from '../bible/verseIndex';

interface PickerProps {
  book: BookId;
  onPick: (book: BookId, chapter: number, verse?: number) => void;
  onClose: () => void;
}

type Step = { kind: 'book' } | { kind: 'chapter'; book: BookId } | { kind: 'verse'; book: BookId; chapter: number };

/** Book, then chapter, then (optionally) verse. */
export function Picker({ book, onPick, onClose }: PickerProps) {
  const [step, setStep] = useState<Step>({ kind: 'book' });
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open && typeof d.showModal === 'function') d.showModal();
  }, []);

  const title =
    step.kind === 'book'
      ? 'Choose a book'
      : step.kind === 'chapter'
        ? bookInfo(step.book).name
        : `${bookInfo(step.book).name} ${step.chapter}`;

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="sheet-inner">
        <header className="sheet-head">
          {step.kind !== 'book' ? (
            <button
              type="button"
              className="link-btn"
              onClick={() => setStep(step.kind === 'verse' ? { kind: 'chapter', book: step.book } : { kind: 'book' })}
            >
              ← Back
            </button>
          ) : (
            <span />
          )}
          <h2>{title}</h2>
          <button type="button" className="link-btn" onClick={onClose}>
            Close
          </button>
        </header>

        {step.kind === 'book' && (
          <div className="book-lists">
            {[
              ['Old Testament', BOOKS.slice(0, OLD_TESTAMENT_BOOKS)],
              ['New Testament', BOOKS.slice(OLD_TESTAMENT_BOOKS)],
            ].map(([label, list]) => (
              <section key={label as string}>
                <h3 className="sheet-section">{label as string}</h3>
                <ul className="book-grid">
                  {(list as typeof BOOKS[number][]).map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        className={b.id === book ? 'book-btn current' : 'book-btn'}
                        onClick={() => (b.chapters === 1 ? setStep({ kind: 'verse', book: b.id, chapter: 1 }) : setStep({ kind: 'chapter', book: b.id }))}
                      >
                        {b.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {step.kind === 'chapter' && (
          <ul className="num-grid" aria-label="Chapters">
            {Array.from({ length: bookInfo(step.book).chapters }, (_, i) => i + 1).map((c) => (
              <li key={c}>
                <button
                  type="button"
                  className="num-btn"
                  onClick={() => setStep({ kind: 'verse', book: step.book, chapter: c })}
                  onDoubleClick={() => onPick(step.book, c)}
                >
                  {c}
                </button>
              </li>
            ))}
          </ul>
        )}

        {step.kind === 'verse' && (
          <>
            <button type="button" className="whole-chapter" onClick={() => onPick(step.book, step.chapter)}>
              Read from the start
            </button>
            <ul className="num-grid" aria-label="Verses">
              {Array.from({ length: versesInChapter(step.book, step.chapter) }, (_, i) => i + 1).map((v) => (
                <li key={v}>
                  <button type="button" className="num-btn" onClick={() => onPick(step.book, step.chapter, v)}>
                    {v}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </dialog>
  );
}
