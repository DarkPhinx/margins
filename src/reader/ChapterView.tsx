import { Fragment, type ReactNode } from 'react';
import { OMITTED_EXPLANATION } from '../bible/manuscripts';
import { noteLabels } from '../bible/prepare';
import { formatVerseId, makeVerseId } from '../bible/verseId';
import type { Block, ChapterDoc, Inline, Note, NoteRun, TranslationMeta } from '../bible/types';
import { Popup } from './Popup';

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

function renderInline(
  items: Inline[],
  ctx: { doc: ChapterDoc; meta: TranslationMeta; labels: Map<string, string>; notes: Map<string, Note>; anchorIds: boolean },
): ReactNode[] {
  return items.map((item, i) => {
    switch (item.type) {
      case 'verse':
        return (
          <sup key={i} className="verse-num" id={ctx.anchorIds ? `v${item.n}` : undefined} data-verse={item.n}>
            {item.n}
          </sup>
        );
      case 'text': {
        const cls = [item.jesus && 'wj', item.added && 'add', item.divineName && 'nd'].filter(Boolean).join(' ');
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
  const ctx = { doc, meta, labels, notes, anchorIds };

  const renderBlock = (block: Block, i: number): ReactNode => {
    switch (block.type) {
      case 'heading':
        return block.level === 'acrostic' ? (
          <h3 key={i} className="acrostic">
            {renderInline(block.inline, ctx)}
          </h3>
        ) : (
          <h3 key={i} className={block.level === 2 ? 'heading heading-2' : 'heading'}>
            {renderInline(block.inline, ctx)}
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
        return (
          <p key={i} className="parallel-refs">
            {block.text}
          </p>
        );
      case 'descriptive':
        return (
          <p key={i} className="descriptive">
            {renderInline(block.inline, ctx)}
          </p>
        );
      case 'colophon':
        return (
          <p key={i} className="colophon">
            {renderInline(block.inline, ctx)}
          </p>
        );
      case 'para':
        return (
          <p key={i} className={PARA_CLASS[block.style]}>
            {renderInline(block.inline, ctx)}
          </p>
        );
      case 'break':
        return <div key={i} className="stanza-break" aria-hidden="true" />;
    }
  };

  return (
    <article className="chapter" lang="en">
      {doc.blocks.map(renderBlock)}
    </article>
  );
}
