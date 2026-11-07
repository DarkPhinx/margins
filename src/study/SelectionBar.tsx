import { useEffect } from 'react';
import { formatRange } from '../bible/refParser';
import { useStudy } from './StudyContext';
import { createNote, createQuestion, setHighlight } from './store';
import { HIGHLIGHT_COLORS } from './types';
import { preloadEditor } from './ItemView';

/** Actions for the selected verses: highlight, note, question. */
export function SelectionBar() {
  const { selection, setSelection, openNoteDialog } = useStudy();

  // Fetch the editor as soon as verses are selected, so it's ready when Note is tapped.
  useEffect(() => {
    if (selection) preloadEditor();
  }, [selection]);

  useEffect(() => {
    if (!selection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).closest('dialog, [role="dialog"], .study-panel')) setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, setSelection]);

  if (!selection) return null;
  const label = formatRange(selection);

  return (
    <div className="selection-bar" role="toolbar" aria-label={`Selected: ${label}`}>
      <span className="selection-label">{label}</span>
      <div className="swatches">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch-btn hl-${c}`}
            aria-label={`Highlight ${c}`}
            onClick={async () => {
              await setHighlight(selection, c);
              setSelection(null);
            }}
          />
        ))}
        <button
          type="button"
          className="swatch-btn swatch-none"
          aria-label="Remove highlight"
          onClick={async () => {
            await setHighlight(selection, null);
            setSelection(null);
          }}
        />
      </div>
      <button
        type="button"
        className="bar-action"
        onClick={async () => {
          const note = await createNote([selection]);
          // Close the bar so a key pressed before the editor has focus can't press this button again.
          setSelection(null);
          openNoteDialog({ id: note.id, isNew: true });
        }}
      >
        Note
      </button>
      <button
        type="button"
        className="bar-action"
        onClick={async () => {
          const q = await createQuestion([selection]);
          setSelection(null);
          openNoteDialog({ id: q.id, isNew: true });
        }}
      >
        Question
      </button>
      <button type="button" className="bar-close" aria-label="Clear selection" onClick={() => setSelection(null)}>
        ✕
      </button>
    </div>
  );
}
