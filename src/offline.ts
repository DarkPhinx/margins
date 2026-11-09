import { useSyncExternalStore } from 'react';

type OfflineState = 'unsupported' | 'preparing' | 'ready';

let state: OfflineState = __DESKTOP__
  ? 'ready' // The Windows app carries the Bibles inside it.
  : typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    ? 'preparing'
    : 'unsupported';
const listeners = new Set<() => void>();

export function setOfflineState(next: OfflineState): void {
  state = next;
  for (const l of listeners) l();
}

export function useOfflineState(): OfflineState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
