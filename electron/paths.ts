/**
 * The rules the desktop app lives by, kept free of Electron so they can be tested.
 *
 * The app is served from its own origin, margins://app, out of the files built
 * into the program. The same address is registered with Windows, so a link to
 * margins://app/… — a sign-in email, or Google sending you back — opens the
 * program at that page.
 */

import { extname, join, normalize, sep } from 'node:path';

export const SCHEME = 'margins';
export const HOST = 'app';
export const ORIGIN = `${SCHEME}://${HOST}`;

/** Is this address one of the app's own pages? */
export function isAppUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === `${SCHEME}:` && u.host === HOST;
  } catch {
    return false;
  }
}

/** Addresses handed to the person's own browser (sign-in with Google, credits, links). */
export function isExternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:';
  } catch {
    return false;
  }
}

/**
 * The file a request for one of the app's addresses is answered with, or null
 * for an address that isn't the app's. Paths can't climb out of the app's
 * folder; a page address (no file extension) gets index.html, as a web server
 * set up for a single-page app would; a missing file stays missing (404).
 */
export function fileFor(root: string, url: string): { file: string; page: boolean } | null {
  if (!isAppUrl(url)) return null;
  let path: string;
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
  if (path.includes('\0')) return null;
  const base = normalize(root.endsWith(sep) ? root : root + sep);
  const file = normalize(join(base, path));
  if (!file.startsWith(base)) return null;
  if (file === base || !extname(file)) return { file: join(base, 'index.html'), page: true };
  return { file, page: false };
}

/** A margins://app link Windows started the program with (or passed to the open program). */
export function deepLinkIn(argv: readonly string[]): string | null {
  for (const arg of argv) if (isAppUrl(arg)) return arg;
  return null;
}

/** The kind of a file, by its extension. */
export function contentType(file: string): string {
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json',
    '.txt': 'text/plain; charset=utf-8',
  };
  return types[extname(file).toLowerCase()] ?? 'application/octet-stream';
}
