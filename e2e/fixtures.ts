/**
 * Every browser test runs signed in, as a test account that exists only in
 * the page: a session is put in storage before the app loads, and every
 * request to Supabase is blocked, so these tests never reach a real server
 * (sync just reports "offline"). The two-device sync test (sync.spec.ts) uses
 * real accounts instead and imports from '@playwright/test' directly.
 */

import { expect, test as base, type Page } from '@playwright/test';

export { expect, type Page, type BrowserContext, type Locator } from '@playwright/test';

export const E2E_USER = { id: 'e2e-user', email: 'tester@example.com' };
/** The test account's database on the device. */
export const E2E_DATABASE = `margins-${E2E_USER.id}`;

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** A session shaped like Supabase's, valid for a day. */
export function fakeSession() {
  const expires = Math.floor(Date.now() / 1000) + 86_400;
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: E2E_USER.id, email: E2E_USER.email, exp: expires, role: 'authenticated' })}.signature`,
    refresh_token: 'e2e-refresh',
    token_type: 'bearer',
    expires_in: 86_400,
    expires_at: expires,
    user: { id: E2E_USER.id, email: E2E_USER.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
  };
}

export const test = base.extend<{ signedOut: boolean; signedIn: null }>({
  /** `test.use({ signedOut: true })`: nobody signed in (reading only). */
  signedOut: [false, { option: true }],
  signedIn: [
    async ({ context, signedOut }, use) => {
      if (!signedOut) await context.addInitScript((session) => {
        // Before the app reads it, every time a page loads (tests may clear storage).
        try {
          if (!localStorage.getItem('margins.auth')) localStorage.setItem('margins.auth', JSON.stringify(session));
        } catch {
          // Pages without storage (about:blank and the like) don't run the app.
        }
      }, fakeSession());
      await context.route(/\.supabase\.co\//, (route) => route.abort('internetdisconnected'));
      await context.routeWebSocket(/\.supabase\.co\//, (ws) => ws.close());
      await use(null);
    },
    { auto: true },
  ],
});

/**
 * Continuous reading on or off, from Settings as a person would. It's an
 * account setting: signed in it comes from the account, so seeding the
 * device's own storage wouldn't reach it.
 */
export async function setContinuous(page: Page, on: boolean): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const toggle = dialog.getByRole('switch', { name: /Continuous reading/ });
  if ((await toggle.isChecked()) !== on) await toggle.click();
  await expect(toggle).toBeChecked({ checked: on });
  await dialog.getByRole('button', { name: 'Done' }).click();
}
