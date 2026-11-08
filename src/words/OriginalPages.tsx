/**
 * The Original language area: search, a verse's Hebrew/Greek words, and one
 * word in depth. Every view links to the others.
 *
 *   /original                      search
 *   /original/search?q=love        results
 *   /original/verse/43003016[-…]   a verse (or verses) word by word
 *   /original/word/G0025?v=43003016&i=2&t=bsb   a word, in a verse
 */

import { Fragment, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BOOKS, OLD_TESTAMENT_BOOKS, bookInfo, type BookId } from '../bible/books';
import { formatRange } from '../bible/refParser';
import { makeVerseId, parseVerseId } from '../bible/verseId';
import type { TranslationId, VerseId, VerseRange } from '../bible/types';
import { readerPath } from '../reader/nav';
import { getSettings } from '../settings';
import { PageHeader } from '../shell/menu';
import { loadPassage } from '../study/passage';
import { withReferences } from '../study/RichText';
import {
  countByBook,
  isHebrew,
  lexiconEntry,
  occurrences,
  originalWords,
  wordLinks,
  WORDS_CREDIT,
  type LexEntry,
  type Occurrences,
  type OrigWord,
  type WordLink,
} from './data';
import { describeGrammar } from './grammar';
import { searchOriginal, type OriginalQuery } from './search';

export function versePath(range: VerseRange): string {
  return `/original/verse/${range.start}${range.end !== range.start ? `-${range.end}` : ''}`;
}

export function wordPath(strong: string, context?: { verse: VerseId; index: number; translation?: TranslationId }): string {
  if (!context) return `/original/word/${strong}`;
  return `/original/word/${strong}?v=${context.verse}&i=${context.index}${context.translation ? `&t=${context.translation}` : ''}`;
}

/** Loads something async keyed by a string; null while loading. */
function useLoaded<T>(key: string, load: () => Promise<T>): { value: T | null; failed: boolean } {
  const [state, setState] = useState<{ key: string; value: T | null; failed: boolean }>({ key: '', value: null, failed: false });
  useEffect(() => {
    let live = true;
    load().then(
      (value) => live && setState({ key, value, failed: false }),
      () => live && setState({ key, value: null, failed: true }),
    );
    return () => {
      live = false;
    };
    // key identifies what is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? { value: state.value, failed: state.failed } : { value: null, failed: false };
}

function OriginalWord({ word, className }: { word: string; className?: string }) {
  const hebrew = /[֐-׿]/.test(word);
  return (
    <span className={`orig ${hebrew ? 'orig-he' : 'orig-gr'} ${className ?? ''}`} lang={hebrew ? 'he' : 'grc'} dir={hebrew ? 'rtl' : 'ltr'}>
      {word}
    </span>
  );
}

/** The one search box, shown at the top of every Original language page. */
function SearchBox({ initial = '' }: { initial?: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/original/search?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <form className="orig-search" role="search" onSubmit={submit}>
      <label className="sr-only" htmlFor="orig-q">
        Search the original language
      </label>
      <input
        id="orig-q"
        type="search"
        value={q}
        placeholder="A verse (John 3:16), a word (love, agape, ἀγάπη) or a Strong’s number (G26)"
        onChange={(e) => setQ(e.target.value)}
      />
      <button type="submit" className="primary-btn">
        Search
      </button>
    </form>
  );
}

function Shell({ children, query }: { children: ReactNode; query?: string }) {
  return (
    <div className="page original">
      <PageHeader title="Original language" />
      <main className="page-main">
        <SearchBox key={query ?? ''} initial={query} />
        {children}
        <p className="xref-credit">{WORDS_CREDIT}</p>
      </main>
    </div>
  );
}

// ───────── Search

export function OriginalSearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const navigate = useNavigate();
  const { value: result, failed } = useLoaded<OriginalQuery>(q, () => searchOriginal(q));

  useEffect(() => {
    document.title = q ? `${q} · Original language · Margins` : 'Original language · Margins';
  }, [q]);
  // A verse reference goes straight to the verse.
  useEffect(() => {
    if (result?.kind === 'verse') navigate(versePath(result.range), { replace: true });
  }, [result, navigate]);

  return (
    <Shell query={q}>
      {!q && (
        <div className="orig-intro">
          <p>
            Look up any verse to see its Hebrew or Greek word by word, or search for a word to see the original words
            behind it and every verse they appear in.
          </p>
          <p className="empty-text">
            In the Bible, select verses (or just a word) and choose <strong>Original language</strong> to come here.
          </p>
        </div>
      )}
      {failed && <p className="notice">Search couldn’t load.</p>}
      {q && !result && !failed && <p className="loading">Searching…</p>}
      {result?.kind === 'words' &&
        (result.hits.length === 0 ? (
          <p className="empty-text">No original words found for “{q}”.</p>
        ) : (
          <ul className="orig-results" aria-label="Words">
            {result.hits.map((h) => (
              <WordResult key={h.strong} hit={h} query={q} />
            ))}
          </ul>
        ))}
    </Shell>
  );
}

function WordResult({ hit, query }: { hit: import('./search').WordHit; query: string }) {
  const { value: occ } = useLoaded<Occurrences>(hit.strong, () => occurrences(hit.strong));
  const sample = occ?.v.slice(0, 3) ?? [];
  return (
    <li className="orig-result">
      <div className="orig-result-head">
        <OriginalWord word={hit.lemma} className="orig-lemma-sm" />
        <span className="orig-translit">{hit.translit}</span>
        <span className="orig-strong">{hit.strong}</span>
        <span className="orig-gloss">{hit.gloss}</span>
      </div>
      <p className="orig-result-meta">
        {hit.viaEnglish > 0 && <>The BSB translates it “{query.toLowerCase()}” {hit.viaEnglish}×. </>}
        Appears {hit.total} times.
      </p>
      <div className="orig-result-actions">
        <Link className="secondary-btn" to={wordPath(hit.strong)}>
          Go deeper on this word
        </Link>
      </div>
      {sample.length > 0 && (
        <ul className="orig-sample" aria-label={`Verses with ${hit.translit}`}>
          {sample.map((v) => (
            <li key={v}>
              <VerseSnippet id={v} strong={hit.strong} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** A verse's BSB text, with the English for one original word marked, linking to the verse page. */
function VerseSnippet({ id, strong }: { id: VerseId; strong: string }) {
  const range = { start: id, end: id };
  const { value } = useLoaded(`${id}:${strong}`, async () => {
    const [verses, words, links] = await Promise.all([loadPassage('bsb', range), originalWords(id), wordLinks('bsb', id)]);
    const text = verses[0]?.text ?? '';
    const marks = links.filter((l) => words[l[2]]?.[0] === strong);
    return { text, marks };
  });
  return (
    <Link className="orig-snippet" to={versePath(range)}>
      <span className="orig-snippet-ref">{formatRange(range)}</span>{' '}
      {value ? <Marked text={value.text} marks={value.marks} /> : <span className="loading">…</span>}
    </Link>
  );
}

function Marked({ text, marks }: { text: string; marks: WordLink[] }) {
  const parts: ReactNode[] = [];
  let pos = 0;
  for (const [s, e] of [...marks].sort((a, b) => a[0] - b[0])) {
    if (s < pos) continue;
    parts.push(text.slice(pos, s));
    parts.push(<mark key={s}>{text.slice(s, e)}</mark>);
    pos = e;
  }
  parts.push(text.slice(pos));
  return <>{parts}</>;
}

// ───────── A verse, word by word

function parseRangeParam(param: string | undefined): VerseRange | null {
  // Genesis verse ids have 7 digits (1001001), later books 8.
  const m = /^(\d{7,8})(?:-(\d{7,8}))?$/.exec(param ?? '');
  if (!m) return null;
  const start = Number(m[1]);
  const end = m[2] ? Number(m[2]) : start;
  if (end < start || Math.floor(start / 1e6) !== Math.floor(end / 1e6)) return null;
  return { start, end };
}

const MAX_VERSES = 30;

export function OriginalVersePage() {
  const { range: param } = useParams();
  const range = parseRangeParam(param);
  const [translation, setTranslation] = useState<TranslationId>(() => (getSettings().translation === 'kjv' ? 'kjv' : 'bsb'));
  useEffect(() => {
    if (range) document.title = `${formatRange(range)} · Original language · Margins`;
  }, [range]);
  if (!range) {
    return (
      <Shell>
        <p className="notice">That verse wasn’t recognised.</p>
      </Shell>
    );
  }
  return (
    <Shell>
      <VerseWords range={range} translation={translation} onTranslation={setTranslation} />
    </Shell>
  );
}

function VerseWords({
  range,
  translation,
  onTranslation,
}: {
  range: VerseRange;
  translation: TranslationId;
  onTranslation: (t: TranslationId) => void;
}) {
  const key = `${range.start}-${range.end}:${translation}`;
  const { value: verses, failed } = useLoaded(key, () => loadPassage(translation, range));
  const shown = (verses ?? []).slice(0, MAX_VERSES);
  const { book, chapter, verse } = parseVerseId(range.start);
  const single = range.start === range.end;
  return (
    <section aria-label={formatRange(range)}>
      <div className="orig-verse-head">
        <h2>{formatRange(range)}</h2>
        <div className="segmented" role="group" aria-label="English translation">
          {(['bsb', 'kjv'] as const).map((t) => (
            <button key={t} type="button" aria-pressed={translation === t} onClick={() => onTranslation(t)}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        <Link className="secondary-btn" to={readerPath(getSettings().translation, book, chapter, verse)}>
          Open in the Bible
        </Link>
      </div>
      {single && <VerseNav id={range.start} />}
      {failed && <p className="notice">This passage couldn’t load.</p>}
      {!verses && !failed && <p className="loading">Loading…</p>}
      {shown.map((v) => (
        <VerseBlock key={v.id} id={v.id} text={v.text} translation={translation} showRef={!single} />
      ))}
      {(verses?.length ?? 0) > MAX_VERSES && (
        <p className="empty-text">Showing the first {MAX_VERSES} verses. Search a shorter passage to see the rest.</p>
      )}
    </section>
  );
}

function VerseNav({ id }: { id: VerseId }) {
  const { book, chapter, verse } = parseVerseId(id);
  const prev = verse > 1 ? makeVerseId(book, chapter, verse - 1) : null;
  const next = makeVerseId(book, chapter, verse + 1);
  return (
    <nav className="orig-verse-nav" aria-label="Neighbouring verses">
      {prev ? <Link to={versePath({ start: prev, end: prev })}>← {formatRange({ start: prev, end: prev })}</Link> : <span />}
      <Link to={versePath({ start: next, end: next })}>{formatRange({ start: next, end: next })} →</Link>
    </nav>
  );
}

function VerseBlock({ id, text, translation, showRef }: { id: VerseId; text: string; translation: TranslationId; showRef: boolean }) {
  const { value } = useLoaded(`${id}:${translation}`, async () => {
    const [words, links] = await Promise.all([originalWords(id), wordLinks(translation, id)]);
    return { words, links };
  });
  const words = value?.words ?? [];
  const links = value?.links ?? [];
  const hebrew = words.some((w) => isHebrew(w[0]));
  return (
    <article className="orig-verse" aria-label={formatRange({ start: id, end: id })}>
      {showRef && <h3 className="orig-verse-ref">{formatRange({ start: id, end: id })}</h3>}
      <p className="orig-english">
        <LinkedEnglish id={id} text={text} links={links} words={words} translation={translation} />
      </p>
      {words.length > 0 && (
        <ol className={hebrew ? 'orig-words rtl' : 'orig-words'} aria-label="Original words">
          {words.map((w, i) => (
            <li key={i}>
              <Link className="orig-word-card" to={w[0] ? wordPath(w[0], { verse: id, index: i, translation }) : '#'}>
                <OriginalWord word={w[1]} />
                <span className="orig-translit">{w[2]}</span>
                <span className="orig-gloss">{w[3].replace(/[<>]/g, '')}</span>
                <span className="orig-strong">{w[0]}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

/** The English text with each linked word going to its original word. */
function LinkedEnglish({
  id,
  text,
  links,
  words,
  translation,
  current,
}: {
  id: VerseId;
  text: string;
  links: WordLink[];
  words: OrigWord[];
  translation: TranslationId;
  /** Index of the original word to mark. */
  current?: number;
}) {
  const parts: ReactNode[] = [];
  let pos = 0;
  for (const [s, e, i] of [...links].sort((a, b) => a[0] - b[0])) {
    if (s < pos) continue;
    parts.push(<Fragment key={`t${s}`}>{text.slice(pos, s)}</Fragment>);
    const strong = words[i]?.[0];
    parts.push(
      strong ? (
        <Link
          key={`w${s}`}
          className={i === current ? 'eng-word current' : 'eng-word'}
          to={wordPath(strong, { verse: id, index: i, translation })}
          title={`${words[i]![1]} · ${strong}`}
        >
          {text.slice(s, e)}
        </Link>
      ) : (
        <Fragment key={`w${s}`}>{text.slice(s, e)}</Fragment>
      ),
    );
    pos = e;
  }
  parts.push(<Fragment key="end">{text.slice(pos)}</Fragment>);
  return <>{parts}</>;
}

// ───────── One word in depth

const PAGE = 25;

function partOfSpeech(m: string): string {
  const [lang, pos] = m.split(':');
  const language = lang === 'H' ? 'Hebrew' : lang === 'A' ? 'Aramaic' : lang === 'G' ? 'Greek' : '';
  const kinds: Record<string, string> = {
    N: 'noun', 'N-M': 'noun, masculine', 'N-F': 'noun, feminine', 'N-N': 'noun, neuter', 'N-M/F': 'noun, masculine or feminine',
    V: 'verb', A: 'adjective', Adv: 'adverb', ADV: 'adverb', Conj: 'conjunction', CONJ: 'conjunction', Prep: 'preposition', PREP: 'preposition',
    'N-PRI': 'proper noun', 'N:N-M-P': 'name of a person (male)', 'N:N-F-P': 'name of a person (female)', 'N:N--L': 'name of a place',
    Prt: 'particle', PRT: 'particle', Pron: 'pronoun', Intj: 'interjection',
  };
  const kind = kinds[pos ?? ''] ?? (pos ? pos.replace(/-/g, ' ') : '');
  return [language, kind].filter(Boolean).join(' ');
}

export function OriginalWordPage() {
  const { strong = '' } = useParams();
  const [params] = useSearchParams();
  const ctxVerse = Number(params.get('v')) || null;
  const ctxIndex = params.get('i') !== null ? Number(params.get('i')) : null;
  const translation: TranslationId = params.get('t') === 'kjv' ? 'kjv' : 'bsb';
  const { value: lex, failed } = useLoaded<LexEntry | null>(strong, () => lexiconEntry(strong));
  const { value: occ } = useLoaded<Occurrences>(`occ:${strong}`, () => occurrences(strong));

  useEffect(() => {
    document.title = `${lex?.l ?? strong} · Original language · Margins`;
  }, [lex, strong]);

  return (
    <Shell>
      {failed && <p className="notice">This word couldn’t load.</p>}
      {!lex && !failed && <p className="loading">Loading…</p>}
      {lex && (
        <article className="orig-word-page" aria-label={`${lex.l} ${strong}`}>
          <header className="orig-word-head">
            <OriginalWord word={lex.l} className="orig-lemma" />
            <div className="orig-word-meta">
              <span className="orig-translit">{lex.t}</span>
              <span className="orig-strong">{strong}</span>
              <span className="orig-pos">{partOfSpeech(lex.m)}</span>
            </div>
            <p className="orig-word-gloss">{lex.g}</p>
          </header>
          {ctxVerse && ctxIndex !== null && (
            <InThisVerse strong={strong} verse={ctxVerse} index={ctxIndex} translation={translation} />
          )}
          <section aria-label="Range of meanings">
            <h3 className="panel-section">Range of meanings</h3>
            <Definition html={lex.d} />
          </section>
          {occ && <Usage occ={occ} strong={strong} contextBook={ctxVerse ? parseVerseId(ctxVerse).book : null} />}
          {occ && <EveryVerse occ={occ} strong={strong} />}
        </article>
      )}
    </Shell>
  );
}

function InThisVerse({ strong, verse, index, translation }: { strong: string; verse: VerseId; index: number; translation: TranslationId }) {
  const range = { start: verse, end: verse };
  const { value } = useLoaded(`${verse}:${translation}`, async () => {
    const [words, links, verses] = await Promise.all([originalWords(verse), wordLinks(translation, verse), loadPassage(translation, range)]);
    return { words, links, text: verses[0]?.text ?? '' };
  });
  const word = value?.words[index];
  if (!value) return <p className="loading">Loading…</p>;
  if (!word || word[0] !== strong) return null;
  return (
    <section className="orig-context" aria-label={`In ${formatRange(range)}`}>
      <h3 className="panel-section">
        In <Link to={versePath(range)}>{formatRange(range)}</Link>
      </h3>
      <p className="orig-context-form">
        <OriginalWord word={word[1]} /> <span className="orig-translit">{word[2]}</span> <span className="orig-gloss">“{word[3].replace(/[<>]/g, '')}”</span>
      </p>
      <p className="orig-grammar">{describeGrammar(word[4])}</p>
      <p className="orig-english">
        <LinkedEnglish id={verse} text={value.text} links={value.links} words={value.words} translation={translation} current={index} />
      </p>
    </section>
  );
}

/** The lexicon's markup: <b>, <i>, <br>; verse references become links. */
function Definition({ html }: { html: string }) {
  const nodes = useMemo(() => {
    const out: ReactNode[] = [];
    let bold = false;
    let italic = false;
    let key = 0;
    for (const part of html.split(/(<\/?b>|<\/?i>|<br>)/)) {
      if (part === '<b>') bold = true;
      else if (part === '</b>') bold = false;
      else if (part === '<i>') italic = true;
      else if (part === '</i>') italic = false;
      else if (part === '<br>') out.push(<br key={key++} />);
      else if (part) {
        let el: ReactNode = <Fragment key={key++}>{withReferences(part, `d${key}`)}</Fragment>;
        if (italic) el = <em key={key++}>{el}</em>;
        if (bold) el = <strong key={key++}>{el}</strong>;
        out.push(el);
      }
    }
    return out;
  }, [html]);
  return <div className="orig-definition">{nodes}</div>;
}

function Usage({ occ, strong, contextBook }: { occ: Occurrences; strong: string; contextBook: BookId | null }) {
  const byBook = countByBook(occ.v);
  const hebrew = isHebrew(strong);
  const testament = hebrew ? BOOKS.slice(0, OLD_TESTAMENT_BOOKS) : BOOKS.slice(OLD_TESTAMENT_BOOKS);
  const most = Math.max(1, ...testament.map((b) => byBook.get(b.id) ?? 0));
  const books = testament.filter((b) => (byBook.get(b.id) ?? 0) > 0).length;
  return (
    <section aria-label="Usage">
      <h3 className="panel-section">Usage</h3>
      <p>
        Appears <strong>{occ.n}</strong> {occ.n === 1 ? 'time' : 'times'} in <strong>{occ.v.length}</strong>{' '}
        {occ.v.length === 1 ? 'verse' : 'verses'}, in {books} of the{' '}
        {testament.length} books of the {hebrew ? 'Old' : 'New'} Testament.
        {contextBook && (
          <>
            {' '}
            In {bookInfo(contextBook).name}: <strong>{byBook.get(contextBook) ?? 0}</strong>{' '}
            {(byBook.get(contextBook) ?? 0) === 1 ? 'verse' : 'verses'}.
          </>
        )}
      </p>
      <ol className="usage-bars" aria-label={`Verses per book in the ${hebrew ? 'Old' : 'New'} Testament`}>
        {testament.map((b) => {
          const n = byBook.get(b.id) ?? 0;
          return (
            <li key={b.id} className={n ? (b.id === contextBook ? 'current' : '') : 'none'} title={`${b.name}: ${n}`}>
              <span className="usage-book">{b.name}</span>
              <span className="usage-bar" style={{ width: `${(n / most) * 100}%` }} />
              <span className="usage-n">{n || ''}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function EveryVerse({ occ, strong }: { occ: Occurrences; strong: string }) {
  const [shown, setShown] = useState(PAGE);
  const list = occ.v.slice(0, shown);
  const byBook = new Map<BookId, VerseId[]>();
  for (const v of list) {
    const b = parseVerseId(v).book;
    byBook.set(b, [...(byBook.get(b) ?? []), v]);
  }
  return (
    <section aria-label="Every verse">
      <h3 className="panel-section">Every verse ({occ.v.length})</h3>
      {[...byBook.entries()].map(([b, verses]) => (
        <div key={b} className="every-verse-book">
          <h4>{bookInfo(b).name}</h4>
          <ul>
            {verses.map((v) => (
              <li key={v}>
                <VerseSnippet id={v} strong={strong} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {occ.v.length > shown && (
        <button type="button" className="secondary-btn" onClick={() => setShown((n) => n + PAGE * 2)}>
          Show more ({occ.v.length - shown} left)
        </button>
      )}
    </section>
  );
}
