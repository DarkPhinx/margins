import { useEffect } from 'react';
import { PageHeader } from '../shell/menu';
import { NotesList } from './NotesList';

/** The Notes page: every note and question, on verses or standalone. */
export function NotesPage() {
  useEffect(() => {
    document.title = 'Notes · Margins';
  }, []);
  return (
    <div className="page">
      <PageHeader title="Notes" />
      <main className="page-main">
        <NotesList />
      </main>
    </div>
  );
}
