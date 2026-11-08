/**
 * The study actions for some verses — Note, Question, Cross-refs, Link,
 * Answer — shared by the verse pop-up and the selected-words pop-up, so both
 * work the same way. They always apply to whole verses.
 */

import { useState, type ReactNode } from 'react';
import type { VerseRange } from '../bible/types';
import { AnswerPicker } from './AnswerPicker';
import { LinkDialog } from './LinkDialog';
import { useStudy } from './StudyContext';
import { createNote, createQuestion } from './store';

export function useVerseActions(): {
  /** The buttons for `range`; `close` closes the pop-up they're in. */
  buttons: (range: VerseRange, close: () => void) => ReactNode;
  /** Link and Answer open a dialog that outlives the pop-up: render this even when it's closed. */
  dialogs: ReactNode;
} {
  const { openNoteDialog, openView } = useStudy();
  const [dialog, setDialog] = useState<{ kind: 'link' | 'answer'; range: VerseRange } | null>(null);

  const dialogs =
    dialog &&
    (dialog.kind === 'link' ? (
      <LinkDialog from={dialog.range} onClose={() => setDialog(null)} />
    ) : (
      <AnswerPicker range={dialog.range} onClose={() => setDialog(null)} />
    ));

  const buttons = (range: VerseRange, close: () => void) => (
    <>
      <button
        type="button"
        className="bar-action"
        onClick={async () => {
          // Close first, so a key pressed before the editor has focus can't press this button again.
          close();
          const note = await createNote([range]);
          openNoteDialog({ id: note.id, isNew: true });
        }}
      >
        Note
      </button>
      <button
        type="button"
        className="bar-action"
        onClick={async () => {
          close();
          const q = await createQuestion([range]);
          openNoteDialog({ id: q.id, isNew: true });
        }}
      >
        Question
      </button>
      <button
        type="button"
        className="bar-action"
        onClick={() => {
          openView({ type: 'xrefs', range });
          close();
        }}
      >
        Cross-refs
      </button>
      <button
        type="button"
        className="bar-action"
        onClick={() => {
          setDialog({ kind: 'link', range });
          close();
        }}
      >
        Link
      </button>
      <button
        type="button"
        className="bar-action"
        onClick={() => {
          setDialog({ kind: 'answer', range });
          close();
        }}
      >
        Answer
      </button>
    </>
  );

  return { buttons, dialogs };
}
