import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseVerseId } from '../bible/verseId';
import { versePath } from '../words/OriginalPages';
import { formatRange } from '../bible/refParser';
import { useStudy } from './StudyContext';
import { setHighlight } from './store';
import { useVerseActions } from './VerseActions';
import { useNeedAccount, useReadingOnly } from '../sync/access';
import { HIGHLIGHT_COLORS } from './types';
import { preloadEditor } from './ItemView';

/**
 * Where a small pop-up should sit: just above an element, or below another if
 * there isn't room above; always on screen and clear of the top bar.
 */
export function popupPosition(above: DOMRect, below: DOMRect, width: number, height: number): { top: number; left: number } {
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  const bar = document.querySelector('.reader-bar')?.getBoundingClientRect().bottom ?? 0;
  let top = above.top - height - 10;
  if (top < bar + 8) top = below.bottom + 10;
  top = Math.min(Math.max(top, bar + 8), vh - height - 8);
  const left = Math.min(Math.max(above.left, 8), Math.max(8, vw - width - 8));
  return { top, left };
}

function verseElement(id: number, last: boolean): Element | null {
  const { book, chapter, verse } = parseVerseId(id);
  const all = document.querySelectorAll(`article.chapter[data-scope="${book}.${chapter}"] [data-v="${verse}"]`);
  return (last ? all[all.length - 1] : all[0]) ?? null;
}

/** Actions for the selected verses, in a small pop-up right above them. */
export function SelectionBar() {
  const { selection, setSelection } = useStudy();
  const navigate = useNavigate();
  const barRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Keep the pop-up just above the selected verses as the page scrolls.
  useLayoutEffect(() => {
    if (!selection) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const first = verseElement(selection.start, false);
      const last = verseElement(selection.end, true) ?? first;
      const el = barRef.current;
      if (!el) return;
      if (!first || !last) {
        // The verses aren't on the page (scrolled away): sit at the bottom centre instead.
        const vw = document.documentElement.clientWidth || window.innerWidth;
        setPos({ top: window.innerHeight - el.offsetHeight - 16, left: Math.max(8, (vw - el.offsetWidth) / 2) });
        return;
      }
      setPos(popupPosition(first.getBoundingClientRect(), last.getBoundingClientRect(), el.offsetWidth, el.offsetHeight));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, [selection]);
  const actions = useVerseActions();
  const readingOnly = useReadingOnly();
  const needAccount = useNeedAccount();

  // Fetch the editor as soon as verses are selected, so it's ready when Note is tapped.
  useEffect(() => {
    if (selection && !readingOnly) preloadEditor();
  }, [selection, readingOnly]);

  useEffect(() => {
    if (!selection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).closest('dialog, [role="dialog"], .study-panel')) setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, setSelection]);

  const dialogs = actions.dialogs;
  if (!selection) return dialogs || null;
  const label = formatRange(selection);

  return (
    <div
      ref={barRef}
      className="selection-bar floating"
      // Laid out as the pop-up from the start (so its size is measured right), hidden until placed.
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
      role="toolbar"
      aria-label={`Selected: ${label}`}
    >
      <span className="selection-label">{label}</span>
      <div className="swatches">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch-btn hl-${c}`}
            aria-label={`Highlight ${c}`}
            onClick={async () => {
              // Highlights are saved, so they need an account.
              if (needAccount('highlights')) return;
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
            if (needAccount('highlights')) return;
            await setHighlight(selection, null);
            setSelection(null);
          }}
        />
      </div>
      {actions.buttons(selection, () => setSelection(null))}
      <button
        type="button"
        className="bar-action bar-original"
        onClick={() => {
          navigate(versePath(selection));
          setSelection(null);
        }}
      >
        Original language
      </button>
      <button type="button" className="bar-close" aria-label="Clear selection" onClick={() => setSelection(null)}>
        ✕
      </button>
    </div>
  );
}
