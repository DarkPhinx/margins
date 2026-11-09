/**
 * The Windows app against the real Supabase project in .env: signing in from
 * the program's own origin (margins://app) works, and a note written in one
 * copy of the program reaches another, like the web app (e2e/sync.spec.ts).
 *
 * Runs only when SUPABASE_ACCESS_TOKEN is set; makes a throwaway account and
 * deletes it (and everything it saved) afterwards.
 */

import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch } from './program';

const root = join(import.meta.dirname, '..');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const URL = process.env.VITE_SUPABASE_URL?.trim() ?? '';
const ref = URL ? new globalThis.URL(URL).hostname.split('.')[0] : '';

test.skip(!TOKEN || !URL, 'Needs SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL in .env');
test.describe.configure({ timeout: 180_000 });

let serviceKey = '';
const account = { id: '', email: `desktop-test-${Date.now()}@example.com`, password: `Test-${Math.random().toString(36).slice(2)}-pw` };
const profiles: string[] = [];

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
  if (account.id) await admin(`/users/${account.id}`, { method: 'DELETE' });
  for (const p of profiles) rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

async function signIn(page: Page) {
  await page.goto('margins://app/signin');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /^Synced$/ })).toBeVisible({ timeout: 30_000 });
}

test('sign in from the program; a note written in one copy appears in another', async () => {
  const profile = () => {
    const p = mkdtempSync(join(tmpdir(), 'margins-desktop-sync-'));
    profiles.push(p);
    return p;
  };
  const a = await launch(profile(), { offline: false });
  const b = await launch(profile(), { offline: false });
  try {
    await signIn(a.page);
    await signIn(b.page);

    await a.page.goto('margins://app/bsb/JHN/3');
    await a.page.locator('article.chapter span[data-v="16"]').first().click();
    await a.page.getByRole('toolbar', { name: /Selected/ }).getByRole('button', { name: 'Note', exact: true }).click();
    const dialog = a.page.getByRole('dialog', { name: 'Note' });
    await expect(dialog.getByRole('textbox', { name: 'Note' })).toBeFocused();
    await a.page.keyboard.type('From the Windows app.');
    await expect(dialog.getByText('Saved')).toBeVisible();
    await a.page.keyboard.press('Escape');
    await expect(a.page.getByRole('status').filter({ hasText: /^Synced$/ })).toBeVisible({ timeout: 30_000 });

    // The other copy hears about it straight away (Realtime) — or within the minute.
    // (Saves made while typing go up too, so wait for the last one.)
    await b.page.goto('margins://app/notes');
    await expect(b.page.locator('main')).toContainText('From the Windows app.', { timeout: 70_000 });
    await b.page.goto('margins://app/bsb/JHN/3');
    await b.page.getByRole('button', { name: 'A note on verse 16' }).click();
    await expect(b.page.getByRole('dialog', { name: 'Note' }).getByRole('textbox', { name: 'Note' })).toContainText('From the Windows app.');
  } finally {
    await a.app.close();
    await b.app.close();
  }
});
