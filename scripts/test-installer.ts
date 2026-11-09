/**
 * Installs the Windows app from release/ the way a person would (for this
 * Windows user, silently), checks the shortcuts and the margins:// link are in
 * place, runs the desktop tests against the installed Margins.exe, then
 * uninstalls it and checks nothing is left behind.
 *
 *   npm run dist:win && npm run test:installer
 *
 * It stops if Margins is already installed for this user, so it never touches a real copy.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const release = join(root, 'release');

function fail(message: string): never {
  // Thrown, not exit(): the uninstall below must still run.
  throw new Error(message);
}

function check(ok: boolean, message: string) {
  if (!ok) fail(message);
  console.log(`✓ ${message}`);
}

const registered = () => spawnSync('reg', ['query', 'HKCU\\Software\\Classes\\margins'], { stdio: 'ignore' }).status === 0;
const folder = (name: 'Desktop' | 'Programs') =>
  execFileSync('powershell', ['-NoProfile', '-Command', `[Environment]::GetFolderPath('${name}')`], { encoding: 'utf8' }).trim();

process.on('uncaughtException', (e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});

if (process.platform !== 'win32') fail('The installer test runs on Windows.');
const setups = existsSync(release) ? readdirSync(release).filter((f) => /^Margins-Setup-.*\.exe$/.test(f)) : [];
if (!setups.length) fail('No installer in release/: run `npm run dist:win` first.');
const setup = join(release, setups.sort((a, b) => statSync(join(release, b)).mtimeMs - statSync(join(release, a)).mtimeMs)[0]!);

const desktopLink = join(folder('Desktop'), 'Margins.lnk');
const startLink = join(folder('Programs'), 'Margins.lnk');
if (registered() || existsSync(desktopLink)) fail('Margins is already installed for this Windows user; uninstall it first (or check this installer by hand).');

const dir = mkdtempSync(join(tmpdir(), 'margins-install-'));
// NSIS reads /D= as-is, so the folder can't have spaces (Node would quote it).
if (dir.includes(' ')) fail(`The temporary folder has a space in it: ${dir}`);
let installed = false;
try {
  console.log(`Installing ${setup} into ${dir}…`);
  // NSIS: /S is silent; /D= (last, unquoted) is where to install.
  execFileSync(setup, ['/S', `/D=${dir}`], { stdio: 'inherit' });
  installed = true;
  const exe = join(dir, 'Margins.exe');
  check(existsSync(exe), 'Margins.exe is installed');
  check(existsSync(join(dir, 'resources', 'app.asar')), 'the app (with both Bibles and the word data) is inside it');
  check(existsSync(desktopLink), 'a desktop shortcut was made');
  check(existsSync(startLink), 'a Start menu shortcut was made');
  check(registered(), 'margins:// links open the program');

  console.log('Running the desktop tests against the installed program…');
  const env: NodeJS.ProcessEnv = { ...process.env, MARGINS_EXE: exe };
  delete env.ELECTRON_RUN_AS_NODE;
  const run = spawnSync('npx', ['playwright', 'test', '-c', 'playwright.desktop.config.ts', 'desktop.spec.ts'], {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: true,
  });
  check(run.status === 0, 'the installed program passes the desktop tests');
} finally {
  if (installed) {
    console.log('Uninstalling…');
    // Close any copy a failed test left running, or files would stay locked.
    spawnSync('taskkill', ['/IM', 'Margins.exe', '/F'], { stdio: 'ignore' });
    // _?= runs the uninstaller in place and waits for it.
    const uninstaller = join(dir, 'Uninstall Margins.exe');
    if (existsSync(uninstaller)) execFileSync(uninstaller, ['/S', `_?=${dir}`], { stdio: 'inherit' });
    check(!existsSync(join(dir, 'Margins.exe')), 'the program is removed');
    check(!existsSync(desktopLink) && !existsSync(startLink), 'the shortcuts are removed');
    check(!registered(), 'margins:// is no longer registered');
  }
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
console.log('The installer works.');
