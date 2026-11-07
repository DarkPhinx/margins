import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MenuButton } from '../shell/menu';
import { ItemView } from '../study/ItemView';

/** A full page for writing one journal entry. Saves as you type; ← Journal goes back. */
export function JournalPage() {
  const { id = '' } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Journal · Margins';
  }, []);

  return (
    <div className="page journal-page">
      <div className="page-header page-header-bare">
        <MenuButton />
      </div>
      <main className="page-main">
        <ItemView key={id} id={id} isNew={search.get('new') === '1'} layout="page" onClose={() => navigate('/journal')} />
      </main>
    </div>
  );
}
