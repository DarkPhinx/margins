import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeVerseId } from '../src/bible/verseId';
import { db, switchDatabase } from '../src/study/db';
import { createJournal, createNote, createQuestion, deleteItem, discardIfEmpty, itemsForChapter, saveBody, setHighlight, setSegmentHighlight } from '../src/study/store';
import { docFromText } from '../src/study/text';
import type { NoteItem, StudyItem } from '../src/study/types';
import { forUpload, resolveConflict, sync, type PushResult, type Remote, type RemoteRow } from '../src/sync/engine';
import { doneTyping, isTyping, onTypingDone, TYPING_PAUSE_MS, typing } from '../src/sync/writing';

/** The server, following the same rules as push_item in supabase/migrations. */
class FakeServer {
  rows = new Map<string, RemoteRow>();
  seq = 0;
  /** While true, every request fails as if offline. */
  offline = false;

  remote(): Remote {
    return {
      push: async (item, base): Promise<PushResult> => {
        if (this.offline) throw new Error('offline');
        expect(item).not.toHaveProperty('dirty');
        expect(item).not.toHaveProperty('syncedVersion');
        const cur = this.rows.get(item.id);
        if (!cur) {
          const row = { id: item.id, version: 1, data: structuredClone(item), seq: ++this.seq };
          this.rows.set(item.id, row);
          return { status: 'ok', version: 1, seq: row.seq };
        }
        if (base === null || cur.version !== base) return { status: 'conflict', row: structuredClone(cur) };
        const row = { id: item.id, version: cur.version + 1, data: structuredClone(item), seq: ++this.seq };
        this.rows.set(item.id, row);
        return { status: 'ok', version: row.version, seq: row.seq };
      },
      pull: async (since, limit) => {
        if (this.offline) throw new Error('offline');
        return [...this.rows.values()]
          .filter((r) => r.seq > since)
          .sort((a, b) => a.seq - b.seq)
          .slice(0, limit)
          .map((r) => structuredClone(r));
      },
    };
  }
}

const v = makeVerseId;
const jn316 = { start: v('JHN', 3, 16), end: v('JHN', 3, 16) };
let server: FakeServer;
let n = 0;
/** Two devices of one account: each its own local database. */
let laptop = '';
let phone = '';

async function on(device: string): Promise<void> {
  await switchDatabase(device);
}

async function syncOn(device: string) {
  await on(device);
  return sync(server.remote());
}

const textOfNote = async (id: string) => ((await db.items.get(id)) as NoteItem | undefined)?.text;

beforeEach(async () => {
  server = new FakeServer();
  n++;
  laptop = `laptop-${n}`;
  phone = `phone-${n}`;
});

describe('syncing notes between two devices', () => {
  it('a note written offline reaches the other device once back online', async () => {
    await on(laptop);
    server.offline = true;
    const note = await createNote([jn316], docFromText('Written on the train'));
    await expect(sync(server.remote())).rejects.toThrow('offline');
    expect((await db.items.get(note.id))?.dirty).toBe(1);

    server.offline = false;
    expect(await sync(server.remote())).toEqual({ pulled: 0, pushed: 1, conflicts: 0 });
    expect((await db.items.get(note.id))?.dirty).toBe(0);

    const report = await syncOn(phone);
    expect(report.pulled).toBe(1);
    expect(await textOfNote(note.id)).toBe('Written on the train');
    // It shows on the phone's chapter, and isn't sent back.
    expect((await itemsForChapter('JHN', 3)).map((i) => i.id)).toEqual([note.id]);
    expect((await syncOn(phone)).pushed).toBe(0);
  });

  it('edits and deletions travel both ways', async () => {
    await on(laptop);
    const note = await createNote([jn316], docFromText('First'));
    await sync(server.remote());
    await syncOn(phone);
    await saveBody(note.id, docFromText('Edited on the phone'));
    await sync(server.remote());

    await syncOn(laptop);
    expect(await textOfNote(note.id)).toBe('Edited on the phone');
    await deleteItem(note.id);
    await sync(server.remote());

    await syncOn(phone);
    expect((await db.items.get(note.id))?.deletedAt).not.toBeNull();
    expect(await itemsForChapter('JHN', 3)).toEqual([]);
    expect(server.rows.get(note.id)?.version).toBe(3);
  });

  it('asks when the same note was edited on both devices, and does what the person chooses', async () => {
    await on(laptop);
    const note = await createNote([jn316], docFromText('Start'));
    await sync(server.remote());
    await syncOn(phone);

    // Both edit while apart.
    await saveBody(note.id, docFromText('Phone version'));
    await on(laptop);
    await saveBody(note.id, docFromText('Laptop version'));

    await syncOn(phone); // the phone gets there first
    expect((await syncOn(laptop)).conflicts).toBe(1);
    // Neither copy is lost or overwritten until the person chooses.
    expect(await textOfNote(note.id)).toBe('Laptop version');
    const conflict = (await db.conflicts.get(note.id))!;
    expect((conflict.remote as NoteItem).text).toBe('Phone version');
    expect((server.rows.get(note.id)!.data as NoteItem).text).toBe('Phone version');
    // Syncing again doesn't push it or ask twice.
    expect(await sync(server.remote())).toEqual({ pulled: 0, pushed: 0, conflicts: 0 });

    await resolveConflict(note.id, 'mine');
    await sync(server.remote());
    expect(await db.conflicts.count()).toBe(0);
    expect((server.rows.get(note.id)!.data as NoteItem).text).toBe('Laptop version');
    await syncOn(phone);
    expect(await textOfNote(note.id)).toBe('Laptop version');
  });

  it('can keep the other device’s copy, or both', async () => {
    const conflictOver = async () => {
      await on(laptop);
      const note = await createNote([jn316], docFromText('Start'));
      await sync(server.remote());
      await syncOn(phone);
      await saveBody(note.id, docFromText('Phone'));
      await sync(server.remote());
      await on(laptop);
      await saveBody(note.id, docFromText('Laptop'));
      await sync(server.remote());
      return note.id;
    };

    const a = await conflictOver();
    await resolveConflict(a, 'theirs');
    expect(await textOfNote(a)).toBe('Phone');
    expect((await db.items.get(a))?.dirty).toBe(0);
    expect((await sync(server.remote())).pushed).toBe(0);

    const b = await conflictOver();
    await resolveConflict(b, 'both', () => 'copy-of-b');
    expect(await textOfNote(b)).toBe('Laptop');
    expect(await textOfNote('copy-of-b')).toBe('Phone');
    await sync(server.remote());
    await syncOn(phone);
    expect(await textOfNote(b)).toBe('Laptop');
    expect(await textOfNote('copy-of-b')).toBe('Phone');
  });

  it('doesn’t ask when both devices made the same change', async () => {
    await on(laptop);
    const note = await createNote([jn316], docFromText('Start'));
    await sync(server.remote());
    await syncOn(phone);
    const same = (await db.items.get(note.id))!;
    await db.items.update(note.id, { text: 'Same', updatedAt: 5 } as Partial<StudyItem>);
    await on(laptop);
    await db.items.update(note.id, { text: 'Same', updatedAt: 5 } as Partial<StudyItem>);
    await syncOn(phone);
    expect((await syncOn(laptop)).conflicts).toBe(0);
    expect((await db.items.get(note.id))?.dirty).toBe(0);
    expect(same.id).toBe(note.id);
  });

  it('settles highlights by the newer change, without asking', async () => {
    await on(laptop);
    await setHighlight(jn316, 'yellow');
    await sync(server.remote());
    await syncOn(phone);
    const [h] = (await db.items.toArray()) as StudyItem[];
    await db.items.update(h!.id, { color: 'green', updatedAt: h!.updatedAt + 10 } as Partial<StudyItem>);
    await on(laptop);
    await db.items.update(h!.id, { color: 'blue', updatedAt: h!.updatedAt + 20 } as Partial<StudyItem>);
    await syncOn(phone);
    expect((await syncOn(laptop)).conflicts).toBe(0);
    await sync(server.remote());
    await syncOn(phone);
    expect(((await db.items.get(h!.id)) as { color: string }).color).toBe('blue');
    expect(await db.conflicts.count()).toBe(0);
  });

  it('word highlights sync too', async () => {
    await on(laptop);
    await setSegmentHighlight('bsb', jn316, 11, 16, 'pink');
    await sync(server.remote());
    await syncOn(phone);
    const [h] = await db.items.toArray();
    expect(h).toMatchObject({ kind: 'highlight', color: 'pink', segment: { translation: 'bsb', start: 11, end: 16 } });
  });

  it('a blank note already synced is marked deleted rather than vanishing, so other devices drop it', async () => {
    await on(laptop);
    const note = await createNote([jn316]);
    await sync(server.remote());
    expect(await discardIfEmpty(note.id)).toBe(true);
    await sync(server.remote());
    expect(server.rows.get(note.id)?.data.deletedAt).not.toBeNull();
    // One never synced just goes.
    const fresh = await createNote([jn316]);
    await discardIfEmpty(fresh.id);
    expect(await db.items.get(fresh.id)).toBeUndefined();
  });

  it('never uploads this device’s sync fields', () => {
    const item = { id: 'x', kind: 'note', dirty: 1, syncedVersion: 3 } as unknown as StudyItem;
    expect(forUpload(item)).toEqual({ id: 'x', kind: 'note' });
  });

  it('a change made while uploading is uploaded next time', async () => {
    await on(laptop);
    const note = await createNote([jn316], docFromText('One'));
    const remote = server.remote();
    const slow: Remote = {
      ...remote,
      push: async (item, base) => {
        const r = await remote.push(item, base);
        await saveBody(note.id, docFromText('Two'));
        return r;
      },
    };
    await sync(slow);
    expect((await db.items.get(note.id))?.dirty).toBe(1);
    await sync(server.remote());
    expect((server.rows.get(note.id)!.data as NoteItem).text).toBe('Two');
  });

  it('pulls a large backlog in pages', async () => {
    await on(laptop);
    for (let i = 0; i < 1203; i++) {
      const item = { ...forUpload((await createNote([jn316], docFromText(`n${i}`))) as StudyItem) };
      await db.items.delete(item.id);
      await server.remote().push(item, null);
    }
    expect((await syncOn(phone)).pulled).toBe(1203);
    expect(await db.items.count()).toBe(1203);
  });
});

describe('half-written notes stay on the device', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a note being typed in is uploaded only once typing pauses for about two seconds', async () => {
    // Only the hold's timers are faked; the database keeps real time.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const ready = vi.fn();
    const stop = onTypingDone(ready);
    await on(laptop);
    const note = await createNote([jn316], docFromText('In the beginning'));
    await sync(server.remote());

    // Typing: each keystroke is saved here at once, but nothing goes up.
    typing(note.id);
    await saveBody(note.id, docFromText('In the beginning was the W'));
    await sync(server.remote());
    vi.advanceTimersByTime(TYPING_PAUSE_MS - 500);
    typing(note.id);
    await saveBody(note.id, docFromText('In the beginning was the Word'));
    await sync(server.remote());
    vi.advanceTimersByTime(TYPING_PAUSE_MS - 500);
    expect(server.rows.get(note.id)?.data).toMatchObject({ text: 'In the beginning' });
    expect((await db.items.get(note.id))?.dirty).toBe(1);
    expect(ready).not.toHaveBeenCalled();

    // A pause: the hold ends, sync is asked for, and the whole sentence goes up.
    vi.advanceTimersByTime(500);
    expect(isTyping(note.id)).toBe(false);
    expect(ready).toHaveBeenCalledTimes(1);
    await sync(server.remote());
    expect(server.rows.get(note.id)?.data).toMatchObject({ text: 'In the beginning was the Word' });
    expect((await db.items.get(note.id))?.dirty).toBe(0);
    stop();
  });

  it('closing the note uploads it straight away', async () => {
    const ready = vi.fn();
    const stop = onTypingDone(ready);
    await on(laptop);
    const note = await createNote([jn316], docFromText('Grace'));
    typing(note.id);
    await sync(server.remote());
    expect(server.rows.has(note.id)).toBe(false);

    doneTyping(note.id);
    expect(ready).toHaveBeenCalledTimes(1);
    await sync(server.remote());
    expect(server.rows.get(note.id)?.data).toMatchObject({ text: 'Grace' });
    // Closing again (nothing held) doesn't ask for another sync.
    doneTyping(note.id);
    expect(ready).toHaveBeenCalledTimes(1);
    stop();
  });

  it('a brand-new note, question or journal entry is not uploaded until it has some text', async () => {
    await on(laptop);
    const note = await createNote([jn316]);
    const question = await createQuestion([jn316]);
    const journal = await createJournal('2026-11-07');
    await sync(server.remote());
    expect(server.rows.size).toBe(0);
    for (const item of [note, question, journal]) expect((await db.items.get(item.id))?.dirty).toBe(1);

    // Left empty and closed: removed here, and never reached the account.
    expect(await discardIfEmpty(question.id)).toBe(true);
    await saveBody(note.id, docFromText('  '));
    await sync(server.remote());
    expect(server.rows.size).toBe(0);

    // Some text (or a journal title) and it goes up.
    await saveBody(note.id, docFromText('Light'));
    await db.items.update(journal.id, { title: 'Morning' } as Partial<StudyItem>);
    await sync(server.remote());
    expect(server.rows.get(note.id)?.data).toMatchObject({ text: 'Light' });
    expect(server.rows.get(journal.id)?.data).toMatchObject({ title: 'Morning' });
    expect(server.rows.has(question.id)).toBe(false);
  });

  it('a note already in the account and emptied out still syncs', async () => {
    await on(laptop);
    const note = await createNote([jn316], docFromText('Draft'));
    await sync(server.remote());
    await saveBody(note.id, docFromText(''));
    await sync(server.remote());
    expect(server.rows.get(note.id)?.data).toMatchObject({ text: '' });
  });
});
