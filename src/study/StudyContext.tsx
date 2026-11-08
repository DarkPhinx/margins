import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { recoverDrafts } from './drafts';
import { useReadingOnly } from '../sync/access';
import type { BookId } from '../bible/books';
import type { TranslationId, VerseId, VerseRange } from '../bible/types';
import { sameBook } from './ranges';

export type StudyTab = 'chapter' | 'questions' | 'journal' | 'search';

export type StudyView =
  | { type: 'item'; id: string; isNew?: boolean }
  | { type: 'passage'; range: VerseRange; chapterOnly: boolean }
  | { type: 'xrefs'; range: VerseRange };

export interface Place {
  translation: TranslationId;
  book: BookId;
  chapter: number;
}

interface StudyState {
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  tab: StudyTab;
  setTab: (tab: StudyTab) => void;
  /** Views stacked over the tabs (an item being edited, a passage being read). */
  views: StudyView[];
  push: (view: StudyView) => void;
  pop: () => void;
  /** Opens the panel on a view, replacing any stack. */
  openView: (view: StudyView) => void;
  selection: VerseRange | null;
  setSelection: (range: VerseRange | null) => void;
  /** Tap a verse number: select it, extend the selection to it, or clear it. */
  selectVerse: (id: VerseId) => void;
  place: Place | null;
  setPlace: (place: Place) => void;
  /** The note or question open in the pop-up over the passage. */
  noteDialog: NoteDialogState | null;
  openNoteDialog: (state: NoteDialogState) => void;
  closeNoteDialog: () => void;
}

export interface NoteDialogState {
  id: string;
  /** Just created: discarded if closed without writing anything. */
  isNew?: boolean;
}

const KEY = 'margins.study.v1';

function loadPanel(): { open: boolean; tab: StudyTab } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { open?: unknown; tab?: unknown };
    const tab = ['chapter', 'questions', 'journal', 'search'].includes(raw.tab as string) ? (raw.tab as StudyTab) : 'chapter';
    return { open: raw.open === true, tab };
  } catch {
    return { open: false, tab: 'chapter' };
  }
}

function savePanel(state: { open: boolean; tab: StudyTab }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Remembering the panel is a convenience only.
  }
}

const noop = () => {};
const StudyContext = createContext<StudyState>({
  panelOpen: false,
  setPanelOpen: noop,
  tab: 'chapter',
  setTab: noop,
  views: [],
  push: noop,
  pop: noop,
  openView: noop,
  selection: null,
  setSelection: noop,
  selectVerse: noop,
  place: null,
  setPlace: noop,
  noteDialog: null,
  openNoteDialog: noop,
  closeNoteDialog: noop,
});

export function useStudy(): StudyState {
  return useContext(StudyContext);
}

/**
 * What tapping a verse number does to the selection:
 * - nothing selected: select that verse;
 * - the only selected verse: clear;
 * - a verse inside a longer selection: narrow to that verse;
 * - a verse nearby (same or next chapter): extend the selection to it;
 * - a verse far away: start a new selection there.
 */
export function nextSelection(current: VerseRange | null, id: VerseId): VerseRange | null {
  const single = { start: id, end: id };
  if (!current || !sameBook(current.start, id)) return single;
  if (current.start === current.end && current.start === id) return null;
  if (id >= current.start && id <= current.end) return single;
  const chapterOf = (v: number) => Math.floor(v / 1000);
  const near = chapterOf(id) >= chapterOf(current.start) - 1 && chapterOf(id) <= chapterOf(current.end) + 1;
  if (!near) return single;
  return { start: Math.min(current.start, id), end: Math.max(current.end, id) };
}

export function StudyProvider({ children }: { children: ReactNode }) {
  // Words typed just before the page last closed are put back first (into your account's
  // notes; signed out there's nothing to put them in, so they're kept for later).
  const readingOnly = useReadingOnly();
  useEffect(() => {
    if (!readingOnly) void recoverDrafts();
  }, [readingOnly]);
  const [panel, setPanel] = useState(loadPanel);
  const [views, setViews] = useState<StudyView[]>([]);
  const [selection, setSelection] = useState<VerseRange | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [noteDialog, setNoteDialog] = useState<NoteDialogState | null>(null);
  const closeNoteDialog = useCallback(() => setNoteDialog(null), []);

  const setPanelOpen = useCallback((open: boolean) => {
    setPanel((p) => {
      const next = { ...p, open };
      savePanel(next);
      return next;
    });
    if (!open) setViews([]);
  }, []);

  const setTab = useCallback((tab: StudyTab) => {
    setPanel((p) => {
      const next = { ...p, tab };
      savePanel(next);
      return next;
    });
    setViews([]);
  }, []);

  const push = useCallback((view: StudyView) => setViews((v) => [...v, view]), []);
  const pop = useCallback(() => setViews((v) => v.slice(0, -1)), []);
  const openView = useCallback(
    (view: StudyView) => {
      setPanelOpen(true);
      setViews([view]);
    },
    [setPanelOpen],
  );
  const selectVerse = useCallback((id: VerseId) => {
    setSelection((cur) => nextSelection(cur, id));
  }, []);
  const setPlaceStable = useCallback((p: Place) => {
    setPlace((cur) =>
      cur && cur.book === p.book && cur.chapter === p.chapter && cur.translation === p.translation ? cur : p,
    );
  }, []);

  const value = useMemo<StudyState>(
    () => ({
      panelOpen: panel.open,
      setPanelOpen,
      tab: panel.tab,
      setTab,
      views,
      push,
      pop,
      openView,
      selection,
      setSelection,
      selectVerse,
      place,
      setPlace: setPlaceStable,
      noteDialog,
      openNoteDialog: setNoteDialog,
      closeNoteDialog,
    }),
    [panel, setPanelOpen, setTab, views, push, pop, openView, selection, selectVerse, place, setPlaceStable, noteDialog, closeNoteDialog],
  );
  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}
