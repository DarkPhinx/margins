import { createContext, useContext } from 'react';

/** Opens the sidebar drawer on narrow screens. */
export const MenuContext = createContext<() => void>(() => {});

/** The ☰ button that opens the sidebar on narrow screens (hidden when the sidebar is always shown). */
export function MenuButton() {
  const open = useContext(MenuContext);
  return (
    <button type="button" className="icon-btn menu-btn" aria-label="Menu" onClick={open}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    </button>
  );
}

/** A plain page's top bar: the menu button (on phones) and the page title. */
export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="page-header">
      <MenuButton />
      <h1>{title}</h1>
      {children && <div className="page-header-actions">{children}</div>}
    </header>
  );
}
