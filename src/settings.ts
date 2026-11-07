import { useSyncExternalStore } from 'react';
import { isBookId, type BookId } from './bible/books';
import type { TranslationId } from './bible/types';

export interface Position {
  book: BookId;
  chapter: number;
  verse: number;
}

export interface Settings {
  translation: TranslationId;
  redLetters: boolean;
  /** KJV only: show the 16 verses the earliest manuscripts lack as faded markers. */
  showManuscriptNotes: boolean;
  /** Scroll from one chapter (and book) straight into the next. */
  continuousScroll: boolean;
  last: Position;
}

export const DEFAULT_SETTINGS: Settings = {
  translation: 'bsb',
  redLetters: true,
  showManuscriptNotes: true,
  continuousScroll: false,
  last: { book: 'JHN', chapter: 1, verse: 1 },
};

const KEY = 'margins.settings.v1';
const listeners = new Set<() => void>();
let current: Settings = load();

function sanitize(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  // Any well-formed id; the reader sends one that isn't available to the BSB.
  if (typeof r.translation === 'string' && /^[a-z]{2,8}$/.test(r.translation)) {
    s.translation = r.translation as TranslationId;
  }
  if (typeof r.redLetters === 'boolean') s.redLetters = r.redLetters;
  if (typeof r.showManuscriptNotes === 'boolean') s.showManuscriptNotes = r.showManuscriptNotes;
  if (typeof r.continuousScroll === 'boolean') s.continuousScroll = r.continuousScroll;
  const last = r.last as Record<string, unknown> | undefined;
  if (last && typeof last.book === 'string' && isBookId(last.book)) {
    s.last = {
      book: last.book,
      chapter: Number.isInteger(last.chapter) ? (last.chapter as number) : 1,
      verse: Number.isInteger(last.verse) ? (last.verse as number) : 1,
    };
  }
  return s;
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage can be unavailable (private windows); settings still work for this visit.
  }
  for (const l of listeners) l();
}

/** For tests. */
export function reloadSettings(): void {
  current = load();
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
