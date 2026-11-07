import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { formatRange } from '../bible/refParser';
import type { VerseRange } from '../bible/types';
import { clearDraft, writeDraft, type DraftField } from './drafts';
import { loadPassage, type PassageVerse } from './passage';
import { AnchorLink, KIND_LABEL } from './ItemCard';
import { useStudy } from './StudyContext';
import { useNavigate } from 'react-router-dom';
import { parseVerseId } from '../bible/verseId';
import { Picker } from '../reader/Picker';
import { readerPath } from '../reader/nav';
import { getSettings } from '../settings';
import { chapterRange, rangeLabel } from './ranges';
import { discardIfEmpty, getItem, markAnswered, saveAnswer, saveBody, saveJournalMeta, setAnchors } from './store';
import { emptyDoc } from './text';
import type { RichDoc } from './types';
import { deleteWithUndo } from './undo';

// The editor is large, so it is a separate file (also cached for offline use). It
// is fetched as soon as the panel opens or verses are selected, so it's ready by
// the time you start writing.
let editorModule: Promise<typeof import('./RichEditor')> | null = null;
export function preloadEditor(): Promise<typeof import('./RichEditor')> {
  editorModule ??= import('./RichEditor');
  return editorModule;
}
const RichEditor = lazy(() => preloadEditor().then((m) => ({ default: m.RichEditor })));

const SAVE_DELAY_MS = 400;

/**
 * Saves after a short pause in typing, and always on leaving. Each change is
 * also kept as a draft at once, so nothing is lost if the page closes mid-save.
 * With `merge`, changes to different fields (a journal's date and title) add up.
 */
function useDebouncedSave<T>(id: string, field: DraftField, save: (value: T) => Promise<void>, merge = false) {
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [state, setState] = useState<'saved' | 'saving'>('saved');
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (!p) return Promise.resolve();
    return saveRef.current(p.value).then(() => {
      // Only drop the draft if nothing newer arrived while saving.
      if (!pending.current) {
        clearDraft(id, field);
        setState('saved');
      }
    });
  }, [id, field]);

  const queue = useCallback(
    (value: T) => {
      const next = merge && pending.current ? ({ ...pending.current.value, ...value } as T) : value;
      pending.current = { value: next };
      writeDraft(id, field, next);
      setState('saving');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush, id, field, merge],
  );

  // Save at once when leaving: closing the tab, reloading, or switching apps on a phone.
  useEffect(() => {
    const onHide = () => void flush();
    const onVisibility = () => document.visibilityState === 'hidden' && void flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      void flush();
    };
  }, [flush]);
  return { queue, flush, state };
}

interface ItemViewProps {
  id: string;
  isNew?: boolean;
  /** 'panel': inside the study panel. 'dialog': the pop-up over the passage, with the verse text shown. */
  layout?: 'panel' | 'dialog' | 'page';
  /** Called after saving when the view closes. Defaults to going back in the panel. */
  onClose?: () => void;
  /** Lets the pop-up close the view (saving first) from a click outside or Esc. */
  closeRef?: { current: (() => Promise<void>) | null };
}

/** Writing or editing one note, question or journal entry. Changes save as you type. */
export function ItemView({ id, isNew, layout = 'panel', onClose, closeRef }: ItemViewProps) {
  const { pop, place } = useStudy();
  const close = onClose ?? pop;
  const navigate = useNavigate();
  const translation = place?.translation ?? getSettings().translation;
  const item = useLiveQuery(() => getItem(id), [id]);
  const body = useDebouncedSave<RichDoc>(id, 'body', (doc) => saveBody(id, doc));
  const answer = useDebouncedSave<RichDoc>(id, 'answer', (doc) => saveAnswer(id, doc));
  const meta = useDebouncedSave<{ date?: string; title?: string }>(id, 'meta', (patch) => saveJournalMeta(id, patch), true);
  const [title, setTitle] = useState<string | null>(null);

  /** Save everything, drop a new item left empty, then close. */
  const back = async () => {
    await Promise.all([body.flush(), answer.flush(), meta.flush()]);
    if (isNew) await discardIfEmpty(id);
    close();
  };
  /** A reference clicked in the editor: save, then go to that verse in the reader. */
  const followReference = async (range: VerseRange, chapterOnly: boolean) => {
    await Promise.all([body.flush(), answer.flush(), meta.flush()]);
    // The pop-up sits over the reader, so it closes; the panel and journal page stay as they are.
    if (layout === 'dialog') close();
    const { book, chapter, verse } = parseVerseId(range.start);
    navigate(readerPath(translation, book, chapter, chapterOnly ? undefined : verse));
  };
  useEffect(() => {
    if (closeRef) closeRef.current = back;
  });

  if (item === undefined) return <p className="loading">Loading…</p>;
  if (item === null || item.kind === 'highlight' || item.deletedAt !== null) {
    return (
      <div className="item-view">
        <button type="button" className="link-btn" onClick={close}>
          {layout === 'dialog' ? 'Close' : '← Back'}
        </button>
        <p className="empty-text">This item was deleted.</p>
      </div>
    );
  }

  const saving = [body.state, answer.state, meta.state].includes('saving');
  const saveState = (
    <span className="save-state" aria-live="polite">
      {saving ? 'Saving…' : 'Saved'}
    </span>
  );
  const kindLabel = item.kind === 'journal' ? 'Journal entry' : KIND_LABEL[item.kind];
  return (
    <div className={`item-view item-view-${layout}`}>
      {layout === 'dialog' ? (
        <div className="note-dialog-head">
          <h2>
            {kindLabel}
            {item.anchors.map((a) => (
              <span key={`${a.start}-${a.end}`} className="note-dialog-ref">
                {formatRange(a)}
              </span>
            ))}
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => void back()}>
            ✕
          </button>
        </div>
      ) : (
        <>
          <div className="item-view-head">
            <button type="button" className="link-btn" onClick={() => void back()}>
              {layout === 'page' ? '← Journal' : '← Back'}
            </button>
            {saveState}
          </div>
          <h3 className="item-view-title">
            {kindLabel}
            {/* A journal entry's chapter is shown (and changed) in its own row below. */}
            {item.kind !== 'journal' &&
              item.anchors.map((a) => <AnchorLink key={`${a.start}-${a.end}`} range={a} />)}
          </h3>
        </>
      )}

      {layout === 'dialog' && item.anchors.map((a) => <VerseText key={`${a.start}-${a.end}`} range={a} />)}
      {layout === 'dialog' && item.kind !== 'journal' && item.anchors.length === 0 && (
        <p className="note-standalone">A standalone {item.kind}, not tied to any verse.</p>
      )}

      {item.kind === 'journal' && (
        <div className="journal-meta">
          <label>
            <span>Date</span>
            <input
              type="date"
              defaultValue={item.date}
              onChange={(e) => e.target.value && meta.queue({ date: e.target.value })}
            />
          </label>
          <label>
            <span>Title</span>
            <input
              type="text"
              value={title ?? item.title}
              placeholder="Optional"
              onChange={(e) => {
                setTitle(e.target.value);
                meta.queue({ title: e.target.value });
              }}
            />
          </label>
        </div>
      )}
      {item.kind === 'journal' && <ChapterTie id={id} anchors={item.anchors} />}

      <Suspense fallback={<p className="loading">Loading the editor…</p>}>
      <RichEditor
        key={id}
        initial={item.body}
        onChange={body.queue}
        onReference={(r, c) => void followReference(r, c)}
        label={item.kind === 'journal' ? 'Journal entry' : item.kind === 'question' ? 'Question' : 'Note'}
        placeholder={
          item.kind === 'question'
            ? 'What are you asking?'
            : item.kind === 'journal'
              ? 'Write freely. References like Jn 3:16 become links.'
              : 'Write your note. References like Rom 8:28 become links.'
        }
        autoFocus={isNew}
      />
      </Suspense>

      {item.kind === 'question' && (
        <section className="answer-edit">
          <label className="toggle-row">
            <span>
              <span className="toggle-label">Answered</span>
              <span className="toggle-hint">The question stays open until you mark it answered.</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={item.status === 'answered'}
              onChange={(e) => void markAnswered(id, e.target.checked)}
            />
          </label>
          {item.status === 'answered' && (
            <Suspense fallback={null}>
            <RichEditor
              key={`${id}-answer`}
              initial={item.answer ?? emptyDoc()}
              onChange={answer.queue}
              onReference={(r, c) => void followReference(r, c)}
              label="Answer"
              placeholder="Your answer (optional)"
            />
            </Suspense>
          )}
        </section>
      )}

      <div className="item-view-foot">
        <button
          type="button"
          className="danger"
          onClick={async () => {
            await Promise.all([body.flush(), answer.flush(), meta.flush()]);
            if (isNew && (await discardIfEmpty(id))) {
              close();
              return;
            }
            await deleteWithUndo(id, kindLabel);
            close();
          }}
        >
          Delete
        </button>
        {layout === 'dialog' && (
          <>
            {saveState}
            <button type="button" className="primary-btn done-btn" onClick={() => void back()}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** The verses a note is on, shown above the editor in the pop-up. */
function VerseText({ range }: { range: VerseRange }) {
  const { place } = useStudy();
  const translation = place?.translation ?? 'bsb';
  const key = `${translation}:${range.start}-${range.end}`;
  const [loaded, setLoaded] = useState<{ key: string; verses: PassageVerse[] } | null>(null);
  useEffect(() => {
    let live = true;
    loadPassage(translation, range).then(
      (verses) => live && setLoaded({ key, verses }),
      () => live && setLoaded({ key, verses: [] }),
    );
    return () => {
      live = false;
    };
    // key covers translation and range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (loaded?.key !== key) return <p className="note-verses loading">Loading the verses…</p>;
  const multiChapter = new Set(loaded.verses.map((v) => v.chapter)).size > 1;
  return (
    <blockquote className="note-verses" aria-label={`Text of ${formatRange(range)}`}>
      {loaded.verses.map((v) => (
        <span key={v.id}>
          <sup className="verse-num">{multiChapter ? `${v.chapter}:${v.verse}` : v.verse}</sup>
          {v.text}{' '}
        </span>
      ))}
    </blockquote>
  );
}

/** A journal entry's chapter: standalone, or tied to a chapter you can read, change or remove. */
function ChapterTie({ id, anchors }: { id: string; anchors: VerseRange[] }) {
  const [picking, setPicking] = useState(false);
  const navigate = useNavigate();
  const { place } = useStudy();
  const translation = place?.translation ?? getSettings().translation;
  const anchor = anchors[0];
  const at = anchor ? parseVerseId(anchor.start) : null;
  return (
    <div className="chapter-tie">
      {anchor && at ? (
        <>
          <span className="chapter-tie-label">
            On <strong>{rangeLabel(anchor)}</strong>
          </span>
          <button type="button" className="link-btn" onClick={() => navigate(readerPath(translation, at.book, at.chapter, at.verse))}>
            Read
          </button>
          <button type="button" className="link-btn" onClick={() => setPicking(true)}>
            Change
          </button>
          <button type="button" className="link-btn" onClick={() => void setAnchors(id, [])}>
            Remove
          </button>
        </>
      ) : (
        <>
          <span className="chapter-tie-label">Standalone entry</span>
          <button type="button" className="link-btn" onClick={() => setPicking(true)}>
            Tie to a chapter
          </button>
        </>
      )}
      {picking && (
        <Picker
          book={at?.book ?? place?.book ?? getSettings().last.book}
          chapterOnly
          onClose={() => setPicking(false)}
          onPick={(book, chapter) => {
            setPicking(false);
            void setAnchors(id, [chapterRange(book, chapter)]);
          }}
        />
      )}
    </div>
  );
}
