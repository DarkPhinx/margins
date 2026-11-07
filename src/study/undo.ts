import { useSyncExternalStore } from 'react';
import { deleteItem, restoreItem } from './store';

/** The last deletion, offered for undo for a few seconds. */
let last: { id: string; label: string } | null = null;
let timer: number | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function deleteWithUndo(id: string, label: string): Promise<void> {
  await deleteItem(id);
  last = { id, label };
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    last = null;
    emit();
  }, 8000);
  emit();
}

export async function undoDelete(): Promise<void> {
  if (!last) return;
  const { id } = last;
  last = null;
  window.clearTimeout(timer);
  emit();
  await restoreItem(id);
}

export function dismissUndo(): void {
  last = null;
  emit();
}

export function useUndo() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => last,
    () => last,
  );
}
