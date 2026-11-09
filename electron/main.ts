/**
 * Margins for Windows: the web app in its own window, served from the files
 * built into the program (both Bibles, cross-references and every word file),
 * so it works fully offline from the first launch. Data lives where the web
 * app keeps it (IndexedDB and local storage), in the program's own profile.
 */

import { app, BrowserWindow, Menu, nativeTheme, net, protocol, screen, session, shell, type MenuItemConstructorOptions } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { contentType, deepLinkIn, fileFor, isAppUrl, isExternalUrl, ORIGIN, SCHEME } from './paths.ts';
import { DEFAULT_WINDOW, parseWindowState, type WindowState } from './window-state.ts';

/** The built app (`npm run build:desktop`). Tests may point elsewhere. */
const appRoot = process.env.MARGINS_APP_DIR ?? join(app.getAppPath(), 'dist-desktop');
const iconFile = join(appRoot, 'icon.png');

// A test can give the program a profile of its own.
if (process.env.MARGINS_USER_DATA) app.setPath('userData', process.env.MARGINS_USER_DATA);

// The app's origin behaves like a secure website: storage, fetch, crypto (sign-in uses it).
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);

// One copy of the program: opening it again (or a margins:// link) comes back to this window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win: BrowserWindow | null = null;

  app.on('second-instance', (_event, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const link = deepLinkIn(argv);
    if (link) void win.loadURL(link);
  });

  // Links from Windows (sign-in emails, Google). The installer registers the
  // scheme too; a development copy leaves the registry alone.
  if (app.isPackaged) app.setAsDefaultProtocolClient(SCHEME);

  void app.whenReady().then(() => {
    protocol.handle(SCHEME, serveAppFile);
    // Nothing the app does needs the camera, location and the like.
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, done) => done(false));
    Menu.setApplicationMenu(menu());
    win = createWindow(deepLinkIn(process.argv) ?? `${ORIGIN}/`);
    win.on('closed', () => (win = null));
  });

  app.on('window-all-closed', () => app.quit());
}

async function serveAppFile(request: Request): Promise<Response> {
  let target = fileFor(appRoot, request.url);
  // Opening a page whose address looks like a file name still opens the app.
  if (target && !target.page && !existsSync(target.file) && (request.headers.get('accept') ?? '').includes('text/html')) {
    target = { file: join(appRoot, 'index.html'), page: true };
  }
  if (!target || !existsSync(target.file)) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  const res = await net.fetch(pathToFileURL(target.file).toString());
  return new Response(res.body, {
    status: 200,
    headers: {
      'content-type': contentType(target.file),
      // A page always comes fresh, so a new version of the program shows at once.
      'cache-control': target.page ? 'no-cache' : 'max-age=31536000, immutable',
    },
  });
}

const stateFile = () => join(app.getPath('userData'), 'window.json');

/** The window size setting (a device setting, kept here because the window exists before the page). */
function loadWindowState(): WindowState {
  const fallback = DEFAULT_WINDOW;
  try {
    const s = parseWindowState(JSON.parse(readFileSync(stateFile(), 'utf8')));
    if (!s) return fallback;
    // Only where a screen still is (a monitor may have been unplugged).
    const visible =
      s.x === undefined ||
      s.y === undefined ||
      screen.getAllDisplays().some(({ workArea: a }) => s.x! < a.x + a.width - 100 && s.x! + s.width > a.x + 100 && s.y! >= a.y - 10 && s.y! < a.y + a.height - 50);
    return visible ? s : { width: s.width, height: s.height, maximized: s.maximized };
  } catch {
    return fallback;
  }
}

function saveWindowState(w: BrowserWindow): void {
  const b = w.getNormalBounds();
  try {
    writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: w.isMaximized() }));
  } catch {
    // Not worth bothering anyone about.
  }
}

function createWindow(url: string): BrowserWindow {
  const state = loadWindowState();
  const w = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 360,
    minHeight: 480,
    title: 'Margins',
    icon: existsSync(iconFile) ? iconFile : undefined,
    // The page's paper colour (src/index.css), dark when Windows is, until the page draws.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1a18' : '#f7f4ee',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  w.setMenuBarVisibility(false);
  if (state.maximized) w.maximize();
  w.once('ready-to-show', () => w.show());
  w.on('close', () => saveWindowState(w));

  // The app's own pages stay in the window; anything else (Google sign-in,
  // credits, a link in a note) opens in the person's browser.
  w.webContents.on('will-navigate', (event, target) => {
    if (isAppUrl(target)) return;
    event.preventDefault();
    if (isExternalUrl(target)) void shell.openExternal(target);
  });
  w.webContents.setWindowOpenHandler(({ url: target }) => {
    if (isExternalUrl(target)) void shell.openExternal(target);
    else if (isAppUrl(target)) void w.loadURL(target);
    return { action: 'deny' };
  });
  w.webContents.on('context-menu', (_event, params) => {
    const items: MenuItemConstructorOptions[] = [];
    for (const s of params.dictionarySuggestions) items.push({ label: s, click: () => w.webContents.replaceMisspelling(s) });
    if (params.misspelledWord) {
      items.push({ label: 'Add to dictionary', click: () => w.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) });
      items.push({ type: 'separator' });
    }
    if (params.isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' });
    else if (params.selectionText.trim()) items.push({ role: 'copy' });
    else if (params.linkURL && isExternalUrl(params.linkURL)) items.push({ label: 'Open link in browser', click: () => void shell.openExternal(params.linkURL) });
    if (items.length) Menu.buildFromTemplate(items).popup({ window: w });
  });

  void w.loadURL(url);
  return w;
}

/** No menu bar, but the usual keys still work: editing, zoom, full screen, reload. */
function menu(): Menu {
  return Menu.buildFromTemplate([
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomIn', accelerator: 'CommandOrControl+=', visible: false },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]);
}
