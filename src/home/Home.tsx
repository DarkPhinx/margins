import { useEffect } from 'react';
import { PageHeader } from '../shell/menu';
import { HOME_SECTIONS } from './sections';
import type { HomeSection } from './sections/types';

/**
 * The home page: a frame around an ordered list of sections. It knows nothing
 * about what each section does, so the page can grow later by adding sections
 * (see ./sections/index.ts).
 */
export function Home({ sections = HOME_SECTIONS }: { sections?: readonly HomeSection[] }) {
  useEffect(() => {
    document.title = 'Margins';
  }, []);

  return (
    <div className="page home">
      <PageHeader title="Home" />
      <main className="page-main">
        {sections.map(({ id, label, Component }) => (
          <section key={id} className={`home-section home-section-${id}`} data-section={id} aria-label={label}>
            <Component />
          </section>
        ))}
      </main>
    </div>
  );
}
