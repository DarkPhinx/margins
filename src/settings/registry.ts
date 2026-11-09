/**
 * Every Margins setting, in one list. Each declares its scope:
 *
 *  - "account": about how the person studies. Signed in, it's kept with the
 *    account and synced, so it's the same on every device. Signed out, it's
 *    kept on this device like everything else.
 *  - "device": about the screen and this device. Always kept on this device
 *    only, signed in or not.
 *
 * Adding a setting means adding one entry here, with its scope, default and
 * a parser for stored values. The store (./store.ts) puts it in the right
 * place and syncs it if it's an account setting; nothing else needs to change.
 * Moving a setting between scopes is changing one word, and its control moves
 * to the matching section of the Settings panel too.
 *
 * Values are checked with `parse` whenever they're read, since they can come
 * from an older version, from another device on a newer version, or from
 * storage someone edited. An unusable value falls back to the default.
 */

import { DEFAULT_WINDOW, parseWindowState, type WindowState } from '../../electron/window-state.ts';
import { isBookId, type BookId } from '../bible/books';
import type { TranslationId } from '../bible/types';

export type Scope = 'account' | 'device';

export interface SettingDef<T> {
  scope: Scope;
  default: T;
  /** A stored value as a valid one, or undefined to use the default. */
  parse: (raw: unknown) => T | undefined;
  /**
   * Kept by the desktop program itself rather than the page: only the window
   * size, since the window exists before the page loads (see electron/window-state.ts).
   * The page never reads or writes these.
   */
  keptBy?: 'desktop';
}

export interface Position {
  book: BookId;
  chapter: number;
  verse: number;
}

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const TEXT_SIZES = ['small', 'medium', 'large', 'larger'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

const setting = <T>(def: SettingDef<T>): SettingDef<T> => def;
const desktopSetting = <T>(def: Omit<SettingDef<T>, 'keptBy'>): SettingDef<T> & { keptBy: 'desktop' } => ({ ...def, keptBy: 'desktop' });

const bool = (raw: unknown) => (typeof raw === 'boolean' ? raw : undefined);
const oneOf =
  <T extends string>(options: readonly T[]) =>
  (raw: unknown) =>
    options.includes(raw as T) ? (raw as T) : undefined;

function parsePosition(raw: unknown): Position | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.book !== 'string' || !isBookId(r.book)) return undefined;
  const whole = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 ? (v as number) : 1);
  return { book: r.book, chapter: whole(r.chapter), verse: whole(r.verse) };
}

export const SETTINGS = {
  // ——— Account: how you study ———

  /** The translation you read in. Any well-formed id: the reader sends one it can't show to the BSB. */
  translation: setting<TranslationId>({
    scope: 'account',
    default: 'bsb',
    parse: (raw) => (typeof raw === 'string' && /^[a-z]{2,8}$/.test(raw) ? (raw as TranslationId) : undefined),
  }),
  /** The words of Jesus in red. */
  redLetters: setting({ scope: 'account', default: true, parse: bool }),
  /** KJV only: show the 16 verses the earliest manuscripts lack as faded markers. */
  showManuscriptNotes: setting({ scope: 'account', default: true, parse: bool }),
  /** Continuous reading: scroll from one chapter (and book) straight into the next. */
  continuousScroll: setting({ scope: 'account', default: false, parse: bool }),

  // ——— Device: the screen and this device ———

  /** Dark mode: follow the system, or always light or dark. */
  theme: setting<Theme>({ scope: 'device', default: 'system', parse: oneOf(THEMES) }),
  /** Text size for the whole app. */
  textSize: setting<TextSize>({ scope: 'device', default: 'medium', parse: oneOf(TEXT_SIZES) }),
  /** The desktop window's size and place. */
  windowSize: desktopSetting<WindowState>({ scope: 'device', default: DEFAULT_WINDOW, parse: parseWindowState }),
  /** Where you were reading on this device. */
  last: setting<Position>({ scope: 'device', default: { book: 'JHN', chapter: 1, verse: 1 }, parse: parsePosition }),
};

type Registry = typeof SETTINGS;
export type SettingKey = keyof Registry;
type ValueOf<K extends SettingKey> = Registry[K] extends SettingDef<infer T> ? T : never;

/** The settings the page keeps (all but those the desktop program keeps itself). */
export type PageSettingKey = { [K in SettingKey]: Registry[K] extends { keptBy: 'desktop' } ? never : K }[SettingKey];

export type Settings = { [K in PageSettingKey]: ValueOf<K> };

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];
export const PAGE_SETTING_KEYS = SETTING_KEYS.filter((k) => !(SETTINGS[k] as SettingDef<unknown>).keptBy) as PageSettingKey[];

export function scopeOf(key: SettingKey): Scope {
  return SETTINGS[key].scope;
}

export function keysIn(scope: Scope): SettingKey[] {
  return SETTING_KEYS.filter((k) => SETTINGS[k].scope === scope);
}

export function isPageSetting(key: string): key is PageSettingKey {
  return (PAGE_SETTING_KEYS as string[]).includes(key);
}

/** A stored value as a valid one for `key`, or its default. */
export function parseSetting<K extends PageSettingKey>(key: K, raw: unknown): Settings[K] {
  const def = SETTINGS[key] as SettingDef<Settings[K]>;
  return raw === undefined ? def.default : (def.parse(raw) ?? def.default);
}

export const DEFAULT_SETTINGS: Settings = Object.fromEntries(PAGE_SETTING_KEYS.map((k) => [k, SETTINGS[k].default])) as Settings;
