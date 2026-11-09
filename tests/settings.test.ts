import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_WINDOW, parseWindowState } from '../electron/window-state';
import { applyScreenSettings } from '../src/settings/apply';
import { DEFAULT_SETTINGS, keysIn, PAGE_SETTING_KEYS, scopeOf, SETTINGS, type SettingDef } from '../src/settings/registry';
import {
  accountSettingsKey,
  attachAccountSettings,
  detachAccountSettings,
  DEVICE_KEY,
  forgetAccountSettings,
  getSettings,
  isStamped,
  onAccountSettingsChange,
  pendingAccountChangeCount,
  pendingAccountChanges,
  reloadSettings,
  settingsAccount,
  updateSettings,
  type AccountRecord,
} from '../src/settings/store';
import { syncSettings, type SettingsRemote } from '../src/settings/sync';

/** The account's settings on the server, following merge_account_settings in supabase/migrations. */
class FakeSettingsServer {
  data: AccountRecord = {};
  offline = false;
  calls = 0;

  remote(): SettingsRemote {
    return {
      exchange: async (changes) => {
        this.calls++;
        if (this.offline) throw new Error('offline');
        for (const [k, v] of Object.entries(changes)) {
          if (!isStamped(v)) throw new Error(`setting ${k} is not {value, at}`);
          const cur = this.data[k];
          if (!cur || v.at > cur.at) this.data[k] = { value: structuredClone(v.value), at: v.at };
        }
        return structuredClone(this.data);
      },
    };
  }
}

const stored = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null') as Record<string, unknown> | null;

/**
 * A device: its own localStorage. The store is one module, so switching
 * device swaps the storage under it and reloads (as opening the app would).
 */
const devices = new Map<string, Record<string, string>>();
let onDevice = '';
function on(name: string, userId: string | null): void {
  if (onDevice) {
    const saved: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      saved[k] = localStorage.getItem(k)!;
    }
    devices.set(onDevice, saved);
  }
  detachAccountSettings();
  localStorage.clear();
  for (const [k, v] of Object.entries(devices.get(name) ?? {})) localStorage.setItem(k, v);
  onDevice = name;
  reloadSettings();
  if (userId) attachAccountSettings(userId);
}

let server: FakeSettingsServer;

beforeEach(() => {
  detachAccountSettings();
  localStorage.clear();
  devices.clear();
  onDevice = '';
  reloadSettings();
  server = new FakeSettingsServer();
});

afterEach(() => {
  detachAccountSettings();
  localStorage.clear();
  reloadSettings();
});

describe('the settings list', () => {
  it('declares a scope for every setting', () => {
    for (const k of Object.keys(SETTINGS) as (keyof typeof SETTINGS)[]) expect(['account', 'device']).toContain(scopeOf(k));
  });

  it('puts how you study with the account, and the screen and device on the device', () => {
    expect(keysIn('account').sort()).toEqual(['continuousScroll', 'redLetters', 'showManuscriptNotes', 'translation']);
    expect(keysIn('device').sort()).toEqual(['last', 'textSize', 'theme', 'windowSize']);
  });

  it('the page keeps every setting but the window size, which the desktop program keeps', () => {
    expect(PAGE_SETTING_KEYS).not.toContain('windowSize');
    expect(PAGE_SETTING_KEYS.length).toBe(Object.keys(SETTINGS).length - 1);
    expect(SETTINGS.windowSize.keptBy).toBe('desktop');
    expect(SETTINGS.windowSize.default).toEqual(DEFAULT_WINDOW);
  });

  it('every default parses as itself', () => {
    for (const [k, def] of Object.entries(SETTINGS) as [string, SettingDef<unknown>][]) {
      expect(def.parse(def.default), k).toEqual(def.default);
    }
  });

  it('defaults: BSB, red letters and manuscript notes on, paged reading, system theme, medium text', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      translation: 'bsb',
      redLetters: true,
      showManuscriptNotes: true,
      continuousScroll: false,
      theme: 'system',
      textSize: 'medium',
      last: { book: 'JHN', chapter: 1, verse: 1 },
    });
  });

  it('turns unusable stored values into defaults', () => {
    localStorage.setItem(
      DEVICE_KEY,
      JSON.stringify({ translation: 'NOT AN ID', redLetters: 'yes', theme: 'purple', textSize: 3, last: { book: 'XYZ', chapter: 2 } }),
    );
    reloadSettings();
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('reads window sizes the way the desktop program stores them', () => {
    expect(parseWindowState({ width: 1000, height: 700, x: 10, y: 20, maximized: true })).toEqual({ width: 1000, height: 700, x: 10, y: 20, maximized: true });
    expect(parseWindowState({ width: 1000.4, height: 700 })).toEqual({ width: 1000, height: 700 });
    expect(parseWindowState({ width: 200, height: 700 })).toBeUndefined();
    expect(parseWindowState({ width: '1000', height: 700 })).toBeUndefined();
    expect(parseWindowState(null)).toBeUndefined();
  });
});

describe('signed out: everything stays on the device', () => {
  it('keeps account and device settings on the device', () => {
    updateSettings({ redLetters: false, translation: 'kjv', theme: 'dark', textSize: 'large' });
    expect(stored(DEVICE_KEY)).toMatchObject({ redLetters: false, translation: 'kjv', theme: 'dark', textSize: 'large' });
    expect(pendingAccountChangeCount()).toBe(0);
  });

  it('reads settings saved by earlier versions', () => {
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ translation: 'kjv', redLetters: false, continuousScroll: true, last: { book: 'PSA', chapter: 23, verse: 1 } }));
    reloadSettings();
    expect(getSettings()).toMatchObject({ translation: 'kjv', redLetters: false, continuousScroll: true, last: { book: 'PSA', chapter: 23, verse: 1 } });
  });

  it('records nothing when a value is unchanged', () => {
    updateSettings({ redLetters: true });
    expect(localStorage.getItem(DEVICE_KEY)).toBeNull();
  });
});

describe('signed in: account settings come from the account', () => {
  it('sends account settings to the account, and device settings stay on the device', async () => {
    attachAccountSettings('u1');
    updateSettings({ redLetters: false, theme: 'dark', last: { book: 'ROM', chapter: 8, verse: 28 } });
    expect(pendingAccountChanges()).toEqual({ redLetters: { value: false, at: expect.any(Number) } });
    expect(stored(DEVICE_KEY)).toMatchObject({ theme: 'dark', last: { book: 'ROM', chapter: 8, verse: 28 } });
    expect(stored(DEVICE_KEY)).not.toHaveProperty('redLetters');

    await syncSettings(server.remote());
    expect(server.data).toEqual({ redLetters: { value: false, at: expect.any(Number) } });
    expect(server.data).not.toHaveProperty('theme');
    expect(server.data).not.toHaveProperty('last');
    expect(pendingAccountChangeCount()).toBe(0);
  });

  it("the account's settings replace this device's on signing in", async () => {
    server.data = { translation: { value: 'kjv', at: 100 }, continuousScroll: { value: true, at: 100 } };
    updateSettings({ translation: 'bsb', continuousScroll: false, textSize: 'small' });
    attachAccountSettings('u1');
    await syncSettings(server.remote());
    expect(getSettings()).toMatchObject({ translation: 'kjv', continuousScroll: true, textSize: 'small' });
    // The device's values didn't overwrite the account's.
    expect(server.data.translation).toEqual({ value: 'kjv', at: 100 });
  });

  it('fills settings the account has never had from this device', async () => {
    server.data = { translation: { value: 'kjv', at: 100 } };
    updateSettings({ redLetters: false });
    attachAccountSettings('u1');
    await syncSettings(server.remote());
    expect(server.data.redLetters?.value).toBe(false);
    expect(getSettings()).toMatchObject({ translation: 'kjv', redLetters: false });
  });

  it('signing out goes back to the signed-out values, and forgets the account copy', async () => {
    updateSettings({ redLetters: true });
    attachAccountSettings('u1');
    updateSettings({ redLetters: false });
    expect(getSettings().redLetters).toBe(false);
    forgetAccountSettings('u1');
    expect(settingsAccount()).toBeNull();
    expect(getSettings().redLetters).toBe(true);
    expect(localStorage.getItem(accountSettingsKey('u1'))).toBeNull();
  });

  it('works offline: changes wait on the device until the account is reachable', async () => {
    attachAccountSettings('u1');
    server.offline = true;
    updateSettings({ showManuscriptNotes: false });
    await expect(syncSettings(server.remote())).rejects.toThrow('offline');
    expect(pendingAccountChangeCount()).toBe(1);
    // Opening the app again offline keeps the change.
    detachAccountSettings();
    reloadSettings();
    attachAccountSettings('u1');
    expect(getSettings().showManuscriptNotes).toBe(false);
    server.offline = false;
    await syncSettings(server.remote());
    expect(server.data.showManuscriptNotes?.value).toBe(false);
    expect(pendingAccountChangeCount()).toBe(0);
  });

  it('two accounts on one device have their own settings', async () => {
    attachAccountSettings('alice');
    updateSettings({ translation: 'kjv' });
    detachAccountSettings();
    attachAccountSettings('bob');
    expect(getSettings().translation).toBe('bsb');
    detachAccountSettings();
    attachAccountSettings('alice');
    expect(getSettings().translation).toBe('kjv');
  });

  it('tells sync when an account setting changes, not a device one', () => {
    attachAccountSettings('u1');
    let calls = 0;
    const stop = onAccountSettingsChange(() => calls++);
    updateSettings({ theme: 'light' });
    expect(calls).toBe(0);
    updateSettings({ redLetters: false });
    expect(calls).toBe(1);
    stop();
  });

  it('keeps a change made while a sync is on its way', async () => {
    attachAccountSettings('u1');
    updateSettings({ redLetters: false });
    let release!: () => void;
    const slow: SettingsRemote = {
      exchange: async (changes) => {
        await new Promise<void>((r) => (release = r));
        return server.remote().exchange(changes);
      },
    };
    const running = syncSettings(slow);
    updateSettings({ redLetters: true });
    release();
    await running;
    expect(getSettings().redLetters).toBe(true);
    expect(pendingAccountChangeCount()).toBe(1);
    await syncSettings(server.remote());
    expect(server.data.redLetters?.value).toBe(true);
  });
});

describe('two devices, one account', () => {
  it('a setting changed on one device reaches the other; device settings never do', async () => {
    on('laptop', 'u1');
    updateSettings({ translation: 'kjv', textSize: 'larger', theme: 'dark' });
    await syncSettings(server.remote());

    on('phone', 'u1');
    await syncSettings(server.remote());
    expect(getSettings()).toMatchObject({ translation: 'kjv', textSize: 'medium', theme: 'system' });
  });

  it('different settings changed on each device both survive; the same one takes the later change', async () => {
    on('laptop', 'u1');
    await syncSettings(server.remote());
    on('phone', 'u1');
    await syncSettings(server.remote());

    on('laptop', 'u1');
    updateSettings({ redLetters: false, translation: 'kjv' });
    on('phone', 'u1');
    await new Promise((r) => setTimeout(r, 5));
    updateSettings({ continuousScroll: true, translation: 'esv' });

    on('laptop', 'u1');
    await syncSettings(server.remote());
    on('phone', 'u1');
    await syncSettings(server.remote());
    on('laptop', 'u1');
    await syncSettings(server.remote());

    const want = { redLetters: false, continuousScroll: true, translation: 'esv' };
    expect(getSettings()).toMatchObject(want);
    on('phone', 'u1');
    expect(getSettings()).toMatchObject(want);
  });

  it('keeps settings a newer version of the app added', async () => {
    server.data = { futureSetting: { value: 42, at: 5 } };
    on('laptop', 'u1');
    updateSettings({ redLetters: false });
    await syncSettings(server.remote());
    expect(server.data.futureSetting).toEqual({ value: 42, at: 5 });
    expect(getSettings()).not.toHaveProperty('futureSetting');
  });
});

describe('screen settings on the page', () => {
  it('sets dark mode and text size on <html>', () => {
    const root = document.createElement('html');
    const stop = applyScreenSettings(root);
    expect(root.dataset.theme).toBeUndefined();
    expect(root.dataset.textSize).toBe('medium');
    updateSettings({ theme: 'dark', textSize: 'large' });
    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.textSize).toBe('large');
    updateSettings({ theme: 'system' });
    expect(root.dataset.theme).toBeUndefined();
    stop();
  });
});
