/** Settings: the list is in ./registry.ts, where each one is kept in ./store.ts, account sync in ./sync.ts. */

export {
  DEFAULT_SETTINGS,
  SETTINGS,
  TEXT_SIZES,
  THEMES,
  keysIn,
  scopeOf,
  type PageSettingKey,
  type Position,
  type Scope,
  type SettingKey,
  type Settings,
  type TextSize,
  type Theme,
} from './registry';
export {
  attachAccountSettings,
  detachAccountSettings,
  forgetAccountSettings,
  getSettings,
  onAccountSettingsChange,
  pendingAccountChangeCount,
  reloadSettings,
  subscribeSettings,
  updateSettings,
  useSettings,
  useSettingsAccount,
  type AccountRecord,
  type Stamped,
} from './store';
export { syncSettings, type SettingsRemote } from './sync';
