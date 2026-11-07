import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getSettings } from '../settings';
import { useNavigate } from 'react-router-dom';
import { parseVerseId } from '../bible/verseId';
import type { VerseRange } from '../bible/types';
import { readerPath } from '../reader/nav';
import { formatRange } from '../bible/refParser';
import { previewText } from './passage';
import { useStudy } from './StudyContext';

/** True inside the study panel, where a passage can open beside the text. */
export const InStudyPanel = createContext(false);

/** How long to hover before a reference shows its preview. */
export const REF_PREVIEW_DELAY_MS = 1500;

/**
 * A verse reference found in a note. Hover to preview it; click to read it
 * with its context (a whole-chapter reference opens the chapter instead).
 */
export function RefLink({ text, range, chapterOnly }: { text: string; range: VerseRange; chapterOnly: boolean }) {
  const { place, push } = useStudy();
  const inPanel = useContext(InStudyPanel);
  const navigate = useNavigate();
  const translation = place?.translation ?? getSettings().translation;
  const [preview, setPreview] = useState<{ text: string; top: number; left: number; width: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const ref = useRef<HTMLButtonElement>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const el = ref.current;
      if (!el) return;
      const body = await previewText(translation, range, chapterOnly).catch(() => 'This passage couldn’t load.');
      if (!live.current) return;
      const r = el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const width = Math.min(320, vw - 32);
      setPreview({ text: body, top: r.bottom + 6, left: Math.min(Math.max(r.left, 16), vw - width - 16), width });
    }, REF_PREVIEW_DELAY_MS);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setPreview(null);
  };

  const open = () => {
    hide();
    const { book, chapter, verse } = parseVerseId(range.start);
    if (chapterOnly) {
      navigate(readerPath(translation, book, chapter));
    } else if (inPanel) {
      // In the study panel: show the passage with its context, beside the text.
      push({ type: 'passage', range, chapterOnly });
    } else {
      // Elsewhere (Notes, Home): go to the verse in the reader.
      navigate(readerPath(translation, book, chapter, verse));
    }
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        className="ref-link"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={open}
        aria-label={`${text}: ${chapterOnly ? 'open the chapter' : 'read the passage'}`}
      >
        {text}
      </button>
      {preview && (
        <span
          role="tooltip"
          className="popup ref-preview"
          style={{ top: preview.top, left: preview.left, width: preview.width }}
        >
          <span className="popup-meta">{formatRange(range, chapterOnly)}</span>
          <span className="popup-body">{preview.text}</span>
        </span>
      )}
    </>
  );
}
