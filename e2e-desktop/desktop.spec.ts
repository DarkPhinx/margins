/**
 * The Windows app (Phase 6), driven through Electron itself: its own window,
 * everything from inside the program with no network at all, data kept between
 * launches, screen settings, outside links in the browser, and margins:// links.
 *
 * Runs against `npm run build:desktop`, or an installed Margins.exe (see program.ts).
 */

import { expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeSession } from '../e2e/fixtures';
import { launch, openAgain, requested } from './program';

let profile: string;
test.beforeEach(() => {
  profile = mkdtempSync(join(tmpdir(), 'margins-desktop-'));
});
test.afterEach(() => {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('opens in its own window, with both Bibles, cross-references and word lookups, all without the internet', async () => {
  const { app, page } = await launch(profile);
  try {
    await expect(page).toHaveTitle(/Margins/);
    expect(page.url()).toMatch(/^margins:\/\/app\//);
    const win = await app.browserWindow(page);
    // Shown once the first page is drawn, so there's no blank flash.
    await expect.poll(() => win.evaluate((w) => ({ visible: w.isVisible(), menu: w.isMenuBarVisible() }))).toEqual({ visible: true, menu: false });

    // Signed out, the app opens on the Bible.
    await expect(page.locator('article.chapter').first()).toBeVisible();

    await page.evaluate(() => history.pushState(null, '', '/bsb/JHN/3'));
    await page.reload();
    await expect(page.getByText('Jesus and Nicodemus')).toBeVisible();

    // A deep page address loads straight from the program.
    await page.goto('margins://app/kjv/PSA/119?v=105');
    await expect(page.getByText(/a lamp unto my feet, and a light unto my path/)).toBeVisible();
    await page.getByLabel('Translation').selectOption('bsb');
    await expect(page.getByText(/Your word is a lamp to my feet/)).toBeVisible();

    // Cross-references.
    await page.goto('margins://app/bsb/JHN/3?v=16');
    await page.locator('article.chapter span[data-v="16"]').first().click();
    await page.getByRole('toolbar', { name: /Selected/ }).getByRole('button', { name: /Cross-ref/ }).click();
    await expect(page.getByRole('complementary', { name: 'Study' })).toContainText(/Romans 5:8|Rom 5:8/);

    // Original language: word data is inside the program, so it works the first time, offline.
    await page.goto('margins://app/original/word/G0025?v=43003016&i=2&t=bsb');
    await expect(page.getByRole('region', { name: 'In John 3:16' })).toContainText('ēgapēsen');
    await page.goto('margins://app/original/verse/01001001');
    await expect(page.getByRole('list', { name: 'Original words' })).toContainText('bereshit');

    // Settings says it's ready offline straight away (no download to wait for).
    await page.goto('margins://app/bsb/JHN/3');
    await page.getByRole('button', { name: 'Settings' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toContainText('Ready to read offline.');

    // No service worker: there is nothing to download.
    expect(await page.evaluate(async () => ({ controller: navigator.serviceWorker?.controller ?? null, sw: (await fetch('/sw.js')).status }))).toEqual({
      controller: null,
      sw: 404,
    });
    expect(await requested(app)).toEqual([]);
  } finally {
    await app.close();
  }
});

test('notes are kept between launches, and the window opens where it was left', async () => {
  let { app, page } = await launch(profile);
  try {
    // Signed in as a test account (all requests to Supabase are refused, so sync says offline).
    await page.evaluate((s) => localStorage.setItem('margins.auth', JSON.stringify(s)), fakeSession());
    await page.goto('margins://app/bsb/JHN/3');
    await page.locator('article.chapter span[data-v="16"]').first().click();
    await page.getByRole('toolbar', { name: /Selected/ }).getByRole('button', { name: 'Note', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Note' });
    await expect(dialog.getByRole('textbox', { name: 'Note' })).toBeFocused();
    await page.keyboard.type('Written on the desktop.');
    await expect(dialog.getByText('Saved')).toBeVisible();
    await dialog.getByRole('button', { name: 'Done' }).click();

    const win = await app.browserWindow(page);
    await win.evaluate((w) => w.setBounds({ x: 120, y: 90, width: 1000, height: 700 }));
    await app.close();

    ({ app, page } = await launch(profile));
    await page.goto('margins://app/bsb/JHN/3');
    await page.getByRole('button', { name: 'A note on verse 16' }).click();
    await expect(page.getByRole('dialog', { name: 'Note' }).getByRole('textbox', { name: 'Note' })).toContainText('Written on the desktop.');
    const bounds = await (await app.browserWindow(page)).evaluate((w) => w.getNormalBounds());
    expect(bounds).toMatchObject({ x: 120, y: 90, width: 1000, height: 700 });
  } finally {
    await app.close();
  }
});

test('dark mode and text size are set in Settings and kept on this computer between launches', async () => {
  let { app, page } = await launch(profile);
  try {
    await page.goto('margins://app/bsb/JHN/3');
    await page.getByRole('button', { name: 'Settings' }).first().click();
    const device = page.getByRole('dialog', { name: 'Settings' }).getByRole('region', { name: 'This device' });
    await device.getByText('Dark', { exact: true }).click();
    await device.getByText('Larger', { exact: true }).click();
    const look = () =>
      page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        size: document.documentElement.dataset.textSize,
        paper: getComputedStyle(document.body).backgroundColor,
      }));
    await expect.poll(look).toEqual({ theme: 'dark', size: 'larger', paper: 'rgb(27, 26, 24)' });
    await app.close();

    ({ app, page } = await launch(profile));
    await page.goto('margins://app/bsb/JHN/3');
    await expect.poll(look).toEqual({ theme: 'dark', size: 'larger', paper: 'rgb(27, 26, 24)' });
  } finally {
    await app.close();
  }
});

test('outside links open in the browser, never in the window', async () => {
  const { app, page } = await launch(profile);
  try {
    await app.evaluate(({ shell }) => {
      const g = globalThis as unknown as { opened: string[] };
      g.opened = [];
      shell.openExternal = async (url: string) => void g.opened.push(url);
    });
    await page.goto('margins://app/bsb/JHN/3');
    const before = page.url();
    await page.getByRole('button', { name: 'Settings' }).first().click();
    await page.getByRole('link', { name: 'STEPBible-Data' }).click();
    // A page that sends the window elsewhere (as Google sign-in does) is caught too.
    await page.evaluate(() => window.location.assign('https://accounts.google.com/o/oauth2/auth?x=1'));
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened)).toEqual([
      'https://github.com/STEPBible/STEPBible-Data',
      'https://accounts.google.com/o/oauth2/auth?x=1',
    ]);
    expect(page.url()).toBe(before);
    expect(app.windows()).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test('a margins:// link opens the program at that page, also when it is already open', async () => {
  const { app, page } = await launch(profile, { args: ['margins://app/kjv/GEN/1'] });
  try {
    await expect(page.getByText(/In the beginning God created the heaven and the earth/)).toBeVisible();

    // Opening a link while the program runs (as Windows does for a sign-in email) comes back to this window.
    // The second copy hands the link over and quits.
    expect(await openAgain(profile, ['margins://app/bsb/ROM/8'])).toBe(0);
    await expect(page).toHaveURL('margins://app/bsb/ROM/8');
    await expect(page.getByText(/no condemnation for those who are in Christ Jesus/)).toBeVisible();
    expect(app.windows()).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test('a missing file is a 404, and nothing outside the program can be read', async () => {
  const { app, page } = await launch(profile);
  try {
    const status = (path: string) => page.evaluate(async (p) => (await fetch(p)).status, path);
    expect(await status('/bibles/bsb/JHN.json')).toBe(200);
    expect(await status('/bibles/bsb/NOPE.json')).toBe(404);
    expect(await status('/..%2f..%2fpackage.json')).toBe(404);
    expect(await status('/%2e%2e/%2e%2e/package.json')).toBe(404);
    // A page address, even one that looks like a file, opens the app.
    await page.goto('margins://app/bsb/JHN/3.5');
    await expect(page.locator('#root')).not.toBeEmpty();
  } finally {
    await app.close();
  }
});
