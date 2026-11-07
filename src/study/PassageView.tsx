import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatRange } from '../bible/refParser';
import { parseVerseId } from '../bible/verseId';
import type { VerseRange } from '../bible/types';
import { readerPath } from '../reader/nav';
import { loadPassage, type PassageVerse } from './passage';
import { useStudy } from './StudyContext';

/** Verses shown either side of a reference, in grey. */
export const CONTEXT_VERSES = 3;

/**
 * A referenced passage: its verses in normal ink, the verses around it in grey.
 * Tapping the grey context opens the full passage in the reader.
 */
export function PassageView({ range }: { range: VerseRange }) {
  const { place, pop } = useStudy();
  const navigate = useNavigate();
  const translation = place?.translation ?? 'bsb';
  const [verses, setVerses] = useState<PassageVerse[] | null>(null);
  const [failed, setFailed] = useState(false);
  const key = `${translation}:${range.start}-${range.end}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadPassage(translation, range, CONTEXT_VERSES).then(
      (v) => {
        if (!live) return;
        setVerses(v);
        setFailed(false);
        setLoadedKey(key);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
    // key covers translation and range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const openInReader = () => {
    const { book, chapter, verse } = parseVerseId(range.start);
    navigate(readerPath(translation, book, chapter, verse));
  };
  const multiChapter = verses ? new Set(verses.map((v) => v.chapter)).size > 1 : false;

  return (
    <div className="passage-view">
      <div className="item-view-head">
        <button type="button" className="link-btn" onClick={pop}>
          ← Back
        </button>
      </div>
      <h3 className="item-view-title">{formatRange(range)}</h3>
      {failed && <p className="notice">This passage couldn’t load.</p>}
      {loadedKey === key && verses && (
        <div className="passage-text">
          {verses.map((v) =>
            v.inRange ? (
              <span key={v.id} className="passage-in">
                <sup className="verse-num">{multiChapter ? `${v.chapter}:${v.verse}` : v.verse}</sup>
                {v.text}{' '}
              </span>
            ) : (
              <button
                key={v.id}
                type="button"
                className="passage-context"
                title="Open the full passage"
                onClick={openInReader}
              >
                <sup className="verse-num">{multiChapter ? `${v.chapter}:${v.verse}` : v.verse}</sup>
                {v.text}{' '}
              </button>
            ),
          )}
        </div>
      )}
      <button type="button" className="whole-chapter" onClick={openInReader}>
        Read the full passage
      </button>
    </div>
  );
}
