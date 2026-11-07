/**
 * Continuous reading: chapters load ahead and behind as you scroll, across
 * book boundaries. The verse at the top of the screen is tracked all the time,
 * and the header, URL and saved position follow it.
 *
 * Bundled translations only. The ESV must never show more than half a book at
 * once, so it always uses the paged reader.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookInfo, type BookId } from '../bible/books';
import { prepareChapter } from '../bible/prepare';
import { makeVerseId } from '../bible/verseId';
import type { ChapterDoc } from '../bible/types';
import { getProvider } from '../translations/registry';
import { updateSettings, useSettings, type Position } from '../settings';
import { ChapterView } from './ChapterView';
import { ChapterHeading, ReaderBar, TranslationNotice } from './ReaderBar';
import { findLanding, flashVerse } from './landing';
import { nextChapter, previousChapter, readerPath, type ChapterRef } from './nav';
import type { ReaderProps } from './PagedReader';

/** How close to an edge (in pixels) before the next chapter loads. */
const AHEAD_PX = 1600;
/** Chapters kept in the page; ones far off screen are dropped beyond this. */
const WINDOW = 6;
/**
 * Below the bar, the line that decides which verse you are "at". It sits just
 * under where a jumped-to verse lands (its scroll-margin-top is 5rem), so
 * reopening a saved place gives back the same verse.
 */
const READING_LINE_OFFSET = 40;

interface Loaded {
  book: BookId;
  chapter: number;
  doc: ChapterDoc;
}

const keyOf = (c: ChapterRef) => `${c.book}.${c.chapter}`;
const sectionFor = (c: ChapterRef) => document.querySelector<HTMLElement>(`section[data-chapter-key="${keyOf(c)}"]`);

const prepared = new WeakMap<ChapterDoc, Map<boolean, ChapterDoc>>();
function prepareCached(doc: ChapterDoc, showManuscriptNotes: boolean): ChapterDoc {
  let byFlag = prepared.get(doc);
  if (!byFlag) prepared.set(doc, (byFlag = new Map()));
  let out = byFlag.get(showManuscriptNotes);
  if (!out) byFlag.set(showManuscriptNotes, (out = prepareChapter(doc, { showManuscriptNotes })));
  return out;
}

function readingLine(): number {
  return (document.querySelector('.reader-bar')?.getBoundingClientRect().bottom ?? 0) + READING_LINE_OFFSET;
}

/** The chapter section under the reading line: what the reader is looking at right now. */
function sectionAtLine(): HTMLElement | null {
  const line = readingLine();
  const sections = [...document.querySelectorAll<HTMLElement>('section[data-chapter-key]')];
  if (!sections.length) return null;
  return sections.find((s) => s.getBoundingClientRect().bottom > line) ?? sections[sections.length - 1]!;
}

/** The chapter and verse at the reading line. */
function measurePosition(): Position | null {
  const line = readingLine();
  const section = sectionAtLine();
  if (!section) return null;
  const [book, chapter] = section.dataset.chapterKey!.split('.') as [BookId, string];
  let verse = 1;
  for (const el of section.querySelectorAll<HTMLElement>('[data-verse]')) {
    if (el.getBoundingClientRect().top <= line) verse = Number(el.dataset.verse);
    else break;
  }
  return { book, chapter: Number(chapter), verse };
}

interface ContinuousReaderProps extends ReaderProps {
  /** Verse to start at when the URL names none; used only when this reader first opens. */
  resumeVerse?: number | null;
}

export function ContinuousReader({ translation, book, chapter, verse, resumeVerse = null }: ContinuousReaderProps) {
  const navigate = useNavigate();
  const settings = useSettings();
  const provider = getProvider(translation);
  const [chapters, setChapters] = useState<Loaded[]>([]);
  const [current, setCurrent] = useState<Position>({ book, chapter, verse: verse ?? 1 });
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const chaptersRef = useRef<Loaded[]>([]);
  const currentRef = useRef(current);
  const generation = useRef(0);
  const busy = useRef({ up: false, down: false });
  /** Path this component wrote to the URL itself, so it isn't mistaken for a jump. */
  const ownPath = useRef<string | null>(null);
  /** A verse to scroll to once its chapter is on the page. */
  const pendingJump = useRef<{ key: string; verse: number | null } | null>(null);
  /** Keeps the view still when chapters are added or removed above it. */
  const scrollAnchor = useRef<{ key: string; top: number } | null>(null);
  const resume = useRef(resumeVerse);
  const saveTimer = useRef<number | undefined>(undefined);
  /**
   * After a jump, the position stays on the verse jumped to until the reader
   * scrolls themselves. Chapters loading above shift the page slightly, and
   * that must not count as moving.
   */
  const heldByJump = useRef(false);
  /**
   * True from the moment a jump starts until the new chapter is on the page and
   * scrolled to. While the old chapters are still showing, nothing may be
   * measured or loaded from them, or they would be stitched onto the new place.
   */
  const jumping = useRef(true);

  useEffect(() => {
    const release = () => {
      heldByJump.current = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) release();
    };
    window.addEventListener('wheel', release, { passive: true });
    window.addEventListener('touchmove', release, { passive: true });
    // Dragging the scrollbar starts with a pointer press.
    window.addEventListener('pointerdown', release, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', release);
      window.removeEventListener('touchmove', release);
      window.removeEventListener('pointerdown', release);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Synced in a layout effect, before the jump below is marked finished, so no
  // check can ever see the new page with the old chapter list.
  useLayoutEffect(() => {
    chaptersRef.current = chapters;
  }, [chapters]);
  /** Schedules a position check and load; set by the tracking effect below. */
  const checkSoon = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    currentRef.current = current;
  }, [current]);

  // Native scroll anchoring would fight the manual anchoring below.
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflowAnchor;
    root.style.overflowAnchor = 'none';
    return () => {
      root.style.overflowAnchor = before;
    };
  }, []);

  const load = useCallback(
    async (ref: ChapterRef): Promise<Loaded> => {
      const result = await provider.read(provider.pageFor(makeVerseId(ref.book, ref.chapter, 1)));
      return { book: ref.book, chapter: ref.chapter, doc: result.doc };
    },
    [provider],
  );

  // Start, or jump when the URL changes from outside (picker, arrow keys, links).
  useEffect(() => {
    const path = readerPath(translation, book, chapter, verse ?? undefined);
    if (path === ownPath.current) return;
    // A jump wins over a position save still waiting to be written.
    window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    jumping.current = true;
    heldByJump.current = false;
    const target = verse ?? resume.current;
    resume.current = null;
    const gen = ++generation.current;
    busy.current = { up: false, down: false };
    load({ book, chapter }).then(
      (loaded) => {
        if (gen !== generation.current) return;
        const doc = prepareCached(loaded.doc, settings.showManuscriptNotes);
        const landing = target ? findLanding(doc, target, provider.meta) : null;
        // Verse 1 means the start of the chapter: show its heading too.
        pendingJump.current = { key: keyOf(loaded), verse: landing && landing.verse > 1 ? landing.verse : null };
        scrollAnchor.current = null;
        setNotice(verse ? (landing?.notice ?? null) : null);
        setFailed(false);
        // Updated at once, not on the next effect, so nothing can act on the old place.
        currentRef.current = { book, chapter, verse: target ?? 1 };
        setCurrent(currentRef.current);
        setChapters([loaded]);
      },
      () => gen === generation.current && setFailed(true),
    );
    // settings.showManuscriptNotes only affects the notice; a change doesn't need a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translation, book, chapter, verse, load]);

  /** Loads the chapter after the last one, or before the first. */
  const extend = useCallback(
    async (dir: 'up' | 'down') => {
      const list = chaptersRef.current;
      if (jumping.current || !list.length || busy.current[dir]) return;
      const edge = dir === 'down' ? list[list.length - 1]! : list[0]!;
      const target = dir === 'down' ? nextChapter(edge) : previousChapter(edge);
      if (!target) return;
      busy.current[dir] = true;
      const gen = generation.current;
      const edgeKey = keyOf(edge);
      try {
        const loaded = await load(target);
        if (gen !== generation.current || jumping.current) return;
        // Drop a chapter from the far end only once it is well off screen.
        const latest = chaptersRef.current;
        let drop = 0;
        if (latest.length >= WINDOW) {
          const far = dir === 'down' ? latest[0]! : latest[latest.length - 1]!;
          const rect = sectionFor(far)?.getBoundingClientRect();
          if (rect && (dir === 'down' ? rect.bottom < -AHEAD_PX : rect.top > window.innerHeight + AHEAD_PX)) drop = 1;
        }
        // Hold steady whatever is on screen now. This reads the page itself, so it
        // can never point at a chapter that isn't there.
        const anchorSection = sectionAtLine();
        if (anchorSection) {
          scrollAnchor.current = { key: anchorSection.dataset.chapterKey!, top: anchorSection.getBoundingClientRect().top };
        }
        setChapters((cur) => {
          // Only attach to the chapter it was loaded for. Anything else is stale.
          const curEdge = dir === 'down' ? cur[cur.length - 1] : cur[0];
          if (!curEdge || keyOf(curEdge) !== edgeKey) return cur;
          if (cur.some((c) => keyOf(c) === keyOf(loaded))) return cur;
          return dir === 'down' ? [...cur.slice(drop), loaded] : [loaded, ...cur.slice(0, cur.length - drop)];
        });
        setFailed(false);
      } catch {
        if (gen === generation.current) setFailed(true);
      } finally {
        // A load from before a jump must not unlock loading for the new place.
        if (gen === generation.current) busy.current[dir] = false;
        // Whatever happened, look again: a request turned away while this one
        // was busy may be needed now, even if the reader isn't scrolling.
        checkSoon.current();
      }
    },
    [load],
  );

  // After chapters change: keep the view still, then make any pending jump.
  useLayoutEffect(() => {
    const anchor = scrollAnchor.current;
    if (anchor) {
      scrollAnchor.current = null;
      const el = document.querySelector<HTMLElement>(`section[data-chapter-key="${anchor.key}"]`);
      if (el) window.scrollBy(0, el.getBoundingClientRect().top - anchor.top);
    }
    const jump = pendingJump.current;
    if (!jump) return;
    const section = document.querySelector<HTMLElement>(`section[data-chapter-key="${jump.key}"]`);
    if (!section) return;
    pendingJump.current = null;
    heldByJump.current = true;
    jumping.current = false;
    if (jump.verse) {
      const el = section.querySelector(`[data-verse="${jump.verse}"]`);
      el?.scrollIntoView({ block: 'start' });
      return flashVerse(el);
    }
    window.scrollTo(0, Math.max(0, section.getBoundingClientRect().top + window.scrollY - readingLine() + READING_LINE_OFFSET));
  }, [chapters]);

  // Track the position and load more as the reader nears either end.
  useEffect(() => {
    if (!chapters.length) return;
    let frame = 0;

    const check = () => {
      frame = 0;
      // Mid-jump the page still shows the old chapters: ignore them entirely.
      if (jumping.current) return;
      const pos = heldByJump.current ? null : measurePosition();
      const cur = currentRef.current;
      if (pos && (pos.book !== cur.book || pos.chapter !== cur.chapter || pos.verse !== cur.verse)) {
        currentRef.current = pos;
        setCurrent(pos);
      }
      const root = document.documentElement;
      // No layout (e.g. a test DOM): don't keep loading.
      if (root.scrollHeight === 0) return;
      if (root.scrollHeight - (window.scrollY + window.innerHeight) < AHEAD_PX) void extend('down');
      if (window.scrollY < AHEAD_PX) void extend('up');
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    checkSoon.current = onScroll;

    frame = requestAnimationFrame(check);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // At the very top or bottom the page can't scroll, so no scroll event comes;
    // a wheel or swipe still means "show me more".
    window.addEventListener('wheel', onScroll, { passive: true });
    window.addEventListener('touchmove', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('wheel', onScroll);
      window.removeEventListener('touchmove', onScroll);
      cancelAnimationFrame(frame);
      checkSoon.current = () => {};
    };
  }, [chapters, extend]);

  // Write the position to the URL and settings at most every 300 ms, even while
  // scrolling never stops, always with the latest position.
  useEffect(() => {
    if (jumping.current || !chaptersRef.current.length || saveTimer.current !== undefined) return;
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined;
      // Never write the old place back while a jump is loading.
      if (jumping.current) return;
      const pos = currentRef.current;
      const path = readerPath(translation, pos.book, pos.chapter, pos.verse);
      ownPath.current = path;
      navigate(path, { replace: true });
      updateSettings({ translation, last: pos });
    }, 300);
  }, [current, translation, navigate]);
  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
    },
    [],
  );

  const docs = useMemo(
    () => chapters.map((c) => ({ ...c, doc: prepareCached(c.doc, settings.showManuscriptNotes) })),
    [chapters, settings.showManuscriptNotes],
  );
  const last = chapters[chapters.length - 1];
  const atEnd = last ? !nextChapter(last) : false;

  return (
    <>
      <ReaderBar
        translation={translation}
        book={current.book}
        chapter={current.chapter}
        currentVerse={() => currentRef.current.verse}
      />
      <main className="reader-main continuous">
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {!chapters.length && !failed && (
          <p className="loading" aria-live="polite">
            Loading…
          </p>
        )}
        {docs.map((c) => (
          <section
            key={keyOf(c)}
            data-chapter-key={keyOf(c)}
            className={c.chapter === 1 ? 'continuous-chapter book-start' : 'continuous-chapter'}
            aria-label={`${bookInfo(c.book).name} ${c.chapter}`}
          >
            <ChapterHeading book={c.book} chapter={c.chapter} level={2} />
            <ChapterView doc={c.doc} meta={provider.meta} anchorIds={false} />
          </section>
        ))}
        {failed && (
          <p className="notice" role="alert">
            The next chapter couldn’t load. {navigator.onLine ? 'Scroll again to retry.' : 'It hasn’t been saved for offline reading yet.'}
          </p>
        )}
        {chapters.length > 0 && !atEnd && !failed && (
          <p className="loading continuous-more" aria-hidden="true">
            Loading the next chapter…
          </p>
        )}
        {atEnd && <p className="continuous-end">End of Revelation</p>}
        {chapters.length > 0 && <TranslationNotice translation={translation} />}
      </main>
    </>
  );
}
