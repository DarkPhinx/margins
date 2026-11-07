import { useEffect } from 'react';
import { PageHeader } from '../shell/menu';
import { JournalList } from './JournalList';

/** The Journal page: every entry, standalone or on a chapter. */
export function JournalListPage() {
  useEffect(() => {
    document.title = 'Journal · Margins';
  }, []);
  return (
    <div className="page">
      <PageHeader title="Journal" />
      <main className="page-main">
        <JournalList />
      </main>
    </div>
  );
}
