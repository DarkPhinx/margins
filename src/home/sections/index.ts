import { ContinueReading } from './ContinueReading';
import { RecentJournal, RecentNotes } from './Recent';
import type { HomeSection } from './types';

/**
 * The home page, top to bottom. Add, remove or reorder sections here; each one
 * is self-contained, so a change to one never touches the others.
 */
export const HOME_SECTIONS: readonly HomeSection[] = [
  { id: 'continue', label: 'Continue reading', Component: ContinueReading },
  { id: 'journal', label: 'Journal', Component: RecentJournal },
  { id: 'notes', label: 'Notes', Component: RecentNotes },
];
