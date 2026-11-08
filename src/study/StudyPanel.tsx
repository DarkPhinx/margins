import { useLiveQuery } from 'dexie-react-hooks';
import { useDeferredValue, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatRange } from '../bible/refParser';
import { parseVerseId } from '../bible/verseId';
import { chapterTitle, readerPath } from '../reader/nav';
import { AnchorLink, formatDay, ItemCard, JournalRow, KIND_LABEL, LinkCard } from './ItemCard';
import { ItemView, preloadEditor } from './ItemView';
import { XrefView } from '../xrefs/XrefView';
import { InStudyPanel } from './RefLink';
import { AccountNeeded, useReadingOnly } from '../sync/access';
import { PassageView } from './PassageView';
import { byStart, chapterRange, overlaps } from './ranges';
import { useStudy, type StudyTab } from './StudyContext';
import { createJournal, deleteItem, listByKind, search, setHighlight } from './store';
import { loadPassage } from './passage';
import type { TranslationId } from '../bible/types';
import type { HighlightItem, JournalItem, LinkItem, NoteItem, QuestionItem } from './types';
import { dismissUndo, undoDelete, useUndo } from './undo';
import { useChapterStudy } from './useChapterStudy';

const TABS: { id: StudyTab; label: string }[] = [
  { id: 'chapter', label: 'Chapter' },
  { id: 'questions', label: 'Questions' },
  { id: 'journal', label: 'Journal' },
  { id: 'search', label: 'Search' },
];

/** The words a word highlight covers, quoted (with its translation when that isn't the one being read). */
function HighlightedWords({ item }: { item: HighlightItem }) {
  const seg = item.segment!;
  const { start: first, end: last } = item.anchors[0]!;
  const [words, setWords] = useState('');
  useEffect(() => {
    let live = true;
    void loadPassage(seg.translation as TranslationId, { start: first, end: last }).then((verses) => {
      const text = verses
        .map((v) => v.text.slice(v.id === first ? seg.start : 0, v.id === last ? seg.end : undefined))
        .join(' ')
        .trim();
      if (live) setWords(text.length > 80 ? `${text.slice(0, 78)}…` : text);
    });
    return () => {
      live = false;
    };
  }, [seg.translation, seg.start, seg.end, first, last]);
  return (
    <span className="highlight-words">
      {words && `“${words}”`} <span className="highlight-translation">{seg.translation.toUpperCase()}</span>
    </span>
  );
}

function ChapterTab() {
  const { place, selection, push } = useStudy();
  const study = useChapterStudy(place?.book ?? 'JHN', place?.chapter ?? 1);
  if (!place) return null;
  const written = study.items.filter((i): i is NoteItem | QuestionItem => i.kind === 'note' || i.kind === 'question').sort(byStart);
  const highlights = study.items.filter((i): i is HighlightItem => i.kind === 'highlight').sort(byStart);
  const journal = study.items.filter((i): i is JournalItem => i.kind === 'journal');
  const links = study.items.filter((i): i is LinkItem => i.kind === 'link');
  const onSelection = selection ? written.filter((i) => i.anchors.some((a) => overlaps(a, selection))) : [];
  const rest = written.filter((i) => !onSelection.includes(i));
  const heading = <h3 className="panel-title">{chapterTitle(place.book, place.chapter)}</h3>;

  if (!written.length && !highlights.length && !journal.length && !links.length) {
    return (
      <>
        {heading}
        <p className="empty-text">
          Nothing here yet. Tap a verse number to select verses, then add a note, a question or a highlight.
        </p>
      </>
    );
  }
  return (
    <>
      {heading}
      {selection && onSelection.length > 0 && (
        <section>
          <h4 className="panel-section">On {formatRange(selection)}</h4>
          {onSelection.map((i) => (
            <ItemCard key={i.id} item={i} emphasis />
          ))}
        </section>
      )}
      {rest.length > 0 && (
        <section>
          {selection && onSelection.length > 0 && <h4 className="panel-section">Rest of the chapter</h4>}
          {rest.map((i) => (
            <ItemCard key={i.id} item={i} />
          ))}
        </section>
      )}
      {links.length > 0 && (
        <section>
          <h4 className="panel-section">Links</h4>
          {links.map((l) => (
            <LinkCard
              key={l.id}
              item={l}
              onOpen={(target) => {
                push({ type: 'passage', range: target, chapterOnly: false });
              }}
            />
          ))}
        </section>
      )}
      {journal.length > 0 && (
        <section>
          <h4 className="panel-section">Journal</h4>
          <ul className="journal-list">
            {journal.map((e) => (
              <JournalRow key={e.id} item={e} />
            ))}
          </ul>
        </section>
      )}
      {highlights.length > 0 && (
        <section>
          <h4 className="panel-section">Highlights</h4>
          <ul className="highlight-list">
            {highlights.map((h) => (
              <li key={h.id}>
                <span className={`swatch hl-${h.color}`} aria-hidden="true" />
                <AnchorLink range={h.anchors[0]!} />
                {h.segment && <HighlightedWords item={h} />}
                <button
                  type="button"
                  className="link-btn"
                  aria-label={
                    h.segment ? `Remove highlight on words in ${formatRange(h.anchors[0]!)}` : `Remove highlight on ${formatRange(h.anchors[0]!)}`
                  }
                  onClick={() => void (h.segment ? deleteItem(h.id) : setHighlight(h.anchors[0]!, null))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function QuestionsTab() {
  const [filter, setFilter] = useState<'open' | 'answered' | 'all'>('open');
  const questions = useLiveQuery(() => listByKind('question'), []) ?? [];
  const open = questions.filter((q) => q.status === 'open');
  const shown = (filter === 'all' ? questions : questions.filter((q) => q.status === filter)).sort(
    (a, b) => (b.answeredAt ?? b.createdAt) - (a.answeredAt ?? a.createdAt),
  );
  return (
    <>
      <div className="segmented" role="group" aria-label="Show questions">
        {(['open', 'answered', 'all'] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'open' ? `Open (${open.length})` : f === 'answered' ? `Answered (${questions.length - open.length})` : 'All'}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="empty-text">
          {filter === 'open' ? 'No open questions. Select verses and tap Question to ask one.' : 'Nothing here yet.'}
        </p>
      ) : (
        shown.map((q) => <ItemCard key={q.id} item={q} />)
      )}
    </>
  );
}

function JournalTab() {
  const { push, place } = useStudy();
  const entries = (useLiveQuery(() => listByKind('journal'), []) ?? []).sort(
    (a: JournalItem, b: JournalItem) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
  );
  return (
    <>
      <button
        type="button"
        className="primary-btn"
        onClick={async () => {
          const entry = await createJournal();
          push({ type: 'item', id: entry.id, isNew: true });
        }}
      >
        New entry
      </button>
      {place && (
        <button
          type="button"
          className="secondary-btn"
          onClick={async () => {
            const entry = await createJournal(undefined, undefined, '', [chapterRange(place.book, place.chapter)]);
            push({ type: 'item', id: entry.id, isNew: true });
          }}
        >
          New entry on {chapterTitle(place.book, place.chapter)}
        </button>
      )}
      {entries.length === 0 ? (
        <p className="empty-text">Dated entries that aren’t tied to a verse. References you type still become links.</p>
      ) : (
        <ul className="journal-list">
          {entries.map((e) => (
            <JournalRow key={e.id} item={e} />
          ))}
        </ul>
      )}
    </>
  );
}

function SearchTab() {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const hits = useLiveQuery(() => search(deferred), [deferred]) ?? [];
  const { push, place, openNoteDialog } = useStudy();
  const navigate = useNavigate();
  return (
    <>
      <label className="sr-only" htmlFor="study-search">
        Search notes and journal
      </label>
      <input
        id="study-search"
        className="search-input"
        type="search"
        placeholder="Search notes, questions and journal"
        value={query}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
      />
      {deferred.trim() && hits.length === 0 && <p className="empty-text">No matches.</p>}
      <ul className="search-results">
        {hits.map(({ item, snippet }) => (
          <li key={item.id}>
            <button
              type="button"
              className="search-hit"
              onClick={() => {
                const anchor = item.anchors[0];
                if (anchor) {
                  const { book, chapter, verse } = parseVerseId(anchor.start);
                  navigate(readerPath(place?.translation ?? 'bsb', book, chapter, verse));
                }
                if (item.kind === 'journal') push({ type: 'item', id: item.id });
                else openNoteDialog({ id: item.id });
              }}
            >
              <span className="search-hit-head">
                <span className={`kind kind-${item.kind}`}>{KIND_LABEL[item.kind]}</span>
                <span className="search-hit-where">
                  {item.kind === 'journal' ? formatDay(item.date) : item.anchors[0] ? formatRange(item.anchors[0]) : ''}
                </span>
              </span>
              <span className="search-hit-text">{snippet}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function UndoBar() {
  const last = useUndo();
  if (!last) return null;
  return (
    <div className="undo-bar" role="status">
      <span>{last.label} deleted.</span>
      <button type="button" className="link-btn" onClick={() => void undoDelete()}>
        Undo
      </button>
      <button type="button" className="link-btn" aria-label="Dismiss" onClick={dismissUndo}>
        ✕
      </button>
    </div>
  );
}

/** The study panel: beside the text on wide screens, a sheet under it on phones. */
export function StudyPanel() {
  const { panelOpen, setPanelOpen, tab, setTab, views } = useStudy();
  // Signed out: cross-references and previews work; the tabs (your own writing) explain accounts.
  const readingOnly = useReadingOnly();
  useEffect(() => {
    if (panelOpen && !readingOnly) void preloadEditor();
  }, [panelOpen, readingOnly]);
  if (!panelOpen) return null;
  const top = views[views.length - 1];
  return (
    <InStudyPanel.Provider value={true}>
    <aside className="study-panel" aria-label="Study">
      <header className="study-head">
        <div className="study-tabs" role="tablist" aria-label="Study modes">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id && !top}
              className={tab === t.id ? 'study-tab active' : 'study-tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="icon-btn" aria-label="Close study panel" onClick={() => setPanelOpen(false)}>
          ✕
        </button>
      </header>
      <div className="study-body" role="tabpanel" aria-label={top ? undefined : TABS.find((t) => t.id === tab)?.label}>
        {top?.type === 'item' ? (
          <ItemView key={top.id} id={top.id} isNew={top.isNew} />
        ) : top?.type === 'passage' ? (
          <PassageView key={`${top.range.start}-${top.range.end}`} range={top.range} />
        ) : top?.type === 'xrefs' ? (
          <XrefView key={`${top.range.start}-${top.range.end}`} range={top.range} />
        ) : readingOnly ? (
          <AccountNeeded title="Your notes, questions and journal" compact />
        ) : tab === 'chapter' ? (
          <ChapterTab />
        ) : tab === 'questions' ? (
          <QuestionsTab />
        ) : tab === 'journal' ? (
          <JournalTab />
        ) : (
          <SearchTab />
        )}
      </div>
      <UndoBar />
    </aside>
    </InStudyPanel.Provider>
  );
}
