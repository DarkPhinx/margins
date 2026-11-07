import { JournalList } from '../../pages/JournalList';
import { NotesList } from '../../pages/NotesList';
import { SectionHeading } from './SectionHeading';

/** Home section: the latest journal entries, and ways to start one. */
export function RecentJournal() {
  return (
    <>
      <SectionHeading title="Journal" to="/journal" />
      <JournalList limit={5} />
    </>
  );
}

/** Home section: the latest notes and questions, and ways to start a standalone one. */
export function RecentNotes() {
  return (
    <>
      <SectionHeading title="Notes" to="/notes" />
      <NotesList limit={5} />
    </>
  );
}
