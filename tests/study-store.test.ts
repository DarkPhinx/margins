import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeVerseId } from '../src/bible/verseId';
import { MarginsDB, db, resetDatabase } from '../src/study/db';
import { subtractRange } from '../src/study/ranges';
import {
  createJournal,
  createNote,
  createQuestion,
  deleteItem,
  itemsForChapter,
  listByKind,
  markAnswered,
  restoreItem,
  saveAnswer,
  saveBody,
  search,
  setAnchors,
  setClock,
  setHighlight,
} from '../src/study/store';
import { docFromText, textOf } from '../src/study/text';
import type { HighlightItem, NoteItem } from '../src/study/types';

const v = makeVerseId;
const r = (book: Parameters<typeof v>[0], c: number, a: number, b = a, c2 = c) => ({ start: v(book, c, a), end: v(book, c2, b) });

beforeEach(async () => {
  await resetDatabase();
});

describe('notes attached to verses', () => {
  it('saves, edits and reloads a note from a fresh connection', async () => {
    const note = await createNote([r('JHN', 3, 16)], docFromText('God so loved'));
    await saveBody(note.id, docFromText('God so loved the world. See Rom 5:8.'));

    // A second connection to the same database, as after a page reload.
    const reopened = new MarginsDB(db.name);
    await reopened.open();
    const stored = await reopened.items.get(note.id);
    reopened.close();
    expect(stored).toMatchObject({
      kind: 'note',
      text: 'God so loved the world. See Rom 5:8.',
      anchors: [r('JHN', 3, 16)],
      chapterKeys: [43003],
      refs: [r('ROM', 5, 8)],
      deletedAt: null,
    });
    expect(stored!.updatedAt).toBeGreaterThanOrEqual(stored!.createdAt);
  });

  it('finds items for a chapter, including ranges that run through it', async () => {
    await createNote([r('JHN', 3, 16)]);
    await createNote([{ start: v('JHN', 2, 23), end: v('JHN', 3, 3) }]);
    await createNote([r('JHN', 4, 1)]);
    expect((await itemsForChapter('JHN', 3)).length).toBe(2);
    expect((await itemsForChapter('JHN', 2)).length).toBe(1);
    expect((await itemsForChapter('JHN', 4)).length).toBe(1);
  });

  it('moves an item when its verses change', async () => {
    const note = await createNote([r('JHN', 3, 16)]);
    await setAnchors(note.id, [r('ROM', 8, 28)]);
    expect(await itemsForChapter('JHN', 3)).toHaveLength(0);
    expect(await itemsForChapter('ROM', 8)).toHaveLength(1);
  });

  it('soft-deletes and restores', async () => {
    const note = await createNote([r('JHN', 3, 16)]);
    await deleteItem(note.id);
    expect(await itemsForChapter('JHN', 3)).toHaveLength(0);
    expect((await db.items.get(note.id))?.deletedAt).not.toBeNull();
    await restoreItem(note.id);
    expect(await itemsForChapter('JHN', 3)).toHaveLength(1);
  });
});

describe('questions', () => {
  it('stay open until marked answered, and can hold an answer', async () => {
    const q = await createQuestion([r('ROM', 9, 13)], docFromText('What does hated mean here?'));
    expect((await listByKind('question'))[0]).toMatchObject({ status: 'open', answeredAt: null });
    await markAnswered(q.id, true);
    await saveAnswer(q.id, docFromText('Compare Mal 1:2-3.'));
    const answered = (await listByKind('question'))[0]!;
    expect(answered).toMatchObject({ status: 'answered', answerText: 'Compare Mal 1:2-3.' });
    expect(answered.answeredAt).not.toBeNull();
    await markAnswered(q.id, false);
    expect((await listByKind('question'))[0]).toMatchObject({ status: 'open', answeredAt: null });
  });
});

describe('journal', () => {
  it('keeps dated entries with no verses, and detects references in them', async () => {
    const entry = await createJournal('2026-11-07', docFromText('Read Jn 15 and 1 Cor 13 today.'), 'Love');
    const stored = (await listByKind('journal'))[0]!;
    expect(stored).toMatchObject({ id: entry.id, date: '2026-11-07', title: 'Love', anchors: [], chapterKeys: [] });
    expect(stored.refs).toEqual([
      { start: v('JHN', 15, 1), end: v('JHN', 15, 27) },
      { start: v('1CO', 13, 1), end: v('1CO', 13, 13) },
    ]);
  });
});

describe('highlights', () => {
  const colours = async (book: Parameters<typeof v>[0], chapter: number) =>
    ((await itemsForChapter(book, chapter)).filter((i) => i.kind === 'highlight') as HighlightItem[])
      .map((h) => [h.anchors[0]!.start % 1000, h.anchors[0]!.end % 1000, h.color])
      .sort((a, b) => (a[0] as number) - (b[0] as number));

  it('colours whole verses and re-colours part of a range by splitting it', async () => {
    await setHighlight(r('MAT', 5, 3, 12), 'yellow');
    await setHighlight(r('MAT', 5, 6, 7), 'green');
    expect(await colours('MAT', 5)).toEqual([
      [3, 5, 'yellow'],
      [6, 7, 'green'],
      [8, 12, 'yellow'],
    ]);
  });

  it('removes highlighting from part of a range', async () => {
    await setHighlight(r('MAT', 5, 3, 12), 'yellow');
    await setHighlight(r('MAT', 5, 3, 4), null);
    expect(await colours('MAT', 5)).toEqual([[5, 12, 'yellow']]);
    await setHighlight(r('MAT', 5, 1, 48), null);
    expect(await colours('MAT', 5)).toEqual([]);
  });

  it('splits correctly across a chapter boundary', () => {
    expect(subtractRange({ start: v('JHN', 2, 20), end: v('JHN', 3, 5) }, r('JHN', 3, 1))).toEqual([
      { start: v('JHN', 2, 20), end: v('JHN', 2, 25) },
      { start: v('JHN', 3, 2), end: v('JHN', 3, 5) },
    ]);
  });
});

describe('search', () => {
  it('finds notes, questions, answers and journal entries containing every word', async () => {
    await createNote([r('JHN', 3, 16)], docFromText('Grace is a gift, not earned.'));
    const q = await createQuestion([r('EPH', 2, 8)], docFromText('Is faith itself the gift?'));
    await saveAnswer(q.id, docFromText('The grace is the gift.'));
    await createJournal('2026-11-01', docFromText('Thinking about Sabbath rest.'), 'Rest');
    const deleted = await createNote([r('JHN', 1, 1)], docFromText('grace gift deleted'));
    await deleteItem(deleted.id);

    expect((await search('gift grace')).map((h) => h.item.kind).sort()).toEqual(['note', 'question']);
    expect((await search('REST')).map((h) => h.item.kind)).toEqual(['journal']);
    expect((await search('sabbath'))[0]!.snippet).toContain('Sabbath rest');
    expect(await search('   ')).toEqual([]);
  });
});

describe('drafts', () => {
  it('puts back words typed just before the page closed, unless something newer was saved', async () => {
    const { writeDraft, recoverDrafts } = await import('../src/study/drafts');
    let now = 1000;
    setClock(() => now);
    const a = await createNote([r('JHN', 3, 16)], docFromText('saved'));
    const b = await createNote([r('JHN', 3, 17)], docFromText('newer save'));
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    writeDraft(a.id, 'body', docFromText('typed before closing'));
    writeDraft(b.id, 'body', docFromText('old draft'));
    vi.restoreAllMocks();
    now = 3000;
    await saveBody(b.id, docFromText('newer save'));

    expect(await recoverDrafts()).toBe(1);
    expect(((await db.items.get(a.id)) as NoteItem | undefined)?.text).toBe('typed before closing');
    expect(((await db.items.get(b.id)) as NoteItem | undefined)?.text).toBe('newer save');
    expect(Object.keys(localStorage).filter((k) => k.startsWith('margins.draft.'))).toEqual([]);
    setClock(() => Date.now());
  });
});

describe('rich text', () => {
  it('reads plain text from lists and paragraphs', () => {
    const doc = {
      type: 'doc' as const,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'One ' }, { type: 'text', text: 'bold', marks: [{ type: 'bold' }] }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Jn 3:16' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ps 23' }] }] },
          ],
        },
      ],
    };
    expect(textOf(doc)).toBe('One bold\nJn 3:16\nPs 23');
  });
});
