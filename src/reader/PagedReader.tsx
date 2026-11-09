import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BookId } from '../bible/books';
import { prepareChapter } from '../bible/prepare';
import { parseVerseId, makeVerseId } from '../bible/verseId';
import type { ReadResult, TranslationId } from '../bible/types';
import { getProvider } from '../translations/registry';
import { updateSettings, useSettings } from '../settings';
import { ChapterView } from './ChapterView';
import { ChapterHeading, ReaderBar, TranslationNotice } from './ReaderBar';
import { findLanding, flashVerse } from './landing';
import { chapterTitle, nextChapter, previousChapter, readerPath } from './nav';

type Load = { key: string; result: ReadResult } | { key: string; error: string };

export interface ReaderProps {
  translation: TranslationId;
  book: BookId;
  chapter: number;
  verse: number | null;
}

/** One chapter (or, for the ESV, one page) at a time. */
export function PagedReader({ translation, book, chapter, verse }: ReaderProps) {
  const navigate = useNavigate();
  const settings = useSettings();
  const provider = getProvider(translation);
  const page = provider.pageFor(makeVerseId(book, chapter, verse ?? 1));
  const pageKey = `${translation}:${page.range.start}-${page.range.end}`;
  const [load, setLoad] = useState<Load | null>(null);
  const visibleVerse = useRef(verse ?? 1);

  useEffect(() => {
    let live = true;
    provider.read(page).then(
      (result) => live && setLoad({ key: pageKey, result }),
      (e: unknown) => live && setLoad({ key: pageKey, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
    // pageKey identifies the page; provider and page are derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  const current = load?.key === pageKey ? load : null;
  const result = current && 'result' in current ? current.result : null;
  const doc = useMemo(
    () => (result ? prepareChapter(result.doc, { showManuscriptNotes: settings.showManuscriptNotes }) : null),
    [result, settings.showManuscriptNotes],
  );
  const shownMeta = result?.status === 'fallback' ? getProvider('bsb').meta : provider.meta;
  const landing = useMemo(() => (doc && verse ? findLanding(doc, verse, shownMeta) : null), [doc, verse, shownMeta]);

  useLayoutEffect(() => {
    if (!doc) return;
    if (!verse || !landing) {
      window.scrollTo(0, 0);
      visibleVerse.current = 1;
      return;
    }
    const el = document.getElementById(`v${landing.verse}`);
    el?.scrollIntoView({ block: 'start' });
    visibleVerse.current = verse;
    return flashVerse(el);
  }, [doc, verse, landing]);

  // Remember the verse at the top of the screen.
  useEffect(() => {
    if (!doc) return;
    let frame = 0;
    let saveTimer = 0;
    const measure = () => {
      frame = 0;
      const header = document.querySelector('.reader-bar')?.getBoundingClientRect().bottom ?? 0;
      for (const el of document.querySelectorAll<HTMLElement>('[data-verse]')) {
        if (el.getBoundingClientRect().top >= header - 4) {
          visibleVerse.current = Number(el.dataset.verse);
          break;
        }
      }
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(
        () => updateSettings({ last: { book, chapter, verse: visibleVerse.current } }),
        400,
      );
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    updateSettings({ last: { book, chapter, verse: verse ?? visibleVerse.current } });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
      window.clearTimeout(saveTimer);
    };
  }, [doc, translation, book, chapter, verse]);

  const prev = previousChapter({ book, chapter });
  const next = nextChapter({ book, chapter });
  const go = (b: BookId, c: number, vv?: number) => navigate(readerPath(translation, b, c, vv));

  const pageNav = page.total > 1 && (
    <nav className="page-nav" aria-label="Pages in this chapter">
      <button
        type="button"
        disabled={page.index === 0}
        onClick={() => go(book, chapter, parseVerseId(page.range.start).verse - 1)}
      >
        ← Earlier verses
      </button>
      <span>
        Page {page.index + 1} of {page.total}
      </span>
      <button
        type="button"
        disabled={page.index === page.total - 1}
        onClick={() => go(book, chapter, parseVerseId(page.range.end).verse + 1)}
      >
        Later verses →
      </button>
    </nav>
  );

  return (
    <>
      <ReaderBar translation={translation} book={book} chapter={chapter} currentVerse={() => visibleVerse.current} />
      <main className="reader-main">
        {result?.status === 'fallback' && (
          <p className="notice" role="status">
            {result.notice}
          </p>
        )}
        {landing?.notice && (
          <p className="notice" role="status">
            {landing.notice}
          </p>
        )}
        <ChapterHeading book={book} chapter={chapter} level={1} />
        {pageNav}
        {current && 'error' in current && (
          <p className="notice" role="alert">
            This chapter couldn’t load. {navigator.onLine ? 'Try again in a moment.' : 'It hasn’t been saved for offline reading yet.'}
          </p>
        )}
        {!current && (
          <p className="loading" aria-live="polite">
            Loading…
          </p>
        )}
        {doc && <ChapterView doc={doc} meta={shownMeta} />}
        {pageNav}

        <nav className="chapter-nav" aria-label="Chapters">
          {prev ? (
            <button type="button" onClick={() => go(prev.book, prev.chapter)}>
              ← {chapterTitle(prev.book, prev.chapter)}
            </button>
          ) : (
            <span />
          )}
          {next ? (
            <button type="button" onClick={() => go(next.book, next.chapter)}>
              {chapterTitle(next.book, next.chapter)} →
            </button>
          ) : (
            <span />
          )}
        </nav>

        {doc && <TranslationNotice translation={shownMeta.id} />}
      </main>
    </>
  );
}
