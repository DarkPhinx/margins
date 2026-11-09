/**
 * Keeps half-typed words out of the account. A note is saved on the device a
 * moment after each keystroke, but it's only uploaded once typing pauses for
 * about two seconds, or when the note is closed. Until then sync skips it, and
 * when the hold ends sync is asked to run.
 */

export const TYPING_PAUSE_MS = 2000;

const held = new Map<string, number>();
const listeners = new Set<() => void>();

function release(id: string): void {
  window.clearTimeout(held.get(id));
  if (!held.delete(id)) return;
  for (const fn of listeners) fn();
}

/** Someone typed in this item: hold its upload until typing pauses. */
export function typing(id: string): void {
  window.clearTimeout(held.get(id));
  held.set(
    id,
    window.setTimeout(() => release(id), TYPING_PAUSE_MS),
  );
}

/** The item was closed (and saved): upload it now. */
export function doneTyping(id: string): void {
  release(id);
}

/** True while someone is typing in this item. */
export function isTyping(id: string): boolean {
  return held.has(id);
}

/** Calls back whenever an item stops being held. Returns an unsubscribe. */
export function onTypingDone(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
