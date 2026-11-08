import { useEffect, useRef, useState } from 'react';
import { findReferences } from '../bible/refParser';
import type { VerseRange } from '../bible/types';
import { isWholeChapter, overlaps, rangeLabel } from './ranges';
import { previewText } from './passage';
import { useStudy } from './StudyContext';
import { createLink } from './store';

/** Parses what's typed into the first reference, if any ("Rom 8:28-30", "Ps 23"). */
export function parseTyped(text: string): VerseRange | null {
  return findReferences(text)[0]?.range ?? null;
}

/**
 * Links a passage to another one you type, with an optional note on why.
 * The link shows on both passages.
 */
export function LinkDialog({ from, onClose, onSaved }: { from: VerseRange; onClose: () => void; onSaved?: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { place } = useStudy();
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<{ key: string; text: string } | null>(null);
  const target = parseTyped(text);
  const sameAsFrom = !!target && overlaps(target, from);
  const key = target ? `${target.start}-${target.end}` : '';

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open && typeof d.showModal === 'function') d.showModal();
  }, []);

  useEffect(() => {
    if (!target) return;
    let live = true;
    void previewText(place?.translation ?? 'bsb', target, isWholeChapter(target), 200).then(
      (t) => live && setPreview({ key, text: t }),
      () => live && setPreview({ key, text: '' }),
    );
    return () => {
      live = false;
    };
    // key identifies the target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, place?.translation]);

  const save = async () => {
    if (!target || sameAsFrom) return;
    await createLink(from, target, note);
    onSaved?.();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="sheet link-dialog"
      aria-label={`Link ${rangeLabel(from)}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form
        className="sheet-inner"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="note-dialog-head">
          <h2>
            Link <span className="note-dialog-ref">{rangeLabel(from)}</span>
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <label className="field">
          <span>To which passage?</span>
          <input
            type="text"
            value={text}
            autoFocus
            placeholder="e.g. Rom 8:28-30 or Psalm 23"
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        {target ? (
          <p className="link-target" aria-live="polite">
            <strong>{rangeLabel(target)}</strong>
            {sameAsFrom ? (
              <span className="field-error"> That’s the passage you’re linking from.</span>
            ) : (
              preview?.key === key && preview.text && <span className="link-preview"> {preview.text}</span>
            )}
          </p>
        ) : (
          text.trim() && (
            <p className="field-error" aria-live="polite">
              Type a reference such as John 3:16, Rom 8:28-30 or Ps 23.
            </p>
          )
        )}
        <label className="field">
          <span>Why do they belong together? (optional)</span>
          <textarea value={note} rows={3} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="item-view-foot">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn done-btn" disabled={!target || sameAsFrom}>
            Save link
          </button>
        </div>
      </form>
    </dialog>
  );
}
