/**
 * The desktop window's size and place: a device setting (see src/settings/registry.ts).
 *
 * Pure (no Electron or Node), so the app's settings list and the desktop
 * program share one definition. The program keeps the value itself, in
 * window.json in its profile, because the window is sized before the page loads.
 */

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

export const DEFAULT_WINDOW: WindowState = { width: 1280, height: 860 };

const MIN_SIDE = 300;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A stored window state, or undefined if it isn't a usable one. */
export function parseWindowState(raw: unknown): WindowState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (!isNum(r.width) || !isNum(r.height) || r.width <= MIN_SIDE || r.height <= MIN_SIDE) return undefined;
  const s: WindowState = { width: Math.round(r.width), height: Math.round(r.height) };
  if (isNum(r.x) && isNum(r.y)) {
    s.x = Math.round(r.x);
    s.y = Math.round(r.y);
  }
  if (typeof r.maximized === 'boolean') s.maximized = r.maximized;
  return s;
}
