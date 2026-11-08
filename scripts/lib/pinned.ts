/**
 * Pinned sources. Small ones are committed in data/sources/; large ones
 * ("cached") are downloaded from their pinned URL into data/cache/ (ignored by
 * git). Either way the SHA-256 must match SOURCES.json, or the build stops.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourcesDir = join(root, 'data', 'sources');
const cacheDir = join(root, 'data', 'cache');

export interface SourceEntry {
  id: string;
  file: string;
  url: string;
  sha256: string;
  cached?: boolean;
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sourceEntries(): SourceEntry[] {
  return (JSON.parse(readFileSync(join(sourcesDir, 'SOURCES.json'), 'utf8')) as { sources: SourceEntry[] }).sources;
}

/** Reads a pinned source, downloading a cached one if it isn't here yet. */
export async function readPinned(id: string): Promise<Buffer> {
  const entry = sourceEntries().find((s) => s.id === id);
  if (!entry) throw new Error(`No source listed for ${id}`);
  const path = join(entry.cached ? cacheDir : sourcesDir, entry.file);
  if (!existsSync(path)) {
    if (!entry.cached) throw new Error(`Missing committed source ${entry.file}`);
    console.log(`Downloading ${entry.file}…`);
    const res = await fetch(entry.url);
    if (!res.ok) throw new Error(`Download of ${entry.file} failed (${res.status})`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (sha256(bytes) !== entry.sha256) throw new Error(`Checksum mismatch for downloaded ${entry.file}; refusing it`);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(path, bytes);
    return bytes;
  }
  const bytes = readFileSync(path);
  if (sha256(bytes) !== entry.sha256) throw new Error(`Checksum mismatch for ${entry.file}`);
  return bytes;
}
