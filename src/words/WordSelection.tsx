/**
 * Select a word or phrase in the Bible text (drag, double-click, or long-press
 * on a phone) and a small pop-up above it offers the original language for
 * that word, or for the whole verse(s).
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { makeVerseId } from '../bible/verseId';
import type { BookId } from '../bible/books';
import type { TranslationId, VerseRange } from '../bible/types';
import { popupPosition } from '../study/SelectionBar';
import { useStudy } from '../study/StudyContext';
import { setSegmentHighlight } from '../study/store';
import { useVerseActions } from '../study/VerseActions';
import { preloadEditor } from '../study/ItemView';
import { formatRange } from '../bible/refParser';
import { HIGHLIGHT_COLORS, type HighlightColor } from '../study/types';
import { linkAt, originalWords, wordLinks } from './data';
import { versePath, wordPath } from './OriginalPages';

interface Picked {
  text: string;
  range: VerseRange;
  /** For a selection inside one verse: where it starts in the verse's plain text. */
  offset: number | null;
  /** Where it starts in the first verse's plain text and ends in the last's, spaces at the edges left out. */
  start: number;
  end: number;
  rect: DOMRect;
}

/** A verse's plain text as shown, joined the same way as prefixOf. */
function verseText(article: Element, verse: number): string {
  let out = '';
  let block: Element | null = null;
  for (const span of article.querySelectorAll(`[data-v="${verse}"]`)) {
    const b = span.closest('p, .descriptive');
    if (block && b !== block) out += ' ';
    block = b;
    out += span.textContent ?? '';
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Length of a verse's text up to a point, as the plain text counts it. */
const plainLength = (prefix: string) => prefix.replace(/\s+/g, ' ').trimStart().length;

/** Text of a verse up to a point, built the same way as the plain text the word links use. */
function prefixOf(article: Element, verse: number, node: Node, nodeOffset: number): string {
  let out = '';
  let block: Element | null = null;
  for (const span of article.querySelectorAll(`[data-v="${verse}"]`)) {
    const b = span.closest('p, .descriptive');
    if (block && b !== block) out += ' ';
    block = b;
    if (span.contains(node)) {
      // Text in this span before the selection starts.
      const r = document.createRange();
      r.setStart(span, 0);
      r.setEnd(node, nodeOffset);
      return out + r.toString();
    }
    out += span.textContent ?? '';
  }
  return out;
}

function readSelection(): Picked | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const text = sel.toString().replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const range = sel.getRangeAt(0);
  const startEl = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement) as Element | null;
  const endEl = (range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement) as Element | null;
  const startSpan = startEl?.closest('[data-v]');
  const endSpan = endEl?.closest('[data-v]') ?? startSpan;
  const article = startSpan?.closest('article.chapter');
  if (!startSpan || !endSpan || !article || endSpan.closest('article.chapter') !== article) return null;
  const [book, chapter] = (article.getAttribute('data-scope') ?? '').split('.') as [BookId, string];
  const v1 = Number(startSpan.getAttribute('data-v'));
  const v2 = Number(endSpan.getAttribute('data-v'));
  const start = makeVerseId(book, Number(chapter), Math.min(v1, v2));
  const end = makeVerseId(book, Number(chapter), Math.max(v1, v2));
  // A selection runs forwards through the text, so v1 is the first verse.
  const first = verseText(article, v1);
  const last = v1 === v2 ? first : verseText(article, v2);
  const at = plainLength(prefixOf(article, v1, range.startContainer, range.startOffset));
  let from = at;
  let to = plainLength(prefixOf(article, v2, range.endContainer, range.endOffset));
  // A double-click often takes the space after the word too.
  while (from < first.length && first[from] === ' ') from++;
  while (to > 0 && last[to - 1] === ' ') to--;
  return { text, range: { start, end }, offset: v1 === v2 ? at : null, start: from, end: to, rect: range.getBoundingClientRect() };
}

export function WordSelection({ translation }: { translation: TranslationId }) {
  const navigate = useNavigate();
  const { setSelection } = useStudy();
  const actions = useVerseActions();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer = 0;
    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const p = readSelection();
        setPicked(p);
        // Selecting words replaces any verse selection, so one pop-up shows at a time.
        if (p) setSelection(null);
        // Have the editor ready in case Note or Question is tapped.
        if (p) preloadEditor();
      }, 180);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      window.clearTimeout(timer);
    };
  }, [setSelection]);

  useEffect(() => {
    if (!picked || !ref.current) {
      setPos(null);
      return;
    }
    setPos(popupPosition(picked.rect, picked.rect, ref.current.offsetWidth, ref.current.offsetHeight));
  }, [picked]);

  if (!picked) return actions.dialogs || null;
  const oneVerse = picked.range.start === picked.range.end;
  const close = () => {
    window.getSelection()?.removeAllRanges();
    setPicked(null);
  };
  const short = picked.text.length > 40 ? `${picked.text.slice(0, 38)}…` : picked.text;

  const lookUpWord = async () => {
    const t = translation === 'kjv' ? 'kjv' : 'bsb';
    if (oneVerse && picked.offset !== null) {
      const [links, words] = await Promise.all([wordLinks(t, picked.range.start), originalWords(picked.range.start)]);
      const link = linkAt(links, picked.offset, picked.offset + picked.text.length);
      const strong = link ? words[link[2]]?.[0] : null;
      if (link && strong) {
        window.getSelection()?.removeAllRanges();
        navigate(wordPath(strong, { verse: picked.range.start, index: link[2], translation: t }));
        return;
      }
    }
    window.getSelection()?.removeAllRanges();
    navigate(versePath(picked.range));
  };

  /** Colours just the selected words (in this translation), or clears colour from them. */
  const highlight = async (color: HighlightColor | null) => {
    // Close first, so a selection made while it saves isn't cleared.
    close();
    await setSegmentHighlight(translation, picked.range, picked.start, picked.end, color);
  };

  return (
    <>
      {actions.dialogs}
      <div
        ref={ref}
        className="selection-bar floating word-popup"
        style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
        role="toolbar"
        aria-label={`Selected text: ${short}`}
        // Keep the text selected while a button is pressed.
        onMouseDown={(e) => e.preventDefault()}
      >
        <span className="selection-label">“{short}”</span>
        {/* Notes, questions and the rest are on the whole verse(s): say which. */}
        <span className="selection-ref">{formatRange(picked.range)}</span>
        <div className="swatches" role="group" aria-label="Highlight these words">
          {HIGHLIGHT_COLORS.map((c) => (
            <button key={c} type="button" className={`swatch-btn hl-${c}`} aria-label={`Highlight ${c}`} onClick={() => void highlight(c)} />
          ))}
          <button type="button" className="swatch-btn swatch-none" aria-label="Remove highlight" onClick={() => void highlight(null)} />
        </div>
        {actions.buttons(picked.range, close)}
        {oneVerse && (
          <button type="button" className="bar-action bar-original" onClick={() => void lookUpWord()}>
            Original language for this word
          </button>
        )}
        <button
          type="button"
          className="bar-action bar-original"
          onClick={() => {
            close();
            navigate(versePath(picked.range));
          }}
        >
          {oneVerse ? 'Original language: whole verse' : 'Original language: these verses'}
        </button>
      </div>
    </>
  );
}
