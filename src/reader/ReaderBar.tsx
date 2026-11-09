import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BookId } from '../bible/books';
import type { TranslationId } from '../bible/types';
import { getProvider, listProviders } from '../translations/registry';
import { updateSettings } from '../settings';
import { Picker } from './Picker';
import { useStudy } from '../study/StudyContext';
import { MenuButton } from '../shell/menu';
import { SettingsPanel } from './SettingsPanel';
import { chapterTitle, nextChapter, previousChapter, readerPath } from './nav';

interface ReaderBarProps {
  translation: TranslationId;
  /** The chapter the reader is in now. */
  book: BookId;
  chapter: number;
  /** The verse at the top of the screen, read when switching translation. */
  currentVerse: () => number;
}

/**
 * The settings panel lives above the reader, so it stays open when a setting
 * swaps the paged and continuous readers.
 */
export const SettingsContext = createContext<{ open: boolean; setOpen: (open: boolean) => void }>({
  open: false,
  setOpen: () => {},
});

export function SettingsHost({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SettingsContext.Provider value={{ open, setOpen }}>
      {children}
      {open && <SettingsPanel onClose={() => setOpen(false)} />}
    </SettingsContext.Provider>
  );
}

/** Top bar shared by the paged and continuous readers: place, translation, settings, arrow keys. */
export function ReaderBar({ translation, book, chapter, currentVerse }: ReaderBarProps) {
  const navigate = useNavigate();
  const [picker, setPicker] = useState(false);
  // Arrow keys pause while settings are open (Settings is in the sidebar).
  const { open: settingsOpen } = useContext(SettingsContext);
  const title = chapterTitle(book, chapter);
  const abbreviation = getProvider(translation).meta.abbreviation;
  const { panelOpen, setPanelOpen, setPlace } = useStudy();

  useEffect(() => {
    document.title = `${title} (${abbreviation}) · Margins`;
  }, [title, abbreviation]);

  // The study panel follows the chapter you're reading.
  useEffect(() => {
    setPlace({ translation, book, chapter });
  }, [translation, book, chapter, setPlace]);

  useEffect(() => {
    const prev = previousChapter({ book, chapter });
    const next = nextChapter({ book, chapter });
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || picker || settingsOpen) return;
      if ((e.target as HTMLElement).closest('input, select, textarea, dialog, [contenteditable="true"], .study-panel')) return;
      if (e.key === 'ArrowLeft' && prev) navigate(readerPath(translation, prev.book, prev.chapter));
      if (e.key === 'ArrowRight' && next) navigate(readerPath(translation, next.book, next.chapter));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [book, chapter, translation, navigate, picker, settingsOpen]);

  return (
    <>
      <header className="reader-bar">
        <div className="reader-bar-inner">
          <div className="bar-left">
          <MenuButton />
          <button type="button" className="place-btn" onClick={() => setPicker(true)} aria-label={`${title}. Choose a passage`}>
            {title}
            <span aria-hidden="true" className="caret">
              ▾
            </span>
          </button>
          </div>
          <div className="bar-right">
            <label className="sr-only" htmlFor="translation">
              Translation
            </label>
            <select
              id="translation"
              className="translation-select"
              value={translation}
              onChange={(e) => {
                // Choosing a translation is the setting; following a link to one isn't.
                updateSettings({ translation: e.target.value as TranslationId });
                navigate(readerPath(e.target.value, book, chapter, currentVerse()));
              }}
            >
              {listProviders().map((p) => (
                <option key={p.meta.id} value={p.meta.id}>
                  {p.meta.abbreviation}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={panelOpen ? 'icon-btn study-toggle active' : 'icon-btn study-toggle'}
              onClick={() => setPanelOpen(!panelOpen)}
              aria-label="Study"
              aria-pressed={panelOpen}
              title="Notes, questions, journal and search"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  d="M6 3.5h9l3 3V20.5H6zM9 9h6M9 12.5h6M9 16h4"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>
      {picker && (
        <Picker
          book={book}
          onClose={() => setPicker(false)}
          onPick={(b, c, v) => {
            setPicker(false);
            navigate(readerPath(translation, b, c, v));
          }}
        />
      )}
    </>
  );
}

export function TranslationNotice({ translation }: { translation: TranslationId }) {
  const meta = getProvider(translation).meta;
  return (
    <footer className="translation-notice">
      <p>
        {meta.notice}{' '}
        {meta.noticeUrl && (
          <a href={meta.noticeUrl} target="_blank" rel="noreferrer">
            {new URL(meta.noticeUrl).hostname}
          </a>
        )}
      </p>
    </footer>
  );
}

export function ChapterHeading({ book, chapter, level }: { book: BookId; chapter: number; level: 1 | 2 }) {
  const Tag = level === 1 ? 'h1' : 'h2';
  const name = chapterTitle(book, chapter).replace(/ \d+$/, '');
  return (
    <Tag className="chapter-title">
      <span className="chapter-book">{book === 'PSA' ? 'Psalm' : name}</span>
      {chapterTitle(book, chapter) !== name && <span className="chapter-num">{chapter}</span>}
    </Tag>
  );
}
