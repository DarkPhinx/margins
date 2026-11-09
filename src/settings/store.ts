/**
 * Where each setting is kept, following its scope in ./registry.ts.
 *
 * On this device (localStorage, "margins.settings.v1"):
 *   - every device setting, always;
 *   - the account settings used while signed out.
 *
 * Signed in, account settings come from the account instead. A copy is kept
 * on the device per account ("margins.settings.account.<user id>"), so they
 * work offline, with each value's change time and a list of changes not yet
 * uploaded. Syncing (./sync.ts) sends those and takes the account's values
 * back; for each setting the newer change wins, so changing one setting on a
 * phone and another on a laptop keeps both.
 *
 * The signed-out values are left as they were while someone is signed in, so
 * signing out goes back to them.
 */

import { useSyncExternalStore } from 'react';
import { isPageSetting, PAGE_SETTING_KEYS, parseSetting, SETTINGS, type PageSettingKey, type Settings } from './registry';

/** A setting as the account keeps it: its value and when it last changed (ms since 1970). */
export interface Stamped {
  value: unknown;
  at: number;
}

/** The account's settings: setting name → stamped value. May hold settings this version doesn't know. */
export type AccountRecord = Record<string, Stamped>;

interface AccountCopy {
  values: AccountRecord;
  /** Settings changed here and not yet uploaded. */
  changed: string[];
}

export const DEVICE_KEY = 'margins.settings.v1';
export const accountSettingsKey = (userId: string) => `margins.settings.account.${userId}`;

const listeners = new Set<() => void>();
const accountListeners = new Set<() => void>();

let device: Record<string, unknown> = readJson(DEVICE_KEY) ?? {};
let account: { userId: string; copy: AccountCopy } | null = null;
let current: Settings = compute();

function readJson(key: string): Record<string, unknown> | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private windows); settings still work for this visit.
  }
}

export function isStamped(v: unknown): v is Stamped {
  return !!v && typeof v === 'object' && 'value' in v && typeof (v as Stamped).at === 'number' && Number.isFinite((v as Stamped).at);
}

function readAccountCopy(userId: string): AccountCopy | null {
  const raw = readJson(accountSettingsKey(userId));
  if (!raw) return null;
  const values: AccountRecord = {};
  const stored = raw.values && typeof raw.values === 'object' ? (raw.values as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(stored)) if (isStamped(v)) values[k] = v;
  const changed = Array.isArray(raw.changed) ? raw.changed.filter((k): k is string => typeof k === 'string' && k in values) : [];
  return { values, changed };
}

/** Where a setting's value comes from right now. */
function rawValue(key: PageSettingKey): unknown {
  if (SETTINGS[key].scope === 'account' && account) return account.copy.values[key]?.value;
  return device[key];
}

function compute(): Settings {
  const s: Record<string, unknown> = {};
  for (const k of PAGE_SETTING_KEYS) s[k] = parseSetting(k, rawValue(k));
  return s as Settings;
}

function same(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** Recomputes and tells everyone, if anything visible changed (or `always`). */
function refresh(always = false): void {
  const next = compute();
  const unchanged = PAGE_SETTING_KEYS.every((k) => same(next[k], current[k]));
  if (!unchanged) current = next;
  if (!unchanged || always) for (const l of listeners) l();
}

function saveAccount(): void {
  if (account) writeJson(accountSettingsKey(account.userId), account.copy);
}

export function getSettings(): Settings {
  return current;
}

/**
 * Changes settings. Each goes where its scope says: device settings (and
 * account settings while signed out) on this device; account settings, when
 * signed in, to the account. A value that hasn't changed isn't recorded.
 */
export function updateSettings(patch: Partial<Settings>): void {
  let deviceChanged = false;
  let accountChanged = false;
  for (const [key, value] of Object.entries(patch)) {
    if (!isPageSetting(key) || value === undefined || same(current[key], value)) continue;
    if (SETTINGS[key].scope === 'account' && account) {
      const before = account.copy.values[key]?.at ?? 0;
      // Always later than the value it replaces, even if the clock went back.
      account.copy.values[key] = { value, at: Math.max(Date.now(), before + 1) };
      if (!account.copy.changed.includes(key)) account.copy.changed.push(key);
      accountChanged = true;
    } else {
      device[key] = value;
      deviceChanged = true;
    }
  }
  if (deviceChanged) writeJson(DEVICE_KEY, device);
  if (accountChanged) saveAccount();
  refresh();
  if (accountChanged) for (const l of accountListeners) l();
}

/**
 * Signed in: account settings now come from this account. The first time on
 * this device, the values used here signed out are offered to the account,
 * dated as old as possible: the account keeps any value it already has, and
 * takes these only for settings it has never had.
 */
export function attachAccountSettings(userId: string): void {
  if (account?.userId === userId) return;
  let copy = readAccountCopy(userId);
  if (!copy) {
    copy = { values: {}, changed: [] };
    for (const k of PAGE_SETTING_KEYS) {
      if (SETTINGS[k].scope !== 'account' || device[k] === undefined) continue;
      copy.values[k] = { value: device[k], at: 0 };
      copy.changed.push(k);
    }
  }
  account = { userId, copy };
  saveAccount();
  refresh(true);
  if (copy.changed.length) for (const l of accountListeners) l();
}

/** Signed out: account settings go back to this device's own values. */
export function detachAccountSettings(): void {
  if (!account) return;
  account = null;
  refresh(true);
}

/** Removes this device's copy of an account's settings (on signing out). */
export function forgetAccountSettings(userId: string): void {
  if (account?.userId === userId) detachAccountSettings();
  try {
    localStorage.removeItem(accountSettingsKey(userId));
  } catch {
    // Nothing stored.
  }
}

/** The account whose settings are in use, or null signed out. */
export function settingsAccount(): string | null {
  return account?.userId ?? null;
}

/** Account setting changes made here and not yet uploaded. */
export function pendingAccountChanges(): AccountRecord {
  if (!account) return {};
  const out: AccountRecord = {};
  for (const k of account.copy.changed) {
    const v = account.copy.values[k];
    if (v) out[k] = v;
  }
  return out;
}

export function pendingAccountChangeCount(): number {
  return account?.copy.changed.length ?? 0;
}

/**
 * Takes the account's settings after a sync. `sent` is what this device
 * uploaded; anything changed again here since then stays as it is (and
 * waiting to upload). Ignored if a different account is signed in by now.
 */
export function receiveAccountSettings(userId: string, sent: AccountRecord, record: AccountRecord): void {
  if (account?.userId !== userId) return;
  const copy = account.copy;
  copy.changed = copy.changed.filter((k) => !(sent[k] && copy.values[k]?.at === sent[k].at));
  for (const [k, v] of Object.entries(record)) {
    if (!isStamped(v) || copy.changed.includes(k)) continue;
    copy.values[k] = { value: v.value, at: v.at };
  }
  saveAccount();
  refresh();
}

/** Calls back when an account setting changes here (so it can be synced). */
export function onAccountSettingsChange(listener: () => void): () => void {
  accountListeners.add(listener);
  return () => accountListeners.delete(listener);
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings, getSettings);
}

const getAccount = () => account?.userId ?? null;

/** The account whose settings are in use (null signed out), for the Settings panel. */
export function useSettingsAccount(): string | null {
  return useSyncExternalStore(subscribeSettings, getAccount, getAccount);
}

/** For tests: reads everything from storage again. */
export function reloadSettings(): void {
  device = readJson(DEVICE_KEY) ?? {};
  if (account) account.copy = readAccountCopy(account.userId) ?? { values: {}, changed: [] };
  current = compute();
  for (const l of listeners) l();
}
