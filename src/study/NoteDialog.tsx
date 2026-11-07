import { useEffect, useRef } from 'react';
import { ItemView } from './ItemView';
import { useStudy } from './StudyContext';

/**
 * A note or question as a pop-up over the passage: the verse text, then the
 * editor. It saves as you type; clicking outside, Esc, ✕ or Done closes it and
 * returns to reading.
 */
export function NoteDialog() {
  const { noteDialog, closeNoteDialog } = useStudy();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<(() => Promise<void>) | null>(null);
  /** Where a click began: dragging from the editor out onto the backdrop must not close it. */
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (noteDialog && d && !d.open && typeof d.showModal === 'function') d.showModal();
  }, [noteDialog]);

  // Esc closes (after saving) wherever focus happens to be.
  useEffect(() => {
    if (!noteDialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Stops the browser closing the dialog on its own, before the note is saved.
      e.preventDefault();
      if (closeRef.current) void closeRef.current();
      else closeNoteDialog();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [noteDialog, closeNoteDialog]);

  if (!noteDialog) return null;

  const requestClose = () => {
    if (closeRef.current) void closeRef.current();
    else closeNoteDialog();
  };

  return (
    <dialog
      ref={dialogRef}
      className="sheet note-dialog"
      aria-label="Note"
      onCancel={(e) => {
        // Other ways of dismissing (e.g. a phone's back gesture) also save first.
        e.preventDefault();
        requestClose();
      }}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === dialogRef.current;
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current && pressedOnBackdrop.current) requestClose();
      }}
    >
      <div className="sheet-inner">
        <ItemView
          key={noteDialog.id}
          id={noteDialog.id}
          isNew={noteDialog.isNew}
          layout="dialog"
          onClose={closeNoteDialog}
          closeRef={closeRef}
        />
      </div>
    </dialog>
  );
}
