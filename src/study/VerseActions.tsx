/**
 * The study actions for some verses — Note, Question, Cross-refs, Link,
 * Answer — shared by the verse pop-up and the selected-words pop-up, so both
 * work the same way. They always apply to whole verses. Signed out, Cross-refs
 * works and the others explain that an account saves your study.
 */

import { useState, type ReactNode } from 'react';
import type { VerseRange } from '../bible/types';
import { AnswerPicker } from './AnswerPicker';
import { LinkDialog } from './LinkDialog';
import { useStudy } from './StudyContext';
import { useNeedAccount } from '../sync/access';
import { createNote, createQuestion } from './store';

export function useVerseActions(): {
  /** The buttons for `range`; `close` closes the pop-up they're in. */
  buttons: (range: VerseRange, close: () => void) => ReactNode;
  /** Link and Answer open a dialog that outlives the pop-up: render this even when it's closed. */
  dialogs: ReactNode;
} {
  const { openNoteDialog, openView } = useStudy();
  // Cross-refs are for everyone; the rest save something, so they need an account.
  const needAccount = useNeedAccount();
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
          if (needAccount('your notes')) return;
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
          if (needAccount('your questions')) return;
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
          close();
          if (needAccount('passage links')) return;
          setDialog({ kind: 'link', range });
        }}
      >
        Link
      </button>
      <button
        type="button"
        className="bar-action"
        onClick={() => {
          close();
          if (needAccount('answers to your questions')) return;
          setDialog({ kind: 'answer', range });
        }}
      >
        Answer
      </button>
    </>
  );

  return { buttons, dialogs };
}
