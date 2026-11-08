import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import type { VerseRange } from '../bible/types';
import { LinkDialog } from '../study/LinkDialog';
import { loadPassage } from '../study/passage';
import { rangeLabel } from '../study/ranges';
import { useStudy } from '../study/StudyContext';
import { deleteItem, linksFor } from '../study/store';
import { useNeedAccount } from '../sync/access';
import { crossReferences, XREF_CREDIT, XREF_TOP, type CrossReference } from './xrefs';

/** Short text of a passage for a list row. */
function useSnippets(translation: string, refs: CrossReference[]): Map<string, string> {
  const [snippets, setSnippets] = useState<Map<string, string>>(new Map());
  const key = refs.map((r) => `${r.range.start}-${r.range.end}`).join(',');
  useEffect(() => {
    let live = true;
    void Promise.all(
      refs.map(async (r) => {
        const verses = await loadPassage(translation as never, r.range).catch(() => []);
        const text = verses.map((v) => v.text).join(' ');
        return [`${r.range.start}-${r.range.end}`, text.length > 170 ? `${text.slice(0, 170).replace(/\s+\S*$/, '')}…` : text] as const;
      }),
    ).then((pairs) => {
      if (live) setSnippets(new Map(pairs));
    });
    return () => {
      live = false;
    };
    // key identifies the refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, translation]);
  return snippets;
}

/**
 * Cross-references for a verse or passage, in the study panel so your place
 * in the text is kept: your own links first, then the top ten by readers'
 * votes, with "Show all" for the rest.
 */
export function XrefView({ range }: { range: VerseRange }) {
  const { pop, push, place } = useStudy();
  const translation = place?.translation ?? 'bsb';
  const [all, setAll] = useState<CrossReference[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [linking, setLinking] = useState(false);
  const needAccount = useNeedAccount();
  const links = useLiveQuery(() => linksFor(range), [range.start, range.end]) ?? [];
  const key = `${range.start}-${range.end}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    crossReferences(range).then(
      (refs) => {
        if (!live) return;
        setAll(refs);
        setLoadedKey(key);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
    // key identifies the range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = loadedKey === key ? all : null;
  const shown = current ? (showAll ? current : current.slice(0, XREF_TOP)) : [];
  const snippets = useSnippets(translation, shown);

  /** Opens a passage with its context, still in the panel. */
  const open = (target: VerseRange) => {
    push({ type: 'passage', range: target, chapterOnly: false });
  };

  return (
    <div className="xref-view">
      <div className="item-view-head">
        <button type="button" className="link-btn" onClick={pop}>
          ← Back
        </button>
      </div>
      <h3 className="item-view-title">
        Cross-references <span className="note-dialog-ref">{rangeLabel(range)}</span>
      </h3>

      <section aria-label="Your links">
        <div className="xref-section-head">
          <h4 className="panel-section">Your links</h4>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              // Links are saved, so they need an account.
              if (!needAccount('passage links')) setLinking(true);
            }}
          >
            Link to another passage…
          </button>
        </div>
        {links.length === 0 ? (
          <p className="empty-text">None yet.</p>
        ) : (
          <ul className="xref-list">
            {links.map((l) => {
              const other = l.anchors.find((a) => !(a.start <= range.end && range.start <= a.end)) ?? l.anchors[1]!;
              return (
                <li key={l.id} className="xref-row link-row">
                  <button type="button" className="xref-ref" onClick={() => open(other)}>
                    {rangeLabel(other)}
                  </button>
                  {l.note && <span className="xref-text">{l.note}</span>}
                  <button
                    type="button"
                    className="link-btn xref-remove"
                    aria-label={`Remove link to ${rangeLabel(other)}`}
                    onClick={() => void deleteItem(l.id)}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Cross-references">
        <h4 className="panel-section">From the Treasury and OpenBible</h4>
        {failed && <p className="notice">Cross-references couldn’t load.</p>}
        {!current && !failed && <p className="loading">Loading…</p>}
        {current && current.length === 0 && <p className="empty-text">No cross-references for this passage.</p>}
        {shown.length > 0 && (
          <ol className="xref-list">
            {shown.map((r) => {
              const k = `${r.range.start}-${r.range.end}`;
              return (
                <li key={k} className="xref-row">
                  <button type="button" className="xref-ref" onClick={() => open(r.range)}>
                    {rangeLabel(r.range)}
                  </button>
                  <span className="xref-votes" title={r.votes === null ? 'From the Treasury of Scripture Knowledge' : 'Readers’ votes on OpenBible.info'}>
                    {r.votes === null ? 'TSK' : r.votes}
                  </span>
                  <span className="xref-text">{snippets.get(k) ?? ''}</span>
                </li>
              );
            })}
          </ol>
        )}
        {current && current.length > XREF_TOP && !showAll && (
          <button type="button" className="secondary-btn" onClick={() => setShowAll(true)}>
            Show all {current.length}
          </button>
        )}
        <p className="xref-credit">{XREF_CREDIT}</p>
      </section>

      {linking && <LinkDialog from={range} onClose={() => setLinking(false)} />}
    </div>
  );
}
