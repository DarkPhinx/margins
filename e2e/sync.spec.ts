/**
 * Two devices, one account, the real Supabase project in .env.
 *
 * Runs only when SUPABASE_ACCESS_TOKEN is set (it's used to get the project's
 * admin key, to make a throwaway account with its email already confirmed,
 * and to delete that account — and everything it saved — afterwards).
 * Unlike the other browser tests, this one talks to the real server.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const root = join(import.meta.dirname, '..');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const URL = process.env.VITE_SUPABASE_URL ?? '';
const ref = URL ? new globalThis.URL(URL).hostname.split('.')[0] : '';

test.skip(!TOKEN || !URL, 'Needs SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL in .env');
test.describe.configure({ mode: 'serial', timeout: 180_000 });

let serviceKey = '';
const account = { id: '', email: `sync-test-${Date.now()}@example.com`, password: `Test-${Math.random().toString(36).slice(2)}-pw` };

async function admin(path: string, init: RequestInit = {}) {
  const res = await fetch(`${URL}/auth/v1/admin${path}`, {
    ...init,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : ((await res.json()) as { id?: string });
}

test.beforeAll(async () => {
  const keys = (await (
    await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  ).json()) as { name: string; api_key: string }[];
  serviceKey = keys.find((k) => k.name === 'service_role')?.api_key ?? '';
  if (!serviceKey) throw new Error('No service_role key for the project');
  const user = await admin('/users', { method: 'POST', body: JSON.stringify({ email: account.email, password: account.password, email_confirm: true }) });
  account.id = user!.id!;
});

test.afterAll(async () => {
  // Deleting the account deletes its study items too (on delete cascade).
  if (account.id) await admin(`/users/${account.id}`, { method: 'DELETE' });
});

/** A device: its own browser profile, signed in to the account. */
async function device(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: 'http://localhost:4173' });
  const page = await context.newPage();
  // Reading needs no account, so / opens the Bible; sign in from the sign-in page.
  await page.goto('/signin');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /^Synced$/ })).toBeVisible({ timeout: 30_000 });
  return { context, page };
}

const verseText = (page: Page, n: number) => page.locator(`article.chapter span[data-v="${n}"]`).first();
const syncStatus = (page: Page) => page.locator('.sync-status [role="status"]');

async function writeNote(page: Page, text: string) {
  await verseText(page, 16).click();
  await page.getByRole('toolbar', { name: /Selected/ }).getByRole('button', { name: 'Note', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Note' });
  await expect(dialog.getByRole('textbox', { name: 'Note' })).toBeFocused();
  await page.keyboard.type(text);
  await expect(dialog.getByText('Saved')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

async function editNote(page: Page, text: string) {
  await page.getByRole('button', { name: /note.* on verse 16/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Note' });
  const editor = dialog.getByRole('textbox', { name: 'Note' });
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
  await expect(dialog.getByText('Saved')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

test('a note written offline on one device appears on the other; an edit on both asks which to keep', async ({ browser }) => {
  const laptop = await device(browser);
  const phone = await device(browser);
  await laptop.page.goto('/bsb/JHN/3');
  await phone.page.goto('/bsb/JHN/3');

  // Written offline on the laptop.
  await laptop.context.setOffline(true);
  await expect(syncStatus(laptop.page)).toHaveText('Offline');
  await writeNote(laptop.page, 'Written offline on the laptop');
  await expect(syncStatus(laptop.page)).toHaveText('Offline · 1 change saved on this device');

  // Back online: it uploads, and the phone gets it without reloading.
  await laptop.context.setOffline(false);
  await expect(syncStatus(laptop.page)).toHaveText('Synced', { timeout: 30_000 });
  await expect(phone.page.getByRole('button', { name: 'A note on verse 16' })).toBeVisible({ timeout: 70_000 });
  await phone.page.getByRole('button', { name: 'A note on verse 16' }).click();
  await expect(phone.page.getByRole('dialog', { name: 'Note' })).toContainText('Written offline on the laptop');
  await phone.page.keyboard.press('Escape');

  // Both edit it while offline.
  await laptop.context.setOffline(true);
  await phone.context.setOffline(true);
  await editNote(laptop.page, 'The laptop’s version');
  await editNote(phone.page, 'The phone’s version');

  // The laptop gets there first; the phone is asked.
  await laptop.context.setOffline(false);
  await expect(syncStatus(laptop.page)).toHaveText('Synced', { timeout: 30_000 });
  await phone.context.setOffline(false);
  const ask = phone.page.getByRole('dialog', { name: 'Changed on two devices' });
  await expect(ask).toBeVisible({ timeout: 30_000 });
  await expect(ask.getByRole('region', { name: 'On this device' })).toContainText('The phone’s version');
  await expect(ask.getByRole('region', { name: 'On your other device' })).toContainText('The laptop’s version');
  await ask.getByRole('button', { name: 'Keep both' }).click();
  await expect(ask).toBeHidden();

  // Both notes end up on both devices.
  await expect(phone.page.getByRole('button', { name: '2 notes on verse 16' })).toBeVisible({ timeout: 30_000 });
  await expect(laptop.page.getByRole('button', { name: '2 notes on verse 16' })).toBeVisible({ timeout: 70_000 });

  await laptop.context.close();
  await phone.context.close();
});
