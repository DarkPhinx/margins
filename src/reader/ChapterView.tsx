import { Fragment, useMemo, useRef, type ReactNode } from 'react';
import { OMITTED_EXPLANATION } from '../bible/manuscripts';
import { noteLabels } from '../bible/prepare';
import { textPositions } from '../bible/verseText';
import { formatVerseId, makeVerseId } from '../bible/verseId';
import type { Block, ChapterDoc, Inline, Note, NoteRun, TranslationMeta } from '../bible/types';
import { Popup } from './Popup';
import { useStudy } from '../study/StudyContext';
import { useChapterStudy, type ChapterStudy, type VerseSegment } from '../study/useChapterStudy';
import type { HighlightColor } from '../study/types';

interface ChapterViewProps {
  doc: ChapterDoc;
  meta: TranslationMeta;
  /** Give verses id="v{n}". Off when several chapters share the page. */
  anchorIds?: boolean;
}

export function NoteText({ runs }: { runs: NoteRun[] }) {
  return (
    <>
      {runs.map((r, i) =>
        r.verse ? (
          <sup key={i} className="note-verse">
            {r.text}
          </sup>
        ) : r.quote ? (
          <em key={i}>{r.text}</em>
        ) : (
          <Fragment key={i}>{r.text}</Fragment>
        ),
      )}
    </>
  );
}

function appNoteLabel(meta: TranslationMeta): string {
  return meta.id === 'bsb'
    ? 'Note from Margins, using the BSB’s own footnote wording.'
    : `Note from Margins, not part of the ${meta.abbreviation} text. Wording from the BSB’s footnote.`;
}

interface RenderContext {
  doc: ChapterDoc;
  meta: TranslationMeta;
  labels: Map<string, string>;
  notes: Map<string, Note>;
  anchorIds: boolean;
  study: ChapterStudy;
  selected: (verse: number) => boolean;
  onVerse: (verse: number) => void;
  onNotes: (verse: number) => void;
  /** The verse being rendered; carried across blocks. */
  current: { verse: number };
  /** The block being rendered (its index in the chapter). */
  block: number;
  /** For word highlights: where each character falls in its verse's plain text. */
  positions: () => Map<string, number[]>;
}

/**
 * A verse's text run cut where word highlights start and end: [text, colour]
 * pieces in order. Collapsed whitespace takes the colour of what follows it,
 * so a space between two highlighted words is highlighted too.
 */
function cutForSegments(text: string, positions: number[], segments: VerseSegment[]): [string, HighlightColor | null][] {
  const colorAt = (p: number) => segments.find((s) => p >= s.start && p < s.end)?.color ?? null;
  const colors: (HighlightColor | null)[] = [];
  for (let k = text.length - 1; k >= 0; k--) {
    const p = positions[k] ?? -1;
    colors[k] = p >= 0 ? colorAt(p) : (colors[k + 1] ?? null);
  }
  const out: [string, HighlightColor | null][] = [];
  for (let k = 0; k < text.length; k++) {
    const last = out[out.length - 1];
    if (last && last[1] === colors[k]) last[0] += text[k];
    else out.push([text[k]!, colors[k]!]);
  }
  return out;
}

function renderInline(items: Inline[], ctx: RenderContext, decorate: boolean): ReactNode[] {
  return items.map((item, i) => {
    switch (item.type) {
      case 'verse': {
        ctx.current.verse = item.n;
        const selected = ctx.selected(item.n);
        const notes = ctx.study.notes.get(item.n) ?? 0;
        return (
          <Fragment key={i}>
            <sup
              className={selected ? 'verse-num verse-num-selected' : 'verse-num'}
              id={ctx.anchorIds ? `v${item.n}` : undefined}
              data-verse={item.n}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`Verse ${item.n}`}
              onClick={() => ctx.onVerse(item.n)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  ctx.onVerse(item.n);
                }
              }}
            >
              {item.n}
            </sup>
            {notes > 0 && (
              <button
                type="button"
                className="verse-note-dot"
                aria-label={`${notes === 1 ? 'A note' : `${notes} notes`} on verse ${item.n}`}
                onClick={() => ctx.onNotes(item.n)}
              />
            )}
          </Fragment>
        );
      }
      case 'text': {
        const v = ctx.current.verse;
        const highlight = decorate && v ? ctx.study.highlights.get(v) : undefined;
        /** Classes for this run; a word highlight's colour shows over the verse's. */
        const classes = (words: HighlightColor | null = null) =>
          [
            item.jesus && 'wj',
            item.added && 'add',
            item.divineName && 'nd',
            words ? `hl hl-${words} hl-words` : highlight && `hl hl-${highlight}`,
            decorate && v && ctx.selected(v) && 'sel',
          ]
            .filter(Boolean)
            .join(' ');
        const cls = classes();
        // In verse text, every run carries its verse so it can be hovered and clicked.
        const segments = decorate && v ? (ctx.study.segments.get(v) ?? []).filter((s) => s.translation === ctx.meta.id) : [];
        const positions = segments.length ? ctx.positions().get(`${ctx.block}:${i}`) : undefined;
        if (decorate && v && positions) {
          return (
            <Fragment key={i}>
              {cutForSegments(item.text, positions, segments).map(([text, color], k) => (
                <span key={k} className={classes(color) || undefined} data-v={v}>
                  {text}
                </span>
              ))}
            </Fragment>
          );
        }
        if (decorate && v) {
          return (
            <span key={i} className={cls || undefined} data-v={v}>
              {item.text}
            </span>
          );
        }
        return cls ? (
          <span key={i} className={cls}>
            {item.text}
          </span>
        ) : (
          <Fragment key={i}>{item.text}</Fragment>
        );
      }
      case 'bracket':
        return (
          <span key={i} className="variant-bracket" aria-hidden="true">
            {item.side === 'open' ? '[' : ']'}
          </span>
        );
      case 'note': {
        const note = ctx.notes.get(item.id);
        const label = ctx.labels.get(item.id) ?? '*';
        if (!note) return null;
        return (
          <Popup key={i} label={`Footnote ${label}`} trigger={label} triggerClassName="note-ref">
            {note.origin === 'app' && <span className="popup-meta">{appNoteLabel(ctx.meta)}</span>}
            <span className="popup-body">
              <NoteText runs={note.text} />
            </span>
          </Popup>
        );
      }
      case 'omitted': {
        const ref = formatVerseId(makeVerseId(ctx.doc.book, ctx.doc.chapter, item.n));
        return (
          <Popup
            key={i}
            id={ctx.anchorIds ? `v${item.n}` : undefined}
            dataVerse={item.n}
            label={`${ref}, not in the earliest manuscripts`}
            trigger={item.n}
            triggerClassName="omitted-verse"
          >
            <span className="popup-meta">{ref}</span>
            <span className="popup-body">
              <em>{item.wording}</em>
            </span>
            <span className="popup-explain">
              {OMITTED_EXPLANATION}{' '}
              {item.wordingSource === 'BSB footnote' ? 'Wording from the BSB footnote.' : 'Wording from the KJV.'}
            </span>
          </Popup>
        );
      }
    }
  });
}

const PARA_CLASS: Record<string, string> = {
  p: 'para',
  pmo: 'para para-embedded',
  pc: 'para para-center',
  q1: 'poetry q1',
  q2: 'poetry q2',
  qr: 'poetry qr',
  li1: 'list li1',
  li2: 'list li2',
};

export function ChapterView({ doc, meta, anchorIds = true }: ChapterViewProps) {
  const labels = noteLabels(doc);
  const notes = new Map(doc.notes.map((n) => [n.id, n]));
  const study = useChapterStudy(doc.book, doc.chapter);
  const positions = useMemo(() => textPositions(doc), [doc]);
  const { selection, selectVerse, setSelection, setPanelOpen, setTab, openNoteDialog } = useStudy();
  const idOf = (verse: number) => makeVerseId(doc.book, doc.chapter, verse);
  const scope = `${doc.book}.${doc.chapter}`;
  const hoverStyle = useRef<HTMLStyleElement>(null);
  const hovered = useRef(0);
  const ctx: RenderContext = {
    doc,
    meta,
    labels,
    notes,
    anchorIds,
    study,
    selected: (verse) => !!selection && idOf(verse) >= selection.start && idOf(verse) <= selection.end,
    onVerse: (verse) => selectVerse(idOf(verse)),
    onNotes: (verse) => {
      // One note: open it. Several: list them in the panel.
      const id = idOf(verse);
      const here = study.items.filter(
        (i) => (i.kind === 'note' || i.kind === 'question') && i.anchors.some((a) => Math.max(a.start, idOf(1)) === id),
      );
      if (here.length === 1) {
        openNoteDialog({ id: here[0]!.id });
        return;
      }
      setSelection({ start: id, end: id });
      setTab('chapter');
      setPanelOpen(true);
    },
    current: { verse: 0 },
    block: 0,
    positions: () => positions,
  };

  /** Tints the whole verse under the pointer, without re-rendering the chapter. */
  const setHover = (verse: number) => {
    if (verse === hovered.current || !hoverStyle.current) return;
    hovered.current = verse;
    hoverStyle.current.textContent = verse
      ? // Highlighted text keeps its colour under the pointer.
        `@media (hover: hover) { .chapter[data-scope="${scope}"] [data-v="${verse}"] { cursor: pointer; } .chapter[data-scope="${scope}"] [data-v="${verse}"]:not(.hl) { background-color: var(--verse-hover); } }`
      : '';
  };

  /** Clicking anywhere in a verse's text selects it (or adds it to the selection). */
  const onTextClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, [role="button"], [role="dialog"], .popup, input, textarea')) return;
    // Dragging to select words for copying is not a tap on the verse.
    if (window.getSelection?.()?.toString()) return;
    const run = target.closest<HTMLElement>('[data-v]');
    if (run) selectVerse(idOf(Number(run.dataset.v)));
  };
  const onTextHover = (e: React.MouseEvent) => {
    const run = (e.target as HTMLElement).closest<HTMLElement>('[data-v]');
    setHover(run ? Number(run.dataset.v) : 0);
  };

  const renderBlock = (block: Block, i: number): ReactNode => {
    ctx.block = i;
    switch (block.type) {
      case 'heading':
        return block.level === 'acrostic' ? (
          <h3 key={i} className="acrostic">
            {renderInline(block.inline, ctx, false)}
          </h3>
        ) : (
          <h3 key={i} className={block.level === 2 ? 'heading heading-2' : 'heading'}>
            {renderInline(block.inline, ctx, false)}
          </h3>
        );
      case 'division':
        return (
          <div key={i} className="division">
            <div>{block.text}</div>
            {block.subtitle && <div className="division-sub">{block.subtitle}</div>}
          </div>
        );
      case 'parallelRefs':
        // The BSB's "(Matthew 5:3–12; Luke 6:20–23)" lines under headings are kept in the
        // data but not shown in the reader.
        return null;
      case 'descriptive':
        return (
          <p key={i} className="descriptive">
            {renderInline(block.inline, ctx, true)}
          </p>
        );
      case 'colophon':
        return (
          <p key={i} className="colophon">
            {renderInline(block.inline, ctx, false)}
          </p>
        );
      case 'para':
        return (
          <p key={i} className={PARA_CLASS[block.style]}>
            {renderInline(block.inline, ctx, true)}
          </p>
        );
      case 'break':
        return <div key={i} className="stanza-break" aria-hidden="true" />;
    }
  };

  return (
    <article
      className="chapter"
      lang="en"
      data-scope={scope}
      onClick={onTextClick}
      onMouseOver={onTextHover}
      onMouseLeave={() => setHover(0)}
    >
      <style ref={hoverStyle} />
      {doc.blocks.map(renderBlock)}
    </article>
  );
}
