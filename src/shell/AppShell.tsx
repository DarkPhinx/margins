import { useContext, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { SettingsContext, SettingsHost } from '../reader/ReaderBar';
import { NoteDialog } from '../study/NoteDialog';
import { MenuContext } from './menu';
import { NAV_ITEMS } from './navItems';

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { pathname } = useLocation();
  const { setOpen: openSettings } = useContext(SettingsContext);
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="sidebar-brand">Margins</div>
      <ul className="sidebar-items">
        {NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname);
          return (
            <li key={item.id}>
              <Link
                to={item.to()}
                className={active ? 'sidebar-link active' : 'sidebar-link'}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="sidebar-foot">
        <button
          type="button"
          className="sidebar-link"
          onClick={() => {
            onNavigate();
            openSettings(true);
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              d="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4"
            />
          </svg>
          <span>Settings</span>
        </button>
      </div>
    </nav>
  );
}

/**
 * The app's frame: the sidebar on the left (a slide-out drawer on phones) and
 * the current page beside it. Pages render into the outlet.
 */
export function AppShell() {
  const [drawer, setDrawer] = useState(false);
  return (
    <SettingsHost>
      <MenuContext.Provider value={() => setDrawer(true)}>
        <div className={drawer ? 'shell drawer-open' : 'shell'}>
          <Sidebar onNavigate={() => setDrawer(false)} />
          {drawer && <div className="drawer-backdrop" aria-hidden="true" onClick={() => setDrawer(false)} />}
          <div className="shell-main">
            <Outlet />
          </div>
        </div>
        <NoteDialog />
      </MenuContext.Provider>
    </SettingsHost>
  );
}
