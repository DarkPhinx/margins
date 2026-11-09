/**
 * Starting the Windows app for a test: `npm run build:desktop` run by Electron,
 * or an installed Margins.exe when MARGINS_EXE is set (scripts/test-installer.ts).
 */

import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

export const exe = process.env.MARGINS_EXE;

/** The program's environment. (Editors built on Electron set ELECTRON_RUN_AS_NODE, which would start it as plain Node.) */
export function programEnv(profile: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  return { ...env, MARGINS_USER_DATA: profile };
}

function command(args: string[]): { file: string; args: string[] } {
  if (exe) return { file: exe, args };
  return { file: createRequire(import.meta.url)('electron') as string, args: ['.', ...args] };
}

/**
 * Starts the program with a profile of its own. Offline (the default), every
 * internet request is refused and recorded, so a test can show none were made.
 */
export async function launch(
  profile: string,
  { args = [], offline = true }: { args?: string[]; offline?: boolean } = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const c = command(args);
  const app = await electron.launch({ executablePath: c.file, args: c.args, env: programEnv(profile) });
  if (offline) {
    await app.evaluate(({ session }) => {
      const g = globalThis as unknown as { requested: string[] };
      g.requested = [];
      session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (d, done) => {
        g.requested.push(d.url);
        done({ cancel: true });
      });
    });
  }
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

/** Internet requests the program tried to make (offline launches). */
export const requested = (app: ElectronApplication) => app.evaluate(() => (globalThis as unknown as { requested: string[] }).requested);

/** Opens the program again with these arguments, as Windows does for a margins:// link; resolves with its exit code. */
export function openAgain(profile: string, args: string[]): Promise<number | null> {
  const c = command(args);
  const p = spawn(c.file, c.args, { env: programEnv(profile), stdio: 'ignore' });
  return new Promise((resolve) => p.on('exit', resolve));
}
