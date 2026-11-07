import type { ReactNode } from 'react';
import { readerPath } from '../reader/nav';
import { getSettings } from '../settings';

/**
 * One entry in the sidebar. The sidebar is just an ordered list of these, so
 * it can grow (studies, templates, the library…) by adding an item here,
 * without changing anything else.
 */
export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  /** Where the item goes; worked out each time, e.g. the Bible opens at your last place. */
  to: () => string;
  /** Whether the current page belongs to this item. */
  isActive: (pathname: string) => boolean;
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" d={d} />
  </svg>
);

const READER_PATH = /^\/[a-z]{2,8}\/[1-3A-Z]{3}\/\d+/;

/** The sidebar, top to bottom. */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: icon('M4 11.5 12 5l8 6.5M6.5 10v9.5h4v-5h3v5h4V10'),
    to: () => '/',
    isActive: (p) => p === '/',
  },
  {
    id: 'bible',
    label: 'Bible',
    icon: icon('M5 4.5h5.5a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H5zM19 4.5h-5.5a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2H19z'),
    to: () => {
      const { translation, last } = getSettings();
      return readerPath(translation, last.book, last.chapter, last.verse);
    },
    isActive: (p) => READER_PATH.test(p),
  },
  {
    id: 'journal',
    label: 'Journal',
    icon: icon('M7 3.5h11v17H7zM7 3.5H5.5v17H7M10 8h5M10 11.5h5'),
    to: () => '/journal',
    isActive: (p) => p === '/journal' || p.startsWith('/journal/'),
  },
  {
    id: 'notes',
    label: 'Notes',
    icon: icon('M6 3.5h9l3 3V20.5H6zM9 9h6M9 12.5h6M9 16h4'),
    to: () => '/notes',
    isActive: (p) => p === '/notes' || p.startsWith('/notes/'),
  },
];
